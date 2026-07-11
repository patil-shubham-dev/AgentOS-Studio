const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.rar',
  '.exe', '.dll', '.so', '.dylib',
  '.mp3', '.mp4', '.avi', '.mov',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.map',
])

const EXCLUDED_DIRECTORIES = ['node_modules', '.git', 'dist', 'build', '.next', '.cache']

interface CacheEntry {
  content: string
  mtime: number
  cachedAt: number
}

export class ContextFileCache {
  private cache = new Map<string, CacheEntry>()
  private maxSize: number

  constructor(maxSize = 20) {
    this.maxSize = maxSize
  }

  async getContent(
    filePath: string,
    readFile: (path: string) => Promise<string>,
    getMtime?: (path: string) => Promise<number>
  ): Promise<{ content: string; fromCache: boolean } | null> {
    if (this.shouldExclude(filePath)) return null

    if (this.isBinary(filePath)) return null

    let currentMtime = 0
    if (getMtime) {
      try {
        currentMtime = await getMtime(filePath)
      } catch {
        currentMtime = Date.now()
      }
    }

    const cached = this.cache.get(filePath)
    if (cached && (!getMtime || cached.mtime === currentMtime)) {
      return { content: cached.content, fromCache: true }
    }

    try {
      const content = await readFile(filePath)
      this.cache.set(filePath, {
        content,
        mtime: currentMtime || Date.now(),
        cachedAt: Date.now(),
      })
      this.enforceMaxSize()
      return { content, fromCache: false }
    } catch {
      return null
    }
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath)
  }

  invalidateAll(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }

  private enforceMaxSize(): void {
    if (this.cache.size <= this.maxSize) return
    const entries = [...this.cache.entries()]
      .sort((a, b) => a[1].cachedAt - b[1].cachedAt)
    const toRemove = entries.slice(0, entries.length - this.maxSize)
    for (const [key] of toRemove) {
      this.cache.delete(key)
    }
  }

  private shouldExclude(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/')
    for (const dir of EXCLUDED_DIRECTORIES) {
      if (normalized.includes(`/${dir}/`) || normalized.startsWith(`${dir}/`)) {
        return true
      }
    }
    return false
  }

  private isBinary(filePath: string): boolean {
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase()
    return BINARY_EXTENSIONS.has(ext)
  }
}
