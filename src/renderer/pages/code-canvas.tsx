import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useAgentStore, type ExecutionMode } from "@/stores/agent-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"

import { pickWorkspaceFolder, loadFileTree, startWatching, onFileChange, createFile, createFolder, deleteEntry, renameEntry, sanitizeFilename, readFile } from "@/lib/workspace"
import type { FileEntry } from "@/types"
import { workspaceIndex } from "@/lib/search-index"
import { WorkspaceExplorer, type WorkspaceExplorerHandle } from "@/components/workspace/explorer/WorkspaceExplorer"
import { CodeWorkspace } from "@/components/workspace/code-workspace"
import { ChatPanel } from "@/components/workspace/chat-panel"
import { BrowserWorkspace } from "@/components/workspace/browser/browser-workspace"
import { ExecutionTimeline } from "@/components/workspace/execution-timeline/ExecutionTimeline"
import { AgentStatusBar } from "@/components/workspace/agent-visibility/AgentStatusBar"
import { DesignWorkspace } from "@/components/workspace/design-workspace"
import { SnapshotBrowser } from "@/components/workspace/snapshot-browser"
import { ChatHistoryViewer } from "@/components/workspace/chat-history-viewer"
import { TerminalWorkspace } from "@/components/workspace/terminal-workspace"
import { AgentWorkspace } from "@/components/workspace/agent-workspace"
import { GlobalSearch } from "@/components/workspace/global-search"
import { CommandPalette } from "@/components/workspace/command-palette"
import { ExecutionDock } from "@/components/runtime/ExecutionDock"
import { ErrorBoundary } from "@/components/runtime/ErrorBoundary"

import { Button, TooltipSimple as Tooltip } from "@agentic-os/ui"
import { cn } from "@/lib/utils"
import { useToastStore } from "@/stores/toast-store"
import { WorkspacePanelController, type WorkspacePanel } from "@/lib/workspace-panel-controller"
import { useLeakTracker } from "@/performance/leak-detector"
import {
  PanelRightClose, PanelRight, PanelLeftClose, PanelLeft,
  FileCode, Globe,
  FolderOpen, FilePlus, FolderPlus, ChevronsUpDown, ChevronLeft, RefreshCw, Loader2,
  Cpu, Zap, Target, BookOpen, UserCheck, Shield,
  Brain, Activity, CheckCircle2, XCircle, AlertTriangle,
  Palette,
  GripVertical, History, Search, Terminal,
} from "lucide-react"



const EXECUTION_MODES: { id: ExecutionMode; label: string; icon: typeof Cpu; color: string; description: string }[] = [
  { id: "autonomous", label: "Autonomous", icon: Cpu, color: "text-blue-400", description: "AI auto-selects agents and tools" },
  { id: "fastest", label: "Fastest", icon: Zap, color: "text-yellow-400", description: "Optimize for speed — parallel execution" },
  { id: "most_accurate", label: "Most Accurate", icon: Target, color: "text-purple-400", description: "Multi-agent verification & review" },
  { id: "research_heavy", label: "Research", icon: BookOpen, color: "text-cyan-400", description: "Deep analysis, extensive searching" },
  { id: "human_guided", label: "Human Guided", icon: UserCheck, color: "text-orange-400", description: "Approve every action before execution" },
  { id: "safe_mode", label: "Safe Mode", icon: Shield, color: "text-red-400", description: "Read-only analysis, no mutations" },
]

const WORKSPACE_PANEL_OPTIONS: { id: WorkspacePanel; label: string; icon: typeof FileCode }[] = [
  { id: "code", label: "Code", icon: FileCode },
  { id: "browser", label: "Browser", icon: Globe },
  { id: "design", label: "Design", icon: Palette },
  { id: "history", label: "History", icon: History },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "agents", label: "Agents", icon: Brain },
]

const PANEL_STORAGE_KEY_PREFIX = "aos-panel-"

function loadPanelState<T>(key: string, defaultVal: T): T {
  try {
    const raw = localStorage.getItem(`${PANEL_STORAGE_KEY_PREFIX}${key}`)
    if (raw === null) return defaultVal
    return JSON.parse(raw) as T
  } catch {
    return defaultVal
  }
}

function persistPanelState(key: string, value: unknown): void {
  try {
    localStorage.setItem(`${PANEL_STORAGE_KEY_PREFIX}${key}`, JSON.stringify(value))
  } catch { /* quota exceeded — ignore */ }
}



function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        "group relative w-0.5 cursor-col-resize shrink-0 transition-colors duration-150",
        "hover:bg-blue-500/30 active:bg-blue-500/50",
      )}
    >
      <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="h-3 w-3 text-white/30" />
      </div>
    </div>
  )
}

async function updateImportsOnMove(rootPath: string, oldPath: string, newPath: string): Promise<{ updated: number; files: string[] }> {
  const affectedFiles: string[] = []
  let updatedCount = 0
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    const tree = await invoke<FileEntry[]>("list_directory", { path: rootPath })
    const allFiles: string[] = []
    function flatten(entries: FileEntry[], base: string) {
      for (const e of entries) {
        const p = base ? `${base}/${e.name}` : e.name
        if (e.is_dir) flatten(e.children, p)
        else if (!e.name.endsWith(".map")) allFiles.push(p)
      }
    }
    flatten(tree, "")
    const oldBasename = oldPath.replace(/\\/g, "/").split("/").pop() || ""
    const oldImportPaths = [
      oldPath.replace(/\\/g, "/"),
      oldPath.replace(/\\/g, "/").replace(/\.[^.]+$/, ""),
      `./${oldPath.replace(/\\/g, "/").replace(/\.[^.]+$/, "")}`,
    ]
    const newBasename = newPath.replace(/\\/g, "/").split("/").pop() || ""
    const newRelBase = newPath.replace(/\\/g, "/").replace(/\.[^.]+$/, "")
    const newRelative = `./${newRelBase}`

    for (const relPath of allFiles) {
      if (relPath === oldPath.replace(/\\/g, "/")) continue
      try {
        const fullPath = `${rootPath}/${relPath}`
        const content = await invoke<string>("read_text_file", { path: fullPath })
        let modified = content
        for (const oldImport of oldImportPaths) {
          const escaped = oldImport.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          const regex = new RegExp(escaped, "g")
          if (regex.test(modified)) {
            modified = modified.replace(regex, newRelative)
          }
        }
        if (modified !== content) {
          await invoke("write_text_file", { path: fullPath, content: modified })
          affectedFiles.push(relPath)
          updatedCount++
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Tauri not available
  }
  return { updated: updatedCount, files: affectedFiles }
}

export function CodeCanvasPage() {
  useLeakTracker("CodeCanvasPage")
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const setRootPath = useWorkspaceStore((s) => s.setRootPath)
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const setFileTree = useWorkspaceStore((s) => s.setFileTree)
  const setLoading = useWorkspaceStore((s) => s.setLoading)
  const handleFileChange = useWorkspaceStore((s) => s.handleFileChange)

  const executionMode = useAgentStore((s) => s.executionMode)
  const setExecutionMode = useAgentStore((s) => s.setExecutionMode)
  const runtimeStatus = useWorkspaceRuntime((s) => s.status)
  const runtimeHealth = useWorkspaceRuntime((s) => s.health)
  const runtimeMessage = useWorkspaceRuntime((s) => s.statusMessage)
  const runtimeError = useWorkspaceRuntime((s) => s.error)
  const runtimeReady = useWorkspaceRuntime((s) => s.isReady)
  const wiredAgents = useWorkspaceRuntime((s) => s.wiredAgents)
  const totalProviders = useWorkspaceRuntime((s) => s.totalProviders)
  const wiredRoles = useWorkspaceRuntime((s) => s.wiredRoles)
  const memoryPressure = useWorkspaceRuntime((s) => s.memoryPressure)
  const tokenUsage = useWorkspaceRuntime((s) => s.tokenUsage)
  const hasStaleConfig = useWorkspaceRuntime((s) => s.hasStaleConfig)
  const refreshRuntime = useWorkspaceRuntime((s) => s.refresh)
  const initializeRuntime = useWorkspaceRuntime((s) => s.initialize)
  const navigate = useNavigate()
  const persistWorkspaceState = useWorkspaceStore((s) => s.persistWorkspaceState)
  const restoreWorkspaceState = useWorkspaceStore((s) => s.restoreWorkspaceState)

  const unlistenRef = useRef<(() => void) | null>(null)

  // ── Panel state (persisted to localStorage) ──
  const [explorerOpen, setExplorerOpen] = useState(() => loadPanelState("explorerOpen", true))
  const [explorerWidth, setExplorerWidth] = useState(() => loadPanelState("explorerWidth", 240))
  const [workspacePanel, setWorkspacePanel] = useState<WorkspacePanel>(() => loadPanelState("workspacePanel", "code"))
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(() => loadPanelState("workspacePanelOpen", true))
  const [workspacePanelWidth, setWorkspacePanelWidth] = useState(() => loadPanelState("workspacePanelWidth", 420))
  const [showModeSelector, setShowModeSelector] = useState(false)
  const [explorerCreating, setExplorerCreating] = useState<{ type: "file" | "folder"; parent: string | null } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  const [isRefreshing, setIsRefreshing] = useState(false)
  const fileTreeRef = useRef<WorkspaceExplorerHandle>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const explorerResizingRef = useRef(false)
  const workspaceResizingRef = useRef(false)
  const resizeCleanupFns = useRef<(() => void)[]>([])
  const modeSelectorBtnRef = useRef<HTMLButtonElement>(null)

  const panelCtrlRef = useRef<WorkspacePanelController | null>(null)

  const activeMode = EXECUTION_MODES.find((m) => m.id === executionMode) || EXECUTION_MODES[0]

  const commandPaletteContext = useMemo(() => ({
    navigate,
    toggleExplorer: () => setExplorerOpen((p) => !p),
    toggleTerminal: () => setWorkspacePanelOpen((p) => {
      const next = !p
      panelCtrlRef.current?.syncOpenState(next)
      return next
    }),
    toggleSearch: () => setSearchOpen((p) => !p),
    closeTab: () => {
      const state = useWorkspaceStore.getState()
      if (state.activeFilePath) state.closeFile(state.activeFilePath)
    },
    refreshTree,
    switchPanel: (panel: string) => {
      setWorkspacePanel(panel as WorkspacePanel)
      setWorkspacePanelOpen(true)
    },
  }), [navigate, refreshTree])

  useEffect(() => {
    if (runtimeStatus === "uninitialized" && rootPath) {
      initializeRuntime()
    }
  }, [runtimeStatus, rootPath, initializeRuntime])

  // ── File tree loader: when rootPath is set but fileTree is empty, load it ──
  useEffect(() => {
    if (!rootPath) return
    if (fileTree.length > 0) return
    console.log("[CodeCanvas] rootPath set but fileTree empty — loading tree", { rootPath })
    setLoading(true)
    loadFileTree(rootPath).then((tree) => {
      console.log(`[CodeCanvas] File tree loaded: ${tree.length} roots, ${countAllNodes(tree)} total nodes`)
      setFileTree(tree)
      startWatching(rootPath)
    }).catch((err) => {
      console.error("[CodeCanvas] Failed to load file tree:", err)
      setLoading(false)
    })
  }, [rootPath])

  function countAllNodes(entries: FileEntry[]): number {
    let count = 0
    for (const e of entries) {
      count++
      if (e.is_dir) count += countAllNodes(e.children)
    }
    return count
  }

  // ── Search index — rebuild when file tree changes ──
  useEffect(() => {
    const rp = useWorkspaceStore.getState().rootPath
    if (fileTree.length > 0 && rp) {
      workspaceIndex.initialize(fileTree, rp)
    }
  }, [fileTree])

  // ── Workspace auto-restore on app startup ──
  // Reads agentic-workspace-root from localStorage and re-opens the last workspace
  useEffect(() => {
    if (rootPath) {
      // rootPath already set — not a cold start
      return
    }
    const storedRoot = localStorage.getItem('agentic-workspace-root')
    if (!storedRoot) return
    console.log('[CodeCanvas] Restoring workspace from localStorage:', storedRoot)
    setRootPath(storedRoot)
    setLoading(true)
    loadFileTree(storedRoot).then((tree) => {
      console.log(`[CodeCanvas] Restored file tree: ${tree.length} roots`)
      setFileTree(tree)
      startWatching(storedRoot)
      restoreWorkspaceState()
    }).catch((err) => {
      console.error('[CodeCanvas] Failed to restore file tree:', err)
      setLoading(false)
    })
  }, []) // only on mount

  // ── State persistence — persist on changes ──
  useEffect(() => {
    if (rootPath) {
      localStorage.setItem('agentic-workspace-root', rootPath)
      restoreWorkspaceState()
    }
  }, [rootPath, restoreWorkspaceState])

  const prevFilesRef = useRef<string | null>(null)
  const prevCursorRef = useRef<string | null>(null)
  useEffect(() => {
    const { openFiles, activeFilePath, cursorLine, cursorColumn } = useWorkspaceStore.getState()
    const filesKey = JSON.stringify(openFiles.map(f => f.path)) + '|' + activeFilePath
    const cursorKey = `${cursorLine}:${cursorColumn}`
    if (filesKey !== prevFilesRef.current || cursorKey !== prevCursorRef.current) {
      prevFilesRef.current = filesKey
      prevCursorRef.current = cursorKey
      persistWorkspaceState()
    }
  })

  // ── Workspace operations ──
  async function openWorkspace() {
    const folder = await pickWorkspaceFolder()
    if (!folder) return
    setRootPath(folder)
    setLoading(true)
    const tree = await loadFileTree(folder)
    setFileTree(tree)
    startWatching(folder)
  }

  async function refreshTree() {
    const rp = useWorkspaceStore.getState().rootPath
    if (!rp) return
    setIsRefreshing(true)
    setLoading(true)
    try {
      const tree = await loadFileTree(rp)
      setFileTree(tree)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Explorer] refresh tree FAILED`, { error: msg })
    } finally {
      setIsRefreshing(false)
    }
  }

  function debouncedRefresh() {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => refreshTree(), 150)
  }

  async function handleNewFile() {
    setExplorerCreating({ type: "file", parent: null })
  }

  const handleSearchOpenFile = useCallback((path: string, line?: number) => {
    const rootPath = useWorkspaceStore.getState().rootPath
    const fetchAndOpen = async () => {
      try {
        const fullPath = rootPath ? rootPath + "\\" + path.replace(/\//g, "\\") : path
        const { readFile } = await import("@/lib/workspace")
        const content = await readFile(fullPath)
        const name = path.split("/").pop() || path
        useWorkspaceStore.getState().openFile({ path, name, content, isDirty: false })
      } catch (err) {
        // File may already be open — just navigate
        useWorkspaceStore.getState().setActiveFile(path)
      }
    }
    fetchAndOpen()
  }, [])

  async function handleNewFolder() {
    setExplorerCreating({ type: "folder", parent: null })
  }

  async function handleCreateSubmit(fullPath: string, name: string) {
    setExplorerCreating(null)
    const sanitized = sanitizeFilename(name)
    if (!sanitized) return
    try {
      if (explorerCreating?.type === "folder") {
        await createFolder(fullPath)
      } else {
        await createFile(fullPath)
        const rootPath = useWorkspaceStore.getState().rootPath
        if (rootPath) {
          const relativePath = fullPath.replace(rootPath, "").replace(/^[\\/]+/, "").replace(/\\/g, "/")
          const content = await readFile(fullPath)
          useWorkspaceStore.getState().openFile({ path: relativePath, name, content, isDirty: false })
        }
      }
      useToastStore.getState().addToast(`Created ${name}`, "success", 2000)
      await refreshTree()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      useToastStore.getState().addToast(`Failed to create ${name}: ${msg}`, "error", 5000)
    }
  }

  function handleCreateCancel() {
    setExplorerCreating(null)
  }

  async function handleDeleteEntry(entryPath: string) {
    try {
      await deleteEntry(entryPath)
      useToastStore.getState().addToast(`Deleted ${entryPath}`, "info", 2000)
      await refreshTree()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      useToastStore.getState().addToast(`Failed to delete: ${msg}`, "error", 5000)
    }
  }

  useEffect(() => {
    onFileChange((event) => {
      handleFileChange(event)
    }).then((unlisten) => {
      unlistenRef.current = unlisten
    })
    return () => {
      unlistenRef.current?.()
    }
  }, [handleFileChange])

  // ── Workspace Panel Controller ──
  // Three-layer state: USER_TAB (manual click + timestamp), RUNTIME_TAB (agent step), RESOLVED (final).
  // Manual override window: 5s after any user tab click, auto-routing is suppressed.
  // All event listeners cleaned up via DisposableRegistry on unmount.
  useEffect(() => {
    const ctrl = new WorkspacePanelController(workspacePanel, workspacePanelOpen)
    panelCtrlRef.current = ctrl
    ctrl.setResolvedPanelChangeHandler((panel) => {
      setWorkspacePanel(panel)
    })
    ctrl.setOpenChangeHandler((open) => {
      setWorkspacePanelOpen(open)
    })

    const unsubAgent = useAgentStore.subscribe((state) => {
      ctrl.updateRuntimeState(state)
    })
    ctrl.disposables.add(unsubAgent)

    // Seed with current state
    ctrl.updateRuntimeState(useAgentStore.getState())

    return () => {
      ctrl.destroy()
      panelCtrlRef.current = null
    }
  }, [])

  interface ValidationIssueItem {
    id: string
    severity: "error" | "warning" | "info"
    category: string
    message: string
    detail?: string
    repairable: boolean
    repairAction?: string
  }

  // ── Validation state from preflight ──
  const [validationIssues, setValidationIssues] = useState<ValidationIssueItem[]>([])

  useEffect(() => {
    const issues: ValidationIssueItem[] = []

    if (!runtimeReady && runtimeStatus !== "uninitialized") {
      issues.push({
        id: "runtime-not-ready",
        severity: "warning",
        category: "runtime",
        message: "Runtime not fully initialized",
        detail: runtimeMessage ?? "Some runtime components may not be ready",
        repairable: false,
      })
    }

    if (hasStaleConfig) {
      issues.push({
        id: "stale-config",
        severity: "warning",
        category: "configuration",
        message: "Provider configuration changed — runtime needs refresh",
        detail: "Refresh runtime to apply new provider/role configuration",
        repairable: true,
        repairAction: "refresh-runtime",
      })
    }

    setValidationIssues(issues)
  }, [runtimeReady, runtimeStatus, hasStaleConfig, runtimeMessage])

  const handleValidationDismiss = useCallback((id: string) => {
    setValidationIssues((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const handleValidationRepair = useCallback((issue: ValidationIssueItem) => {
    if (issue.repairAction === "refresh-runtime") {
      refreshRuntime()
    }
    setValidationIssues((prev) => prev.filter((i) => i.id !== issue.id))
  }, [refreshRuntime])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault()
        setExplorerOpen((p) => !p)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault()
        setWorkspacePanelOpen((p) => {
          const next = !p
          panelCtrlRef.current?.syncOpenState(next)
          return next
        })
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "e") {
        e.preventDefault()
        panelCtrlRef.current?.handleManualTabClick("code")
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "b") {
        e.preventDefault()
        panelCtrlRef.current?.handleManualTabClick("browser")
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "m") {
        e.preventDefault()
        panelCtrlRef.current?.handleManualTabClick("design")
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "t") {
        e.preventDefault()
        panelCtrlRef.current?.handleManualTabClick("terminal")
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n" && !e.shiftKey && rootPath) {
        e.preventDefault()
        handleNewFile()
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "n" && rootPath) {
        e.preventDefault()
        handleNewFolder()
      }
      // ⌘W — close active tab
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault()
        const state = useWorkspaceStore.getState()
        if (state.activeFilePath) {
          state.closeFile(state.activeFilePath)
        }
      }
      // ⌘P — command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "p" && !e.shiftKey) {
        e.preventDefault()
        setCommandPaletteOpen((p) => !p)
      }
      // ⌘⇧P — command palette (same handler)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "p") {
        e.preventDefault()
        setCommandPaletteOpen((p) => !p)
      }
      // ⌘S — save (global fallback)
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        // Monaco handles its own save via action, this is a no-op fallback
      }
      if (e.key === "F5") {
        e.preventDefault()
        refreshTree()
      }
      // ⌘⇧F — global search
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault()
        setSearchOpen((p) => !p)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [rootPath])

    // ── Persist panel state on change ──
  useEffect(() => { persistPanelState("explorerOpen", explorerOpen) }, [explorerOpen])
  useEffect(() => { persistPanelState("explorerWidth", explorerWidth) }, [explorerWidth])
  useEffect(() => { persistPanelState("workspacePanel", workspacePanel) }, [workspacePanel])
  useEffect(() => { persistPanelState("workspacePanelOpen", workspacePanelOpen) }, [workspacePanelOpen])
  useEffect(() => { persistPanelState("workspacePanelWidth", workspacePanelWidth) }, [workspacePanelWidth])

  // ── Resize drag cleanup on unmount — guarantees no leaked listeners or body styles ──
  useEffect(() => {
    return () => {
      for (const fn of resizeCleanupFns.current) fn()
      resizeCleanupFns.current = []
      explorerResizingRef.current = false
      workspaceResizingRef.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [])

  // ── Resize handlers ──
  const handleExplorerResize = useCallback(() => {
    explorerResizingRef.current = true
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    function onMouseMove(e: MouseEvent) {
      if (!explorerResizingRef.current) return
      const newWidth = Math.max(180, Math.min(350, e.clientX - 52))
      setExplorerWidth(newWidth)
    }

    function cleanup() {
      explorerResizingRef.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }

    function onMouseUp() {
      cleanup()
      window.removeEventListener("mousemove", onMouseMove)
    }

    function onBlur() { onMouseUp() }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp, { once: true })
    window.addEventListener("blur", onBlur, { once: true })

    resizeCleanupFns.current.push(() => {
      cleanup()
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
      window.removeEventListener("blur", onBlur)
    })
  }, [])

  const handleWorkspaceResize = useCallback(() => {
    workspaceResizingRef.current = true
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    function onMouseMove(e: MouseEvent) {
      if (!workspaceResizingRef.current) return
      const newWidth = Math.max(300, Math.min(700, window.innerWidth - e.clientX - 52))
      setWorkspacePanelWidth(newWidth)
    }

    function cleanup() {
      workspaceResizingRef.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }

    function onMouseUp() {
      cleanup()
      window.removeEventListener("mousemove", onMouseMove)
    }

    function onBlur() { onMouseUp() }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp, { once: true })
    window.addEventListener("blur", onBlur, { once: true })

    resizeCleanupFns.current.push(() => {
      cleanup()
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
      window.removeEventListener("blur", onBlur)
    })
  }, [])

  // ── Render workspace panel content ──
  function renderWorkspacePanelContent() {
    switch (workspacePanel) {
      case "code":
        return <ErrorBoundary name="CodeWorkspace"><CodeWorkspace /></ErrorBoundary>
      case "browser":
        return <ErrorBoundary name="BrowserWorkspace"><BrowserWorkspace /></ErrorBoundary>
      case "design":
        return <ErrorBoundary name="DesignWorkspace"><DesignWorkspace /></ErrorBoundary>
      case "history":
        return (
          <ErrorBoundary name="SnapshotBrowser">
            <div className="flex flex-col h-full">
              <ChatHistoryViewer />
            </div>
          </ErrorBoundary>
        )
      case "terminal":
        return <ErrorBoundary name="TerminalWorkspace"><TerminalWorkspace /></ErrorBoundary>
      case "agents":
        return <ErrorBoundary name="AgentWorkspace"><AgentWorkspace /></ErrorBoundary>
      default:
        return <ErrorBoundary name="CodeWorkspace"><CodeWorkspace /></ErrorBoundary>
    }
  }

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#0a0a0b] to-[#09090a]" role="main" aria-label="Code canvas workspace">
      {/* Status banners */}
      {runtimeStatus === "uninitialized" && (
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2">
          <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
          <span className="text-xs text-white/50">Initializing workspace runtime...</span>
        </div>
      )}
      {runtimeStatus === "error" && (
        <div className="flex items-center gap-2 border-b border-red-500/15 bg-red-500/[0.03] px-4 py-2">
          <XCircle className="h-3.5 w-3.5 text-red-400" />
          <span className="text-xs text-red-400">Runtime error: {runtimeError}</span>
          <Button variant="outline" size="sm" className="h-6 text-[10px] ml-auto border-red-500/20 text-red-400" onClick={initializeRuntime}>
            Retry
          </Button>
        </div>
      )}
      {runtimeStatus === "ready" && !runtimeReady && rootPath && (
        <div className="flex items-center gap-2 border-b border-amber-500/15 bg-amber-500/[0.03] px-4 py-2">
          <span className="text-xs text-amber-400">
            {wiredRoles > 0
              ? "Manager role needs a provider/model assignment in Settings → Roles to enable orchestration."
              : "No roles are wired. Add providers and assign models to roles in Settings."}
          </span>
        </div>
      )}

      {/* Stale config warning — settings changed but runtime hasn't refreshed */}
      {hasStaleConfig && runtimeReady && (
        <div className="flex items-center gap-2 border-b border-yellow-500/20 bg-yellow-500/[0.04] px-4 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
          <span className="text-xs text-yellow-300/80">
            Provider or role configuration changed — runtime will auto-refresh or{" "}
            <button
              onClick={() => refreshRuntime()}
              className="underline font-medium text-yellow-300 hover:text-yellow-200 transition-colors"
            >
              refresh now
            </button>
          </span>
        </div>
      )}



      {/* ── MAIN 4-PANEL LAYOUT or Empty State ── */}
      {rootPath && typeof rootPath === 'string' && rootPath.length > 0 ? (
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* PANEL 1: Explorer (File Tree) */}
        <div
          style={{ width: explorerOpen ? explorerWidth : 0 }}
          className={cn(
            "flex flex-col flex-shrink-0 overflow-hidden bg-[#0c0c0d]",
            explorerOpen && "border-r border-white/[0.06]",
          )}
        >
          {/* Explorer header — always rendered, hidden via opacity when collapsed */}
          <div className={cn(
            "flex items-center justify-between px-1 py-2.5 border-b border-white/[0.04]",
            explorerOpen ? "opacity-100" : "opacity-0 pointer-events-none",
          )}>
            <div className="flex items-center gap-0.5 min-w-0">
              <button
                onClick={() => setExplorerOpen(false)}
                className="rounded p-0.5 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all shrink-0"
                title="Collapse explorer (⌘B)"
                aria-label="Collapse explorer panel"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span className="text-[9px] font-medium text-white/25 uppercase tracking-widest shrink-0">Explorer</span>
              {typeof rootPath === 'string' && rootPath.length > 0 && (
                <span className="text-[10px] text-white/40 truncate max-w-[120px]" title={rootPath}>
                  {rootPath.split(/[/\\]/).pop()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <Tooltip content="Open workspace folder">
                <button onClick={openWorkspace} className="rounded p-0.5 text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all">
                  <FolderOpen className="h-3 w-3" />
                </button>
              </Tooltip>
              <Tooltip content="New file (⌘N)">
                <button
                  onClick={handleNewFile}
                  disabled={!rootPath}
                  className={cn(
                    "rounded p-0.5 transition-all",
                    rootPath ? "text-white/25 hover:text-white/60 hover:bg-white/[0.06]" : "text-white/10 cursor-not-allowed",
                  )}
                >
                  <FilePlus className="h-3 w-3" />
                </button>
              </Tooltip>
              <Tooltip content="New folder (⌘⇧N)">
                <button
                  onClick={handleNewFolder}
                  disabled={!rootPath}
                  className={cn(
                    "rounded p-0.5 transition-all",
                    rootPath ? "text-white/25 hover:text-white/60 hover:bg-white/[0.06]" : "text-white/10 cursor-not-allowed",
                  )}
                >
                  <FolderPlus className="h-3 w-3" />
                </button>
              </Tooltip>
              <Tooltip content="Refresh (F5)">
                <button
                  onClick={debouncedRefresh}
                  disabled={!rootPath || isRefreshing}
                  className={cn(
                    "rounded p-0.5 transition-all",
                    rootPath && !isRefreshing ? "text-white/25 hover:text-white/60 hover:bg-white/[0.06]" : "text-white/10 cursor-not-allowed",
                  )}
                >
                  {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </button>
              </Tooltip>
              <Tooltip content="Search across files (⌘⇧F)">
                <button
                  onClick={() => setSearchOpen((p) => !p)}
                  disabled={!rootPath}
                  className={cn(
                    "rounded p-0.5 transition-all",
                    rootPath ? "text-white/25 hover:text-white/60 hover:bg-white/[0.06]" : "text-white/10 cursor-not-allowed",
                  )}
                >
                  <Search className="h-3 w-3" />
                </button>
              </Tooltip>
              <Tooltip content="Collapse all">
                <button
                  onClick={() => fileTreeRef.current?.collapseAll()}
                  disabled={!rootPath}
                  className={cn(
                    "rounded p-0.5 transition-all",
                    rootPath ? "text-white/25 hover:text-white/60 hover:bg-white/[0.06]" : "text-white/10 cursor-not-allowed",
                  )}
                >
                  <ChevronsUpDown className="h-3 w-3" />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Explorer */}
          <div className={cn("flex-1 min-h-0", explorerOpen ? "opacity-100" : "opacity-0 pointer-events-none")}>
            <WorkspaceExplorer
              ref={fileTreeRef}
              onOpenWorkspace={openWorkspace}
              creatingType={explorerCreating?.type ?? null}
              creatingParent={explorerCreating?.parent ?? null}
              onCreateSubmit={handleCreateSubmit}
              onCreateCancel={handleCreateCancel}
              onDeleteEntry={handleDeleteEntry}
              onRenameSubmit={async (oldPath, newPath, _newName) => {
                try {
                  const isMove = oldPath.replace(/[/\\][^/\\]+$/, "") !== newPath.replace(/[/\\][^/\\]+$/, "")
                  let proceed = true
                  if (isMove && rootPath) {
                    const result = await updateImportsOnMove(rootPath, oldPath, newPath)
                    if (result.updated > 0) {
                      proceed = window.confirm(
                        `Moving "${_newName}" will update ${result.updated} import(s) in:\n${result.files.slice(0, 5).join("\n")}${result.files.length > 5 ? `\n...and ${result.files.length - 5} more` : ""}\n\nContinue?`,
                      )
                    }
                  }
                  if (!proceed) return
                  await renameEntry(oldPath, newPath)
                  useToastStore.getState().addToast(`Renamed to ${_newName}`, "success", 2000)
                  await refreshTree()
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : String(err)
                  useToastStore.getState().addToast(`Rename failed: ${msg}`, "error", 5000)
                }
              }}
            />
          </div>

        </div>

        {explorerOpen && <ResizeHandle onMouseDown={handleExplorerResize} />}

      {/* PANEL 2: Assistant Workspace */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0" role="region" aria-label="Assistant chat panel">
        {/* Assistant header bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-[#0c0c0d]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExplorerOpen(!explorerOpen)}
                className="rounded-md p-1 text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
                title="Toggle explorer (⌘B)"
                aria-label={explorerOpen ? "Close explorer panel" : "Open explorer panel"}
              >
                {explorerOpen ? <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" /> : <PanelLeft className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
              <span className="text-[10px] font-medium text-white/30">Assistant</span>

            </div>

            <div className="flex items-center gap-2">
              {/* Runtime status indicator */}
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium border transition-all",
                  runtimeReady && runtimeHealth === "healthy"
                    ? "border-green-500/15 bg-green-500/[0.04] text-green-400"
                    : runtimeReady && runtimeHealth === "degraded"
                      ? "border-amber-500/15 bg-amber-500/[0.04] text-amber-400"
                      : runtimeStatus === "initializing"
                        ? "border-blue-500/15 bg-blue-500/[0.04] text-blue-400 hover:bg-blue-500/[0.08]"
                        : runtimeStatus === "error"
                          ? "border-red-500/15 bg-red-500/[0.04] text-red-400 hover:bg-red-500/[0.08]"
                          : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:bg-white/[0.06]"
                )}
                title="Runtime status (⌘⇧R)"
              >
                {runtimeStatus === "initializing" ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : runtimeReady && runtimeHealth === "healthy" ? (
                  <CheckCircle2 className="h-2.5 w-2.5" />
                ) : runtimeReady && runtimeHealth === "degraded" ? (
                  <AlertTriangle className="h-2.5 w-2.5" />
                ) : runtimeStatus === "error" ? (
                  <XCircle className="h-2.5 w-2.5" />
                ) : (
                  <Activity className="h-2.5 w-2.5" />
                )}
                <span>
                  {runtimeReady && runtimeHealth === "healthy" ? "Ready" :
                   runtimeReady && runtimeHealth === "degraded" ? "Partial" :
                   runtimeStatus === "initializing" ? "Init..." :
                   runtimeError || runtimeMessage || "Runtime"}
                </span>
              </div>

              {/* Execution mode selector */}
              <div className="relative">
                <button
                  ref={modeSelectorBtnRef}
                  onClick={() => setShowModeSelector(!showModeSelector)}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-500/[0.06] border border-blue-500/15 px-2 py-1 text-[10px] font-medium text-blue-400 hover:bg-blue-500/[0.1] transition-all"
                >
                  <activeMode.icon className={cn("h-2.5 w-2.5", activeMode.color)} />
                  <span>{activeMode.label}</span>
                </button>

                {showModeSelector && modeSelectorBtnRef.current && createPortal(
                  <div
                    className="w-52 rounded-xl border border-white/[0.08] bg-[#0d0d0e] shadow-2xl z-50 p-1.5"
                    style={{
                      position: 'fixed',
                      top: modeSelectorBtnRef.current.getBoundingClientRect().bottom + 6,
                      right: window.innerWidth - modeSelectorBtnRef.current.getBoundingClientRect().right,
                    }}
                  >
                    <p className="text-[9px] text-white/30 px-2 py-1 font-medium uppercase tracking-wider">Execution Mode</p>
                    <div className="space-y-0.5">
                      {EXECUTION_MODES.map((mode) => {
                        const Icon = mode.icon
                        return (
                          <button
                            key={mode.id}
                            onClick={() => { setExecutionMode(mode.id); setShowModeSelector(false) }}
                            className={cn(
                              "flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-xs transition-all text-left",
                              executionMode === mode.id
                                ? "bg-blue-500/10 text-blue-400"
                                : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                            )}
                          >
                            <Icon className={cn("h-3.5 w-3.5 shrink-0", mode.color)} />
                            <div className="flex flex-col">
                              <span className="font-medium">{mode.label}</span>
                              <span className="text-[9px] text-white/30">{mode.description}</span>
                            </div>
                            {executionMode === mode.id && (
                              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>,
                  document.body
                )}
              </div>

              {/* Toggle docking area */}
              <button
                onClick={() => {
                  const next = !workspacePanelOpen
                  setWorkspacePanelOpen(next)
                  panelCtrlRef.current?.syncOpenState(next)
                }}
                className="rounded-md p-1 text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
                title="Toggle docking area (⌘J)"
                aria-label={workspacePanelOpen ? "Close docking area" : "Open docking area"}
              >
                {workspacePanelOpen ? <PanelRightClose className="h-3.5 w-3.5" aria-hidden="true" /> : <PanelRight className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>

            </div>
          </div>

          {/* Activity summary strip — replaces 3 separate panels */}
          <ExecutionTimeline />
          <AgentStatusBar />

          {/* Assistant content */}
          <div className="flex-1 overflow-hidden min-h-0">
            <ErrorBoundary name="ChatPanel"><ChatPanel /></ErrorBoundary>
          </div>
        </div>

        {/* Resize handle: Assistant | Docking Area */}
        {workspacePanelOpen && <ResizeHandle onMouseDown={handleWorkspaceResize} />}

        {/* PANEL 3: Docking Area */}
        <div
          style={{ width: workspacePanelOpen ? workspacePanelWidth : 0 }}
          className={cn(
            "flex-shrink-0 flex flex-col overflow-hidden bg-[#0a0a0b] min-h-0",
            workspacePanelOpen && "border-l border-white/[0.06]",
          )}
          role="region"
          aria-label={`${workspacePanel} docking area`}
        >
          {/* Docking Area tabs */}
          <div className="flex items-center bg-[#0c0c0d] border-b border-white/[0.04] px-1.5" role="tablist" aria-label="Docking Area">
            {WORKSPACE_PANEL_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const isActive = workspacePanel === opt.id
              return (
                <button
                  key={opt.id}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`workspace-panel-${opt.id}`}
                   onClick={() => panelCtrlRef.current?.handleManualTabClick(opt.id)}
                   className={cn(
                     "flex items-center gap-1.5 flex-1 justify-center py-2.5 text-[11px] font-medium transition-all relative rounded-lg mx-0.5 my-1",
                     isActive
                       ? "text-white bg-white/[0.06] shadow-sm"
                       : "text-white/25 hover:text-white/60 hover:bg-white/[0.03]"
                   )}
                >
                  <Icon className={cn(
                    "h-3.5 w-3.5 transition-all",
                    isActive ? "text-blue-400" : "text-white/30"
                  )} aria-hidden="true" />
                  <span>{opt.label}</span>
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2.5px] w-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-opacity"
                    />
                  )}
                </button>
              )
            })}
          </div>

          {/* Workspace panel content */}
          <div className="flex-1 overflow-hidden min-h-0" id={`workspace-panel-${workspacePanel}`} role="tabpanel">
            {renderWorkspacePanelContent()}
          </div>
        </div>

      </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
            <FolderOpen className="h-6 w-6 text-white/30" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white/60">No workspace open</h2>
            <p className="text-sm text-white/30 mt-1 max-w-sm">
              Open a folder to start coding, browsing files, and running agents.
            </p>
          </div>
          <button
            onClick={openWorkspace}
            className="flex items-center gap-2 rounded-xl bg-blue-500/15 border border-blue-500/20 px-5 py-2.5 text-sm font-medium text-blue-400 hover:bg-blue-500/25 transition-all"
          >
            <FolderOpen className="h-4 w-4" />
            Open Workspace
          </button>
          <p className="text-[10px] text-white/20">Or drag and drop a folder onto the window</p>
        </div>
      )}

      {/* Global Search — overlay above everything */}
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenFile={handleSearchOpenFile}
      />

      {/* Command Palette — overlay above everything */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        context={commandPaletteContext}
      />

      {/* Execution Dock — always visible, survives navigation */}
      <ExecutionDock />


    </div>
  )
}
