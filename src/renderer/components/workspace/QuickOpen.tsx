import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { motion } from "framer-motion"
import { workspaceIndex } from "@/lib/search-index"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { cn } from "@/lib/utils"
import { Search, File, X, ArrowUp, ArrowDown, Loader2, Sparkles } from "lucide-react"
import type { SearchResult } from "@/lib/search-index"
import { semanticSearch } from "@/lib/semantic-search"
import { readFile } from "@/lib/filesystem"

interface QuickOpenProps {
  open: boolean
  onClose: () => void
}

export function QuickOpen({ open, onClose }: QuickOpenProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const openFile = useWorkspaceStore((s) => s.openFile)
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile)

  useEffect(() => {
    if (open) {
      setQuery("")
      setResults([])
      setSelectedIndex(0)
      setSearching(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || !workspaceIndex.isReady) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    try {
      const res = await workspaceIndex.search({
        query: q,
        mode: "fuzzy",
        caseSensitive: false,
        maxResults: 50,
      })
      setResults(res)
      setSelectedIndex(0)

      // If few results, supplement with semantic search
      if (res.length < 5 && q.trim().length >= 2) {
        try {
          if (semanticSearch.ready) {
            const semResults = semanticSearch.search(q.trim(), 5)
            if (semResults.length > 0) {
            // Merge semantic results that aren't already in filename results
            const existingPaths = new Set(res.map((r) => r.filePath))
            const newResults = semResults
              .filter((sr) => !existingPaths.has(sr.filePath))
              .map((sr) => ({
                filePath: sr.filePath,
                fileName: sr.fileName,
                matches: [],
                matchCount: 0,
                _semantic: true as const,
              }))
            if (newResults.length > 0) {
              setResults([...res, ...newResults as any])
            }
            }
          }
        } catch {
          // Semantic search not available  noop
        }
      }
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    doSearch(query)
  }, [query, doSearch])

  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const el = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      if (el) el.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  const openFileByPath = useCallback((filePath: string) => {
    const rp = useWorkspaceStore.getState().rootPath
    if (!rp) return
    const loadAndOpen = async () => {
      try {
        const fullPath = rp + "\\" + filePath.replace(/\//g, "\\")
        const content = await readFile(fullPath)
        const name = filePath.split("/").pop() || filePath
        openFile({ path: filePath, name, content, isDirty: false })
      } catch {
        setActiveFile(filePath)
      }
    }
    loadAndOpen()
    onClose()
  }, [openFile, setActiveFile, onClose])

  const flatResults = useMemo(() => {
    const items: Array<{ type: "file"; filePath: string; fileName: string }> = []
    for (const r of results) {
      items.push({ type: "file", filePath: r.filePath, fileName: r.fileName })
    }
    return items
  }, [results])

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
    if (e.key === "Enter" && flatResults[selectedIndex]) {
      e.preventDefault()
      openFileByPath(flatResults[selectedIndex].filePath)
    }
  }, [flatResults, selectedIndex, onClose, openFileByPath])

  if (!open) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
      className="absolute inset-0 z-50 flex"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className={cn(
          "relative mx-auto mt-16 w-full max-w-lg bg-[#0d0d0e] border border-white/[0.08] rounded-xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col",
          results.length > 0 ? "max-h-[60vh]" : "",
        )}
      >
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5">
          <Search className="h-4 w-4 text-white/30 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files by name..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-white/20 font-mono"
          />
          {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/30" />}
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div ref={resultsRef} className="flex-1 overflow-y-auto min-h-0 py-1">
          {!query.trim() ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <File className="h-6 w-6 text-white/10 mb-2" />
              <p className="text-xs text-white/30">Type to search files</p>
              <p className="text-[10px] text-white/15 mt-1">Fuzzy search across all workspace files</p>
              <div className="flex items-center gap-2 mt-4 text-[9px] text-white/20 font-mono">
                <span className="bg-white/[0.04] px-1.5 py-0.5 rounded"></span> Navigate
                <span className="bg-white/[0.04] px-1.5 py-0.5 rounded">Enter</span> Open
                <span className="bg-white/[0.04] px-1.5 py-0.5 rounded">Esc</span> Close
              </div>
            </div>
          ) : flatResults.length === 0 && !searching ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Search className="h-6 w-6 text-white/10 mb-2" />
              <p className="text-xs text-white/30">No files found</p>
              <p className="text-[10px] text-white/15 mt-1">Try a different search term</p>
            </div>
          ) : (
            flatResults.map((item, idx) => {
              const isSemantic = (item as any)._semantic
              return (
                <button
                  key={`${item.filePath}-${idx}`}
                  data-index={idx}
                  onClick={() => openFileByPath(item.filePath)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-1.5 text-left transition-all",
                    selectedIndex === idx ? "bg-blue-500/10" : "hover:bg-white/[0.03]",
                  )}
                >
                  {isSemantic ? (
                    <Sparkles className="h-3 w-3 text-purple-400/50 shrink-0" />
                  ) : (
                    <File className="h-3.5 w-3.5 text-blue-400/50 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-white/80">{item.fileName}</span>
                    <span className="text-[10px] text-white/30 ml-2">{item.filePath}</span>
                  </div>
                  {isSemantic && (
                    <span className="text-[8px] text-purple-400/40 font-mono">semantic</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {flatResults.length > 0 && (
          <div className="flex items-center gap-3 px-3 py-1.5 border-t border-white/[0.04] bg-white/[0.02]">
            <span className="text-[9px] text-white/20 font-mono">
              {flatResults.length} file{flatResults.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2 ml-auto text-[9px] text-white/20 font-mono">
              <span className="bg-white/[0.04] px-1.5 py-0.5 rounded"></span> Navigate
              <span className="bg-white/[0.04] px-1.5 py-0.5 rounded">Enter</span> Open
              <span className="bg-white/[0.04] px-1.5 py-0.5 rounded">Esc</span> Close
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
