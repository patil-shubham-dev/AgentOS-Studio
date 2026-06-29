import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { workspaceIndex } from "@/lib/search-index"
import type { FileEntry } from "@/types"
import { cn } from "@/lib/utils"
import { emitTelemetry } from "@/lib/telemetry"
import { semanticSearch } from "@/lib/semantic-search"
import { readTextFile, invoke } from "@/lib/electron-api"
import {
  Search, X, File, Loader2, ArrowUp, ArrowDown,
  CaseSensitive, FileType, Filter, SearchCode, Sparkles,
} from "lucide-react"

export interface SearchMatch {
  file: string
  line: number
  lineContent: string
  column?: number
}

interface SearchResult {
  filePath: string
  fileName: string
  matches: SearchMatch[]
  /** Score from semantic search */
  score?: number
  /** Snippet from semantic search */
  snippet?: string
}

type SearchMode = "filename" | "content" | "semantic"

const MAX_CONTENT_SEARCH_RESULTS = 2000

interface GlobalSearchProps {
  open: boolean
  onClose: () => void
  onOpenFile: (path: string, line?: number) => void
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

async function readFileContent(path: string): Promise<string> {
  try {
    return await readTextFile(path)
  } catch {
    try {
      return String(await invoke("read_text_file", { path }))
    } catch {
      throw new Error("Cannot read file")
    }
  }
}

export function GlobalSearch({ open, onClose, onOpenFile }: GlobalSearchProps) {
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const rootPath = useWorkspaceStore((s) => s.rootPath)

  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<SearchMode>("filename")
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [extension, setExtension] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [status, setStatus] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [hasSearched, setHasSearched] = useState(false)
  const [useRegex, setUseRegex] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery("")
      setResults([])
      setSearching(false)
      setStatus("")
      setSelectedIndex(-1)
      setHasSearched(false)
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [open])

  const doSearch = useCallback((q: string, m: SearchMode, cs: boolean, ext: string) => {
    if (!q.trim()) {
      setResults([])
      setStatus("")
      setHasSearched(true)
      return
    }

    if (!workspaceIndex.isReady) {
      setStatus("Index not ready — wait for workspace indexing to complete")
      setHasSearched(true)
      return
    }

    setSearching(false)

    const performSearch = async () => {
      if (m === "semantic") {
        // Use semantic search engine
        if (!semanticSearch || !semanticSearch.ready) {
          setStatus("Semantic index not ready — indexing in progress...")
          setHasSearched(true)
          return
        }
        const semResults = semanticSearch.search(q, 50)
        const mapped: SearchResult[] = semResults.map((r: any) => ({
          filePath: r.filePath,
          fileName: r.fileName,
          matches: r.matchSnippet
            ? [{ file: r.filePath, line: 0, lineContent: r.matchSnippet.split('\n')[0] || r.matchSnippet, snippet: r.matchSnippet }]
            : [],
          score: r.score,
          snippet: r.matchSnippet,
        }))

        setResults(mapped)

        if (mapped.length > 0) {
          setStatus(`${mapped.length} semantic result${mapped.length !== 1 ? "s" : ""}`)
        } else if (!engine.ready) {
          setStatus("Semantic index not ready")
        } else {
          setStatus("No semantic matches found")
        }
        setHasSearched(true)
        return
      }

      workspaceIndex.search({
        query: q,
        mode: m,
        caseSensitive: cs,
        extension: ext || undefined,
        maxResults: 2000,
        useRegex: m === "content" ? useRegex : undefined,
      }).then((searchResults) => {
        const mapped = searchResults.map((r) => ({
        filePath: r.filePath,
        fileName: r.fileName,
        matches: r.matches.map((m) => ({
          file: r.filePath,
          line: m.line,
          lineContent: m.lineContent,
          column: m.column,
        })),
      }))

      setResults(mapped)

      if (m === "filename") {
        setStatus(mapped.length > 0 ? `${mapped.length} file${mapped.length !== 1 ? "s" : ""}` : "No files found")
      } else {
        setStatus(mapped.length > 0
          ? `${mapped.reduce((a: number, r: any) => a + r.matches.length, 0)} matches in ${mapped.length} file${mapped.length !== 1 ? "s" : ""}`
          : "No matches found")
      }
      setHasSearched(true)
      }).catch((err) => {
        emitTelemetry({ type: "search_failure", timestamp: Date.now(), error: String(err), metadata: { query: q } })
        setSearching(false)
        setHasSearched(true)
      })
    }

    performSearch()
  }, [])

  useEffect(() => {
    if (!open) return
    if (!query.trim()) {
      setResults([])
      setStatus("")
      setHasSearched(false)
      setSearching(false)
      return
    }
    doSearch(query, mode, caseSensitive, extension)
  }, [query, mode, caseSensitive, extension, open, doSearch, useRegex])

  const flatResults = useMemo(() => {
    const items: { type: "file" | "match"; filePath?: string; fileName?: string; match?: SearchMatch & { snippet?: string }; matchCount?: number; score?: number }[] = []
    for (const r of results) {
      if (mode === "filename" || mode === "semantic") {
        items.push({ type: "file", filePath: r.filePath, fileName: r.fileName, score: r.score })
        if (r.snippet && mode === "semantic") {
          items.push({ type: "match", filePath: r.filePath, match: { file: r.filePath, line: 0, lineContent: r.snippet.split('\n')[0], snippet: r.snippet } })
        }
      } else {
        items.push({ type: "file", filePath: r.filePath, fileName: r.fileName, matchCount: r.matches.length })
        for (const m of r.matches) {
          items.push({ type: "match", filePath: r.filePath, match: m })
        }
      }
    }
    return items
  }, [results, mode])

  const totalResultCount = mode === "filename" ? results.length : results.reduce((a, r) => a + r.matches.length, 0)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose()
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1))
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
      return
    }
    if (e.key === "Enter" && selectedIndex >= 0 && selectedIndex < flatResults.length) {
      e.preventDefault()
      const item = flatResults[selectedIndex]
      if (item.type === "file" && item.filePath) {
        onOpenFile(item.filePath)
        onClose()
      } else if (item.type === "match" && item.match) {
        onOpenFile(item.match.file, item.match.line)
        onClose()
      }
    }
  }, [flatResults, selectedIndex, onClose, onOpenFile])

  const handleResultClick = useCallback((item: { type: string; filePath?: string; match?: SearchMatch }) => {
    if (item.type === "file" && item.filePath) {
      onOpenFile(item.filePath)
      onClose()
    } else if (item.type === "match" && item.match) {
      onOpenFile(item.match.file, item.match.line)
      onClose()
    }
  }, [onClose, onOpenFile])

  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const el = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      if (el) {
        el.scrollIntoView({ block: "nearest" })
      }
    }
  }, [selectedIndex])

  if (!open) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
      className="absolute inset-0 z-40 flex"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Search panel */}
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="relative mx-auto mt-16 w-full max-w-2xl bg-[#0d0d0e] border border-white/[0.08] rounded-xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[70vh]"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
          <Search className="h-4 w-4 text-white/30 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === "filename" ? "Search filenames (partial match)..." : "Search file contents..."}
            className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-white/20 font-mono"
          />
          {/* Mode toggle */}
          <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
            <button
              onClick={() => setMode("filename")}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] font-medium transition-all",
                mode === "filename" ? "bg-blue-500/15 text-blue-400" : "text-white/30 hover:text-white/60",
              )}
            >
              <FileType className="h-3 w-3 inline mr-1" />
              File
            </button>
            <button
              onClick={() => setMode("content")}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] font-medium transition-all",            mode === "content" ? "bg-blue-500/15 text-blue-400" : "text-white/30 hover:text-white/60",
            )}
          >
            <File className="h-3 w-3 inline mr-1" />
            Content
          </button>
          <button
            onClick={() => setMode("semantic")}
            className={cn(
              "rounded-md px-2 py-1 text-[10px] font-medium transition-all",
              mode === "semantic" ? "bg-purple-500/15 text-purple-400" : "text-white/30 hover:text-white/60",
            )}
          >
            <Sparkles className="h-3 w-3 inline mr-1" />
            Semantic
          </button>
          </div>

          {/* Regex toggle (content mode only) */}
          {mode === "content" && (
            <button
              onClick={() => setUseRegex(!useRegex)}
              className={cn(
                "rounded-md p-1.5 transition-all",
                useRegex ? "bg-amber-500/15 text-amber-400" : "text-white/30 hover:text-white/60",
              )}
              title="Use regex pattern"
            >
              <SearchCode className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={cn(
              "rounded-md p-1.5 transition-all",
              caseSensitive ? "bg-blue-500/15 text-blue-400" : "text-white/30 hover:text-white/60",
            )}
            title="Case sensitive"
          >
            <CaseSensitive className="h-3.5 w-3.5" />
          </button>
          <select
            value={extension}
            onChange={(e) => setExtension(e.target.value)}
            className={cn(
              "rounded-md px-1.5 py-1 text-[10px] font-mono bg-transparent border border-white/[0.06] transition-all",
              extension ? "text-blue-400" : "text-white/30 hover:text-white/60",
            )}
            title="Filter by extension"
          >
            <option value="">All</option>
            <option value="ts">.ts</option>
            <option value="tsx">.tsx</option>
            <option value="js">.js</option>
            <option value="jsx">.jsx</option>
            <option value="css">.css</option>
            <option value="html">.html</option>
            <option value="json">.json</option>
            <option value="md">.md</option>
            <option value="py">.py</option>
            <option value="rs">.rs</option>
            <option value="go">.go</option>
            <option value="yaml">.yaml</option>
          </select>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Status bar */}
        {hasSearched && (
          <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.04]">
            <span className="text-[10px] text-white/40">
              {searching && <Loader2 className="h-3 w-3 animate-spin inline mr-1.5" />}
              {status}
            </span>
            <span className="text-[9px] text-white/20 font-mono flex items-center gap-2">
              {useRegex && <span className="text-amber-400/40">Regex</span>}
              {mode === "semantic" && <span className="text-purple-400/40">TF-IDF</span>}
              <span>
                {workspaceIndex.isReady
                  ? `${workspaceIndex.getFileCount()} files indexed`
                  : `Indexing... ${workspaceIndex.getFileCount()} files scanned`}
              </span>
            </span>
          </div>
        )}

        {/* Results */}
        <div ref={resultsRef} className="flex-1 overflow-y-auto min-h-0 max-h-[50vh]">
          {hasSearched && flatResults.length === 0 && !searching && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              {mode === "semantic" ? <Sparkles className="h-8 w-8 text-purple-500/10 mb-3" /> : <Search className="h-8 w-8 text-white/10 mb-3" />}
              <p className="text-xs text-white/30">No results found</p>
              <p className="text-[10px] text-white/15 mt-1">
                {mode === "semantic" ? "Try different keywords or check the semantic index" : mode === "filename" ? "Try a different filename" : "Try a different search term"}
              </p>
            </div>
          )}

          {!hasSearched && !query.trim() && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-8 w-8 text-white/10 mb-3" />
              <p className="text-xs text-white/30">Search across files</p>
              <p className="text-[10px] text-white/15 mt-1">
                {mode === "filename" ? "Type to search filenames" : "Type to search file contents"}
              </p>
              <div className="flex items-center gap-2 mt-4 text-[9px] text-white/20 font-mono">
                <span className="bg-white/[0.04] px-1.5 py-0.5 rounded">↑↓</span> Navigate
                <span className="bg-white/[0.04] px-1.5 py-0.5 rounded">Enter</span> Open
                <span className="bg-white/[0.04] px-1.5 py-0.5 rounded">Esc</span> Close
              </div>
            </div>
          )}

          {flatResults.map((item, idx) => {
            if (item.type === "file") {
              return (
                <button
                  key={`file-${item.filePath}-${idx}`}
                  data-index={idx}
                  onClick={() => handleResultClick(item)}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-1.5 text-left transition-all",
                    selectedIndex === idx ? mode === "semantic" ? "bg-purple-500/10" : "bg-blue-500/10" : "hover:bg-white/[0.03]",
                  )}
                >
                  {mode === "semantic" ? (
                    <Sparkles className="h-3.5 w-3.5 text-purple-400/50 shrink-0" />
                  ) : (
                    <File className="h-3.5 w-3.5 text-blue-400/50 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-white/80">{item.fileName}</span>
                    <span className="text-[10px] text-white/30 ml-2">{item.filePath}</span>
                  </div>
                  {item.score != null && (
                    <span className="text-[9px] text-purple-400/50 font-mono">{item.score.toFixed(1)}</span>
                  )}
                  {mode === "content" && item.matchCount != null && (
                    <span className="text-[9px] text-white/20 font-mono">{item.matchCount} match{item.matchCount !== 1 ? "es" : ""}</span>
                  )}
                </button>
              )
            }

            if (item.type === "match" && item.match) {
              const m = item.match
              const isSemanticSnippet = mode === "semantic" && (m as any).snippet
              return (
                <button
                  key={`match-${m.file}-${m.line}-${idx}`}
                  data-index={idx}
                  onClick={() => handleResultClick(item)}
                  className={cn(
                    "flex items-start gap-2 w-full pl-8 pr-3 py-1 text-left transition-all",
                    selectedIndex === idx ? "bg-purple-500/8" : "hover:bg-white/[0.02]",
                  )}
                >
                  {isSemanticSnippet ? (
                    <span className="flex flex-col w-full gap-0.5">
                      <span className="text-[10px] text-purple-400/30 font-mono">Best match snippet</span>
                      <code className="text-[10px] font-mono text-white/50 leading-relaxed whitespace-pre-wrap line-clamp-3">{(m as any).snippet}</code>
                    </span>
                  ) : (
                    <>
                      <span className="text-[10px] text-blue-400/40 font-mono w-8 text-right shrink-0">{m.line}</span>
                      <span className="text-[11px] font-mono text-white/70 truncate">{m.lineContent}</span>
                    </>
                  )}
                </button>
              )
            }

            return null
          })}

          {searching && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-blue-400/60" />
              <span className="ml-2 text-xs text-white/30">Searching...</span>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
