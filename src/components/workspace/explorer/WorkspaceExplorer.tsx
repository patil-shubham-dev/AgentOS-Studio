import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle, type KeyboardEvent } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useExplorerStore, type GitBadge } from "@/stores/explorer-store"
import { useAgentStore } from "@/stores/agent-store"
import { FileTree, type FileTreeHandle, type FileTreeProps } from "@/components/workspace/file-tree"
import { ProjectMap } from "./ProjectMap"
import { workspaceIndex, type SearchResult } from "@/lib/search-index"
import { cn } from "@/lib/utils"
import { getAgentLabel } from "@/components/workspace/agent-visibility/AgentActivityMapper"
import {
  Search, X, File, Folder, FolderOpen, ChevronRight, ChevronDown,
  GitBranch, Plus, Star, Sparkles, Map, Bot,
  PanelLeftClose, PanelLeft, RefreshCw,
} from "lucide-react"

interface SectionDef {
  id: string
  label: string
  icon: typeof Search
  count?: number
}

const SECTIONS: SectionDef[] = [
  { id: "search", label: "Search", icon: Search },
  { id: "files", label: "Files", icon: Folder },
  { id: "open-files", label: "Open Files", icon: File },
  { id: "git", label: "Git Changes", icon: GitBranch },
  { id: "agents", label: "Agents", icon: Sparkles },
  { id: "project-map", label: "Project Map", icon: Map },
]

function SectionHeader({
  section,
  collapsed,
  onToggle,
  count,
}: {
  section: SectionDef
  collapsed: boolean
  onToggle: () => void
  count?: number
}) {
  const Icon = section.icon
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white/40 hover:text-white/60 hover:bg-white/[0.03] transition-colors"
    >
      {collapsed ? (
        <ChevronRight className="h-3 w-3 shrink-0" />
      ) : (
        <ChevronDown className="h-3 w-3 shrink-0" />
      )}
      <Icon className="h-3 w-3 shrink-0" />
      <span>{section.label}</span>
      {count !== undefined && (
        <span className="ml-auto text-[10px] text-white/20">{count}</span>
      )}
    </button>
  )
}

function SearchSection({
  query,
  results,
  onOpenFile,
  onClose,
  highlightedIndex,
  onHighlightChange,
}: {
  query: string
  results: SearchResult[]
  onOpenFile: (path: string) => void
  onClose: () => void
  highlightedIndex: number
  onHighlightChange: (index: number) => void
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
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-1">
        <div className="flex-1 relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20" />
          <input
            value={query}
            readOnly
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded pl-7 pr-2 py-1 text-[11px] text-white/60 outline-none"
          />
        </div>
        <button onClick={onClose} className="text-white/20 hover:text-white/60">
          <X className="h-3 w-3" />
        </button>
      </div>
      <div ref={parentRef} className="flex-1 overflow-auto" style={{ height: results.length > 0 ? Math.min(results.length * 28, 300) : 0 }}>
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
                    "absolute left-0 right-0 flex items-center gap-2 px-3 py-1 text-[11px] cursor-pointer truncate",
                    virtualRow.index === highlightedIndex
                      ? "text-white bg-white/[0.08]"
                      : "text-white/50 hover:text-white hover:bg-white/[0.04]",
                  )}
                  style={{ transform: `translateY(${virtualRow.start}px)`, height: virtualRow.size }}
                >
                  <File className="h-3 w-3 shrink-0 text-white/20" />
                  {result.filePath}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="px-3 py-2 text-[11px] text-white/20">No results</div>
        )}
      </div>
    </div>
  )
}

function OpenFilesSection() {
  const openFiles = useWorkspaceStore((s) => s.openFiles)
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)
  const closeFile = useWorkspaceStore((s) => s.closeFile)
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile)
  const fileActivities = useAgentStore((s) => s.fileActivities)

  function getFileActivity(path: string) {
    const normPath = path.replace(/\\/g, "/")
    return fileActivities.find((fa) => fa.path.includes(normPath) || normPath.includes(fa.path))
  }

  if (openFiles.length === 0) {
    return (
      <div className="px-3 py-2 text-[11px] text-white/20">No open files</div>
    )
  }

  return (
    <div className="flex flex-col">
      {openFiles.map((f) => {
        const activity = getFileActivity(f.path)
        const activityColors: Record<string, string> = {
          editing: "text-amber-400",
          reading: "text-blue-400",
          referencing: "text-purple-400",
          reviewing: "text-cyan-400",
        }
        return (
          <button
            key={f.path}
            onClick={() => setActiveFile(f.path)}
            className={cn(
              "flex items-center gap-2 px-3 py-1 text-[11px] hover:bg-white/[0.04] transition-colors text-left",
              f.path === activeFilePath ? "text-white bg-white/[0.06]" : "text-white/50",
            )}
          >
            <File className="h-3 w-3 shrink-0 text-white/20" />
            <span className="flex-1 truncate">{f.name}</span>
            {activity && (
              <span className={cn("text-[9px] shrink-0 flex items-center gap-0.5", activityColors[activity.activity] ?? "text-white/30")}>
                <Bot className="h-2.5 w-2.5" />
                {activity.activity === "editing" ? "Editing" : activity.activity === "reading" ? "Reading" : activity.activity === "reviewing" ? "Reviewing" : "Referenced"}
              </span>
            )}
            {f.isDirty && <span className="h-1.5 w-1.5 rounded-full bg-yellow-400/60 shrink-0" />}
            <button
              onClick={(e) => { e.stopPropagation(); closeFile(f.path) }}
              className="text-white/10 hover:text-white/50"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </button>
        )
      })}
    </div>
  )
}

function GitChangesSection() {
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const [changes, setChanges] = useState<GitBadge[]>([])
  const [branch, setBranch] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!rootPath) return
    setLoading(true)
    let cancelled = false
    async function fetchGit() {
      try { const { invoke } = await import("@tauri-apps/api/core"); const res = await invoke<{ branch: string; changes: { path: string; status: string }[] }>("git_status", { workingDir: rootPath }); if (!cancelled) { setBranch(res.branch); setChanges(res.changes.map((c) => ({ status: c.status, path: c.path }))) } } catch { if (!cancelled) setChanges([]) } finally { if (!cancelled) setLoading(false) }
    }
    fetchGit()
    return () => { cancelled = true }
  }, [rootPath])

  const statusColor = (status: string) => {
    if (status.startsWith("M")) return "text-yellow-400"
    if (status.startsWith("A")) return "text-green-400"
    if (status.startsWith("D")) return "text-red-400"
    if (status.startsWith("R")) return "text-blue-400"
    if (status.startsWith("?")) return "text-white/40"
    return "text-white/30"
  }

  const statusLabel = (status: string) => {
    if (status.startsWith("M")) return "M"
    if (status.startsWith("A")) return "A"
    if (status.startsWith("D")) return "D"
    if (status.startsWith("R")) return "R"
    if (status.startsWith("?")) return "U"
    return status.trim()
  }

  if (loading) {
    return <div className="px-3 py-2 text-[11px] text-white/20">Loading...</div>
  }

  if (!branch) {
    return <div className="px-3 py-2 text-[11px] text-white/20">Not a git repository</div>
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1 text-[10px] text-white/30">
        <GitBranch className="h-3 w-3" />
        <span>{branch}</span>
        {changes.length > 0 && (
          <span className="ml-auto text-white/20">{changes.length} change{changes.length !== 1 ? "s" : ""}</span>
        )}
      </div>
      {changes.length === 0 ? (
        <div className="px-3 py-2 text-[11px] text-white/20">No changes</div>
      ) : (
        changes.slice(0, 50).map((c) => (
          <div key={c.path} className="flex items-center gap-2 px-3 py-0.5 text-[11px] text-white/50">
            <span className={cn("font-mono text-[10px] w-4 text-center shrink-0", statusColor(c.status))}>
              {statusLabel(c.status)}
            </span>
            <span className="truncate">{c.path}</span>
          </div>
        ))
      )}
    </div>
  )
}

function AgentsSection() {
  const aiContextFiles = useWorkspaceStore((s) => s.aiContextFiles)
  const suggestedFiles = useWorkspaceStore((s) => s.suggestedFiles)

  if (aiContextFiles.length === 0 && suggestedFiles.length === 0) {
    return (
      <div className="px-3 py-2 text-[11px] text-white/20">No agent activity</div>
    )
  }

  return (
    <div className="flex flex-col">
      {aiContextFiles.length > 0 && (
        <>
          <div className="px-3 py-1 text-[10px] font-medium text-white/20 uppercase tracking-wider">Context</div>
          {aiContextFiles.slice(0, 10).map((f) => (
            <div key={f.path} className="flex items-center gap-2 px-3 py-0.5 text-[11px] text-white/50">
              <Sparkles className="h-3 w-3 shrink-0 text-blue-400/60" />
              <span className="truncate">{f.name}</span>
              <span className="ml-auto text-[10px] text-white/20">{Math.round(f.relevance * 100)}%</span>
            </div>
          ))}
        </>
      )}
      {suggestedFiles.length > 0 && (
        <>
          <div className="px-3 py-1 text-[10px] font-medium text-white/20 uppercase tracking-wider">Suggested</div>
          {suggestedFiles.slice(0, 10).map((path) => (
            <div key={path} className="flex items-center gap-2 px-3 py-0.5 text-[11px] text-white/50">
              <Star className="h-3 w-3 shrink-0 text-amber-400/60" />
              <span className="truncate">{path}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function ProjectMapSection() {
  return <ProjectMap />
}

interface WorkspaceExplorerProps extends FileTreeProps {}

interface WorkspaceExplorerHandle {
  collapseAll: () => void
  getSelectedPaths: () => string[]
}

const WorkspaceExplorer = forwardRef<WorkspaceExplorerHandle, WorkspaceExplorerProps>(
  function WorkspaceExplorer(props, ref) {
    const { onOpenWorkspace, creatingType, creatingParent, onCreateSubmit, onCreateCancel, onDeleteEntry, onRenameSubmit } = props
    const rootPath = useWorkspaceStore((s) => s.rootPath)
    const fileTree = useWorkspaceStore((s) => s.fileTree)
    const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)
    const setActiveFile = useWorkspaceStore((s) => s.setActiveFile)
    const openFile = useWorkspaceStore((s) => s.openFile)

    const searchQuery = useExplorerStore((s) => s.searchQuery)
    const setSearchQuery = useExplorerStore((s) => s.setSearchQuery)
    const searchResults = useExplorerStore((s) => s.searchResults)
    const setSearchResults = useExplorerStore((s) => s.setSearchResults)
    const collapsedSectionIds = useExplorerStore((s) => s.collapsedSectionIds)
    const toggleSection = useExplorerStore((s) => s.toggleSection)
    const isSectionCollapsed = useExplorerStore((s) => s.isSectionCollapsed)
    const persistState = useExplorerStore((s) => s.persistState)
    const restoreState = useExplorerStore((s) => s.restoreState)

    const fileTreeRef = useRef<FileTreeHandle>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    const highlightedIndexRef = useRef(highlightedIndex)
    highlightedIndexRef.current = highlightedIndex
    const searchResultsRef = useRef(searchResults)
    searchResultsRef.current = searchResults

    useImperativeHandle(ref, () => ({
      collapseAll: () => fileTreeRef.current?.collapseAll(),
      getSelectedPaths: () => fileTreeRef.current?.getSelectedPaths() ?? [],
    }), [])

    useEffect(() => {
      restoreState()
    }, [rootPath, restoreState])

    useEffect(() => {
      persistState()
    })

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
        const results = workspaceIndex.search({ query: q, mode: "fuzzy", caseSensitive: false, maxResults: 50 })
        setSearchResults(results)
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
            openFile({ path, name, content, isDirty: false })
          } catch {
            setActiveFile(path)
          }
        }
        openAndFetch()
      },
      [openFile, setActiveFile],
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

    const handleRefresh = useCallback(async () => {
      const rp = useWorkspaceStore.getState().rootPath
      if (!rp) return
      const { loadFileTree } = await import("@/lib/workspace")
      const setFileTree = useWorkspaceStore.getState().setFileTree
      const tree = await loadFileTree(rp)
      setFileTree(tree)
    }, [])

    const isSearching = searchQuery.length >= 2

    return (
      <div className="flex flex-col h-full">
        {/* Search bar */}
        <div className="px-2 py-1.5 border-b border-white/[0.06]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20 pointer-events-none" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={handleSearchInput}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search files..."
              className="w-full bg-white/[0.06] border border-white/[0.08] rounded pl-7 pr-7 py-1.5 text-[11px] text-white/70 outline-none placeholder-white/20 focus:border-blue-500/40 transition-colors"
            />
            {searchQuery && (
              <button onClick={handleSearchClear} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Search results section (when actively searching) */}
        {isSearching && (
          <div className="border-b border-white/[0.06] max-h-[300px] overflow-hidden">
            <SearchSection
              query={searchQuery}
              results={searchResults}
              onOpenFile={handleOpenSearchFile}
              onClose={handleSearchClear}
              highlightedIndex={highlightedIndex}
              onHighlightChange={setHighlightedIndex}
            />
          </div>
        )}

        {/* Sections */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Files Section */}
          <div>
            <SectionHeader
              section={SECTIONS[1]}
              collapsed={isSectionCollapsed("files")}
              onToggle={() => toggleSection("files")}
              count={fileTree.length}
            />
            {!isSectionCollapsed("files") && (
              <div className={cn(isSearching ? "opacity-30 pointer-events-none" : "")}>
                <FileTree
                  ref={fileTreeRef}
                  onOpenWorkspace={onOpenWorkspace}
                  creatingType={creatingType ?? null}
                  creatingParent={creatingParent ?? null}
                  onCreateSubmit={onCreateSubmit}
                  onCreateCancel={onCreateCancel}
                  onDeleteEntry={onDeleteEntry}
                  onRenameSubmit={onRenameSubmit}
                />
              </div>
            )}
          </div>

          {/* Open Files Section */}
          <div>
            <SectionHeader
              section={SECTIONS[2]}
              collapsed={isSectionCollapsed("open-files")}
              onToggle={() => toggleSection("open-files")}
            />
            {!isSectionCollapsed("open-files") && <OpenFilesSection />}
          </div>

          {/* Git Changes Section */}
          <div>
            <SectionHeader
              section={SECTIONS[3]}
              collapsed={isSectionCollapsed("git")}
              onToggle={() => toggleSection("git")}
            />
            {!isSectionCollapsed("git") && <GitChangesSection />}
          </div>

          {/* Agents Section */}
          <div>
            <SectionHeader
              section={SECTIONS[4]}
              collapsed={isSectionCollapsed("agents")}
              onToggle={() => toggleSection("agents")}
            />
            {!isSectionCollapsed("agents") && <AgentsSection />}
          </div>

          {/* Project Map Section */}
          <div>
            <SectionHeader
              section={SECTIONS[5]}
              collapsed={isSectionCollapsed("project-map")}
              onToggle={() => toggleSection("project-map")}
            />
            {!isSectionCollapsed("project-map") && <ProjectMapSection />}
          </div>

          {/* Spacer for scroll comfort */}
          <div className="h-8" />
        </div>
      </div>
    )
  },
)

export { WorkspaceExplorer }
export type { WorkspaceExplorerHandle }
