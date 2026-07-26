import { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from "react"
import { FileTree } from "@pierre/trees/react"
import type { FileTreeContextMenuItem, FileTreeContextMenuOpenContext } from "@pierre/trees"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useAgentStore } from "@/stores/agent-store"
import { useTreeModel } from "./hooks/useTreeModel"
import { useFileActions } from "./hooks/useFileActions"
import { FileTreeContextMenu } from "./FileTreeContextMenu"
import { WorkspaceHeader } from "./components/WorkspaceHeader"
import { SearchBar } from "./components/SearchBar"
import { PinnedFilesSection, RecentFilesSection, OpenEditorsSection } from "./components/PinnedFilesSection"
import { SemanticSearchSection } from "./components/SemanticSearchSection"
import { RelatedFilesSection } from "./components/RelatedFilesSection"
import { FolderOpen, Loader2, Files, FolderPlus } from "lucide-react"
import { Skeleton, FileTreeSkeleton } from "@/components/ui/Skeleton"

export interface ExplorerHandle {
  collapseAll: () => void
  expandAll: () => void
  focusSearch: () => void
  refresh: () => Promise<void>
}

interface ExplorerProps {
  onOpenFile?: (absPath: string) => void
  onCreateFile?: (absPath: string, name: string) => void
  onOpenWorkspace?: () => void
}

export const Explorer = forwardRef<ExplorerHandle, ExplorerProps>(function Explorer(
  { onOpenFile, onCreateFile: _onCreateFile, onOpenWorkspace },
  ref,
) {
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const isLoading = useWorkspaceStore((s) => s.isLoading)
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const closeWorkspace = useWorkspaceStore((s) => s.closeWorkspace)
  const fileActivities = useAgentStore((s) => s.fileActivities)
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)

  const [searchQuery, setSearchQuery] = useState("")
  const [creatingFile, setCreatingFile] = useState<string | null>(null)
  const [creatingFolder, setCreatingFolder] = useState<string | null>(null)
  const fileTreeRef = useRef<HTMLDivElement>(null)
  const prevActivitiesRef = useRef(fileActivities)

  const handleSelectionChange = useCallback((paths: readonly string[]) => {
    if (paths.length > 0 && onOpenFile) {
      const absPath = paths[paths.length - 1]
      const fullPath = rootPath ? rootPath.replace(/\\/g, "/") + "/" + absPath : absPath
      onOpenFile(fullPath)
    }
  }, [onOpenFile, rootPath])

  const { model, loadTree, refreshTree, collapseAll, expandAll } = useTreeModel(
    searchQuery,
    handleSelectionChange,
    fileActivities as { path: string; activity: string }[],
  )

  const { openFile, createFile, createFolder } = useFileActions(refreshTree)

  const handleOpenFile = useCallback((absPath: string) => {
    if (onOpenFile) onOpenFile(absPath)
    else openFile(absPath)
  }, [onOpenFile, openFile])

  useImperativeHandle(ref, () => ({
    collapseAll,
    expandAll,
    focusSearch: () => {},
    refresh: refreshTree,
  }), [collapseAll, expandAll, refreshTree])

  useEffect(() => {
    if (fileActivities !== prevActivitiesRef.current) {
      prevActivitiesRef.current = fileActivities
      model.setSearch(model.getSearchValue() || null)
    }
  }, [fileActivities, model])

  const handleCreateFile = useCallback(async (parentPath: string) => {
    if (!rootPath) return
    setCreatingFile(parentPath)
    setTimeout(() => {
      const input = fileTreeRef.current?.querySelector("[data-create-file-input]") as HTMLInputElement
      input?.focus()
    }, 50)
  }, [rootPath])

  const handleCreateFolder = useCallback(async (parentPath: string) => {
    if (!rootPath) return
    setCreatingFolder(parentPath)
    setTimeout(() => {
      const input = fileTreeRef.current?.querySelector("[data-create-folder-input]") as HTMLInputElement
      input?.focus()
    }, 50)
  }, [rootPath])

  // ── Context menu state ──
  const [contextMenu, setContextMenu] = useState<{
    item: FileTreeContextMenuItem
    context: FileTreeContextMenuOpenContext
  } | null>(null)

  const handleRenderContextMenu = useCallback(
    (item: FileTreeContextMenuItem, context: FileTreeContextMenuOpenContext) => {
      return (
        <FileTreeContextMenu
          item={item}
          context={context}
          onClose={() => setContextMenu(null)}
        />
      )
    },
    [],
  )

  const commitCreateFile = useCallback(async (name: string) => {
    if (!rootPath || !creatingFile) return
    if (!name.trim()) { setCreatingFile(null); return }
    const absPath = creatingFile === "root" ? rootPath : creatingFile
    if (_onCreateFile) _onCreateFile(absPath, name.trim())
    else await createFile(absPath, name.trim())
    setCreatingFile(null)
  }, [rootPath, creatingFile, _onCreateFile, createFile])

  const commitCreateFolder = useCallback(async (name: string) => {
    if (!rootPath || !creatingFolder) return
    if (!name.trim()) { setCreatingFolder(null); return }
    const absPath = creatingFolder === "root" ? rootPath : creatingFolder
    await createFolder(absPath, name.trim())
    setCreatingFolder(null)
  }, [rootPath, creatingFolder, createFolder])

  const initLoad = useRef(false)
  useEffect(() => {
    if (rootPath && !initLoad.current) {
      initLoad.current = true
      loadTree()
    }
  }, [rootPath, loadTree])

  if (!rootPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-3 select-none"
        style={{ background: "var(--surface-panel)" }}>
        <FolderOpen className="h-8 w-8" style={{ color: "var(--text-quaternary)" }} />
        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>No workspace open</span>
        <span className="text-[9px]" style={{ color: "var(--text-quaternary)" }}>Open a folder to start exploring</span>
        <button
          onClick={onOpenWorkspace}
          className="mt-2 flex items-center gap-1.5 rounded px-3 py-1.5 text-[11px] font-medium transition-all"
          style={{
            color: "var(--text-secondary)",
            background: "var(--border-subtle)",
            border: "1px solid var(--border-default)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border-default)"; e.currentTarget.style.color = "var(--text-primary)" }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--border-subtle)"; e.currentTarget.style.color = "var(--text-secondary)" }}
          onFocus={(e) => { e.currentTarget.style.outline = "2px solid var(--color-accent-brand)"; e.currentTarget.style.outlineOffset = "2px" }}
          onBlur={(e) => { e.currentTarget.style.outline = "" }}
        >
          <FolderPlus className="h-3 w-3" />
          Open Folder
        </button>
      </div>
    )
  }

  if (isLoading && !fileTree) {
    return (
      <div className="flex flex-col h-full select-none"
        style={{ background: "var(--surface-panel)" }}>
        <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <Skeleton className="h-2.5" width={80} />
          <div className="flex items-center gap-1">
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3 w-3" />
          </div>
        </div>
        <FileTreeSkeleton />
      </div>
    )
  }

  const fileCount = fileTree ? countFiles(fileTree) : 0

  return (
    <div className="flex flex-col h-full overflow-hidden" ref={fileTreeRef}
      style={{ background: "var(--surface-panel)" }}>
      <WorkspaceHeader
        rootPath={rootPath}
        fileCount={fileCount}
        isLoading={isLoading}
        onNewFile={() => handleCreateFile("root")}
        onNewFolder={() => handleCreateFolder("root")}
        onRefresh={refreshTree}
        onCollapseAll={collapseAll}
        onExpandAll={expandAll}
        onCloseWorkspace={closeWorkspace}
      />
      <SearchBar value={searchQuery} onChange={setSearchQuery} onClear={() => setSearchQuery("")} />
      <PinnedFilesSection rootPath={rootPath} onOpenPath={handleOpenFile} />
      <RecentFilesSection rootPath={rootPath} onOpenPath={handleOpenFile} />
      <OpenEditorsSection rootPath={rootPath} onOpenPath={handleOpenFile} />
      <div className="flex-1 overflow-y-auto min-h-0">
        <FileTree model={model} className="min-h-full" renderContextMenu={handleRenderContextMenu} />
        {creatingFile && (
          <CreateInline type="file" onSubmit={commitCreateFile} onCancel={() => setCreatingFile(null)} />
        )}
        {creatingFolder && (
          <CreateInline type="folder" onSubmit={commitCreateFolder} onCancel={() => setCreatingFolder(null)} />
        )}
        {!searchQuery && fileCount === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-[10px] gap-1 select-none"
            style={{ color: "var(--text-quaternary)" }}>
            <Files className="h-4 w-4" />
            <span>Empty workspace</span>
          </div>
        )}
        {!searchQuery && activeFilePath && (
          <RelatedFilesSection rootPath={rootPath} onOpenPath={handleOpenFile} />
        )}
        {searchQuery && (
          <SemanticSearchSection query={searchQuery} rootPath={rootPath} onOpenPath={handleOpenFile} />
        )}
      </div>
    </div>
  )
})

function CreateInline({ type, onSubmit, onCancel }: { type: "file" | "folder"; onSubmit: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  return (
    <div className="flex items-center gap-1 px-3 py-0.5">
      <span className="text-[10px] shrink-0" style={{ color: "var(--text-tertiary)" }}>
        {type === "file" ? "📄" : "📁"}
      </span>
      <input
        ref={inputRef}
        data-create-file-input={type === "file" ? "" : undefined}
        data-create-folder-input={type === "folder" ? "" : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit(value)
          if (e.key === "Escape") onCancel()
        }}
        onBlur={() => { if (value) onSubmit(value); else onCancel() }}
        placeholder={`New ${type}...`}
        className="flex-1 bg-transparent text-[11px] outline-none border-b"
        style={{
          color: "var(--text-primary)",
          borderColor: "var(--color-accent-brand)",
          outline: "none",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-accent-brand)" }}
      />
    </div>
  )
}

function countFiles(tree: any): number {
  if (!tree) return 0
  let count = 0
  const walk = (nodes: any[]) => {
    for (const node of nodes) {
      if (!node.is_dir) count++
      if (node.children) walk(node.children)
    }
  }
  walk(Array.isArray(tree) ? tree : tree.children || [])
  return count
}
