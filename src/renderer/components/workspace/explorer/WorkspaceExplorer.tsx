import { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef, type KeyboardEvent } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useExplorerStore } from "@/stores/explorer-store"
import { WorkspaceTree } from "@/components/workspace/explorer/TreeAdapter"
import { workspaceIndex, type SearchResult } from "@/lib/search-index"
import { cn } from "@/lib/utils"
import { emitTelemetry } from "@/lib/telemetry"
import {
  Search, X, File, FolderOpen,
  FileSearch, Folder,
} from "lucide-react"

function SearchSection({
  query,
  results,
  onOpenFile,
  onClose,
  highlightedIndex,
  onHighlightChange,
  searchMode,
}: {
  query: string
  results: SearchResult[]
  onOpenFile: (path: string) => void
  onClose: () => void
  highlightedIndex: number
  onHighlightChange: (index: number) => void
  searchMode: string
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 5,
  })

  useEffect(() => {
    if (highlightedIndex >= 0 && highlightedIndex < results.length) {
      virtualizer.scrollToIndex(highlightedIndex, { align: "center" })
    }
  }, [highlightedIndex, virtualizer, results.length])

  if (!query) return null

  return (
    <div className="flex flex-col min-h-0 border-b border-white/[0.06]">
      <div ref={parentRef} className="overflow-auto" style={{ height: results.length > 0 ? Math.min(results.length * 28, 240) : 0 }}>
        {results.length > 0 ? (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const result = results[virtualRow.index]
              return (
                <button
                  key={result.filePath}
                  onClick={() => onOpenFile(result.filePath)}
                  onMouseEnter={() => onHighlightChange(virtualRow.index)}
                  className={cn(
                    "absolute left-0 right-0 flex flex-col gap-0.5 px-3 py-1 text-[11px] cursor-pointer truncate",
                    virtualRow.index === highlightedIndex
                      ? "text-white bg-white/[0.08]"
                      : "text-white/50 hover:text-white hover:bg-white/[0.04]",
                  )}
                  style={{ transform: `translateY(${virtualRow.start}px)`, minHeight: virtualRow.size }}
                >
                  <div className="flex items-center gap-2">
                    <File className="h-3 w-3 shrink-0 text-white/20" />
                    <span className="truncate">{result.filePath}</span>
                    {result.matchCount > 0 && (
                      <span className="shrink-0 text-[10px] text-white/20">{result.matchCount} match{result.matchCount !== 1 ? "es" : ""}</span>
                    )}
                  </div>
                  {searchMode === "content" && result.matches.length > 0 && (
                    <div className="pl-5 space-y-0.5">
                      {result.matches.slice(0, 3).map((m, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[10px] text-white/30 font-mono truncate">
                          <span className="text-[9px] text-white/15 shrink-0">{m.line}</span>
                          <span className="truncate">{m.lineContent.slice(0, 80)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center py-4 text-center">
            <svg viewBox="0 0 40 40" className="w-6 h-6 mb-1.5" fill="none">
              <circle cx="18" cy="18" r="6" className="stroke-white/[0.08]" strokeWidth="1" />
              <line x1="22" y1="22" x2="27" y2="27" className="stroke-white/[0.06]" strokeWidth="1" strokeLinecap="round" />
            </svg>
            <span className="text-[11px] text-white/20">No results</span>
          </div>
        )}
      </div>
    </div>
  )
}

interface WorkspaceExplorerHandle {
  collapseAll: () => void
  getSelectedPaths: () => string[]
}

const WorkspaceExplorer = forwardRef<WorkspaceExplorerHandle, Record<string, unknown>>(
  function WorkspaceExplorer(_props, ref) {
    const rootPath = useWorkspaceStore((s) => s.rootPath)

    const searchQuery = useExplorerStore((s) => s.searchQuery)
    const searchMode = useExplorerStore((s) => s.searchMode)
    const setSearchQuery = useExplorerStore((s) => s.setSearchQuery)
    const setSearchMode = useExplorerStore((s) => s.setSearchMode)
    const searchResults = useExplorerStore((s) => s.searchResults)
    const setSearchResults = useExplorerStore((s) => s.setSearchResults)

    const searchInputRef = useRef<HTMLInputElement>(null)
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    const highlightedIndexRef = useRef(highlightedIndex)
    highlightedIndexRef.current = highlightedIndex
    const searchResultsRef = useRef(searchResults)
    searchResultsRef.current = searchResults

    useImperativeHandle(ref, () => ({
      collapseAll: () => {},
      getSelectedPaths: () => [],
    }), [])

    useEffect(() => {
      const handleKeyDown = (e: globalThis.KeyboardEvent) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return
        if (e.key.length !== 1) return
        if (document.activeElement === searchInputRef.current) return
        if (
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement ||
          document.activeElement instanceof HTMLSelectElement
        ) return
        searchInputRef.current?.focus()
      }
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }, [])

    const handleSearchInput = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const q = e.target.value
        setSearchQuery(q)
        setHighlightedIndex(-1)
        if (q.length < 2) {
          setSearchResults([])
          return
        }
        const mode = useExplorerStore.getState().searchMode
        workspaceIndex.search({
          query: q,
          mode: mode === "content" ? "content" : "fuzzy",
          caseSensitive: false,
          maxResults: 50,
        }).then((results) => {
          setSearchResults(results)
        }).catch((err) => {
          emitTelemetry({ type: "search_failure", timestamp: Date.now(), error: String(err), metadata: { query: q } })
          setSearchResults([])
        })
      },
      [setSearchQuery, setSearchResults, setHighlightedIndex],
    )

    const handleOpenSearchFile = useCallback(
      (path: string) => {
        const openAndFetch = async () => {
          const rp = useWorkspaceStore.getState().rootPath
          if (!rp) return
          try {
            const { readFile } = await import("@/lib/workspace")
            const content = await readFile(rp + "\\" + path.replace(/\//g, "\\"))
            const name = path.split("/").pop() || path
            useWorkspaceStore.getState().openFile({ path, name, content, isDirty: false })
          } catch {
            useWorkspaceStore.getState().setActiveFile(path)
          }
        }
        openAndFetch()
      },
      [],
    )

    const handleSearchKeyDown = useCallback(
      (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
          setSearchQuery("")
          setSearchResults([])
          setHighlightedIndex(-1)
          searchInputRef.current?.blur()
        } else if (e.key === "ArrowDown") {
          e.preventDefault()
          setHighlightedIndex((prev) => {
            const max = searchResultsRef.current.length - 1
            return prev < max ? prev + 1 : 0
          })
        } else if (e.key === "ArrowUp") {
          e.preventDefault()
          setHighlightedIndex((prev) => {
            const max = searchResultsRef.current.length - 1
            return prev > 0 ? prev - 1 : max
          })
        } else if (e.key === "Enter") {
          e.preventDefault()
          const idx = highlightedIndexRef.current
          const results = searchResultsRef.current
          if (idx >= 0 && idx < results.length) {
            handleOpenSearchFile(results[idx].filePath)
          }
        }
      },
      [setSearchQuery, setSearchResults, setHighlightedIndex, handleOpenSearchFile],
    )

    const handleSearchClear = useCallback(() => {
      setSearchQuery("")
      setSearchResults([])
      setHighlightedIndex(-1)
      searchInputRef.current?.focus()
    }, [setSearchQuery, setSearchResults, setHighlightedIndex])

    const isSearching = searchQuery.length >= 2

    return (
      <div className="flex flex-col h-full">
        {/* Search bar */}
        <div className="px-2 py-1.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20 pointer-events-none" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={handleSearchInput}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchMode === "content" ? "Search file contents..." : "Search files..."}
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded pl-7 pr-2 py-1.5 text-[11px] text-white/70 outline-none placeholder-white/20 focus:border-blue-500/40 transition-colors"
              />
            </div>
            <button
              onClick={() => setSearchMode(searchMode === "filename" ? "content" : "filename")}
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-1 text-[9px] font-medium border transition-colors shrink-0",
                searchMode === "content"
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  : "bg-white/[0.04] text-white/30 border-white/[0.06] hover:text-white/50",
              )}
              title={searchMode === "content" ? "Searching file contents" : "Searching filenames"}
            >
              <FileSearch className="h-3 w-3" />
            </button>
            {searchQuery && (
              <button onClick={handleSearchClear} className="text-white/20 hover:text-white/60 shrink-0">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Search results section (when actively searching) */}
        {isSearching && (
          <SearchSection
            query={searchQuery}
            results={searchResults}
            onOpenFile={handleOpenSearchFile}
            onClose={handleSearchClear}
            highlightedIndex={highlightedIndex}
            onHighlightChange={setHighlightedIndex}
            searchMode={searchMode}
          />
        )}

        {/* File tree — takes ~95% of remaining vertical space */}
        <div className={cn(
          "flex-1 overflow-hidden min-h-0",
          isSearching && "opacity-30 pointer-events-none",
        )}>
          {/* Workspace name header */}
          {rootPath && (
            <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium text-white/25 uppercase tracking-widest border-b border-white/[0.04]">
              <Folder className="h-3 w-3 shrink-0 text-white/30" />
              <span className="truncate">{rootPath.split(/[/\\]/).pop()}</span>
            </div>
          )}
          <WorkspaceTree />
        </div>
      </div>
    )
  },
)

export { WorkspaceExplorer }
export type { WorkspaceExplorerHandle }
