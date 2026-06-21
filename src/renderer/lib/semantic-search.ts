import type { FileEntry } from "@/types"

export interface SemanticSearchResult {
  filePath: string
  fileName: string
  score: number
  matchSnippet?: string
  matchLines?: number[]
  /** How many terms from the query matched in this document (for hybrid ranking) */
  matchedQueryTerms?: number
}

interface TermStats {
  tf: number
  docFreq: number
}

interface DocContentCache {
  content: string
  indexedAt: number
}

const MAX_FILE_SIZE = 512 * 1024
const SNIPPET_LINES_BEFORE = 2
const SNIPPET_LINES_AFTER = 2
const MAX_SNIPPET_CHARS = 600

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "can", "could",
  "shall", "should", "may", "might", "must", "this", "that", "these", "those",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their", "mine", "yours", "theirs",
  "and", "or", "but", "if", "else", "when", "while", "for", "of", "in", "on",
  "at", "by", "with", "from", "to", "into", "through", "during", "before",
  "after", "above", "below", "between", "out", "off", "over", "under",
  "again", "further", "then", "once", "here", "there", "where", "why", "how",
  "all", "each", "every", "both", "few", "more", "most", "other", "some",
  "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too",
  "very", "just", "because", "as", "until", "about", "up",
])

function tokenizeCode(content: string): string[] {
  const tokens: string[] = []

  const lines = content.split("\n")
  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*")) {
      continue
    }

    const stringLiterals = trimmed.match(/(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g)
    if (stringLiterals) {
      for (const s of stringLiterals) {
        const inner = s.slice(1, -1)
        const words = inner.split(/[^a-zA-Z0-9_$]+/).filter(Boolean)
        for (const w of words) {
          if (w.length >= 2) tokens.push(w.toLowerCase())
        }
      }
    }

    const identifiers = trimmed.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g)
    if (identifiers) {
      for (const id of identifiers) {
        if (id.length < 2) continue
        if (id.toUpperCase() === id && id.length > 4) continue
        tokens.push(id.toLowerCase())
        const camelParts = id.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)
        if (camelParts.length > 1) {
          for (const part of camelParts) {
            if (part.length >= 2) tokens.push(part.toLowerCase())
          }
        }
        const snakeParts = id.split("_")
        if (snakeParts.length > 1) {
          for (const part of snakeParts) {
            if (part.length >= 2) tokens.push(part.toLowerCase())
          }
        }
      }
    }

    const comment = trimmed.match(/\/\*[\s\S]*?\*\//g)
    if (comment) {
      for (const c of comment) {
        const words = c.replace(/[^a-zA-Z\s]/g, " ").split(/\s+/).filter(Boolean)
        for (const w of words) {
          if (w.length >= 3 && !STOP_WORDS.has(w.toLowerCase())) {
            tokens.push(w.toLowerCase())
          }
        }
      }
    }
  }

  return tokens.filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
}

function tokenizeQuery(query: string): string[] {
  const raw = query.match(/[a-zA-Z0-9_$]+/g) || []
  const expanded = new Set<string>()

  for (const token of raw) {
    if (token.length < 2) continue

    const lower = token.toLowerCase()
    expanded.add(lower)
    expanded.add(token)

    const camelParts = token.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)
    if (camelParts.length > 1) {
      for (const part of camelParts) {
        if (part.length >= 1) expanded.add(part.toLowerCase())
      }
    }
    const snakeParts = token.split("_")
    if (snakeParts.length > 1) {
      for (const part of snakeParts) {
        if (part.length >= 1) expanded.add(part.toLowerCase())
      }
    }
  }

  return Array.from(expanded).filter((t) => t.length >= 2 && !STOP_WORDS.has(t.toLowerCase()))
}

function stem(word: string): string {
  let w = word.toLowerCase()
  if (w.endsWith("ing")) {
    const base = w.slice(0, -3)
    if (base.length >= 3) w = base
  } else if (w.endsWith("ied") || w.endsWith("ies")) {
    const base = w.slice(0, -3)
    if (base.length >= 2) w = base + "y"
  } else if (w.endsWith("ed")) {
    const base = w.slice(0, -2)
    if (base.length >= 3) w = base
  } else if (w.endsWith("es") && w.length > 4) {
    const base = w.slice(0, -2)
    if (base.length >= 3) w = base
  } else if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) {
    const base = w.slice(0, -1)
    if (base.length >= 3) w = base
  } else if (w.endsWith("ly")) {
    const base = w.slice(0, -2)
    if (base.length >= 3) w = base
  } else if (w.endsWith("er") || w.endsWith("est")) {
    const base = w.slice(0, -2)
    if (base.length >= 3) w = base
  }
  return w
}

export class SemanticSearchEngine {
  private termIndex = new Map<string, Map<string, number>>()
  private docLengths = new Map<string, number>()
  private docNames = new Map<string, string>()
  private totalDocs = 0
  private isReady = false
  private isBuilding = false
  private buildSignal: AbortController | null = null
  // Content cache for snippet extraction
  private docContentCache = new Map<string, DocContentCache>()

  get ready(): boolean {
    return this.isReady
  }

  get building(): boolean {
    return this.isBuilding
  }

  get indexedFiles(): number {
    return this.totalDocs
  }

  async buildIndex(
    entries: FileEntry[],
    rootPath: string | null,
    signal?: AbortSignal
  ): Promise<void> {
    this.buildSignal?.abort()
    this.buildSignal = new AbortController()
    const mergedSignal = signal || this.buildSignal.signal

    this.isBuilding = true
    this.termIndex.clear()
    this.docLengths.clear()
    this.docNames.clear()
    this.totalDocs = 0

    const files = this.flattenFiles(entries)
    if (mergedSignal.aborted) {
      this.isBuilding = false
      this.isReady = true
      return
    }

    const BATCH_SIZE = 20
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      if (mergedSignal.aborted) {
        this.isBuilding = false
        this.isReady = true
        return
      }

      const batch = files.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async (entry) => {
          const entryPath = entry.path || entry.name
          try {
            const fullPath = rootPath
              ? `${rootPath}\\${entryPath.replace(/\//g, "\\")}`
              : entryPath
            const { readTextFile } = await import("@/lib/electron-api")
            const content = await readTextFile(fullPath)
            this.indexDocument(entryPath, entry.name, content)
            this.cacheContent(entryPath, content)
          } catch {
            this.indexDocument(entryPath, entry.name, "")
          }
        })
      )
    }

    this.isBuilding = false
    this.isReady = true
  }

  private indexDocument(path: string, name: string, content: string): void {
    const tokens = tokenizeCode(content)
    if (tokens.length === 0 && content.length > 0) return

    this.docLengths.set(path, tokens.length || 1)
    this.docNames.set(path, name)
    this.totalDocs++

    const termCounts = new Map<string, number>()
    for (const token of tokens) {
      const stemmed = stem(token)
      termCounts.set(stemmed, (termCounts.get(stemmed) || 0) + 1)
    }

    const maxFreq = Math.max(1, ...termCounts.values())

    for (const [term, count] of termCounts) {
      let docMap = this.termIndex.get(term)
      if (!docMap) {
        docMap = new Map()
        this.termIndex.set(term, docMap)
      }
      docMap.set(path, count / maxFreq)
    }
  }

  search(query: string, maxResults = 20): SemanticSearchResult[] {
    if (!this.isReady || !query.trim()) return []

    const queryTokens = tokenizeQuery(query)
    if (queryTokens.length === 0) return []

    const stemmedQuery = queryTokens.map((t) => stem(t))
    const docScores = new Map<string, number>()
    const docTermHits = new Map<string, Set<string>>()

    for (const qTerm of stemmedQuery) {
      const docMap = this.termIndex.get(qTerm)
      if (!docMap) continue

      if (this.totalDocs === 0) continue
      const idf = Math.log(1 + (this.totalDocs - docMap.size + 0.5) / (docMap.size + 0.5))

      for (const [docPath, tf] of docMap) {
        const currentScore = docScores.get(docPath) || 0
        docScores.set(docPath, currentScore + tf * idf)

        let hits = docTermHits.get(docPath)
        if (!hits) {
          hits = new Set()
          docTermHits.set(docPath, hits)
        }
        hits.add(qTerm)
      }
    }

    // Path/name bonus scoring
    const pathScoreBonus = new Map<string, number>()
    for (const docPath of docScores.keys()) {
      const name = this.docNames.get(docPath) || ""
      const pathLower = docPath.toLowerCase()
      let bonus = 0
      for (const qt of queryTokens) {
        const lowerQt = qt.toLowerCase()
        if (name.toLowerCase().includes(lowerQt)) bonus += 5
        if (pathLower.includes(lowerQt)) bonus += 2
      }
      pathScoreBonus.set(docPath, bonus)
    }

    const results: SemanticSearchResult[] = []
    for (const [docPath, score] of docScores) {
      const bonus = pathScoreBonus.get(docPath) || 0
      const hits = docTermHits.get(docPath)
      const matchedCount = hits ? hits.size : 0
      // Bonus for matching more distinct query terms (hybrid boost)
      const hybridBoost = matchedCount >= stemmedQuery.length ? 10 : matchedCount > 1 ? 5 : 0
      const total = score + bonus + hybridBoost
      if (total <= 0) continue

      // Try to extract a snippet
      const snippet = this.docContentCache.get(docPath)
      const matchSnippet = snippet
        ? this.extractSnippet(snippet.content, queryTokens)
        : undefined

      results.push({
        filePath: docPath,
        fileName: this.docNames.get(docPath) || docPath.split(/[/\\]/).pop() || docPath,
        score: total,
        matchSnippet,
        matchedQueryTerms: matchedCount,
      })
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, maxResults)
  }

  private flattenFiles(entries: FileEntry[], basePath = ""): FileEntry[] {
    const result: FileEntry[] = []
    for (const entry of entries) {
      const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name
      if (entry.is_dir) {
        result.push(...this.flattenFiles(entry.children, entryPath))
      } else {
        result.push({ ...entry, path: entryPath })
      }
    }
    return result
  }

  /**
   * Re-index a single file incrementally without rebuilding the entire index.
   * Removes the old document's terms and re-indexes the new content.
   */
  reindexFile(filePath: string, content: string): void {
    // Remove old document's terms first
    this.removeDocument(filePath)
    // Re-index with new content
    const name = filePath.split(/[/\\]/).pop() || filePath
    this.indexDocument(filePath, name, content)
    this.cacheContent(filePath, content)
  }

  /**
   * Remove a document from the index entirely.
   */
  private removeDocument(path: string): void {
    // Remove from doc metadata
    this.docLengths.delete(path)
    this.docNames.delete(path)
    this.docContentCache.delete(path)

    // Remove all term entries pointing to this document
    for (const [, docMap] of this.termIndex) {
      docMap.delete(path)
    }

    // Clean up empty term entries
    for (const [term, docMap] of this.termIndex) {
      if (docMap.size === 0) {
        this.termIndex.delete(term)
      }
    }

    this.totalDocs = Math.max(0, this.totalDocs - 1)
  }

  /**
   * Remove a file from the index (e.g. the file was deleted in the workspace).
   */
  removeFile(filePath: string): void {
    this.removeDocument(filePath)
  }

  /**
   * Extract the best matching code snippet from a file's content given query tokens.
   * Finds the line(s) with the highest density of matched terms.
   */
  private extractSnippet(content: string, queryTokens: string[]): string | undefined {
    const lines = content.split("\n")
    if (lines.length === 0) return undefined

    const lowerTokens = queryTokens.map((t) => t.toLowerCase())

    // Score each line for relevance to query tokens
    const lineScores = lines.map((line, idx) => {
      const lower = line.toLowerCase()
      let score = 0
      for (const token of lowerTokens) {
        if (lower.includes(token)) score += 10
        // Partial matches too
        if (token.length >= 3 && lower.includes(token.substring(0, token.length - 1))) score += 3
      }
      // Boost lines with actual identifiers (not just whitespace)
      if (/[a-zA-Z_]/.test(line)) score += 1
      return { idx, score }
    })

    // Find the highest-scoring window
    let bestStart = 0
    let bestScore = 0
    for (let i = 0; i < lineScores.length; i++) {
      const end = Math.min(i + SNIPPET_LINES_BEFORE + 1 + SNIPPET_LINES_AFTER, lineScores.length)
      const windowScore = lineScores
        .slice(i, end)
        .reduce((sum, ls) => sum + ls.score, 0)
      if (windowScore > bestScore) {
        bestScore = windowScore
        bestStart = Math.max(0, i - SNIPPET_LINES_BEFORE)
      }
    }

    if (bestScore === 0) return undefined

    const endIdx = Math.min(bestStart + SNIPPET_LINES_BEFORE + 1 + SNIPPET_LINES_AFTER, lines.length)
    let snippet = lines.slice(bestStart, endIdx).join("\n")
    if (snippet.length > MAX_SNIPPET_CHARS) {
      snippet = snippet.substring(0, MAX_SNIPPET_CHARS) + "..."
    }
    return snippet
  }

  /**
   * Serialize the term index to a JSON-compatible structure for caching.
   */
  exportIndex(): object | null {
    if (this.totalDocs === 0) return null
    const terms: Record<string, [string, number][]> = {}
    for (const [term, docMap] of this.termIndex) {
      terms[term] = Array.from(docMap.entries())
    }
    return {
      version: 1,
      terms,
      docLengths: Object.fromEntries(Array.from(this.docLengths.entries())),
      docNames: Object.fromEntries(Array.from(this.docNames.entries())),
      totalDocs: this.totalDocs,
      indexedAt: Date.now(),
    }
  }

  /**
   * Deserialize a previously exported index.
   */
  importIndex(data: object): boolean {
    try {
      const d = data as any
      if (d.version !== 1) return false

      this.termIndex.clear()
      this.docLengths.clear()
      this.docNames.clear()
      this.totalDocs = 0

      for (const [term, entries] of Object.entries(d.terms)) {
        const docMap = new Map<string, number>(entries as [string, number][])
        this.termIndex.set(term, docMap)
      }

      for (const [path, length] of Object.entries(d.docLengths)) {
        this.docLengths.set(path, length as number)
      }

      for (const [path, name] of Object.entries(d.docNames)) {
        this.docNames.set(path, name as string)
      }

      this.totalDocs = d.totalDocs as number
      this.isReady = true
      return true
    } catch {
      return false
    }
  }

  getStats() {
    return {
      filesIndexed: this.totalDocs,
      termsIndexed: this.termIndex.size,
      isReady: this.isReady,
      isBuilding: this.isBuilding,
    }
  }

  destroy(): void {
    this.buildSignal?.abort()
    this.termIndex.clear()
    this.docLengths.clear()
    this.docNames.clear()
    this.docContentCache.clear()
    this.totalDocs = 0
    this.isReady = false
    this.isBuilding = false
  }

  cacheContent(filePath: string, content: string): void {
    if (content.length > MAX_FILE_SIZE * 2) return
    this.docContentCache.set(filePath, { content, indexedAt: Date.now() })
  }

  clearContentCache(): void {
    this.docContentCache.clear()
  }

  getContentCacheSize(): number {
    return this.docContentCache.size
  }
}

export const semanticSearch = new SemanticSearchEngine()
