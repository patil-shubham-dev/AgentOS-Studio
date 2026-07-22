const DEFAULT_QUOTA_BYTES = 4_000_000
const EVICTION_TARGET_BYTES = 500_000
const ESTIMATION_OVERHEAD = 100

let quotaBytes = DEFAULT_QUOTA_BYTES

export function configureQuota(bytes: number): void {
  quotaBytes = bytes
}

export function getStorageSize(): number {
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) {
      const val = localStorage.getItem(key)
      if (val) {
        total += key.length * 2 + val.length * 2 + ESTIMATION_OVERHEAD
      }
    }
  }
  return total
}

function isQuotaExceeded(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.code === 22 || e.code === 1014 || e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")
  )
}

const EVICTION_PRIORITY: Record<string, number> = {
  "settings.json": 10,
  "agentic-config": 10,
  "agentic-workspace-state": 10,
  "agentic-workspace-root": 10,
  "agentic-browser-state": 8,
  "agentic-browser-research": 8,
  "recent-workspaces": 5,
  "ledger.json": 5,
}

function getEvictionScore(key: string, val: string): number {
  const base = EVICTION_PRIORITY[key] ?? 3
  const size = (key.length + val.length) * 2
  return base * 100000 - size
}

function evict(requiredBytes: number): boolean {
  const entries: { key: string; value: string; score: number }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    const val = localStorage.getItem(key)
    if (val === null) continue
    entries.push({ key, value: val, score: getEvictionScore(key, val) })
  }

  entries.sort((a, b) => a.score - b.score)

  let freed = 0
  const toRemove: string[] = []
  for (const entry of entries) {
    if (freed >= requiredBytes) break
    const size = (entry.key.length + entry.value.length) * 2 + ESTIMATION_OVERHEAD
    toRemove.push(entry.key)
    freed += size
  }

  for (const key of toRemove) {
    localStorage.removeItem(key)
  }

  return freed >= requiredBytes
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch (e) {
    if (isQuotaExceeded(e)) {
      const currentSize = getStorageSize()
      const newSize = (key.length + value.length) * 2 + ESTIMATION_OVERHEAD
      if (currentSize + newSize > quotaBytes) {
        const needed = currentSize + newSize - quotaBytes + EVICTION_TARGET_BYTES
        if (evict(needed)) {
          localStorage.setItem(key, value)
        } else {
          console.warn("[SafeStorage] Could not free enough space, skipping write")
        }
      } else {
        console.warn("[SafeStorage] Quota exceeded unexpectedly")
      }
    } else {
      throw e
    }
  }
}

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
  }
}
