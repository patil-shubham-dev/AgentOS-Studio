import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from "react"
import { useNavigate } from "react-router-dom"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useAgentStore } from "@/stores/agent-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"

import { loadFileTree, readFile, createFile, createFolder } from "@/lib/filesystem"
import { pickWorkspaceFolder, startWatching, onFileChange } from "@/lib/workspace"
import type { FileEntry } from "@/types"
import { safeCapitalize } from "@/lib/safeCapitalize"
import { workspaceIndex } from "@/lib/search-index"
import { invoke } from "@/lib/electron-api"
import { WorkspaceExplorer, type WorkspaceExplorerHandle } from "@/components/workspace/explorer/WorkspaceExplorer"
import { CodeWorkspace } from "@/components/workspace/code-workspace"
import { ChatPanel } from "@/components/workspace/chat-panel"
import { PaneContainer, Pane } from "@/components/workspace/pane-layout/PaneContainer"

const BrowserWorkspace = lazy(() => import("@/components/workspace/browser/browser-workspace").then(m => ({ default: m.BrowserWorkspace })))
const DesignWorkspace = lazy(() => import("@/components/workspace/design-workspace").then(m => ({ default: m.DesignWorkspace })))
const PreviewPane = lazy(() => import("@/components/workspace/preview/PreviewPane").then(m => ({ default: m.PreviewPane })))
import { AgentActivityPanel } from "@/components/workspace/agent-visibility/AgentActivityPanel"
import { ConfigInitBanner } from "@/components/workspace/ConfigInitBanner"

import { dirtyBufferManager, type DirtyBuffer } from "@/lib/dirty-buffer-manager"
import { DirtyBufferRecoveryDialog } from "@/components/workspace/DirtyBufferRecoveryDialog"
import { GlobalSearch } from "@/components/workspace/global-search"
import { CommandPalette } from "@/components/workspace/command-palette"
import { QuickOpen } from "@/components/workspace/QuickOpen"
import { ExecutionDock } from "@/components/runtime/ExecutionDock"
import { ErrorBoundary } from "@/components/runtime/ErrorBoundary"
import { WorkspaceErrorBoundary } from "@/components/workspace/WorkspaceErrorBoundary"
import { SessionSidebar } from "@/components/workspace/session-sidebar/SessionSidebar"
import { ContextUsageIndicator } from "@/components/workspace/context-indicator/ContextUsageIndicator"
import { SideChat } from "@/components/workspace/side-chat/SideChat"
import { usePaneStore } from "@/stores/pane-store"
import { usePanelCoordinator } from "@/stores/panel-coordinator"
import { useDiffStore } from "@/stores/diff-store"

import { Button, TooltipSimple as Tooltip } from "@agentic-os/ui"
import { cn } from "@/lib/utils"
import { WorkspacePanelController, type WorkspacePanel } from "@/lib/workspace-panel-controller"
import { useLeakTracker } from "@/performance/leak-detector"
import {
  PanelRightClose, PanelRight, PanelLeftClose, PanelLeft,
  FolderOpen, ChevronLeft, Loader2,
  XCircle,
  GripVertical,
  FileDiff,
  Eye,
} from "lucide-react"
import {
  CodePanelIcon,
  BrowserPanelIcon,
  DesignPanelIcon,
  PreviewPanelIcon,
} from "@/components/ui/PanelIcons"

const WORKSPACE_PANEL_OPTIONS: { id: WorkspacePanel; label: string; icon: typeof CodePanelIcon }[] = [
  { id: "code", label: "Code", icon: CodePanelIcon },
  { id: "browser", label: "Browser", icon: BrowserPanelIcon },
  { id: "design", label: "Design", icon: DesignPanelIcon },
  { id: "preview", label: "Preview", icon: PreviewPanelIcon },
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
  const [recoveredBuffers, setRecoveredBuffers] = useState<DirtyBuffer[]>([])
  const [missingWorkspace, setMissingWorkspace] = useState<string | null>(null)
  const refreshRuntime = useWorkspaceRuntime((s) => s.refresh)
  const initializeRuntime = useWorkspaceRuntime((s) => s.initialize)
  const openFile = useWorkspaceStore((s) => s.openFile)
  const navigate = useNavigate()
  const persistWorkspaceState = useWorkspaceStore((s) => s.persistWorkspaceState)
  const restoreWorkspaceState = useWorkspaceStore((s) => s.restoreWorkspaceState)
  const editorMode = useWorkspaceStore((s) => s.editorMode)
  const diffReviewFile = useWorkspaceStore((s) => s.diffReviewFile)
  const openFileInDiffMode = useWorkspaceStore((s) => s.openFileInDiffMode)
  const setEditorMode = useWorkspaceStore((s) => s.setEditorMode)
  const diffFiles = useDiffStore((s) => s.files)

  const unlistenRef = useRef<(() => void) | null>(null)

  // ── Panel state (persisted to localStorage) ──
  const [explorerOpen, setExplorerOpen] = useState(() => loadPanelState("explorerOpen", true))
  const [explorerWidth, setExplorerWidth] = useState(() => loadPanelState("explorerWidth", 240))
  const [workspacePanel, setWorkspacePanel] = useState<WorkspacePanel>(() => loadPanelState("workspacePanel", "code"))
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(() => loadPanelState("workspacePanelOpen", true))
  const [workspacePanelWidth, setWorkspacePanelWidth] = useState(() => loadPanelState("workspacePanelWidth", 420))
  const [searchOpen, setSearchOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [quickOpenOpen, setQuickOpenOpen] = useState(false)

  const sessionSidebarOpen = usePaneStore((s) => s.sessionSidebarOpen)
  const sessionSidebarWidth = usePaneStore((s) => s.sessionSidebarWidth)
  const toggleSessionSidebar = usePaneStore((s) => s.toggleSessionSidebar)
  const panes = usePaneStore((s) => s.panes)
  const setPaneVisibility = usePaneStore((s) => s.setPaneVisibility)
  const dispatchPaneAction = usePanelCoordinator((s) => s.dispatch)
  const paneState = usePanelCoordinator((s) => s.paneState)
  const lastPaneAction = usePanelCoordinator((s) => s.lastAction)

  const [isRefreshing, setIsRefreshing] = useState(false)
  const explorerRef = useRef<WorkspaceExplorerHandle>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadingTreeRef = useRef(false)
  const explorerResizingRef = useRef(false)
  const workspaceResizingRef = useRef(false)
  const resizeCleanupFns = useRef<(() => void)[]>([])
  const panelCtrlRef = useRef<WorkspacePanelController | null>(null)

  // ── Pane configs for PaneContainer ──
  const visiblePanes = useMemo(
    () => panes
      .filter((p) => p.visible && !["explorer", "chat", "terminal", "output", "diff"].includes(p.type))
      .sort((a, b) => a.order - b.order),
    [panes],
  )
  const paneConfigs = useMemo(() => {
    const paneRenderers: Record<string, () => React.ReactNode> = {
      code: () => <WorkspaceErrorBoundary><CodeWorkspace /></WorkspaceErrorBoundary>,
      browser: () => <WorkspaceErrorBoundary><Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/30 text-xs">Loading browser...</div>}><BrowserWorkspace /></Suspense></WorkspaceErrorBoundary>,
      design: () => <WorkspaceErrorBoundary><Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/30 text-xs">Loading design...</div>}><DesignWorkspace /></Suspense></WorkspaceErrorBoundary>,
      preview: () => <WorkspaceErrorBoundary><Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/30 text-xs">Loading preview...</div>}><PreviewPane /></Suspense></WorkspaceErrorBoundary>,
    }
    return visiblePanes.map((p) => ({
      id: p.id,
      type: p.type,
      title: safeCapitalize(p.type, ""),
      children: paneRenderers[p.type]?.() ?? null,
    }))
  }, [visiblePanes])

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

  const handleToggleDiffReview = useCallback(() => {
    if (editorMode === "diff") {
      setEditorMode("editor")
      return
    }

    const allDiffFiles = Array.from(diffFiles.values())
    const preferredTarget =
      diffReviewFile
      ?? allDiffFiles.find((file) => file.status === "pending")?.path
      ?? allDiffFiles[0]?.path
      ?? useWorkspaceStore.getState().activeFilePath

    if (!workspacePanelOpen) {
      setWorkspacePanelOpen(true)
      panelCtrlRef.current?.syncOpenState(true)
    }

    setPaneVisibility("code", true)
    panelCtrlRef.current?.handleManualTabClick("code")

    if (preferredTarget) {
      openFileInDiffMode(preferredTarget)
    } else {
      setEditorMode("diff")
    }
  }, [diffFiles, diffReviewFile, editorMode, openFileInDiffMode, setEditorMode, setPaneVisibility, workspacePanelOpen])

  useEffect(() => {
    if (runtimeStatus === "uninitialized" && rootPath) {
      initializeRuntime()
    }
  }, [runtimeStatus, rootPath, initializeRuntime])

  // ── File tree loader: when rootPath is set but fileTree is empty, load it ──
  useEffect(() => {
    if (!rootPath) return
    if (fileTree.length > 0) return
    if (loadingTreeRef.current) return
    loadingTreeRef.current = true
    console.log("[CodeCanvas] rootPath set but fileTree empty — loading tree", { rootPath })
    setLoading(true)
    loadFileTree(rootPath).then((tree) => {
      console.log(`[CodeCanvas] File tree loaded: ${tree.length} roots, ${countAllNodes(tree)} total nodes`)
      setFileTree(tree)
      startWatching(rootPath)
    }).catch((err) => {
      console.error("[CodeCanvas] Failed to load file tree:", err)
      setLoading(false)
    }).finally(() => {
      loadingTreeRef.current = false
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

  async function loadRestoredFileContent(rp: string) {
    const state = useWorkspaceStore.getState()
    // Load active tab content immediately
    if (state.activeFilePath) {
      const rel = state.activeFilePath.replace(/\//g, "\\")
      const absPath = `${rp}\\${rel}`
      try {
        const content = await readFile(absPath)
        const name = state.activeFilePath.split("/").pop() || state.activeFilePath
        useWorkspaceStore.getState().openFile({ path: state.activeFilePath, name, content, isDirty: false })
      } catch {
        // File may have been deleted — leave as-is
      }
    }
    // Defer background tab content loading
    const backgroundTabs = state.openFiles.filter(f => f.path !== state.activeFilePath)
    if (backgroundTabs.length > 0) {
      requestIdleCallback(() => {
        for (const tab of backgroundTabs) {
          const rel = tab.path.replace(/\//g, "\\")
          const absPath = `${rp}\\${rel}`
          readFile(absPath).then(content => {
            useWorkspaceStore.getState().openFile({ path: tab.path, name: tab.name, content, isDirty: false })
          }).catch(() => {
            // File may have been deleted
          })
        }
      }, { timeout: 2000 })
    }
  }

  const handleKeepDirtyBuffers = useCallback((paths: string[]) => {
    for (const path of paths) {
      const buf = recoveredBuffers.find(b => b.path === path)
      if (buf) {
        const name = path.split('/').pop() || path
        openFile({ path, name, content: buf.content, isDirty: true })
      }
    }
    setRecoveredBuffers([])
  }, [recoveredBuffers, openFile])

  const handleDiscardDirtyBuffers = useCallback((paths: string[]) => {
    setRecoveredBuffers(prev => prev.filter(b => !paths.includes(b.path)))
  }, [])

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
    if (loadingTreeRef.current) return
    loadingTreeRef.current = true
    console.log('[CodeCanvas] Restoring workspace from localStorage:', storedRoot)
    setRootPath(storedRoot)
    setLoading(true)
    loadFileTree(storedRoot).then((tree) => {
      if (tree.length === 0) {
        console.warn('[CodeCanvas] Restored workspace is empty or missing:', storedRoot)
        setMissingWorkspace(storedRoot)
        setLoading(false)
        return
      }
      console.log(`[CodeCanvas] Restored file tree: ${tree.length} roots`)
      setFileTree(tree)
      startWatching(storedRoot)
      restoreWorkspaceState()
      loadRestoredFileContent(storedRoot)
      const recovered = dirtyBufferManager.loadRecovered()
      if (recovered.length > 0) {
        setRecoveredBuffers(recovered)
      }
    }).catch((err) => {
      console.error('[CodeCanvas] Failed to restore file tree:', err)
      setMissingWorkspace(storedRoot)
      setLoading(false)
    }).finally(() => {
      loadingTreeRef.current = false
    })
  }, []) // only on mount

  // ── State persistence — persist on changes ──
  useEffect(() => {
    if (rootPath) {
      localStorage.setItem('agentic-workspace-root', rootPath)
      restoreWorkspaceState()
      loadRestoredFileContent(rootPath)
    }
  }, [rootPath, restoreWorkspaceState])

  const openFilesSnapshot = useWorkspaceStore(s => s.openFiles.map(f => f.path).join(','))
  const activeFileSnapshot = useWorkspaceStore(s => s.activeFilePath)
  const cursorSnapshot = useWorkspaceStore(s => `${s.cursorLine}:${s.cursorColumn}`)
  useEffect(() => {
    persistWorkspaceState()
  }, [openFilesSnapshot, activeFileSnapshot, cursorSnapshot, persistWorkspaceState])

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

  async function handleNewFile() {
    if (!rootPath) return
    const name = prompt("File name:")
    if (!name) return
    try {
      await createFile(`${rootPath}\\${name}`)
      const tree = await loadFileTree(rootPath)
      setFileTree(tree)
    } catch (err) {
      console.error("[CodeCanvas] Failed to create file:", err)
    }
  }

  async function handleNewFolder() {
    if (!rootPath) return
    const name = prompt("Folder name:")
    if (!name) return
    try {
      await createFolder(`${rootPath}\\${name}`)
      const tree = await loadFileTree(rootPath)
      setFileTree(tree)
    } catch (err) {
      console.error("[CodeCanvas] Failed to create folder:", err)
    }
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

  const handleSearchOpenFile = useCallback((path: string, line?: number) => {
    const rootPath = useWorkspaceStore.getState().rootPath
    const fetchAndOpen = async () => {
      try {
        const fullPath = rootPath ? rootPath + "\\" + path.replace(/\//g, "\\") : path
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

  useEffect(() => {
    onFileChange((event) => {
      handleFileChange(event)
      if (event.kind === "created" || event.kind === "removed") {
        debouncedRefresh()
      }

      if (event.kind === "modified") {
        const state = useWorkspaceStore.getState()
        const relativePath = rootPath
          ? event.path.replace(/\\/g, "/").replace(`${rootPath.replace(/\\/g, "/").replace(/\/$/, "")}/`, "")
          : event.path.replace(/\\/g, "/")
        const openFileEntry = state.openFiles.find((file) => file.path === relativePath)
        if (openFileEntry && !openFileEntry.isDirty && rootPath) {
          const absolutePath = `${rootPath}\\${relativePath.replace(/\//g, "\\")}`
          void readFile(absolutePath).then((content) => {
            useWorkspaceStore.getState().notifyFileEdited(relativePath, content)
          }).catch(() => {
            // External writes can race with file moves/deletes; tree refresh already handles recovery.
          })
        }
      }
    }).then((unlisten) => {
      unlistenRef.current = unlisten
    }).catch((err) => console.error("File change listener setup failed:", err))
    return () => {
      unlistenRef.current?.()
    }
  }, [handleFileChange, rootPath])

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
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "s") {
        e.preventDefault()
        toggleSessionSidebar()
      }
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
      if ((e.metaKey || e.ctrlKey) && e.key === "n" && !e.shiftKey && rootPath) {
        e.preventDefault()
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "n" && rootPath) {
        e.preventDefault()
      }
      // ⌘W — close active tab
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault()
        const state = useWorkspaceStore.getState()
        if (state.activeFilePath) {
          state.closeFile(state.activeFilePath)
        }
      }
      // ⌘P — quick open (fuzzy file search)
      if ((e.metaKey || e.ctrlKey) && e.key === "p" && !e.shiftKey) {
        e.preventDefault()
        setQuickOpenOpen((p) => !p)
      }
      // ⌘⇧P — command palette
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

  // ── Pane routing: sync AI actions to pane visibility and URL ──
  const lastPaneAction = usePanelCoordinator((s) => s.lastAction)
  useEffect(() => {
    if (!lastPaneAction) return
    if (lastPaneAction.type === "focus" || lastPaneAction.type === "open" || lastPaneAction.type === "navigate") {
      const target = lastPaneAction.type === "navigate" ? lastPaneAction.pane : lastPaneAction.pane
      const pane = panes.find((p) => p.type === target)
      if (pane) {
        setPaneVisibility(target, true)
        setWorkspacePanel(target as WorkspacePanel)
      }
    }
  }, [lastPaneAction])

  // ── Navigate pane to URL when AI dispatches a navigate action ──
  useEffect(() => {
    if (!lastPaneAction || lastPaneAction.type !== "navigate") return
    const target = lastPaneAction.pane
    const paneConfig = panes.find((p) => p.type === target)
    if (!paneConfig) return
    setPaneVisibility(target, true)
    setWorkspacePanel(target as WorkspacePanel)
  }, [lastPaneAction, panes])

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




  return (
    <div className="flex h-full flex-col bg-[#0a0a0b]" role="main" aria-label="Code canvas workspace">
      {/* Compact status bar — single line for active notifications */}
      {(runtimeStatus === "uninitialized" || runtimeStatus === "error" || (runtimeStatus === "ready" && !runtimeReady && rootPath) || (hasStaleConfig && runtimeReady)) && (
        <div className={cn(
          "flex items-center gap-2 border-b px-3 py-1.5 text-[10px]",
          runtimeStatus === "error" ? "border-red-500/15 bg-red-500/[0.03] text-red-400" :
          hasStaleConfig ? "border-yellow-500/15 bg-yellow-500/[0.03] text-yellow-400" :
          runtimeStatus === "uninitialized" ? "border-white/[0.04] bg-white/[0.02] text-white/50" :
          "border-amber-500/10 bg-amber-500/[0.02] text-amber-400",
        )}>
          {runtimeStatus === "uninitialized" && <><Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />Initializing runtime...</>}
          {runtimeStatus === "error" && <><XCircle className="h-3 w-3 mr-1 shrink-0" />{runtimeError}<Button variant="outline" size="sm" className="h-5 text-[9px] ml-auto border-red-500/20 text-red-400" onClick={initializeRuntime}>Retry</Button></>}
          {runtimeStatus === "ready" && !runtimeReady && rootPath && (
            <>{wiredRoles > 0 ? "Assign a provider to the Manager role in Settings" : "Add providers and assign models in Settings to enable orchestration."}</>
          )}
          {hasStaleConfig && runtimeReady && (
            <>Configuration changed — <button onClick={() => refreshRuntime()} className="underline font-medium hover:text-yellow-200">refresh now</button></>
          )}
        </div>
      )}



      {/* ── AGENTIC.md Init Banner ── */}
      <ConfigInitBanner />

      {/* ── MAIN PANEL LAYOUT or Empty State ── */}
      <WorkspaceErrorBoundary onOpenFolder={openWorkspace}>
      {rootPath && typeof rootPath === 'string' && rootPath.length > 0 ? (
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* PANEL 0: Session Sidebar */}
        {sessionSidebarOpen && (
          <div
            style={{ width: sessionSidebarWidth }}
            className="flex-shrink-0 overflow-hidden border-r border-white/[0.06]"
          >
            <SessionSidebar />
          </div>
        )}

        {/* PANEL 1: Explorer (File Tree) */}
        <div
          style={{ width: explorerOpen ? explorerWidth : 0 }}
          className={cn(
            "flex flex-col flex-shrink-0 overflow-hidden bg-[#0c0c0d]",
            explorerOpen && "border-r border-white/[0.06]",
          )}
        >
          {/* Explorer header — minimal */}
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-2 border-b border-white/[0.04]",
            explorerOpen ? "opacity-100" : "opacity-0 pointer-events-none",
          )}>
            <button
              onClick={() => setExplorerOpen(false)}
              className="rounded p-0.5 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all shrink-0"
              title="Collapse explorer (⌘B)"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <span className="text-[9px] font-medium text-white/25 uppercase tracking-widest">Explorer</span>
            {rootPath && (
              <span className="text-[10px] text-white/40 truncate max-w-[120px]" title={rootPath}>
                {rootPath.split(/[/\\]/).pop()}
              </span>
            )}
          </div>

          {/* Explorer */}
          <div className={cn("flex-1 min-h-0", explorerOpen ? "opacity-100" : "opacity-0 pointer-events-none")}>
            <WorkspaceExplorer
              ref={explorerRef}
              onOpenWorkspace={openWorkspace}
            />
          </div>

        </div>

        {explorerOpen && <ResizeHandle onMouseDown={handleExplorerResize} />}

      {/* PANEL 2: Assistant Workspace */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0" role="region" aria-label="Assistant chat panel">
        {/* Assistant header bar — minimal */}
        <div className="flex items-center justify-between px-2 py-1 border-b border-white/[0.06] bg-[#0c0c0d]">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => toggleSessionSidebar()}
                className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
                title="Toggle session sidebar (⌘⇧S)"
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setExplorerOpen(!explorerOpen)}
                className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
                title="Toggle explorer (⌘B)"
              >
                {explorerOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeft className="h-3.5 w-3.5" />}
              </button>
              <span className="text-[10px] font-medium text-white/25">Assistant</span>
              {/* Runtime dot */}
              <span className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                runtimeReady && runtimeHealth === "healthy" ? "bg-green-500" :
                runtimeStatus === "error" ? "bg-red-500" :
                runtimeStatus === "initializing" ? "bg-blue-400 animate-pulse" :
                "bg-white/20"
              )} title={runtimeReady ? "Runtime ready" : runtimeError || runtimeMessage || "Initializing"} />
            </div>

            <div className="flex items-center gap-1.5">
              {/* Context usage indicator */}
              <ContextUsageIndicator />

              {/* Toggle diff viewer pane */}
              <button
                onClick={handleToggleDiffReview}
                className={cn(
                  "rounded p-0.5 transition-all",
                  editorMode === "diff"
                    ? "text-blue-400 bg-blue-500/10"
                    : "text-white/30 hover:text-white/60 hover:bg-white/[0.06]"
                )}
                title="Toggle diff viewer"
              >
                <FileDiff className="h-3.5 w-3.5" />
              </button>

              {/* Toggle preview pane */}
              <button
                onClick={() => setPaneVisibility("preview", !panes.find((p) => p.id === "preview")?.visible)}
                className={cn(
                  "rounded p-0.5 transition-all",
                  panes.find((p) => p.id === "preview")?.visible
                    ? "text-blue-400 bg-blue-500/10"
                    : "text-white/30 hover:text-white/60 hover:bg-white/[0.06]"
                )}
                title="Toggle preview pane"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>

              {/* Toggle docking area */}
              <button
                onClick={() => {
                  const next = !workspacePanelOpen
                  setWorkspacePanelOpen(next)
                  panelCtrlRef.current?.syncOpenState(next)
                }}
                className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
                title="Toggle docking area (⌘J)"
              >
                {workspacePanelOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRight className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Agent activity strip — visible during execution */}
          <div className="shrink-0 border-b border-white/[0.04] overflow-hidden">
            <WorkspaceErrorBoundary><AgentActivityPanel /></WorkspaceErrorBoundary>
          </div>

          {/* Assistant content */}
          <div className="flex-1 overflow-hidden min-h-0">
            <ErrorBoundary name="ChatPanel"><ChatPanel /></ErrorBoundary>
          </div>
        </div>

        {/* Resize handle: Assistant | Docking Area */}
        {workspacePanelOpen && <ResizeHandle onMouseDown={handleWorkspaceResize} />}

        {/* PANEL 3: Docking Area — multi-pane grid */}
        <div
          style={{ width: workspacePanelOpen ? workspacePanelWidth : 0 }}
          className={cn(
            "flex-shrink-0 flex flex-col overflow-hidden bg-[#0a0a0b] min-h-0",
            workspacePanelOpen && "border-l border-white/[0.06]",
          )}
          role="region"
          aria-label="Docking area"
        >
          {/* Pane toggle bar */}
          <div className="flex items-center bg-[#0c0c0d] border-b border-white/[0.04] px-1.5 overflow-x-auto shrink-0">
            {WORKSPACE_PANEL_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const pane = panes.find((p) => p.type === opt.id)
              const visible = pane?.visible ?? false
              const isMainPanel = workspacePanel === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => {
                    if (visible && isMainPanel) {
                      setPaneVisibility(opt.id, false)
                    } else if (!visible) {
                      setPaneVisibility(opt.id, true)
                      setWorkspacePanel(opt.id)
                    }
                    panelCtrlRef.current?.handleManualTabClick(opt.id)
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-medium transition-all duration-150 shrink-0 border-b-2 border-transparent active:scale-95",
                    visible
                      ? "text-white border-blue-500"
                      : "text-white/30 hover:text-white/50 hover:border-white/10"
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", visible ? "text-blue-400" : "text-white/30")} />
                  <span>{opt.label}</span>
                </button>
              )
            })}
          </div>

          {/* PaneContainer — all visible panes shown simultaneously */}
          <div className="flex-1 overflow-hidden min-h-0">
            <PaneContainer panes={paneConfigs} />
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
      </WorkspaceErrorBoundary>

      {/* Global Search — overlay above everything */}
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenFile={handleSearchOpenFile}
      />

      {/* Quick Open — overlay above everything */}
      <QuickOpen
        open={quickOpenOpen}
        onClose={() => setQuickOpenOpen(false)}
      />

      {/* Command Palette — overlay above everything */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        context={commandPaletteContext}
      />

      {/* Execution Dock — always visible, survives navigation */}
      <ExecutionDock />

      {/* Side Chat — Cmd+; overlay */}
      <SideChat />

      {/* Dirty Buffer Recovery Dialog */}
      {recoveredBuffers.length > 0 && (
        <DirtyBufferRecoveryDialog
          buffers={recoveredBuffers}
          onKeep={handleKeepDirtyBuffers}
          onDiscard={handleDiscardDirtyBuffers}
          onClose={() => setRecoveredBuffers([])}
        />
      )}

      {/* Missing Workspace Dialog */}
      {missingWorkspace && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: '#1a1a1f', borderRadius: '12px', border: '1px solid #2a2a30',
            width: '440px', padding: '24px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', margin: '0 0 8px 0' }}>
              Workspace Not Found
            </h2>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              The workspace folder "<code style={{ color: '#f59e0b', wordBreak: 'break-all' }}>{missingWorkspace}</code>" could not be found. It may have been moved, renamed, or deleted.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  localStorage.removeItem('agentic-workspace-root')
                  setMissingWorkspace(null)
                }}
                style={{
                  padding: '8px 16px', background: 'transparent', color: '#ccc',
                  border: '1px solid #555', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                }}
              >
                Remove from Recent
              </button>
              <button
                onClick={async () => {
                  const folder = await pickWorkspaceFolder()
                  if (folder) {
                    setMissingWorkspace(null)
                    setRootPath(folder)
                    setLoading(true)
                    const tree = await loadFileTree(folder)
                    if (tree.length > 0) setFileTree(tree)
                    startWatching(folder)
                  }
                }}
                style={{
                  padding: '8px 16px', background: '#2563eb', color: '#fff',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                }}
              >
                Choose Another Folder
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
