const MAX_CACHED_PATHS = 500

interface FileState {
  lastReadAt: number
  lastReadContent: string
  lastWriteAt: number
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

export class FileStateCache {
  private static instance: FileStateCache
  private cache = new Map<string, FileState>()

  static getInstance(): FileStateCache {
    if (!FileStateCache.instance) {
      FileStateCache.instance = new FileStateCache()
    }
    return FileStateCache.instance
  }

  recordRead(path: string, content: string, mtime: number): void {
    this.evictIfNeeded()
    this.cache.set(normalizePath(path), { lastReadAt: mtime, lastReadContent: content, lastWriteAt: 0 })
  }

  recordWrite(path: string): void {
    const existing = this.cache.get(normalizePath(path))
    if (existing) {
      existing.lastWriteAt = Date.now()
    }
  }

  wasRead(path: string): boolean {
    const state = this.cache.get(normalizePath(path))
    return state !== undefined && state.lastReadAt > 0
  }

  isStale(path: string, currentMtime: number): boolean {
    const state = this.cache.get(normalizePath(path))
    if (!state) return false
    return currentMtime > state.lastReadAt
  }

  getContent(path: string): string | undefined {
    return this.cache.get(normalizePath(path))?.lastReadContent
  }

  invalidate(path: string): void {
    this.cache.delete(normalizePath(path))
  }

  /** Clear all cached file state. Intended for tests. */
  clear(): void {
    this.cache.clear()
  }

  private evictIfNeeded(): void {
    if (this.cache.size < MAX_CACHED_PATHS) return
    const firstKey = this.cache.keys().next().value
    if (firstKey !== undefined) this.cache.delete(firstKey)
  }
}
