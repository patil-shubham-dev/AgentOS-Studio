import { runMigrations, createDefaultConfig, type MigrationResult } from "./migration"
import { migrateApiKeysFromConfig } from "./secure-storage"
import { safeSetItem, safeGetItem } from "./safe-storage"

export const CONFIG_FILENAME = "agentic-config.json"
export const CONFIG_LOCALSTORAGE_KEY = "agentic-config"
export const LEGACY_SETTINGS_KEY = "settings.json"
export const LEGACY_LEDGER_KEY = "agentic-ledger"

const LOG_PREFIX = "[Persistence]"

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args)
}

function warn(...args: unknown[]) {
  console.warn(LOG_PREFIX, "[WARN]", ...args)
}

function error_(...args: unknown[]) {
  console.error(LOG_PREFIX, "[ERROR]", ...args)
}

export type StorageMode = "tauri-fs" | "localstorage" | "none"

interface StorageBackend {
  read(key: string): Promise<string | null>
  write(key: string, data: string): Promise<boolean>
  remove(key: string): Promise<void>
}

class LocalStorageBackend implements StorageBackend {
  read(key: string): Promise<string | null> {
    try {
      return Promise.resolve(safeGetItem(key))
    } catch (err) {
      warn(`localStorage read failed for "${key}":`, err)
      return Promise.resolve(null)
    }
  }

  write(key: string, data: string): Promise<boolean> {
    try {
      safeSetItem(key, data)
      return Promise.resolve(true)
    } catch (err) {
      error_(`localStorage write failed for "${key}":`, err)
      return Promise.resolve(false)
    }
  }

  remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore
    }
    return Promise.resolve()
  }
}

class TauriFsBackend implements StorageBackend {
  private ready: Promise<boolean>
  private resolved = false
  private available = false

  constructor() {
    this.ready = this.detect()
  }

  private async detect(): Promise<boolean> {
    if (this.resolved) return this.available
    this.resolved = true
    try {
      if (!(globalThis as any).window?.__TAURI_INTERNALS__) {
        this.available = false
        return false
      }
      await import("@/lib/electron-api")
      this.available = true
      log("Tauri FS backend available")
      return true
    } catch {
      this.available = false
      return false
    }
  }

  private async ensureDir(): Promise<boolean> {
    try {
      const mod = await import("@/lib/electron-api")
      if (mod.mkdir) {
        const { BaseDirectory } = await import("@/lib/electron-api")
        await mod.mkdir("", { baseDir: BaseDirectory.AppData, recursive: true })
      }
      return true
    } catch {
      // Directory likely already exists
      return true
    }
  }

  async read(key: string): Promise<string | null> {
    const avail = await this.ready
    if (!avail) return null

    try {
      const { readTextFile, BaseDirectory } = await import("@/lib/electron-api")
      const data = await readTextFile(key, { baseDir: BaseDirectory.AppData })
      return data
    } catch (err) {
      warn(`Tauri FS read failed for "${key}":`, err)
      return null
    }
  }

  async write(key: string, data: string): Promise<boolean> {
    const avail = await this.ready
    if (!avail) return false

    try {
      await this.ensureDir()
      const { writeTextFile, BaseDirectory } = await import("@/lib/electron-api")
      await writeTextFile(key, data, { baseDir: BaseDirectory.AppData })
      return true
    } catch (err) {
      error_(`Tauri FS write failed for "${key}":`, err)
      return false
    }
  }

  async remove(key: string): Promise<void> {
    const avail = await this.ready
    if (!avail) return

    try {
      const { remove, BaseDirectory } = await import("@/lib/electron-api")
      await remove(key, { baseDir: BaseDirectory.AppData })
    } catch {
      // ignore
    }
  }
}

let backend: StorageBackend | null = null
let detectedMode: StorageMode = "none"

export async function getStorageMode(): Promise<StorageMode> {
  if (detectedMode !== "none") return detectedMode

  const tauri = new TauriFsBackend()
  const canTauri = await (tauri as any).ready

  if (canTauri) {
    backend = tauri
    detectedMode = "tauri-fs"
    return detectedMode
  }

  backend = new LocalStorageBackend()
  detectedMode = "localstorage"
  return detectedMode
}

async function getBackend(): Promise<StorageBackend> {
  if (!backend) {
    await getStorageMode()
  }
  return backend!
}

export interface ConfigData {
  version: number
  providers: Record<string, unknown>[]
  roleConfigs: Record<string, unknown>[]
  roleMappings: Record<string, unknown>[]
  ledger: Record<string, unknown>[]
  mcpServers?: Record<string, unknown>[]
  migratedAt?: string
  [key: string]: unknown
}

export interface LoadResult {
  config: ConfigData
  migrated: boolean
  migrationResult: MigrationResult | null
  source: StorageMode
}

export async function loadConfig(migrate = true): Promise<LoadResult> {
  const b = await getBackend()
  const mode = await getStorageMode()
  let raw: string | null = null

  log(`Loading config from ${mode}...`)

  if (mode === "tauri-fs") {
    raw = await b.read(CONFIG_FILENAME)
    if (!raw) {
      raw = await b.read(LEGACY_SETTINGS_KEY)
      if (raw) warn("Found legacy settings.json in Tauri FS")
    }
  }

  if (!raw) {
    raw = localStorage.getItem(CONFIG_LOCALSTORAGE_KEY)
  }

  if (!raw) {
    raw = localStorage.getItem(LEGACY_SETTINGS_KEY)
    if (raw) log("Found legacy settings.json in localStorage")
  }

  if (!raw) {
    log("No existing config found, creating defaults")
    return {
      config: createDefaultConfig() as ConfigData,
      migrated: false,
      migrationResult: null,
      source: mode,
    }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    error_("Failed to parse config JSON:", err)
    return {
      config: createDefaultConfig() as ConfigData,
      migrated: false,
      migrationResult: null,
      source: mode,
    }
  }

  if (!migrate) {
    return {
      config: parsed as ConfigData,
      migrated: false,
      migrationResult: null,
      source: mode,
    }
  }

  const result = runMigrations(parsed)
  if (result.migrated && result.config) {
    log(`Migration applied: ${result.log?.fromVersion} → ${result.log?.toVersion} (${result.log?.actions.length} actions)`)

    if (result.log) {
      for (const action of result.log.actions) {
        log(`  ${action.type}: ${action.description}`)
      }
      if (result.log.errors.length > 0) {
        for (const err of result.log.errors) {
          error_(`  Migration error: ${err}`)
        }
      }
    }

    const apiKeys = (result.config.providers as Array<Record<string, unknown>>)?.map((p) => ({
      id: p.id as string,
      apiKey: p.apiKey as string | undefined,
    })) || []
    const keyResult = await migrateApiKeysFromConfig(apiKeys)
    if (keyResult.migrated > 0) {
      log(`Migrated ${keyResult.migrated} API keys to secure storage`)
    }

    // Strip apiKeys from providers before saving — they live in secure storage now
    const cleanedConfig = {
      ...result.config,
      providers: (result.config.providers as Array<Record<string, unknown>>).map(
        ({ apiKey: _, ...p }) => p,
      ),
    }
    await saveConfig(cleanedConfig as ConfigData, false)

    return {
      config: result.config as ConfigData,
      migrated: true,
      migrationResult: result,
      source: mode,
    }
  }

  return {
    config: parsed as ConfigData,
    migrated: false,
    migrationResult: null,
    source: mode,
  }
}

export async function saveConfig(config: ConfigData, runValidation = true): Promise<boolean> {
  if (runValidation) {
    const validation = validateConfig(config)
    if (!validation.valid) {
      error_("Config validation failed:", validation.errors)
      return false
    }
  }

  const b = await getBackend()
  const mode = await getStorageMode()
  const json = JSON.stringify(config, null, 2)

  if (mode === "tauri-fs") {
    const success = await b.write(CONFIG_FILENAME, json)
    if (success) {
      log(`Config saved to Tauri FS (${json.length} bytes)`)
      return true
    }
    warn("Tauri FS write failed, falling back to localStorage")
  }

  try {
    localStorage.setItem(CONFIG_LOCALSTORAGE_KEY, json)
    log(`Config saved to localStorage (${json.length} bytes)`)
    return true
  } catch (err) {
    error_("Failed to save config to localStorage:", err)
    return false
  }
}

export function validateConfig(config: ConfigData): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (typeof config.version !== "number") {
    errors.push("Config missing version field")
  }

  if (!Array.isArray(config.providers)) {
    errors.push("Config missing or invalid providers array")
  }

  if (!Array.isArray(config.roleConfigs)) {
    errors.push("Config missing or invalid roleConfigs array")
  }

  if (config.providers) {
    const ids = new Set<string>()
    for (const p of config.providers) {
      if (!p.id || typeof p.id !== "string") {
        errors.push(`Provider "${p.name || "unnamed"}" missing id`)
      }
      if (p.id && ids.has(p.id as string)) {
        errors.push(`Duplicate provider id: "${p.id}"`)
      }
      if (p.id) ids.add(p.id as string)
    }
  }

  if (config.roleConfigs) {
    const ids = new Set<string>()
    for (const r of config.roleConfigs) {
      if (!r.id || typeof r.id !== "string") {
        errors.push(`Role "${r.name || "unnamed"}" missing id`)
      }
      if (r.id && ids.has(r.id as string)) {
        errors.push(`Duplicate role id: "${r.id}"`)
      }
      if (r.id) ids.add(r.id as string)
    }
  }

  return { valid: errors.length === 0, errors }
}

export async function clearConfig(): Promise<void> {
  const b = await getBackend()
  const mode = await getStorageMode()

  if (mode === "tauri-fs") {
    await b.remove(CONFIG_FILENAME)
    await b.remove(LEGACY_SETTINGS_KEY)
  }

  localStorage.removeItem(CONFIG_LOCALSTORAGE_KEY)
  localStorage.removeItem(LEGACY_SETTINGS_KEY)
  localStorage.removeItem(LEGACY_LEDGER_KEY)

  log("Config cleared from all storage backends")
}

export function getConfigSize(): { localStorage: number; legacySettings: number } {
  return {
    localStorage: localStorage.getItem(CONFIG_LOCALSTORAGE_KEY)?.length || 0,
    legacySettings: localStorage.getItem(LEGACY_SETTINGS_KEY)?.length || 0,
  }
}
