import { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect, useMemo } from "react"
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useTreeModel } from "./hooks/useTreeModel"
import { useFileActions } from "./hooks/useFileActions"
import { useGitStatus } from "./hooks/useGitStatus"
import { useAgentFileBadges } from "./hooks/useAgentFileBadges"
import { WorkspaceHeader } from "./components/WorkspaceHeader"
import { SearchBar } from "./components/SearchBar"
import { ProjectMapPanel } from "./components/ProjectMapPanel"
import type { ExplorerHandle } from "./types"
import {
  FilePlus, FolderPlus, Search, FileCode,
  ChevronRight, ChevronDown, Loader2,
  Hash, Sparkles, Pencil, Eye, ListChecks,
} from "lucide-react"
import { useComponentState } from "@/lib/state/useComponentState"
import { workspaceSymbolIndex, type SymbolInfo } from "@/lib/symbol-index"
import { semanticSearch, type SemanticSearchResult } from "@/lib/semantic-search"
import type { FileEntry } from "@/types"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { getSpringConfig } from "@/lib/motion"

function ContextMenuItem({ label, onClick, icon, className }: {
  label: string; onClick: () => void; icon?: React.ReactNode; className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/[0.06] transition-colors flex items-center gap-2",
        className,
      )}
    >
      {icon && <span className="w-3.5 h-3.5 shrink-0 text-white/30">{icon}</span>}
      {label}
    </button>
  )
}

interface WorkspaceExplorerProps {
  onOpenWorkspace?: () => void
}

interface FlatNode {
  id: string
  name: string
  path: string
  depth: number
  isDir: boolean
  isExpanded: boolean
  children: FileEntry[]
  gitStatus?: string
  agentBadge?: { label: string; color: string; icon?: string }
  hasChildren: boolean
}

/** Default height for a tree row without any indicators */
const BASE_ROW_HEIGHT = 24
/** Extra height added when a badge is present */
const BADGE_EXTRA_HEIGHT = 4
/** Extra height for rows with both git status and agent badge */
const DUAL_INDICATOR_EXTRA = 6
/** Min height to prevent zero-height rows */
const MIN_ROW_HEIGHT = 20
/** Max height to cap extremely tall rows */
const MAX_ROW_HEIGHT = 48

/**
 * Dynamic row height measurement system.
 * Stores measured heights keyed by row index, with a fallback estimate.
 * Each VirtualTreeRow measures its own DOM height via ResizeObserver.
 */
class RowHeightCache {
  private measurements = new Map<number, number>()

  /** Get cached height or compute fallback estimate */
  get(index: number, node: FlatNode): number {
    const cached = this.measurements.get(index)
    if (cached !== undefined) return clampHeight(cached)
    return clampHeight(estimateRowHeight(node))
  }

  /** Store a measured height */
  set(index: number, height: number): void {
    this.measurements.set(index, clampHeight(height))
  }

  /** Clear all cached measurements (e.g. when tree changes) */
  clear(): void {
    this.measurements.clear()
  }

  /** Remove measurement for a specific index */
  remove(index: number): void {
    this.measurements.delete(index)
  }

  /** Get total number of cached measurements */
  get size(): number {
    return this.measurements.size
  }
}

/** Clamp height within acceptable bounds */
function clampHeight(h: number): number {
  return Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, Math.round(h)))
}

const AGENT_BADGE_STYLES: Record<string, { bg: string; text: string }> = {
  editing: { bg: "bg-amber-500/15", text: "text-amber-300" },
  reading: { bg: "bg-blue-500/15", text: "text-blue-300" },
  reviewing: { bg: "bg-cyan-500/15", text: "text-cyan-300" },
  referenced: { bg: "bg-purple-500/15", text: "text-purple-300" },
  referencing: { bg: "bg-purple-500/12", text: "text-purple-300" },
}

const AGENT_BADGE_ICONS: Record<string, string> = {
  editing: "✎",
  reading: "○",
  reviewing: "✓",
  referenced: "⊚",
}

function estimateRowHeight(node: FlatNode): number {
  let h = BASE_ROW_HEIGHT
  if (node.agentBadge) h += BADGE_EXTRA_HEIGHT
  if (node.agentBadge && node.gitStatus) h += DUAL_INDICATOR_EXTRA - BADGE_EXTRA_HEIGHT
  return h
}

/** Global height cache shared across the explorer instance */
const rowHeightCache = new RowHeightCache()

function VirtualTreeRow({
  node,
  style,
  isActiveFile,
  onToggle,
  onSelect,
  onContextMenu,
  rowIndex,
}: {
  node: FlatNode
  style: React.CSSProperties
  isActiveFile: boolean
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  onContextMenu: (e: React.MouseEvent, path: string) => void
  rowIndex: number
}) {
  const agentColor = node.isDir ? undefined : node.agentBadge?.color
  const badgeKey = node.agentBadge ? node.agentBadge.label.toLowerCase() : ""
  const badgeStyle = node.agentBadge ? AGENT_BADGE_STYLES[badgeKey] || AGENT_BADGE_STYLES.referenced : null
  const badgeIcon = node.agentBadge ? AGENT_BADGE_ICONS[badgeKey] || "○" : null
  const measureRef = useRef<HTMLDivElement>(null)

  // Measure actual row height after mount and when row content changes
  useEffect(() => {
    const el = measureRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        rowHeightCache.set(rowIndex, entry.contentRect.height)
      }
    })
    observer.observe(el)
    // Initial measurement
    rowHeightCache.set(rowIndex, el.getBoundingClientRect().height)
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowIndex, node.name, node.gitStatus, node.agentBadge?.label])

  return (
    <div
      ref={measureRef}
      style={{
        ...style,
        borderLeft: agentColor ? `2px solid ${agentColor}` : isActiveFile ? "2px solid rgba(59,130,246,0.5)" : undefined,
      }}
      className={cn(
        "flex items-center gap-1 px-1 text-xs cursor-pointer group select-none",
        isActiveFile ? "bg-blue-500/[0.06]" : agentColor ? "bg-white/[0.02]" : "hover:bg-white/[0.03]",
      )}
      onClick={() => (node.isDir ? onToggle(node.path) : onSelect(node.path))}
      onContextMenu={(e) => onContextMenu(e, node.path)}
      role="treeitem"
      aria-expanded={node.isDir ? node.isExpanded : undefined}
      aria-selected={isActiveFile}
    >
      <div style={{ width: node.depth * 12 }} className="shrink-0" />

      {node.isDir ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(node.path) }}
          className="flex items-center justify-center h-4 w-4 rounded hover:bg-white/[0.06] shrink-0"
          aria-label={node.isExpanded ? "Collapse folder" : "Expand folder"}
        >
          {node.isExpanded ? (
            <ChevronDown className="h-2.5 w-2.5 text-white/30" />
          ) : (
            <ChevronRight className="h-2.5 w-2.5 text-white/30" />
          )}
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}

      <div className="flex items-center justify-center h-4 w-4 shrink-0">
        {node.isDir ? (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
            <rect x="1.5" y="3.5" width="13" height="10" rx="1.5" fill="#6366f1" fillOpacity={node.isExpanded ? "0.6" : "0.4"} />
            <path d="M1.5 5.5h13" stroke="#1e1e2e" strokeWidth="0.8" />
            <rect x="1.5" y="2" width="6" height="2" rx="0.8" fill="#6366f1" fillOpacity="0.4" />
          </svg>
        ) : (
          <FileCode className="h-3 w-3 text-blue-400/40" />
        )}
      </div>

      <span className={cn(
        "truncate text-[11px]",
        isActiveFile ? "text-blue-300 font-medium" : node.isDir ? "text-white/60 font-medium" : "text-white/45",
      )}>
        {node.name}
      </span>

      {node.gitStatus && (
        <span className={cn(
          "ml-auto text-[9px] font-mono px-1 rounded",
          node.gitStatus === "M" && "text-yellow-400 bg-yellow-400/10",
          node.gitStatus === "A" && "text-green-400 bg-green-400/10",
          node.gitStatus === "D" && "text-red-400 bg-red-400/10",
          node.gitStatus === "R" && "text-blue-400 bg-blue-400/10",
          node.gitStatus === "U" && "text-white/40 bg-white/[0.04]",
        )}>
          {node.gitStatus}
        </span>
      )}

      {node.agentBadge && badgeStyle && (
        <span className={cn(
          "ml-auto flex items-center gap-0.5 text-[8px] px-1 rounded truncate max-w-[72px]",
          badgeStyle.bg, badgeStyle.text,
        )}>
          <span className="text-[9px] leading-none">{badgeIcon}</span>
          {badgeKey === "editing" ? "Editing" :
           badgeKey === "reading" ? "Reading" :
           badgeKey === "reviewing" ? "QA" : "Ref"}
        </span>
      )}
    </div>
  )
}

function flattenTree(
  entries: FileEntry[],
  expandedPaths: Set<string>,
  gitStatus: Record<string, string>,
  fileActivities: Record<string, { label: string; color: string }>,
  depth = 0
): FlatNode[] {
  const result: FlatNode[] = []
  const sorted = [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  for (const entry of sorted) {
    const entryPath = entry.path || entry.name
    const isExpanded = expandedPaths.has(entryPath)
    const activity = fileActivities[entryPath] || undefined
    result.push({
      id: entryPath,
      name: entry.name,
      path: entryPath,
      depth,
      isDir: entry.is_dir,
      isExpanded,
      children: entry.children,
      gitStatus: gitStatus[entryPath],
      agentBadge: activity,
      hasChildren: entry.is_dir && entry.children.length > 0,
    })
    if (entry.is_dir && isExpanded && entry.children) {
      result.push(...flattenTree(entry.children, expandedPaths, gitStatus, fileActivities, depth + 1))
    }
  }

  return result
}

const WorkspaceExplorer = forwardRef<ExplorerHandle, WorkspaceExplorerProps>(
  function WorkspaceExplorer(props, ref) {
    const { onOpenWorkspace } = props

    const rootPath = useWorkspaceStore((s) => s.rootPath)
    const fileTree = useWorkspaceStore((s) => s.fileTree)
    const isLoading = useWorkspaceStore((s) => s.isLoading)
    const openFile = useWorkspaceStore((s) => s.openFile)
    const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)

    const [searchQuery, setSearchQuery] = useState("")
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
    const [symbolResults, setSymbolResults] = useState<SymbolInfo[]>([])
    const [fileSearchResults, setFileSearchResults] = useState<FlatNode[]>([])
    const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([])
    const [creatingState, setCreatingState] = useState<{ type: "file" | "folder"; parent: string | null } | null>(null)
    const [createName, setCreateName] = useState("")

    const scrollRef = useRef<HTMLDivElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const parentRef = useRef<HTMLDivElement>(null)

    const { gitStatus } = useGitStatus(rootPath)
    const { fileActivities: badgeArray } = useAgentFileBadges(rootPath)

    const fileActivityRecord = useMemo(() => {
      const map: Record<string, { label: string; color: string }> = {}
      for (const fa of badgeArray) {
        map[fa.path] = { label: fa.label, color: fa.color }
      }
      return map
    }, [badgeArray])

    const gitStatusMap = useMemo(() => {
      if (!gitStatus || !rootPath) return {}
      const map: Record<string, string> = {}
      const normRoot = rootPath.replace(/\\/g, "/").replace(/\/$/, "")
      const STATUS_CHAR: Record<string, string> = {
        modified: "M", added: "A", deleted: "D", renamed: "R", untracked: "U",
      }
      for (const entry of gitStatus) {
        const absPath = `${normRoot}/${entry.path}`
        map[absPath] = STATUS_CHAR[entry.status] || entry.status[0]?.toUpperCase() || "?"
      }
      return map
    }, [gitStatus, rootPath])

    const {
      model,
      loadTree,
      refreshTree,
      collapseAll,
      expandAll,
      startRenaming,
    } = useTreeModel(searchQuery, undefined, gitStatus, badgeArray)

    const actions = useFileActions(refreshTree)
    const actionsRef = useRef(actions)
    actionsRef.current = actions

    useImperativeHandle(ref, () => ({
      collapseAll: () => collapseAll(),
      focusSearch: () => searchInputRef.current?.focus(),
    }), [collapseAll])

    useEffect(() => {
      if (rootPath && fileTree.length === 0 && !isLoading) {
        loadTree()
      }
    }, [rootPath, fileTree.length, isLoading, loadTree])

    useEffect(() => {
      if (!rootPath || fileTree.length === 0) return
      const timer = setTimeout(() => {
        semanticSearch.buildIndex(fileTree, rootPath)
      }, 2000)
      return () => clearTimeout(timer)
    }, [rootPath, fileTree])

    const isSearching = searchQuery.length >= 1

    const flatTree = useMemo(() => {
      if (isSearching) return []
      return flattenTree(fileTree, expandedPaths, gitStatusMap, fileActivityRecord)
    }, [fileTree, expandedPaths, gitStatusMap, fileActivityRecord, isSearching])

    // Clear height cache when tree structure changes
    useEffect(() => {
      rowHeightCache.clear()
    }, [flatTree.length])

    const virtualizer = useVirtualizer({
      count: flatTree.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: (index) => {
        const node = flatTree[index]
        if (!node) return BASE_ROW_HEIGHT
        return rowHeightCache.get(index, node)
      },
      overscan: 20,
      // Enable dynamic measurement by allowing the virtualizer to re-measure
      // when the actual DOM size differs from the estimate
      getItemKey: (index) => flatTree[index]?.id ?? index,
    })

    useEffect(() => {
      if (!searchQuery || searchQuery.length < 2) {
        setSymbolResults([])
        setFileSearchResults([])
        return
      }

      const lower = searchQuery.toLowerCase()
      const fileResults: FlatNode[] = []

      function searchTree(entries: FileEntry[], depth = 0) {
        for (const entry of entries) {
          if (entry.name.toLowerCase().includes(lower)) {
            fileResults.push({
              id: entry.path || entry.name,
              name: entry.name,
              path: entry.path || entry.name,
              depth,
              isDir: entry.is_dir,
              isExpanded: false,
              children: entry.children,
              hasChildren: entry.is_dir && entry.children.length > 0,
            })
          }
          if (entry.is_dir && entry.children) {
            searchTree(entry.children, depth + 1)
          }
        }
      }
      searchTree(fileTree)

      let symResults: SymbolInfo[] = []
      try {
        symResults = workspaceSymbolIndex.fuzzySearchSymbols(searchQuery).slice(0, 15)
      } catch {}

      setFileSearchResults(fileResults.slice(0, 100))
      setSymbolResults(symResults)

      if (semanticSearch.ready && lower.length >= 2) {
        const semResults = semanticSearch.search(searchQuery, 10)
        setSemanticResults(semResults)
      } else {
        setSemanticResults([])
      }
    }, [searchQuery, fileTree])

    const handleToggle = useCallback((path: string) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        return next
      })
    }, [])

    const handleSelect = useCallback((path: string) => {
      const entry = findEntry(fileTree, path)
      if (entry && !entry.is_dir && rootPath) {
        const loadContent = async () => {
          try {
            const { readFile } = await import("@/lib/filesystem")
            const content = await readFile(path)
            openFile({ path, name: entry.name, content, isDirty: false })
          } catch {
            openFile({ path, name: entry.name, content: "", isDirty: false })
          }
        }
        loadContent()
      }
    }, [rootPath, openFile, fileTree])

    const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number; isDir: boolean } | null>(null)

    const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
      e.preventDefault()
      const entry = findEntry(fileTree, path)
      setContextMenu({ path, x: e.clientX, y: e.clientY, isDir: entry?.is_dir ?? false })
    }, [fileTree])

    const closeContextMenu = useCallback(() => {
      setContextMenu(null)
    }, [])

    const doRename = useCallback((path: string) => {
      startRenaming(path)
      closeContextMenu()
    }, [startRenaming, closeContextMenu])

    const handleCreateSubmit = useCallback(() => {
      if (!createName.trim() || !rootPath) return
      const parent = creatingState?.parent || rootPath
      const fullPath = parent.endsWith("\\") || parent.endsWith("/")
        ? `${parent}${createName.trim()}`
        : `${parent}\\${createName.trim()}`
      if (creatingState?.type === "folder") {
        actions.createFolder(parent, createName.trim())
      } else {
        actions.createFile(parent, createName.trim())
      }
      setCreatingState(null)
      setCreateName("")
    }, [createName, creatingState, rootPath, actions])

    const handleCreateCancel = useCallback(() => {
      setCreatingState(null)
      setCreateName("")
    }, [])

    const hasModel = model !== null
    const state = useComponentState({
      isDisabled: !rootPath,
      isLoading: isLoading || (rootPath ? fileTree.length === 0 && !hasModel : false),
      isEmpty: !!rootPath && !isLoading && fileTree.length === 0 && !hasModel,
    })

    const fileCount = useMemo(() => countAllNodes(fileTree), [fileTree])

    if (state.category === "disabled" && onOpenWorkspace) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
          <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-white/30" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          </div>
          <p className="text-xs text-white/30">No workspace open</p>
          <button
            onClick={onOpenWorkspace}
            className="px-4 py-1.5 text-xs font-medium text-white/70 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded transition-colors"
          >
            Open Folder
          </button>
        </div>
      )
    }

    if (state.category === "loading") {
      return (
        <div className="flex flex-col h-full select-none">
          <WorkspaceHeader rootPath={rootPath} fileCount={0} isLoading={true} />
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="h-4 w-4 animate-spin text-white/20" />
          </div>
        </div>
      )
    }

    if (state.category === "empty") {
      return (
        <div className="flex flex-col h-full select-none">
          <WorkspaceHeader rootPath={rootPath} fileCount={0} isLoading={false} />
          <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center px-4">
            <Search className="h-6 w-6 text-white/10" />
            <p className="text-[11px] text-white/25">No files found</p>
          </div>
        </div>
      )
    }

    const rows = virtualizer.getVirtualItems()

    return (
      <div ref={parentRef} className="flex flex-col h-full select-none">
        <WorkspaceHeader
          rootPath={rootPath}
          fileCount={fileCount}
          isLoading={isLoading}
          onNewFile={() => setCreatingState({ type: "file", parent: null })}
          onNewFolder={() => setCreatingState({ type: "folder", parent: null })}
          onRefresh={refreshTree}
          onCollapseAll={collapseAll}
          onExpandAll={expandAll}
        />

        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery("")}
        />

        <div
          ref={scrollRef}
          className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-white/[0.03] scrollbar-track-transparent"
          role="tree"
          aria-label="File explorer"
        >
          {isSearching ? (
            <div className="py-2 space-y-1">
              {symbolResults.length > 0 && (
                <div className="px-2">
                  <div className="flex items-center gap-1 text-[8px] text-white/20 uppercase tracking-wider font-medium mb-1">
                    <Hash className="h-2.5 w-2.5" />
                    Symbols
                  </div>
                  {symbolResults.map((sym) => (
                    <div
                      key={`${sym.file}-${sym.name}-${sym.line}`}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/[0.03] cursor-pointer text-[11px]"
                      onClick={() => {
                        handleSelect(sym.file)
                        setSearchQuery("")
                      }}
                    >
                      <Hash className="h-2.5 w-2.5 text-blue-400/40 shrink-0" />
                      <span className="text-white/60 font-mono truncate">{sym.name}</span>
                      <span className="text-[8px] text-white/20 shrink-0">{sym.kind}</span>
                      <span className="text-[8px] text-white/15 truncate max-w-[100px] ml-auto">{sym.file}</span>
                    </div>
                  ))}
                </div>
              )}

              {fileSearchResults.length > 0 && (
                <div className="px-2">
                  <div className="flex items-center gap-1 text-[8px] text-white/20 uppercase tracking-wider font-medium mb-1">
                    <FileCode className="h-2.5 w-2.5" />
                    Files ({fileSearchResults.length})
                  </div>
                  {fileSearchResults.slice(0, 50).map((node) => (
                    <div
                      key={node.id}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/[0.03] cursor-pointer text-[11px]"
                      onClick={() => {
                        handleSelect(node.path)
                        setSearchQuery("")
                      }}
                    >
                      <FileCode className="h-2.5 w-2.5 text-blue-400/30 shrink-0" />
                      <span className="text-white/50 truncate">{node.name}</span>
                      <span className="text-[8px] text-white/15 truncate ml-auto max-w-[120px]">{node.path}</span>
                    </div>
                  ))}
                </div>
              )}

              {semanticResults.length > 0 && (
                <div className="px-2">
                  <div className="flex items-center gap-1 text-[8px] text-white/20 uppercase tracking-wider font-medium mb-1">
                    <Sparkles className="h-2.5 w-2.5 text-purple-400/60" />
                    Semantic ({semanticResults.length})
                  </div>
                  {semanticResults.map((result) => (
                    <div
                      key={result.filePath}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/[0.03] cursor-pointer text-[11px]"
                      onClick={() => {
                        handleSelect(result.filePath)
                        setSearchQuery("")
                      }}
                    >
                      <Sparkles className="h-2.5 w-2.5 text-purple-400/40 shrink-0" />
                      <span className="text-white/50 truncate">{result.fileName}</span>
                      <span className="text-[8px] text-white/20 ml-auto">{result.score.toFixed(1)}</span>
                      <span className="text-[8px] text-white/15 truncate max-w-[100px]">{result.filePath}</span>
                    </div>
                  ))}
                </div>
              )}

              {symbolResults.length === 0 && fileSearchResults.length === 0 && semanticResults.length === 0 && (
                <div className="flex items-center justify-center py-8">
                  <p className="text-[10px] text-white/20">No results for &ldquo;{searchQuery}&rdquo;</p>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rows.map((row) => {
                const node = flatTree[row.index]
                if (!node) return null
                const isActive = activeFilePath === node.path
                const measuredHeight = rowHeightCache.get(row.index, node)
                return (
                  <div
                    key={row.key}
                    data-index={row.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: measuredHeight,
                      transform: `translateY(${row.start}px)`,
                    }}
                  >
                    <VirtualTreeRow
                      node={node}
                      style={{ width: "100%" }}
                      isActiveFile={isActive}
                      onToggle={handleToggle}
                      onSelect={handleSelect}
                      onContextMenu={handleContextMenu}
                      rowIndex={row.index}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <ProjectMapPanel />

        <AnimatePresence>
          {creatingState && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={getSpringConfig("fast")}
              className="px-2 py-1.5 border-t border-white/[0.06]"
            >
              <div className="flex items-center gap-1.5">
                {creatingState.type === "folder" ? (
                  <FolderPlus className="h-3 w-3 shrink-0 text-white/30" />
                ) : (
                  <FilePlus className="h-3 w-3 shrink-0 text-white/30" />
                )}
                <input
                  autoFocus
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSubmit()
                    else if (e.key === "Escape") handleCreateCancel()
                    e.stopPropagation()
                  }}
                  onBlur={() => {
                    if (!createName.trim()) handleCreateCancel()
                  }}
                  placeholder={creatingState.type === "folder" ? "Folder name..." : "File name..."}
                  className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-white/70 outline-none placeholder-white/20 focus:border-blue-500/40 transition-colors"
                  aria-label={`Name for new ${creatingState.type}`}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {contextMenu && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="fixed inset-0 z-50"
              onClick={closeContextMenu}
              onContextMenu={(e) => { e.preventDefault(); closeContextMenu() }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="absolute w-44 bg-[#1a1a1b] border border-white/[0.08] rounded-lg shadow-2xl shadow-black/60 overflow-hidden py-1"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onClick={(e) => e.stopPropagation()}
              >
                <ContextMenuItem label="Open" icon={<FileCode className="h-3 w-3" />} onClick={() => { handleSelect(contextMenu.path); closeContextMenu() }} />
                <div className="h-px bg-white/[0.06] mx-2 my-1" />
                <ContextMenuItem label="Rename" icon={<Pencil className="h-3 w-3" />} onClick={() => doRename(contextMenu.path)} />
                {contextMenu.isDir && (
                  <ContextMenuItem label="New File" icon={<FilePlus className="h-3 w-3" />} onClick={() => { setCreatingState({ type: "file", parent: contextMenu.path }); setCreateName(""); closeContextMenu() }} />
                )}
                {contextMenu.isDir && (
                  <ContextMenuItem label="New Folder" icon={<FolderPlus className="h-3 w-3" />} onClick={() => { setCreatingState({ type: "folder", parent: contextMenu.path }); setCreateName(""); closeContextMenu() }} />
                )}
                <div className="h-px bg-white/[0.06] mx-2 my-1" />
                <ContextMenuItem label="Copy Path" icon={<ListChecks className="h-3 w-3" />} onClick={() => { actions.copyPath(contextMenu.path); closeContextMenu() }} />
                {!contextMenu.isDir && (
                  <ContextMenuItem label="Duplicate" icon={<FileCode className="h-3 w-3" />} onClick={() => { actions.duplicateEntry(contextMenu.path); closeContextMenu() }} />
                )}
                <ContextMenuItem label="Reveal in Explorer" icon={<Eye className="h-3 w-3" />} onClick={() => { actions.revealInOs(contextMenu.path); closeContextMenu() }} />
                <div className="h-px bg-white/[0.06] mx-2 my-1" />
                <ContextMenuItem label="Delete" icon={<FilePlus className="h-3 w-3 rotate-45" />} className="text-red-400 hover:bg-red-500/10" onClick={() => { if (confirm(`Delete ${contextMenu.path.split(/[/\\]+/).pop()}?`)) { actions.deleteEntry(contextMenu.path) }; closeContextMenu() }} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }
)

function findEntry(entries: FileEntry[], path: string): FileEntry | undefined {
  for (const entry of entries) {
    const entryPath = entry.path || entry.name
    if (entryPath === path) return entry
    if (entry.is_dir && entry.children) {
      const found = findEntry(entry.children, path)
      if (found) return found
    }
  }
  return undefined
}

function countAllNodes(entries: FileEntry[]): number {
  let count = 0
  for (const e of entries) {
    count++
    if (e.is_dir) count += countAllNodes(e.children)
  }
  return count
}

export { WorkspaceExplorer }
export type { ExplorerHandle as WorkspaceExplorerHandle }
