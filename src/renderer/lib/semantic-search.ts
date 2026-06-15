import type { FileEntry } from "@/types"

export interface SemanticSearchResult {
  filePath: string
  fileName: string
  score: number
  matchSnippet?: string
}

interface TermStats {
  tf: number
  docFreq: number
}

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

    for (const qTerm of stemmedQuery) {
      const docMap = this.termIndex.get(qTerm)
      if (!docMap) continue

      if (this.totalDocs === 0) continue
      const idf = Math.log(1 + (this.totalDocs - docMap.size + 0.5) / (docMap.size + 0.5))

      for (const [docPath, tf] of docMap) {
        const currentScore = docScores.get(docPath) || 0
        docScores.set(docPath, currentScore + tf * idf)
      }
    }

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
      const total = score + bonus
      if (total <= 0) continue
      results.push({
        filePath: docPath,
        fileName: this.docNames.get(docPath) || docPath.split(/[/\\]/).pop() || docPath,
        score: total,
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
    this.totalDocs = 0
    this.isReady = false
    this.isBuilding = false
  }
}

export const semanticSearch = new SemanticSearchEngine()
