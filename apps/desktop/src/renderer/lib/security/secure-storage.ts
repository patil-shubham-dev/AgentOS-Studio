const STORAGE_PREFIX = "agentic-secure:"
const FALLBACK_KEY_PREFIX = "agentic-key:"

type StorageBackend = "tauri" | "electron" | "localstorage" | "none"

let backend: StorageBackend = "none"
let tauriInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null

const LOG_PREFIX = "[SecureStorage]"

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args)
}

function warn(...args: unknown[]) {
  console.warn(LOG_PREFIX, "[WARN]", ...args)
}

async function detectBackend(): Promise<StorageBackend> {
  if (backend !== "none") return backend

  // Try Electron safeStorage via preload bridge
  try {
    if ((globalThis as any).window?.electronAPI?.safeStorageEncrypt) {
      backend = "electron"
      log("Using Electron safeStorage backend")
      return backend
    }
  } catch {
    // electron not available
  }

  try {
    if ((globalThis as any).window?.__TAURI_INTERNALS__) {
      const mod = await import("@/lib/electron-api")
      tauriInvoke = mod.invoke as (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
      backend = "tauri"
      log("Using Tauri secure storage backend")
      return backend
    }
  } catch {
    // Tauri not available
  }

  try {
    localStorage.getItem("__probe__")
    backend = "localstorage"
    log("Using localStorage fallback for secure storage")
    return backend
  } catch {
    backend = "none"
    warn("No storage backend available")
    return backend
  }
}

async function encryptWithElectron(plaintext: string): Promise<string | null> {
  try {
    const result = await (globalThis as any).window?.electronAPI?.safeStorageEncrypt(plaintext)
    return result || null
  } catch {
    return null
  }
}

async function decryptWithElectron(ciphertext: string): Promise<string | null> {
  try {
    const result = await (globalThis as any).window?.electronAPI?.safeStorageDecrypt(ciphertext)
    return result || null
  } catch {
    return null
  }
}

export async function isSecureStorageAvailable(): Promise<boolean> {
  const b = await detectBackend()
  return b !== "none"
}

export async function setApiKey(providerId: string, key: string): Promise<void> {
  const b = await detectBackend()

  if (b === "electron") {
    try {
      const encrypted = await encryptWithElectron(key)
      if (encrypted) {
        localStorage.setItem(`${FALLBACK_KEY_PREFIX}${providerId}`, encrypted)
        log(`API key stored for provider "${providerId}" via Electron safeStorage`)
        return
      }
    } catch (err) {
      warn(`Electron safeStorage encrypt failed for "${providerId}", falling back to localStorage:`, err)
    }
  }

  if (b === "tauri" && tauriInvoke) {
    try {
      await tauriInvoke("secure_set", { key: `${STORAGE_PREFIX}${providerId}`, value: key })
      log(`API key stored for provider "${providerId}" via Tauri secure storage`)
      return
    } catch (err) {
      warn(`Tauri secure_set failed for "${providerId}", falling back to localStorage:`, err)
    }
  }

  if (b === "localstorage") {
    try {
      const encoded = btoa(key)
      localStorage.setItem(`${FALLBACK_KEY_PREFIX}${providerId}`, encoded)
      log(`API key stored for provider "${providerId}" via localStorage (base64 encoded)`)
      return
    } catch (err) {
      warn(`localStorage set failed for "${providerId}":`, err)
    }
  }

  warn(`Cannot store API key for "${providerId}": no storage backend available`)
}

export async function getApiKey(providerId: string): Promise<string | null> {
  const b = await detectBackend()
  const stored = localStorage.getItem(`${FALLBACK_KEY_PREFIX}${providerId}`)
  if (!stored) return null

  // Try Electron safeStorage decryption first
  if (b === "electron") {
    try {
      const decrypted = await decryptWithElectron(stored)
      if (decrypted) return decrypted
    } catch {
      // Fall through to other methods
    }
  }

  if (b === "tauri" && tauriInvoke) {
    try {
      const result = await tauriInvoke("secure_get", { key: `${STORAGE_PREFIX}${providerId}` })
      if (result) return result as string
    } catch {
      // Fall through to localStorage
    }
  }

  // Fallback to base64 decode (for keys stored before safeStorage was added)
  try {
    return atob(stored)
  } catch {
    return null
  }
}

export async function removeApiKey(providerId: string): Promise<void> {
  const b = await detectBackend()

  if (b === "tauri" && tauriInvoke) {
    try {
      await tauriInvoke("secure_remove", { key: `${STORAGE_PREFIX}${providerId}` })
    } catch {
      // Fall through
    }
  }

  try {
    localStorage.removeItem(`${FALLBACK_KEY_PREFIX}${providerId}`)
  } catch {
    // Ignore
  }

  log(`API key removed for provider "${providerId}"`)
}

export async function hasApiKey(providerId: string): Promise<boolean> {
  const key = await getApiKey(providerId)
  return key !== null && key.length > 0
}

export async function migrateApiKeysFromConfig(
  providers: Array<{ id: string; apiKey?: string }>,
): Promise<{ migrated: number; errors: string[] }> {
  let migrated = 0
  const errors: string[] = []

  for (const p of providers) {
    if (p.apiKey && p.apiKey.length > 0) {
      try {
        await setApiKey(p.id, p.apiKey)
        migrated++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`Failed to store key for "${p.id}": ${msg}`)
      }
    }
  }

  log(`Migrated ${migrated}/${providers.length} API keys`)
  return { migrated, errors }
}

export async function clearAllApiKeys(): Promise<void> {
  const b = await detectBackend()

  if (b === "localstorage") {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(FALLBACK_KEY_PREFIX)) {
        keys.push(key)
      }
    }
    keys.forEach((k) => localStorage.removeItem(k))
    log(`Cleared ${keys.length} API keys from localStorage`)
  }
}
