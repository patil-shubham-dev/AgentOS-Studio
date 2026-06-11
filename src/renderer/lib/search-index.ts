import type { FileEntry } from "@/types"

export interface IndexedFile {
  path: string
  name: string
  extension: string
  size: number
  cachedContent: string | null
}

export interface SearchQuery {
  query: string
  mode: "filename" | "content" | "fuzzy" | "path"
  caseSensitive: boolean
  extension?: string
  maxResults?: number
  signal?: AbortSignal
}

export interface FuzzyScore {
  score: number
  matches: number[]
}

export interface SearchResult {
  filePath: string
  fileName: string
  matches: Array<{ line: number; lineContent: string; column?: number }>
  matchCount: number
}

export interface SearchProgress {
  phase: "indexing" | "searching"
  filesScanned: number
  filesMatched: number
  totalFiles: number
  elapsedMs: number
}

export type SearchCallback = (results: SearchResult[], progress: SearchProgress) => void

export function fuzzyMatch(query: string, text: string): FuzzyScore | null {
  const queryLower = query.toLowerCase()
  const textLower = text.toLowerCase()

  let textIdx = 0
  let queryIdx = 0
  const matchPositions: number[] = []
  let consecutiveBonus = 0
  let prevMatchEnd = -2

  while (queryIdx < queryLower.length && textIdx < textLower.length) {
    if (queryLower[queryIdx] === textLower[textIdx]) {
      matchPositions.push(textIdx)
      if (textIdx === prevMatchEnd + 1) {
        consecutiveBonus += 5
      }
      prevMatchEnd = textIdx
      queryIdx++
    }
    textIdx++
  }

  if (queryIdx !== queryLower.length) return null

  const coverage = queryLower.length / textLower.length || 1
  const nameOnly = text.includes("/") ? 0 : 10
  const startBonus = matchPositions[0] === 0 ? 15 : 0
  const positionPenalty = matchPositions.reduce((sum, p) => sum + p, 0) / matchPositions.length

  const score = (consecutiveBonus + nameOnly + startBonus + coverage * 20) / (1 + positionPenalty * 0.1)

  return { score, matches: matchPositions }
}

const MAX_CACHED_FILE_SIZE = 512 * 1024
const MAX_MEMORY_CACHE = 200 * 1024 * 1024
const SEARCH_BATCH_SIZE = 500

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", "vendor", ".next", ".cache", "__pycache__"])
const SKIP_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".map", ".min.js", ".min.css"])

function shouldSkipDir(name: string): boolean {
  return SKIP_DIRS.has(name) || name.startsWith(".")
}

function shouldSkipFile(name: string): boolean {
  const lower = name.toLowerCase()
  for (const ext of SKIP_EXTENSIONS) {
    if (lower.endsWith(ext)) return true
  }
  return false
}

function flattenFileTree(entries: FileEntry[], basePath = ""): FileEntry[] {
  const result: FileEntry[] = []
  for (const entry of entries) {
    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name
    if (entry.is_dir) {
      if (shouldSkipDir(entry.name)) continue
      result.push(...flattenFileTree(entry.children, entryPath))
    } else {
      result.push({ ...entry, path: entryPath })
    }
  }
  return result
}

class LRUContentCache {
  private cache = new Map<string, string>()
  private maxSize: number
  private currentSize = 0

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  get(path: string): string | undefined {
    const content = this.cache.get(path)
    if (content !== undefined) {
      this.cache.delete(path)
      this.cache.set(path, content)
    }
    return content
  }

  set(path: string, content: string): void {
    if (content.length > this.maxSize) return
    while (this.currentSize + content.length > this.maxSize && this.cache.size > 0) {
      const oldest = this.cache.keys().next().value
      if (oldest) {
        const removed = this.cache.get(oldest)!
        this.currentSize -= removed.length
        this.cache.delete(oldest)
      }
    }
    if (this.cache.has(path)) {
      const old = this.cache.get(path)!
      this.currentSize -= old.length
    }
    this.cache.set(path, content)
    this.currentSize += content.length
  }

  delete(path: string): void {
    const content = this.cache.get(path)
    if (content !== undefined) {
      this.currentSize -= content.length
      this.cache.delete(path)
    }
  }

  clear(): void {
    this.cache.clear()
    this.currentSize = 0
  }

  get size(): number {
    return this.currentSize
  }

  get count(): number {
    return this.cache.size
  }
}

export class SearchIndex {
  private files: IndexedFile[] = []
  private ready = false
  private scanning = false
  private contentCache = new LRUContentCache(MAX_MEMORY_CACHE)

  get isReady(): boolean {
    return this.ready
  }

  get totalFiles(): number {
    return this.files.length
  }

  get totalCached(): number {
    return this.contentCache.count
  }

  async initialize(entries: FileEntry[], rootPath: string | null, signal?: AbortSignal): Promise<void> {
    this.scanning = true
    this.files = []
    this.contentCache.clear()

    const flat = flattenFileTree(entries)
    const batchSize = 50

    for (let i = 0; i < flat.length; i += batchSize) {
      if (signal?.aborted) {
        this.scanning = false
        this.ready = true
        return
      }
      const batch = flat.slice(i, i + batchSize)
      const indexed = await Promise.all(
        batch.map(async (entry) => {
          const ext = entry.name.split(".").pop()?.toLowerCase() ?? ""
          return {
            path: entry.path,
            name: entry.name,
            extension: ext,
            size: entry.size ?? 0,
            cachedContent: null,
          } as IndexedFile
        }),
      )
      this.files.push(...indexed)
    }

    this.ready = true
    this.scanning = false
  }

  async ensureContentCached(filePath: string, rootPath: string | null): Promise<string | null> {
    const cached = this.contentCache.get(filePath)
    if (cached !== undefined) return cached

    const file = this.files.find((f) => f.path === filePath)
    if (!file) return null
    if (shouldSkipFile(file.name)) return null
    if (file.size > MAX_CACHED_FILE_SIZE) return null

    try {
      const fullPath = rootPath ? `${rootPath}\\${filePath.replace(/\//g, "\\")}` : filePath
      const content = await readFileContent(fullPath)
      this.contentCache.set(filePath, content)
      file.cachedContent = content
      return content
    } catch {
      return null
    }
  }

  async ensureBatchContentCached(filePaths: string[], rootPath: string | null): Promise<void> {
    const uncached = filePaths.filter((fp) => this.contentCache.get(fp) === undefined)
    if (uncached.length === 0) return

    const batch = uncached.slice(0, 50)
    await Promise.all(
      batch.map(async (fp) => {
        const file = this.files.find((f) => f.path === fp)
        if (!file || shouldSkipFile(file.name) || file.size > MAX_CACHED_FILE_SIZE) return
        try {
          const fullPath = rootPath ? `${rootPath}\\${fp.replace(/\//g, "\\")}` : fp
          const content = await readFileContent(fullPath)
          this.contentCache.set(fp, content)
          file.cachedContent = content
        } catch {
          // skip
        }
      }),
    )
  }

  async search(
    query: SearchQuery,
    onProgress?: SearchCallback,
  ): Promise<SearchResult[]> {
    if (!query.query.trim()) return []

    const needle = query.caseSensitive ? query.query.trim() : query.query.trim().toLowerCase()
    const maxResults = query.maxResults ?? 200
    const results: SearchResult[] = []
    const startTime = Date.now()
    let filesScanned = 0
    let filesMatched = 0
    const totalFileCount = this.files.length

    const reportProgress = (phase: "indexing" | "searching"): void => {
      onProgress?.(results.slice(), {
        phase,
        filesScanned,
        filesMatched,
        totalFiles: totalFileCount,
        elapsedMs: Date.now() - startTime,
      })
    }

    if (query.mode === "filename" || query.mode === "fuzzy" || query.mode === "path") {
      const fuzzy = query.mode === "fuzzy" || query.mode === "path"
      const q = query.query.trim()
      const scored: Array<{ result: SearchResult; score: number }> = []

      for (const file of this.files) {
        if (results.length >= maxResults) break
        if (query.signal?.aborted) return []
        if (query.extension && file.extension !== query.extension) continue

        filesScanned++

        if (query.mode === "filename") {
          const name = query.caseSensitive ? file.name : file.name.toLowerCase()
          if (name.includes(needle)) {
            results.push({
              filePath: file.path,
              fileName: file.name,
              matches: [],
              matchCount: 0,
            })
            filesMatched++
          }
        } else if (fuzzy) {
          const text = query.mode === "path" ? file.path : file.name
          const match = fuzzyMatch(q, text)
          if (match) {
            const nameOnly = query.mode === "fuzzy" && !file.path.includes("/") && !file.path.includes("\\") ? 10 : 0
            scored.push({
              result: {
                filePath: file.path,
                fileName: file.name,
                matches: [],
                matchCount: 0,
              },
              score: match.score + nameOnly,
            })
            filesMatched++
          }
        }

        if (filesScanned % SEARCH_BATCH_SIZE === 0) {
          reportProgress("searching")
        }
      }

      if (fuzzy) {
        scored.sort((a, b) => b.score - a.score)
        const slice = scored.slice(0, maxResults).map((s) => s.result)
        reportProgress("searching")
        return slice
      }

      reportProgress("searching")
      return results
    }

    for (let i = 0; i < this.files.length; i += SEARCH_BATCH_SIZE) {
      if (query.signal?.aborted) return []
      const batch = this.files.slice(i, i + SEARCH_BATCH_SIZE)
      filesScanned += batch.length

      await this.ensureBatchContentCached(
        batch.filter((f) => !shouldSkipFile(f.name)).map((f) => f.path),
        null,
      )

      for (const file of batch) {
        if (results.length >= maxResults) break
        if (query.extension && file.extension !== query.extension) continue
        if (shouldSkipFile(file.name)) continue

        const content = this.contentCache.get(file.path) ?? file.cachedContent
        if (content === null) continue

        const lines = content.split("\n")
        const fileMatches: Array<{ line: number; lineContent: string; column?: number }> = []

        for (let ln = 0; ln < lines.length; ln++) {
          const line = lines[ln]
          const haystack = query.caseSensitive ? line : line.toLowerCase()
          const col = haystack.indexOf(needle)
          if (col !== -1) {
            fileMatches.push({ line: ln + 1, lineContent: line.trim(), column: col + 1 })
          }
        }

        if (fileMatches.length > 0) {
          results.push({
            filePath: file.path,
            fileName: file.name,
            matches: fileMatches.slice(0, 50),
            matchCount: fileMatches.length,
          })
          filesMatched++
        }
      }

      reportProgress("searching")
    }

    return results
  }

  async reindexFile(path: string, rootPath: string | null): Promise<void> {
    const idx = this.files.findIndex((f) => f.path === path)
    if (idx === -1) return

    const file = this.files[idx]
    if (shouldSkipFile(file.name)) return

    this.contentCache.delete(path)
    file.cachedContent = null
  }

  addFile(path: string, name: string, size: number): void {
    if (this.files.some((f) => f.path === path)) return
    const ext = name.split(".").pop()?.toLowerCase() ?? ""
    this.files.push({
      path,
      name,
      extension: ext,
      size,
      cachedContent: null,
    })
  }

  removeFile(path: string): void {
    const idx = this.files.findIndex((f) => f.path === path)
    if (idx !== -1) {
      this.files.splice(idx, 1)
    }
    this.contentCache.delete(path)
  }

  renameFile(oldPath: string, newPath: string, newName: string): void {
    const file = this.files.find((f) => f.path === oldPath)
    if (file) {
      this.contentCache.delete(oldPath)
      file.path = newPath
      file.name = newName
      file.extension = newName.split(".").pop()?.toLowerCase() ?? ""
    }
  }

  getFileCount(): number {
    return this.files.length
  }

  getStats(): { totalFiles: number; cachedFiles: number; memoryEstimateKB: number } {
    return {
      totalFiles: this.files.length,
      cachedFiles: this.contentCache.count,
      memoryEstimateKB: Math.round(this.contentCache.size / 1024),
    }
  }

  destroy(): void {
    this.files = []
    this.ready = false
    this.contentCache.clear()
  }
}

export const workspaceIndex = new SearchIndex()

async function readFileContent(path: string): Promise<string> {
  try {
    const fs = await import("@tauri-apps/plugin-fs")
    return await fs.readTextFile(path)
  } catch {
    try {
      const core = await import("@tauri-apps/api/core")
      return String(await core.invoke("read_text_file", { path }))
    } catch {
      throw new Error("Cannot read file")
    }
  }
}
