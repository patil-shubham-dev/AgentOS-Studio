import { motion } from "framer-motion"
import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from "react"
import { useNavigate } from "react-router-dom"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useAgentStore } from "@/stores/agent-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"

import { loadFileTree, readFile, createFile, createFolder } from "@/lib/filesystem"
import { addRecentWorkspace, getRecentWorkspaces, pickWorkspaceFolder, startWatching, onFileChange, type RecentWorkspace } from "@/lib/workspace"
import type { FileEntry } from "@/types"
import { safeCapitalize } from "@/lib/safeCapitalize"
import { workspaceIndex } from "@/lib/search-index"
import { invoke } from "@/lib/electron-api"
import { Explorer, type ExplorerHandle } from "@/components/workspace/explorer/Explorer"
import { ExplorerResizer } from "@/components/workspace/explorer/ExplorerResizer"
import { CodeWorkspace } from "@/components/workspace/code-workspace"
import { ChatPanel } from "@/components/workspace/chat-panel"
import { PaneContainer } from "@/components/workspace/pane-layout/PaneContainer"
import { MainPaneContainer } from "@/components/workspace/pane-layout/MainPaneContainer"

const DesignWorkspace = lazy(() => import("@/components/workspace/design-workspace").then(m => ({ default: m.DesignWorkspace })))
import { ConfigInitBanner } from "@/components/workspace/ConfigInitBanner"

import { dirtyBufferManager, type DirtyBuffer } from "@/lib/dirty-buffer-manager"
import { DirtyBufferRecoveryDialog } from "@/components/workspace/DirtyBufferRecoveryDialog"
import { IssueToPRDialog } from "@/components/workspace/IssueToPRDialog"
import { WorkflowModeIndicator } from "@/components/workspace/WorkflowModeIndicator"
import { WorkspaceEmptyState } from "@/components/workspace/WorkspaceEmptyState"
import { GlobalSearch } from "@/components/workspace/global-search"
import { ShortcutHint } from "@/components/ui/ShortcutHint"
import { CommandPalette } from "@/components/workspace/command-palette"
import { QuickOpen } from "@/components/workspace/QuickOpen"

import { ErrorBoundary } from "@/components/runtime/ErrorBoundary"
import { WorkspaceErrorBoundary } from "@/components/workspace/WorkspaceErrorBoundary"
import { ContextRadar } from "@/components/workspace/context-indicator/ContextRadar"
import { SideChat } from "@/components/workspace/side-chat/SideChat"
import { SessionSidebar } from "@/components/workspace/timeline/SessionSidebar"
import { CheckpointTimeline } from "@/components/workspace/CheckpointTimeline"
import { useSessionStore } from "@/stores/session-store"
import { useCheckpointStore } from "@/stores/checkpoint-store"
import { usePaneStore } from "@/stores/pane-store"
import { usePanelCoordinator } from "@/stores/panel-coordinator"
import { useDiffStore } from "@/stores/diff-store"

import { Button, TooltipSimple as Tooltip } from "@agentic-os/ui"
import { cn } from "@/lib/utils"
import { WorkspacePanelController, type WorkspacePanel } from "@/lib/workspace-panel-controller"
import { useLeakTracker } from "@/performance/leak-detector"
import {
  PanelRightClose, PanelRight, PanelLeftClose, PanelLeft,
  Loader2,
  XCircle,
  FileDiff,
} from "lucide-react"
import {
  CodePanelIcon,
  DesignPanelIcon,
} from "@/components/ui/PanelIcons"

const WORKSPACE_PANEL_OPTIONS: { id: WorkspacePanel; label: string; icon: typeof CodePanelIcon }[] = [
  { id: "code", label: "Code", icon: CodePanelIcon },
  { id: "design", label: "Design & Preview", icon: DesignPanelIcon },
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
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>([])
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
  const [explorerOpen, setExplorerOpen] = useState(() => loadPanelState("explorerOpen", false))
  const [explorerWidth, setExplorerWidth] = useState(() => loadPanelState("explorerWidth", 320))
  const [workspacePanel, setWorkspacePanel] = useState<WorkspacePanel>(() => loadPanelState("workspacePanel", "code"))
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(() => loadPanelState("workspacePanelOpen", true))
  const [workspacePanelWidth, setWorkspacePanelWidth] = useState(() => loadPanelState("workspacePanelWidth", 420))
  const [sessionSidebarOpen, setSessionSidebarOpen] = useState(() => loadPanelState("sessionSidebarOpen", false))
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const isNarrow = windowWidth < 900
  const searchOpen = useWorkspaceStore((s) => s.searchOpen)
  const setSearchOpen = useWorkspaceStore((s) => s.setSearchOpen)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [quickOpenOpen, setQuickOpenOpen] = useState(false)

  const panes = usePaneStore((s) => s.panes)
  const mainPaneIds = usePaneStore((s) => s.mainPaneIds)
  const setPaneVisibility = usePaneStore((s) => s.setPaneVisibility)
  const dispatchPaneAction = usePanelCoordinator((s) => s.dispatch)
  const paneState = usePanelCoordinator((s) => s.paneState)
  const lastPaneAction = usePanelCoordinator((s) => s.lastAction)

  const [isRefreshing, setIsRefreshing] = useState(false)
  const explorerRef = useRef<ExplorerHandle>(null)
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
      design: () => <WorkspaceErrorBoundary><Suspense fallback={<div className="flex-1 flex items-center justify-center text-[var(--text-tertiary)] text-xs">Loading design...</div>}><DesignWorkspace /></Suspense></WorkspaceErrorBoundary>,
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
    toggleSearch: () => setSearchOpen(!useWorkspaceStore.getState().searchOpen),
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
    setLoading(true)
    loadFileTree(rootPath).then((tree) => {
      setFileTree(tree)
      startWatching(rootPath)
    }).catch((err) => {
      console.error("[CodeCanvas] Failed to load file tree:", err)
      setLoading(false)
    }).finally(() => {
      loadingTreeRef.current = false
    })
  }, [rootPath])

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
    setRootPath(storedRoot)
    setLoading(true)
    loadFileTree(storedRoot).then((tree) => {
      if (tree.length === 0) {
        console.warn('[CodeCanvas] Restored workspace is empty or missing:', storedRoot)
        setMissingWorkspace(storedRoot)
        setLoading(false)
        return
      }
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
  useEffect(() => {
    refreshRecentWorkspaces()
  }, [])

  async function refreshRecentWorkspaces() {
    try {
      setRecentWorkspaces(await getRecentWorkspaces())
    } catch {
      setRecentWorkspaces([])
    }
  }

  async function openWorkspacePath(folder: string) {
    setRootPath(folder)
    setLoading(true)
    const tree = await loadFileTree(folder)
    if (tree.length === 0) {
      setMissingWorkspace(folder)
      setLoading(false)
      return
    }
    setFileTree(tree)
    await startWatching(folder)
    await addRecentWorkspace(folder)
    await refreshRecentWorkspaces()
  }

  async function openWorkspace() {
    const folder = await pickWorkspaceFolder()
    if (!folder) return
    await openWorkspacePath(folder)
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
        setSearchOpen(!useWorkspaceStore.getState().searchOpen)
      }
      // Esc — dismiss open panels when not in an input
      if (e.key === "Escape" && !["TEXTAREA", "INPUT"].includes((e.target as HTMLElement).tagName)) {
        if (explorerOpen) { setExplorerOpen(false); e.preventDefault(); return }
        if (sessionSidebarOpen) { setSessionSidebarOpen(false); e.preventDefault(); return }
        if (searchOpen) { setSearchOpen(false); e.preventDefault(); return }
      }
      // ⌘K — command palette (table-stakes, unless Monaco is editing inline)
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && !e.shiftKey) {
        const target = e.target as HTMLElement
        const isMonaco = target.closest('.monaco-editor')
        if (!isMonaco) {
          e.preventDefault()
          setCommandPaletteOpen((p) => !p)
        }
        // If Monaco is focused, its inline-edit action handles Cmd+K with selection
        return
      }
      // ⌘⇧S — session sidebar
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "s") {
        e.preventDefault()
        setSessionSidebarOpen((p) => !p)
      }
      // ⌘⇧Z — checkpoint timeline
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") {
        e.preventDefault()
        useCheckpointStore.getState().togglePanel()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [rootPath, setSessionSidebarOpen])

  // ── Auto-collapse panels on narrow screens ──
  useEffect(() => {
    function handleResize() {
      const w = window.innerWidth
      setWindowWidth(w)
      if (w < 900 && explorerOpen) {
        setExplorerOpen(false)
      }
      if (w < 700 && workspacePanelOpen) {
        setWorkspacePanelOpen(false)
        panelCtrlRef.current?.syncOpenState(false)
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [explorerOpen, workspacePanelOpen])

    // ── Persist panel state on change ──
  useEffect(() => { persistPanelState("explorerOpen", explorerOpen) }, [explorerOpen])
  useEffect(() => { persistPanelState("explorerWidth", explorerWidth) }, [explorerWidth])
  useEffect(() => { persistPanelState("workspacePanel", workspacePanel) }, [workspacePanel])
  useEffect(() => { persistPanelState("workspacePanelOpen", workspacePanelOpen) }, [workspacePanelOpen])
  useEffect(() => { persistPanelState("workspacePanelWidth", workspacePanelWidth) }, [workspacePanelWidth])
  useEffect(() => { persistPanelState("sessionSidebarOpen", sessionSidebarOpen) }, [sessionSidebarOpen])

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
    const paneConfig = panes.find((p) => p.type === lastPaneAction.pane)
    if (!paneConfig) return
    setPaneVisibility(lastPaneAction.pane, true)
    setWorkspacePanel(lastPaneAction.pane)
  }, [lastPaneAction, panes])

  // ── Resize handlers ──
  const handleExplorerResize = useCallback((width: number) => {
    setExplorerWidth(width)
  }, [])

  const handleWorkspaceResize = useCallback((width: number) => {
    setWorkspacePanelWidth(width)
  }, [])




  return (
    <div className="flex h-full flex-col bg-[var(--surface-app)]" role="main" aria-label="Code canvas workspace">
      {/* Compact status bar — single line for active notifications */}
      {(runtimeStatus === "uninitialized" || runtimeStatus === "error" || (runtimeStatus === "ready" && !runtimeReady && rootPath) || (hasStaleConfig && runtimeReady)) && (
        <div className={cn(
          "flex items-center gap-2 border-b px-3 py-1.5 text-[10px]",
          runtimeStatus === "error" ? "border-[var(--color-accent-red)]/15 bg-[var(--color-accent-red)]/[0.03] text-[var(--color-accent-red)]" :
          hasStaleConfig ? "border-[var(--color-accent-amber)]/15 bg-[var(--color-accent-amber)]/[0.03] text-[var(--color-accent-amber)]" :
          runtimeStatus === "uninitialized" ? "border-[var(--border-subtle)] bg-[var(--border-subtle)] text-[var(--text-tertiary)]" :
          "border-[var(--color-accent-amber)]/10 bg-[var(--color-accent-amber)]/[0.02] text-[var(--color-accent-amber)]",
        )}>
          {runtimeStatus === "uninitialized" && <><Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />Initializing runtime...</>}
          {runtimeStatus === "error" && <><XCircle className="h-3 w-3 mr-1 shrink-0" />{runtimeError}<Button variant="outline" size="sm" className="h-5 text-[9px] ml-auto border-[var(--color-accent-red)]/20 text-[var(--color-accent-red)]" onClick={initializeRuntime}>Retry</Button></>}
          {runtimeStatus === "ready" && !runtimeReady && rootPath && (
            <>Add a provider in Settings to start the AI assistant.</>
          )}
          {hasStaleConfig && runtimeReady && (
            <>Configuration changed — <button onClick={() => refreshRuntime()} className="underline font-medium hover:text-[var(--color-accent-amber)]">refresh now</button></>
          )}
        </div>
      )}



      {/* ── AGENTIC.md Init Banner ── */}
      <ConfigInitBanner />

      {/* ── MAIN PANEL LAYOUT or Empty State ── */}
      <WorkspaceErrorBoundary onOpenFolder={openWorkspace}>
      {rootPath && typeof rootPath === 'string' && rootPath.length > 0 ? (
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Session Sidebar */}
        {sessionSidebarOpen && (
          <SessionSidebar
            open={sessionSidebarOpen}
            onClose={() => setSessionSidebarOpen(false)}
            onSessionChange={(sessionId) => {
              useSessionStore.getState().selectTab(sessionId)
            }}
          />
        )}
        {/* Checkpoint Timeline */}
        <CheckpointTimeline />

        <MainPaneContainer
          panes={mainPaneIds.map((id) => ({
            id,
            children: id === "explorer" ? (
              <div className="h-full flex flex-col bg-[#0c0c0d] min-h-0 overflow-hidden" role="region" aria-label="Explorer">
                <Explorer ref={explorerRef} onOpenWorkspace={openWorkspace} />
              </div>
            ) : id === "chat" ? (
              <div className="h-full flex flex-col overflow-hidden min-h-0" role="region" aria-label="Chat panel">
                <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--border-default)] bg-[var(--surface-panel)] shrink-0">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setExplorerOpen(!explorerOpen)}
                      className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition-all"
                      title="Toggle explorer (⌘B)"
                    >
                      {explorerOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeft className="h-3.5 w-3.5" />}
                    </button>
                    <span className="text-[10px] font-medium text-[var(--text-quaternary)]">Chat</span>
                    <WorkflowModeIndicator />
                    <span className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      runtimeReady && runtimeHealth === "healthy" ? "bg-[var(--color-accent-green)]" :
                      runtimeStatus === "error" ? "bg-[var(--color-accent-red)]" :
                      runtimeStatus === "initializing" ? "bg-[var(--color-accent-blue)] animate-pulse" :
                      "bg-[var(--text-quaternary)]"
                    )} title={runtimeReady ? "Runtime ready" : runtimeError || runtimeMessage || "Initializing"} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ContextRadar />
                    <button
                      onClick={handleToggleDiffReview}
                      className={cn(
                        "rounded p-0.5 transition-all",
                        editorMode === "diff"
                          ? "text-[var(--color-accent-blue)] bg-[var(--color-accent-blue)]/10"
                          : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]"
                      )}
                      title="Toggle diff viewer (⌘⇧D)"
                    >
                      <FileDiff className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        const next = !workspacePanelOpen
                        setWorkspacePanelOpen(next)
                        panelCtrlRef.current?.syncOpenState(next)
                      }}
                      className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition-all"
                      title="Toggle workspace panel (⌘J)"
                    >
                      {workspacePanelOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRight className="h-3.5 w-3.5" />}
                      <ShortcutHint keys="⌘J" className="ml-0.5 hidden sm:inline-flex" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden min-h-0">
                  <ErrorBoundary name="ChatPanel"><ChatPanel /></ErrorBoundary>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col overflow-hidden min-h-0" role="region" aria-label="Workspace panel">
                <div className="flex items-center bg-[var(--surface-panel)] border-b border-[var(--border-subtle)] px-1.5 overflow-x-auto shrink-0">
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
                          } else {
                            panes.forEach((p) => { if (["code", "design"].includes(p.type)) setPaneVisibility(p.type, false) })
                            setPaneVisibility(opt.id, true)
                            setWorkspacePanel(opt.id)
                          }
                          panelCtrlRef.current?.handleManualTabClick(opt.id)
                        }}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-medium transition-all duration-150 shrink-0 border-b-2 border-transparent active:scale-95",
                          visible
                            ? "text-[var(--text-primary)] border-[var(--accent-code)]"
                            : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
                        )}
                      >
                        <Icon className={cn("h-3.5 w-3.5", visible ? "text-[var(--accent-code)]" : "text-[var(--text-tertiary)]")} />
                        <span>{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="flex-1 overflow-hidden min-h-0">
                  <PaneContainer panes={paneConfigs} />
                </div>
              </div>
            ),
            minWidth: id === "explorer" ? 180 : id === "chat" ? 300 : 300,
            maxWidth: id === "explorer" ? 500 : id === "chat" ? Infinity : 700,
            defaultSize: id === "explorer" ? (explorerOpen ? explorerWidth : 0) : id === "chat" ? 1 : (workspacePanelOpen ? workspacePanelWidth : 0),
            header: id === "explorer" ? (
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)] shrink-0" style={{ background: "var(--surface-panel)" }}>
                <span className="text-[10px] font-medium text-[var(--text-quaternary)]">Explorer</span>
                <button onClick={() => setExplorerOpen(false)} className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] transition-all" title="Close explorer">
                  <PanelLeftClose className="h-3 w-3" />
                </button>
              </div>
            ) : undefined,
          }))}
          onReorder={(ids) => usePaneStore.getState().reorderMainPanes(ids)}
          onResize={(id, size) => {
            if (id === "explorer") setExplorerWidth(size)
            if (id === "code") setWorkspacePanelWidth(size)
          }}
          getSize={(id) => {
            if (id === "explorer") return explorerOpen ? explorerWidth : 0
            if (id === "chat") return -1
            if (id === "code") return workspacePanelOpen ? workspacePanelWidth : 0
            return 0
          }}
        />
      </div>

      ) : (
        <WorkspaceEmptyState
          recentWorkspaces={recentWorkspaces}
          onOpenWorkspace={openWorkspace}
          onOpenRecent={openWorkspacePath}
        />
      )}
      </WorkspaceErrorBoundary>

      {/* Global Search overlay */}
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenFile={handleSearchOpenFile}
      />

      {/* Quick Open overlay */}
      <QuickOpen
        open={quickOpenOpen}
        onClose={() => setQuickOpenOpen(false)}
      />

      {/* Command Palette overlay */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        context={commandPaletteContext}
      />

      {/* Side Chat overlay */}
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

      {/* Issue → PR Dialog */}
      <IssueToPRDialog />

      {/* Missing Workspace Dialog */}
      {missingWorkspace && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: 'var(--surface-overlay)', borderRadius: '12px', border: '1px solid var(--border-default)',
            width: '440px', padding: '24px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
              Workspace Not Found
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              The workspace folder "<code style={{ color: 'var(--color-accent-amber)', wordBreak: 'break-all' }}>{missingWorkspace}</code>" could not be found. It may have been moved, renamed, or deleted.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  localStorage.removeItem('agentic-workspace-root')
                  setMissingWorkspace(null)
                }}
                style={{
                  padding: '8px 16px', background: 'transparent', color: 'var(--text-secondary)',
                  border: '1px solid var(--border-default)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                }}
              >
                Remove from Recent
              </button>
              <button
                onClick={async () => {
                  const folder = await pickWorkspaceFolder()
                  if (folder) {
                    setMissingWorkspace(null)
                    await openWorkspacePath(folder)
                  }
                }}
                style={{
                  padding: '8px 16px', background: 'var(--color-accent-blue)', color: '#fff',
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
