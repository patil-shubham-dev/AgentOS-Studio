import { useState, useCallback, useMemo, useImperativeHandle, forwardRef, useRef, useEffect, type MouseEvent, type KeyboardEvent, type DragEvent } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useAgentStore } from "@/stores/agent-store"
import { getAgentLabel } from "@/components/workspace/agent-visibility/AgentActivityMapper"
import { readFile, sanitizeFilename, loadFileTree } from "@/lib/workspace"
import type { FileEntry } from "@/types"
import {
  Bot, File, Folder, FolderOpen, ChevronRight, ChevronDown,
  Sparkles, Clock, Star,
  Trash2, Edit3, FilePlus, FolderPlus,
  Copy, ClipboardPaste, Scissors,
} from "lucide-react"
import { Skeleton } from "@agentic-os/ui"
import { cn } from "@/lib/utils"
import { useToastStore } from "@/stores/toast-store"

// ── Types ──

export interface FileTreeHandle {
  collapseAll: () => void
  getSelectedPaths: () => string[]
}

interface ClipboardState {
  paths: string[]
  operation: "copy" | "cut"
}

interface CreateLocation {
  type: "file" | "folder"
  parent: string
}

// ── Icons ──

const FILE_ICONS: Record<string, { icon: typeof File; color: string }> = {
  ts: { icon: File, color: "text-blue-400" },
  tsx: { icon: File, color: "text-blue-400" },
  js: { icon: File, color: "text-yellow-400" },
  jsx: { icon: File, color: "text-yellow-400" },
  css: { icon: File, color: "text-pink-400" },
  scss: { icon: File, color: "text-pink-400" },
  sass: { icon: File, color: "text-pink-400" },
  less: { icon: File, color: "text-pink-400" },
  html: { icon: File, color: "text-orange-400" },
  json: { icon: File, color: "text-green-400" },
  md: { icon: File, color: "text-purple-400" },
  py: { icon: File, color: "text-blue-300" },
  rs: { icon: File, color: "text-orange-300" },
  go: { icon: File, color: "text-cyan-400" },
  java: { icon: File, color: "text-red-400" },
  c: { icon: File, color: "text-blue-500" },
  cpp: { icon: File, color: "text-blue-500" },
  h: { icon: File, color: "text-purple-300" },
  swift: { icon: File, color: "text-orange-500" },
  kt: { icon: File, color: "text-orange-400" },
  dart: { icon: File, color: "text-cyan-300" },
  yml: { icon: File, color: "text-red-300" },
  yaml: { icon: File, color: "text-red-300" },
  toml: { icon: File, color: "text-amber-400" },
  xml: { icon: File, color: "text-orange-300" },
  svg: { icon: File, color: "text-yellow-300" },
  png: { icon: File, color: "text-purple-400" },
  jpg: { icon: File, color: "text-green-400" },
  jpeg: { icon: File, color: "text-green-400" },
  gif: { icon: File, color: "text-pink-400" },
  ico: { icon: File, color: "text-blue-300" },
  lock: { icon: File, color: "text-white/20" },
  gitignore: { icon: File, color: "text-white/30" },
  env: { icon: File, color: "text-yellow-500" },
}

function FileIcon({ entry }: { entry: FileEntry }) {
  if (entry.is_dir) return null
  const ext = entry.name.split(".").pop()?.toLowerCase() ?? ""
  const match = FILE_ICONS[ext]
  const color = match?.color ?? "text-white/30"
  const Icon = match?.icon ?? File
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
}

// ── Inline Inputs ──

interface CreateInputProps {
  parentPath: string
  type: "file" | "folder"
  onSubmit: (fullPath: string, name: string) => void
  onCancel: () => void
}

function CreateInput({ parentPath, type, onSubmit, onCancel }: CreateInputProps) {
  const [value, setValue] = useState("")
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const name = sanitizeFilename(value)
      if (name) {
        const sep = parentPath.endsWith("\\") ? "" : "\\"
        onSubmit(`${parentPath}${sep}${name}`, name)
      }
    } else if (e.key === "Escape") {
      onCancel()
    }
  }

  return (
    <div className="flex items-center gap-1 px-2 py-0.5" style={{ paddingLeft: "24px" }}>
      {type === "folder" ? (
        <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500/70" />
      ) : (
        <File className="h-3.5 w-3.5 shrink-0 text-white/30" />
      )}
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        placeholder={type === "folder" ? "folder name" : "filename.ts"}
        className="flex-1 bg-white/[0.06] border border-white/[0.12] rounded px-1.5 py-0.5 text-[11px] text-white/80 outline-none placeholder-white/20"
      />
    </div>
  )
}

interface RenameInputProps {
  entry: FileEntry
  onSubmit: (newPath: string, newName: string) => void
  onCancel: () => void
}

function RenameInput({ entry, onSubmit, onCancel }: RenameInputProps) {
  const [value, setValue] = useState(entry.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.select() }, [])

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const name = sanitizeFilename(value)
      if (name && name !== entry.name) {
        const parentDir = entry.path.substring(0, entry.path.lastIndexOf("\\"))
        const sep = parentDir.endsWith("\\") ? "" : "\\"
        onSubmit(`${parentDir}${sep}${name}`, name)
      } else {
        onCancel()
      }
    } else if (e.key === "Escape") {
      onCancel()
    }
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={onCancel}
      className="flex-1 bg-white/[0.06] border border-blue-500/40 rounded px-1.5 py-0 text-[11px] text-white/80 outline-none min-w-0"
      style={{ width: `${Math.max(value.length * 7.5, 60)}px` }}
    />
  )
}

// ── Context Menu ──

interface ContextMenuProps {
  x: number
  y: number
  entry: FileEntry
  onClose: () => void
  onNewFile: (parentPath: string) => void
  onNewFolder: (parentPath: string) => void
  onRename: () => void
  onDelete: () => void
  onCopy: (path: string) => void
  onCut: (path: string) => void
  onPaste: (targetPath: string) => void
  hasClipboard: boolean
}

function ContextMenu({ x, y, entry, onClose, onNewFile, onNewFolder, onRename, onDelete, onCopy, onCut, onPaste, hasClipboard }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: globalThis.MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-lg border border-white/[0.08] bg-[#0d0d0e] shadow-2xl py-1"
      style={{ left: x, top: y }}
    >
      {entry.is_dir && (
        <>
          <MenuItem icon={FilePlus} label="New File" shortcut="" onClick={() => { onNewFile(entry.path); onClose() }} />
          <MenuItem icon={FolderPlus} label="New Folder" shortcut="" onClick={() => { onNewFolder(entry.path); onClose() }} />
          <div className="h-px bg-white/[0.06] my-0.5" />
        </>
      )}
      <MenuItem icon={Copy} label="Copy" shortcut={entry.is_dir ? "" : "⌘C"} onClick={() => { onCopy(entry.path); onClose() }} />
      <MenuItem icon={Scissors} label="Cut" shortcut={entry.is_dir ? "" : "⌘X"} onClick={() => { onCut(entry.path); onClose() }} />
      {hasClipboard && (
        <MenuItem icon={ClipboardPaste} label="Paste" shortcut="⌘V" onClick={() => { onPaste(entry.is_dir ? entry.path : entry.path.substring(0, entry.path.lastIndexOf("\\"))); onClose() }} />
      )}
      <div className="h-px bg-white/[0.06] my-0.5" />
      <MenuItem icon={Edit3} label="Rename" shortcut="F2" onClick={() => { onRename(); onClose() }} />
      <MenuItem icon={Trash2} label="Delete" shortcut="Del" onClick={() => { onDelete(); onClose() }} className="text-red-400/70 hover:text-red-400" />
    </div>
  )
}

function MenuItem({ icon: Icon, label, shortcut, onClick, className }: {
  icon: typeof File; label: string; shortcut: string; onClick: () => void; className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-xs text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors text-left",
        className
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[9px] text-white/20">{shortcut}</span>}
    </button>
  )
}

// ── Tree Node ──

interface TreeNodeProps {
  entry: FileEntry
  depth: number
  expandedPaths: Set<string>
  onToggle: (path: string) => void
  selectedDir: string | null
  onSelectDir: (path: string) => void
  selectedPaths: Set<string>
  onToggleSelect: (path: string, meta: boolean, shift: boolean) => void
  creatingParent: string | null
  creatingType: "file" | "folder" | null
  createLocally: CreateLocation | null
  onCreateSubmit: (fullPath: string, name: string) => void
  onCreateCancel: () => void
  onDeleteEntry: (path: string) => void
  onRenameSubmit?: (oldPath: string, newPath: string, newName: string) => void
  clipboard: ClipboardState | null
  onSetClipboard: (state: ClipboardState | null) => void
  onPasteFiles: (targetDir: string) => void
  onDragStart: (path: string) => void
  dropTarget: string | null
  onDropTarget: (path: string | null) => void
  renamingPath: string | null
  onStartRename: (path: string) => void
  onCancelRename: () => void
  onCreateLocal: (loc: CreateLocation | null) => void
  focusedPath: string | null
  onFocusPath: (path: string | null) => void
}

function TreeNode({
  entry, depth, expandedPaths, onToggle, selectedDir, onSelectDir,
  selectedPaths, onToggleSelect, creatingParent, creatingType, createLocally,
  onCreateSubmit, onCreateCancel, onDeleteEntry, onRenameSubmit,
  clipboard, onSetClipboard, onPasteFiles, onDragStart,
  dropTarget, onDropTarget, renamingPath, onStartRename, onCancelRename,
  onCreateLocal, focusedPath, onFocusPath,
}: TreeNodeProps) {
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)
  const openFile = useWorkspaceStore((s) => s.openFile)
  const changedFiles = useWorkspaceStore((s) => s.changedFiles)
  const aiContextFiles = useWorkspaceStore((s) => s.aiContextFiles)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const isActive = activeFilePath === entry.path
  const isSelected = selectedPaths.has(entry.path)
  const isChanged = changedFiles.has(entry.path)
  const inAiContext = aiContextFiles.some((f) => f.path === entry.path)
  const expanded = expandedPaths.has(entry.path)
  const isDropTarget = dropTarget === entry.path

  const isCreatingHere = creatingParent === entry.path && creatingType !== null
  const isCreatingLocally = createLocally?.parent === entry.path
  const isRenaming = renamingPath === entry.path
  const fileActivities = useAgentStore((s) => s.fileActivities)

  const activityLabels: Record<string, string> = {
    editing: "Editing",
    reading: "Reading",
    reviewing: "Reviewing",
    referencing: "In Context",
  }

  const fileActivityInfo = useMemo(() => {
    if (entry.is_dir || !fileActivities || fileActivities.length === 0) return null
    const normPath = entry.path.replace(/\\/g, "/")
    const fa = fileActivities.find((a) => a.path.includes(normPath) || normPath.includes(a.path))
    if (!fa) return null
    return {
      activity: fa.activity,
      agentRole: fa.agentRole,
      label: activityLabels[fa.activity] ?? "In Context",
    }
  }, [entry.path, fileActivities])

  async function handleClick(e: MouseEvent) {
    e.stopPropagation()
    if (e.metaKey || e.ctrlKey) {
      onToggleSelect(entry.path, true, false)
      return
    }
    if (e.shiftKey) {
      onToggleSelect(entry.path, false, true)
      return
    }
    onSelectDir(entry.path)
    onToggleSelect(entry.path, false, false)
    onFocusPath(entry.path)
    if (!entry.is_dir) {
      try {
        const rootPath = useWorkspaceStore.getState().rootPath
        const absolutePath = rootPath ? `${rootPath}\\${entry.path.replace(/\//g, "\\")}` : entry.path
        const content = await readFile(absolutePath)
        openFile({ path: entry.path, name: entry.name, content, isDirty: false })
      } catch (err) {
        console.error("Failed to read file:", err)
      }
    }
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onSelectDir(entry.path)
    onFocusPath(entry.path)
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  function handleKeyDownOnNode(e: KeyboardEvent) {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault()
      e.stopPropagation()
      onDeleteEntry(entry.path)
    }
    if (e.key === "F2") {
      e.preventDefault()
      e.stopPropagation()
      onStartRename(entry.path)
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "c") {
      e.preventDefault()
      onSetClipboard({ paths: [entry.path], operation: "copy" })
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "x") {
      e.preventDefault()
      onSetClipboard({ paths: [entry.path], operation: "cut" })
    }
  }

  function handleDragStart(e: DragEvent) {
    e.dataTransfer?.setData("text/plain", entry.path)
    onDragStart(entry.path)
  }

  function handleDragOver(e: DragEvent) {
    if (!entry.is_dir) return
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move"
    onDropTarget(entry.path)
  }

  function handleDragLeave(e: DragEvent) {
    e.stopPropagation()
    if (dropTarget === entry.path) onDropTarget(null)
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    onDropTarget(null)
    const draggedPath = e.dataTransfer?.getData("text/plain")
    if (draggedPath && entry.is_dir && draggedPath !== entry.path) {
      const draggedName = draggedPath.split(/[/\\]+/).pop()
      if (draggedName) {
        const sep = entry.path.endsWith("\\") ? "" : "\\"
        const newPath = `${entry.path}${sep}${draggedName}`
        onRenameSubmit?.(draggedPath, newPath, draggedName)
      }
    }
  }

  const showExpanded = entry.is_dir && expanded && entry.children.length > 0

  return (
    <div role="treeitem" aria-expanded={entry.is_dir ? expanded : undefined} aria-selected={isSelected}>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDownOnNode}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        draggable
        tabIndex={-1}
        data-tree-path={entry.path}
        data-is-dir={entry.is_dir ? "true" : undefined}
        className={cn(
          "group relative flex w-full items-center gap-1.5 px-2 py-1 text-left text-sm transition-all",
          isActive && "bg-white/[0.06]",
          isSelected && !isActive && selectedPaths.size > 1 && "bg-blue-500/[0.08]",
          isSelected && !isActive && selectedPaths.size === 1 && "bg-white/[0.04]",
          !isSelected && "hover:bg-white/[0.03]",
          isDropTarget && "bg-blue-500/[0.12]",
          focusedPath === entry.path && "outline-1 outline-white/[0.12]",
          fileActivityInfo?.activity === "editing" && "bg-amber-500/[0.04] border-l-[3px] border-amber-500",
          fileActivityInfo?.activity === "reading" && "bg-blue-500/[0.04] border-l-[3px] border-blue-500",
          fileActivityInfo?.activity === "reviewing" && "bg-cyan-500/[0.04] border-l-[3px] border-cyan-500",
          fileActivityInfo?.activity === "referencing" && "bg-purple-500/[0.04] border-l-[3px] border-purple-500",
        )}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
      >
        {isDropTarget && (
          <div className="absolute inset-x-2 top-0 h-0.5 bg-blue-500/60 rounded-full" />
        )}
        {entry.is_dir ? (
          <>
            <span className="text-white/30 w-3.5 flex justify-center">
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </span>
            {expanded ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500/70" />}
          </>
        ) : (
          <>
            <span className="w-3.5" />
            <FileIcon entry={entry} />
          </>
        )}
        {isRenaming ? (
          <RenameInput
            entry={entry}
            onSubmit={(newPath, newName) => { onCancelRename(); onRenameSubmit?.(entry.path, newPath, newName) }}
            onCancel={onCancelRename}
          />
        ) : (
          <span className={cn("truncate flex-1 text-xs", inAiContext && "text-blue-400")}>{entry.name}</span>
        )}
        {fileActivityInfo && (
          <span className="flex items-center gap-0.5 text-[9px] shrink-0 font-medium text-white/60">
            {fileActivityInfo.activity === "referencing" ? (
              <><span className="text-purple-400">→</span> In Context</>
            ) : (
              <><Bot className="h-2.5 w-2.5 shrink-0" /> {getAgentLabel(fileActivityInfo.agentRole)} {fileActivityInfo.label}</>
            )}
          </span>
        )}
        {isActive && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 rounded-full" />}
        {isChanged && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />}
        {inAiContext && <Sparkles className="h-2.5 w-2.5 text-blue-400 shrink-0" />}
      </button>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={entry}
          onClose={() => setContextMenu(null)}
          onNewFile={(parent) => onCreateLocal({ type: "file", parent })}
          onNewFolder={(parent) => onCreateLocal({ type: "folder", parent })}
          onRename={() => onStartRename(entry.path)}
          onDelete={() => onDeleteEntry(entry.path)}
          onCopy={(p) => onSetClipboard({ paths: [p], operation: "copy" })}
          onCut={(p) => onSetClipboard({ paths: [p], operation: "cut" })}
          onPaste={(target) => onPasteFiles(target)}
          hasClipboard={clipboard !== null}
        />
      )}

      {isCreatingHere && (
        <CreateInput
          parentPath={entry.path}
          type={creatingType!}
          onSubmit={onCreateSubmit}
          onCancel={onCreateCancel}
        />
      )}

      {isCreatingLocally && createLocally && (
        <CreateInput
          parentPath={createLocally.parent}
          type={createLocally.type}
          onSubmit={(fullPath, name) => { onCreateLocal(null); onCreateSubmit(fullPath, name) }}
          onCancel={() => onCreateLocal(null)}
        />
      )}

      {showExpanded && (
        <div>
          {entry.children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              selectedDir={selectedDir}
              onSelectDir={onSelectDir}
              selectedPaths={selectedPaths}
              onToggleSelect={onToggleSelect}
              creatingParent={creatingParent}
              creatingType={creatingType}
              createLocally={createLocally}
              onCreateSubmit={onCreateSubmit}
              onCreateCancel={onCreateCancel}
              onDeleteEntry={onDeleteEntry}
              onRenameSubmit={onRenameSubmit}
              clipboard={clipboard}
              onSetClipboard={onSetClipboard}
              onPasteFiles={onPasteFiles}
              onDragStart={onDragStart}
              dropTarget={dropTarget}
              onDropTarget={onDropTarget}
              renamingPath={renamingPath}
              onStartRename={onStartRename}
              onCancelRename={onCancelRename}
              onCreateLocal={onCreateLocal}
              focusedPath={focusedPath}
              onFocusPath={onFocusPath}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Skeleton ──

function FileTreeSkeleton() {
  return (
    <div className="py-2 space-y-1.5 px-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2" style={{ paddingLeft: `${10 + (i % 3) * 14}px` }}>
          <Skeleton className={i % 2 === 0 ? "h-3 w-3" : "h-3 w-3.5"} />
          <Skeleton className="h-3 flex-1" />
        </div>
      ))}
    </div>
  )
}

// ── Empty State ──

function EmptyState({ onOpenWorkspace }: { onOpenWorkspace?: () => void }) {
  return (
    <div className="flex flex-col items-center py-8 px-4 text-center">
      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white/[0.04] mb-3">
        <FolderOpen className="h-4 w-4 text-white/30" />
      </div>
      <p className="text-xs text-white/40 font-medium mb-1">No workspace open</p>
      <p className="text-[10px] text-white/20 mb-3">Open a folder to explore files</p>
      <button
        onClick={onOpenWorkspace}
        className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] px-3 py-1.5 text-[11px] font-medium text-white/50 hover:text-white/70 transition-all"
      >
        <FolderOpen className="h-3 w-3" />
        Open Folder
      </button>
    </div>
  )
}

// ── Flat Tree for Virtualization ──

interface FlatNode {
  entry: FileEntry
  depth: number
}

function flattenTree(entries: FileEntry[], expandedPaths: Set<string>, depth = 0): FlatNode[] {
  const result: FlatNode[] = []
  for (const entry of entries) {
    result.push({ entry, depth })
    if (entry.is_dir && expandedPaths.has(entry.path) && entry.children.length > 0) {
      result.push(...flattenTree(entry.children, expandedPaths, depth + 1))
    }
  }
  return result
}

function findEntry(flatTree: FlatNode[], path: string): FileEntry | undefined {
  for (const node of flatTree) {
    if (node.entry.path === path) return node.entry
  }
  return undefined
}

// ── Props & Component ──

export interface FileTreeProps {
  onOpenWorkspace?: () => void
  creatingType?: "file" | "folder" | null
  creatingParent?: string | null
  onCreateSubmit?: (fullPath: string, name: string) => void
  onCreateCancel?: () => void
  onDeleteEntry?: (path: string) => void
  onRenameSubmit?: (oldPath: string, newPath: string, newName: string) => void
}

const FileTree = forwardRef<FileTreeHandle, FileTreeProps>(function FileTree(
  { onOpenWorkspace, creatingType = null, creatingParent = null, onCreateSubmit, onCreateCancel, onDeleteEntry, onRenameSubmit },
  ref,
) {
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const isLoading = useWorkspaceStore((s) => s.isLoading)
  const loadDirectory = useWorkspaceStore((s) => s.loadDirectory)
  const aiContextFiles = useWorkspaceStore((s) => s.aiContextFiles)
  const suggestedFiles = useWorkspaceStore((s) => s.suggestedFiles)
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)

  const [showAiContext, setShowAiContext] = useState(true)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [selectedDir, setSelectedDir] = useState<string | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null)
  const [createLocally, setCreateLocally] = useState<CreateLocation | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [dragSource, setDragSource] = useState<string | null>(null)
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)

  // Auto-expand to active file
  useEffect(() => {
    if (!activeFilePath) return
    const normalizedPath = activeFilePath.replace(/\//g, "\\")
    const parts = normalizedPath.split("\\")
    let current = ""
    const ancestors: string[] = []
    for (const part of parts) {
      if (!part) continue
      current = current ? `${current}\\${part}` : part
      ancestors.push(current)
    }
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      for (const a of ancestors) next.add(a)
      return next
    })
    requestAnimationFrame(() => {
      const btn = treeRef.current?.querySelector<HTMLElement>(`button[data-tree-path="${normalizedPath}"]`)
      btn?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    })
  }, [activeFilePath])

  useImperativeHandle(ref, () => ({
    collapseAll() {
      setExpandedPaths(new Set())
    },
    getSelectedPaths() {
      return Array.from(selectedPaths)
    },
  }), [selectedPaths])

  const flatTree = useMemo(() => flattenTree(fileTree, expandedPaths), [fileTree, expandedPaths])

  const handleToggle = useCallback(async (path: string) => {
    const entry = findEntry(flatTree, path)
    if (entry && entry.is_dir && entry.children.length === 0) {
      await loadDirectory(path)
    }
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [loadDirectory, flatTree])

  const handleToggleSelect = useCallback((path: string, meta: boolean, shift: boolean) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (meta) {
        if (next.has(path)) next.delete(path)
        else next.add(path)
      } else if (shift) {
        // Simple shift-select: add this path
        next.add(path)
      } else {
        next.clear()
        next.add(path)
      }
      return next
    })
  }, [])

  const handleSelectDir = useCallback((path: string) => {
    setSelectedDir(path)
    setFocusedPath(path)
  }, [])

  const handlePasteFiles = useCallback(async (targetDir: string) => {
    if (!clipboard) return
    const { createFile, renameEntry } = await import("@/lib/workspace")
    for (const srcPath of clipboard.paths) {
      const name = srcPath.split(/[/\\]+/).pop()
      if (!name) continue
      const sep = targetDir.endsWith("\\") ? "" : "\\"
      const dstPath = `${targetDir}${sep}${name}`
      if (clipboard.operation === "copy") {
        try {
          const content = await readFile(srcPath)
          await createFile(dstPath, content)
          useToastStore.getState().addToast(`Copied ${name}`, "success", 2000)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          useToastStore.getState().addToast(`Copy failed: ${msg}`, "error", 3000)
        }
      } else {
        try {
          await renameEntry(srcPath, dstPath)
          useToastStore.getState().addToast(`Moved ${name}`, "success", 2000)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          useToastStore.getState().addToast(`Move failed: ${msg}`, "error", 3000)
        }
      }
    }
    setClipboard(null)
    const rp = useWorkspaceStore.getState().rootPath
    if (rp) {
      const tree = await loadFileTree(rp)
      useWorkspaceStore.getState().setFileTree(tree)
    }
  }, [clipboard])

  const handleTreeKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button[data-tree-path]"))
    if (buttons.length === 0) return

    const target = e.target as HTMLElement
    const currentIdx = buttons.findIndex((el) => el === target || el.contains(target))
    if (currentIdx === -1) return

    const currentPath = buttons[currentIdx]?.getAttribute("data-tree-path")
    if (!currentPath) return

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault()
        if (currentIdx < buttons.length - 1) {
          buttons[currentIdx + 1].focus()
          buttons[currentIdx + 1].scrollIntoView({ block: "nearest" })
          setFocusedPath(buttons[currentIdx + 1].getAttribute("data-tree-path") ?? null)
        }
        break
      }
      case "ArrowUp": {
        e.preventDefault()
        if (currentIdx > 0) {
          buttons[currentIdx - 1].focus()
          buttons[currentIdx - 1].scrollIntoView({ block: "nearest" })
          setFocusedPath(buttons[currentIdx - 1].getAttribute("data-tree-path") ?? null)
        }
        break
      }
      case "ArrowRight": {
        const isDir = buttons[currentIdx]?.getAttribute("data-is-dir") === "true"
        if (isDir && !expandedPaths.has(currentPath)) {
          e.preventDefault()
          handleToggle(currentPath)
        }
        break
      }
      case "ArrowLeft": {
        if (expandedPaths.has(currentPath)) {
          e.preventDefault()
          handleToggle(currentPath)
        } else {
          const separator = currentPath.lastIndexOf("\\")
          if (separator > 0) {
            const parentPath = currentPath.substring(0, separator)
            const parentIdx = buttons.findIndex((el) => el.getAttribute("data-tree-path") === parentPath)
            if (parentIdx !== -1) {
              e.preventDefault()
              buttons[parentIdx].focus()
              buttons[parentIdx].scrollIntoView({ block: "nearest" })
              setFocusedPath(parentPath)
            }
          }
        }
        break
      }
      case "Home": {
        e.preventDefault()
        buttons[0].focus()
        buttons[0].scrollIntoView({ block: "nearest" })
        setFocusedPath(buttons[0].getAttribute("data-tree-path") ?? null)
        break
      }
      case "End": {
        e.preventDefault()
        buttons[buttons.length - 1].focus()
        buttons[buttons.length - 1].scrollIntoView({ block: "nearest" })
        setFocusedPath(buttons[buttons.length - 1].getAttribute("data-tree-path") ?? null)
        break
      }
      case "Enter": {
        e.preventDefault()
        const targetBtn = buttons.find((el) => el.getAttribute("data-tree-path") === currentPath)
        targetBtn?.click()
        break
      }
      case " ":
      case "Space": {
        e.preventDefault()
        handleToggleSelect(currentPath, true, false)
        break
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "a") {
      e.preventDefault()
      const allPaths = buttons.map((b) => b.getAttribute("data-tree-path")).filter(Boolean) as string[]
      setSelectedPaths(new Set(allPaths))
    }
  }, [expandedPaths, handleToggle, handleToggleSelect])

  const handleCreateSubmit = useCallback((fullPath: string, name: string) => {
    onCreateSubmit?.(fullPath, name)
  }, [onCreateSubmit])

  const handleCreateCancel = useCallback(() => {
    onCreateCancel?.()
    setCreateLocally(null)
  }, [onCreateCancel])

  const handleDelete = useCallback((path: string) => {
    onDeleteEntry?.(path)
  }, [onDeleteEntry])

  const handleRenameSubmit = useCallback((oldPath: string, newPath: string, newName: string) => {
    onRenameSubmit?.(oldPath, newPath, newName)
  }, [onRenameSubmit])

  const handleStartRename = useCallback((path: string) => {
    setRenamingPath(path)
  }, [])

  const handleCancelRename = useCallback(() => {
    setRenamingPath(null)
  }, [])

  const virtualizer = useVirtualizer({
    count: flatTree.length,
    getScrollElement: () => treeRef.current,
    estimateSize: () => 28,
    overscan: 20,
    measureElement: (el) => el.getBoundingClientRect().height,
  })

  if (!rootPath) return <EmptyState onOpenWorkspace={onOpenWorkspace} />
  if (isLoading) return <FileTreeSkeleton />

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Root-level creation from toolbar */}
      {(creatingParent === rootPath || creatingParent === null) && creatingType && (
        <CreateInput
          parentPath={rootPath}
          type={creatingType}
          onSubmit={handleCreateSubmit}
          onCancel={handleCreateCancel}
        />
      )}

      {/* Root-level local creation */}
      {createLocally && createLocally.parent === "" && (
        <CreateInput
          parentPath={rootPath}
          type={createLocally.type}
          onSubmit={(fullPath, name) => { setCreateLocally(null); handleCreateSubmit(fullPath, name) }}
          onCancel={() => setCreateLocally(null)}
        />
      )}

      {/* AI Context */}
      {aiContextFiles.length > 0 && showAiContext && (
        <div className="mb-1.5 px-2">
          <button
            onClick={() => setShowAiContext(false)}
            className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-blue-400/60 hover:text-blue-400 transition-colors w-full text-left"
          >
            <Sparkles className="h-2.5 w-2.5" />
            AI Context
            <span className="text-blue-400/30 ml-auto text-[9px]">{aiContextFiles.length}</span>
          </button>
          {aiContextFiles.slice(0, 5).map((f) => (
            <div key={f.path} className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] text-blue-400/40 font-mono">
              <Star className="h-2 w-2 shrink-0" />
              <span className="truncate">{f.name}</span>
              <span className="text-blue-400/20 ml-auto">{f.relevance}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent files */}
      {suggestedFiles.length > 0 && (
        <div className="mb-1.5 px-2">
          <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-amber-400/60">
            <Clock className="h-2.5 w-2.5" />
            Recent
          </div>
          {suggestedFiles.map((f) => (
            <div key={f} className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] text-amber-400/30 font-mono">
              <span className="truncate">{f}</span>
            </div>
          ))}
        </div>
      )}

      {/* Virtualized Tree */}
      <div
        ref={treeRef}
        className="flex-1 overflow-auto min-h-0"
        style={{ contain: "layout paint style" }}
      >
        {flatTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-center px-4">
            <p className="text-xs text-white/40">Workspace is empty</p>
            <p className="text-[10px] text-white/20 mt-0.5">Add files to get started</p>
          </div>
        ) : (
          <div
            role="tree"
            aria-label="File explorer"
            onKeyDown={handleTreeKeyDown}
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const node = flatTree[virtualRow.index]
              return (
                <div
                  key={node.entry.path}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <TreeNode
                    entry={node.entry}
                    depth={node.depth}
                    expandedPaths={expandedPaths}
                    onToggle={handleToggle}
                    selectedDir={selectedDir}
                    onSelectDir={handleSelectDir}
                    selectedPaths={selectedPaths}
                    onToggleSelect={handleToggleSelect}
                    creatingParent={creatingParent}
                    creatingType={creatingType}
                    createLocally={createLocally}
                    onCreateSubmit={handleCreateSubmit}
                    onCreateCancel={handleCreateCancel}
                    onDeleteEntry={handleDelete}
                    onRenameSubmit={handleRenameSubmit}
                    clipboard={clipboard}
                    onSetClipboard={setClipboard}
                    onPasteFiles={handlePasteFiles}
                    onDragStart={setDragSource}
                    dropTarget={dropTarget}
                    onDropTarget={setDropTarget}
                    renamingPath={renamingPath}
                    onStartRename={handleStartRename}
                    onCancelRename={handleCancelRename}
                    onCreateLocal={setCreateLocally}
                    focusedPath={focusedPath}
                    onFocusPath={setFocusedPath}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
})

export { FileTree }
