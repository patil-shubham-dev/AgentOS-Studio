import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from "react"
import { useNavigate } from "react-router-dom"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useAgentStore } from "@/stores/agent-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"

import { loadFileTree, readFile } from "@/lib/filesystem"
import { addRecentWorkspace, getRecentWorkspaces, pickWorkspaceFolder, startWatching, onFileChange, type RecentWorkspace } from "@/lib/workspace"
import { workspaceIndex } from "@/lib/search-index"
import { Explorer, type ExplorerHandle } from "@/components/workspace/explorer/Explorer"
import { CodeWorkspace } from "@/components/workspace/code-workspace"
import { HarnessTerminalPanel } from "@/components/workspace/harness-terminal-panel"

const DesignWorkspace = lazy(() => import("@/components/workspace/design-workspace").then(m => ({ default: m.DesignWorkspace })))
const BrowserWorkspace = lazy(() => import("@/components/workspace/browser/browser-workspace").then(m => ({ default: m.BrowserWorkspace })))
import { ConfigInitBanner } from "@/components/workspace/ConfigInitBanner"

import { dirtyBufferManager, type DirtyBuffer } from "@/lib/dirty-buffer-manager"
import { DirtyBufferRecoveryDialog } from "@/components/workspace/DirtyBufferRecoveryDialog"
import { IssueToPRDialog } from "@/components/workspace/IssueToPRDialog"
import { WorkflowModeIndicator } from "@/components/workspace/WorkflowModeIndicator"
import { WorkspaceEmptyState } from "@/components/workspace/WorkspaceEmptyState"
import { GlobalSearch } from "@/components/workspace/global-search"
import { CommandPalette } from "@/components/workspace/command-palette"
import { QuickOpen } from "@/components/workspace/QuickOpen"

import { ErrorBoundary } from "@/components/runtime/ErrorBoundary"
import { WorkspaceErrorBoundary } from "@/components/workspace/WorkspaceErrorBoundary"
import { SideChat } from "@/components/workspace/side-chat/SideChat"
import { SessionSidebar } from "@/components/workspace/timeline/SessionSidebar"
import { useSessionStore } from "@/stores/session-store"
import { usePanelCoordinator } from "@/stores/panel-coordinator"
import { useDiffStore } from "@/stores/diff-store"

import { usePaneStore } from "@/stores/pane-store"
import { recordAttribution } from "@/lib/edit-attribution"
import { usePanelResize } from "@/hooks/use-panel-resize"
import { Button } from "@agentic-os/ui"
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
import { Globe } from "lucide-react"

const WORKSPACE_PANEL_OPTIONS: { id: WorkspacePanel; label: string; icon: typeof CodePanelIcon }[] = [
  { id: "code", label: "Code", icon: CodePanelIcon },
  { id: "design", label: "Design & Preview", icon: DesignPanelIcon },
  { id: "browser", label: "Browser", icon: Globe as unknown as typeof CodePanelIcon },
]

const PANEL_STORAGE_KEY_PREFIX = "aos-panel-"

function isWorkspacePanel(panel: string): panel is WorkspacePanel {
  return panel === "code" || panel === "design" || panel === "browser"
}

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
  } catch { /* quota exceeded â€” ignore */ }
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

  // â”€â”€ Panel state (persisted to localStorage) â”€â”€
  // Phase 4 dedup: explorer + session sidebar are canonical via pane-store (single source).
  const explorerOpen = usePaneStore((s) => s.panes.find((p) => p.id === "explorer")?.visible ?? true)
  const setExplorerOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    const cur = usePaneStore.getState().panes.find((p) => p.id === "explorer")?.visible ?? true
    const val = typeof next === "function" ? (next as (p: boolean) => boolean)(cur) : next
    usePaneStore.getState().setPaneVisibility("explorer", val)
  }, [])
  const [workspacePanel, setWorkspacePanel] = useState<WorkspacePanel>(() => loadPanelState("workspacePanel", "code"))
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(() => loadPanelState("workspacePanelOpen", true))
  const sessionSidebarOpen = usePaneStore((s) => s.sessionSidebarOpen)
  const setSessionSidebarOpen = usePaneStore((s) => s.setSessionSidebarOpen)
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const isNarrow = windowWidth < 900
  const searchOpen = useWorkspaceStore((s) => s.searchOpen)
  const setSearchOpen = useWorkspaceStore((s) => s.setSearchOpen)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [quickOpenOpen, setQuickOpenOpen] = useState(false)

  const lastPaneAction = usePanelCoordinator((s) => s.lastAction)

  const layoutRef = useRef<HTMLDivElement>(null)
  // Per-mode width presets via distinct storage keys so each mode remembers its width
  const workspaceDefaultWidth = workspacePanel === "browser" ? 640 : workspacePanel === "design" ? 560 : 480
  const explorerResize = usePanelResize(layoutRef, {
    id: "explorer",
    defaultWidth: workspacePanel === "browser" ? 220 : 280,
    minWidth: 200,
    maxWidth: 500,
    direction: "horizontal",
  })
  const workspaceResize = usePanelResize(layoutRef, {
    id: `workspace-${workspacePanel}`,
    defaultWidth: workspaceDefaultWidth,
    minWidth: 380,
    maxWidth: 900,
    direction: "horizontal",
  })

  const explorerRef = useRef<ExplorerHandle>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadingTreeRef = useRef(false)
  const panelCtrlRef = useRef<WorkspacePanelController | null>(null)

  const refreshTree = useCallback(async () => {
    const rp = useWorkspaceStore.getState().rootPath
    if (!rp) return
    setLoading(true)
    try {
      const tree = await loadFileTree(rp)
      setFileTree(tree)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Explorer] refresh tree FAILED`, { error: msg })
    }
  }, [setFileTree, setLoading])

  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => void refreshTree(), 150)
  }, [refreshTree])

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
      if (!isWorkspacePanel(panel)) return
      setWorkspacePanel(panel)
      setWorkspacePanelOpen(true)
      panelCtrlRef.current?.handleManualTabClick(panel)
    },
  }), [navigate, refreshTree, setSearchOpen])

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

    setWorkspacePanelOpen(true)
    setWorkspacePanel("code")
    panelCtrlRef.current?.handleManualTabClick("code")

    if (preferredTarget) {
      openFileInDiffMode(preferredTarget)
    } else {
      setEditorMode("diff")
    }
  }, [diffFiles, diffReviewFile, editorMode, openFileInDiffMode, setEditorMode])

  useEffect(() => {
    if (runtimeStatus === "uninitialized" && rootPath) {
      initializeRuntime()
    }
  }, [runtimeStatus, rootPath, initializeRuntime])

  // â”€â”€ File tree loader: when rootPath is set but fileTree is empty, load it â”€â”€
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
  }, [fileTree.length, rootPath, setFileTree, setLoading])

  const loadRestoredFileContent = useCallback(async (rp: string) => {
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
        // File may have been deleted â€” leave as-is
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
  }, [])

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

  // â”€â”€ Search index â€” rebuild when file tree changes â”€â”€
  useEffect(() => {
    const rp = useWorkspaceStore.getState().rootPath
    if (fileTree.length > 0 && rp) {
      workspaceIndex.initialize(fileTree, rp)
    }
  }, [fileTree])

  // â”€â”€ Workspace auto-restore on app startup â”€â”€
  // Reads agentic-workspace-root from localStorage and re-opens the last workspace
  useEffect(() => {
    if (rootPath) {
      // rootPath already set â€” not a cold start
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
      if (window.innerWidth >= 900) setExplorerOpen(true)
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
  }, [loadRestoredFileContent, restoreWorkspaceState, rootPath, setFileTree, setLoading, setRootPath])

  // â”€â”€ State persistence â€” persist on changes â”€â”€
  useEffect(() => {
    if (rootPath) {
      localStorage.setItem('agentic-workspace-root', rootPath)
      restoreWorkspaceState()
      loadRestoredFileContent(rootPath)
    }
  }, [loadRestoredFileContent, rootPath, restoreWorkspaceState])

  const openFilesSnapshot = useWorkspaceStore(s => s.openFiles.map(f => f.path).join(','))
  const activeFileSnapshot = useWorkspaceStore(s => s.activeFilePath)
  const cursorSnapshot = useWorkspaceStore(s => `${s.cursorLine}:${s.cursorColumn}`)
  useEffect(() => {
    persistWorkspaceState()
  }, [openFilesSnapshot, activeFileSnapshot, cursorSnapshot, persistWorkspaceState])

  // â”€â”€ Workspace operations â”€â”€
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
    if (!isNarrow) setExplorerOpen(true)
    await startWatching(folder)
    await addRecentWorkspace(folder)
    await refreshRecentWorkspaces()
  }

  async function openWorkspace() {
    const folder = await pickWorkspaceFolder()
    if (!folder) return
    await openWorkspacePath(folder)
  }

  const handleSearchOpenFile = useCallback((path: string) => {
    const rootPath = useWorkspaceStore.getState().rootPath
    const fetchAndOpen = async () => {
      try {
        const fullPath = rootPath ? rootPath + "\\" + path.replace(/\//g, "\\") : path
        const content = await readFile(fullPath)
        const name = path.split("/").pop() || path
        useWorkspaceStore.getState().openFile({ path, name, content, isDirty: false })
      } catch {
        // File may already be open â€” just navigate
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
        // Phase 6 attribution: external write while harness PTY active and editor didn't originate it => agent
        const hasHarness = typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).__harnessHasSession
        // We treat all external modifications as potential agent edits when not dirty; refined via terminal manager later
        recordAttribution(relativePath, hasHarness ? "agent" : "external", !!hasHarness)
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
  }, [debouncedRefresh, handleFileChange, rootPath])

  // â”€â”€ Workspace Panel Controller â”€â”€
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

  // â”€â”€ Validation state from preflight â”€â”€
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
        message: "Provider configuration changed â€” runtime needs refresh",
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

  // â”€â”€ Keyboard shortcuts â”€â”€
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
        panelCtrlRef.current?.handleManualTabClick("design")
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
      // âŒ˜W â€” close active tab
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault()
        const state = useWorkspaceStore.getState()
        if (state.activeFilePath) {
          state.closeFile(state.activeFilePath)
        }
      }
      // âŒ˜P â€” quick open (fuzzy file search)
      if ((e.metaKey || e.ctrlKey) && e.key === "p" && !e.shiftKey) {
        e.preventDefault()
        setQuickOpenOpen((p) => !p)
      }
      // âŒ˜â‡§P â€” command palette
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "p") {
        e.preventDefault()
        setCommandPaletteOpen((p) => !p)
      }
      // âŒ˜S â€” save (global fallback)
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        // Monaco handles its own save via action, this is a no-op fallback
      }
      if (e.key === "F5") {
        e.preventDefault()
        refreshTree()
      }
      // âŒ˜â‡§F â€” global search
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault()
        setSearchOpen(!useWorkspaceStore.getState().searchOpen)
      }
      // Esc â€” dismiss open panels when not in an input
      if (e.key === "Escape" && !["TEXTAREA", "INPUT"].includes((e.target as HTMLElement).tagName)) {
        if (explorerOpen) { setExplorerOpen(false); e.preventDefault(); return }
        if (sessionSidebarOpen) { setSessionSidebarOpen(false); e.preventDefault(); return }
        if (searchOpen) { setSearchOpen(false); e.preventDefault(); return }
      }
      // âŒ˜K â€” command palette (table-stakes, unless Monaco is editing inline)
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
      // âŒ˜â‡§S â€” session sidebar
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "s") {
        e.preventDefault()
        setSessionSidebarOpen((p) => !p)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [rootPath, setSessionSidebarOpen])

  // â”€â”€ Auto-collapse panels on narrow screens â”€â”€
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

  // â”€â”€ Persist panel state on change â”€â”€
  // pane-store handles explorer/sessionSidebar persistence; keep only workspace panel keys here
  useEffect(() => { persistPanelState("workspacePanel", workspacePanel) }, [workspacePanel])
  useEffect(() => { persistPanelState("workspacePanelOpen", workspacePanelOpen) }, [workspacePanelOpen])

  // â”€â”€ Workbench routing: sync AI actions to fixed workspace regions â”€â”€
  useEffect(() => {
    if (!lastPaneAction) return
    if ((lastPaneAction.type === "focus" || lastPaneAction.type === "open") && isWorkspacePanel(lastPaneAction.pane)) {
      setWorkspacePanel(lastPaneAction.pane)
      setWorkspacePanelOpen(true)
      return
    }
    if (lastPaneAction.type === "navigate") {
      setWorkspacePanel("design")
      setWorkspacePanelOpen(true)
      return
    }
    if (lastPaneAction.type === "showDiff") {
      setWorkspacePanel("code")
      setWorkspacePanelOpen(true)
      openFileInDiffMode(lastPaneAction.filePath)
    }
  }, [lastPaneAction, openFileInDiffMode])


  return (
    <div className="flex h-full flex-col bg-[var(--surface-app)]" role="main" aria-label="Code canvas workspace">
      {/* Compact status bar â€” single line for active notifications */}
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
            <>Configuration changed â€” <button onClick={() => refreshRuntime()} className="underline font-medium hover:text-[var(--color-accent-amber)]">refresh now</button></>
          )}
        </div>
      )}



      {/* â”€â”€ AGENTIC.md Init Banner â”€â”€ */}
      <ConfigInitBanner />

      {/* â”€â”€ MAIN PANEL LAYOUT or Empty State â”€â”€ */}
      <WorkspaceErrorBoundary onOpenFolder={openWorkspace}>
      {rootPath && typeof rootPath === 'string' && rootPath.length > 0 ? (
      <div ref={layoutRef} className="relative flex flex-1 overflow-hidden min-h-0 bg-[var(--surface-app)]">
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

        {explorerOpen && workspacePanel !== "browser" && (
          <aside
            className={cn(
              "z-30 flex h-full flex-col overflow-hidden bg-[var(--surface-panel)]",
              isNarrow
                ? "absolute inset-y-0 left-0 w-[min(320px,88vw)] shadow-2xl shadow-black/40"
                : "relative shrink-0",
            )}
            style={isNarrow ? undefined : { width: explorerResize.width }}
            aria-label="Explorer"
          >
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <Explorer ref={explorerRef} onOpenWorkspace={openWorkspace} />
            </div>
          </aside>
        )}

        {explorerOpen && workspacePanel !== "browser" && !isNarrow && (
          <div
            className="flex w-1 cursor-col-resize shrink-0 items-center justify-center bg-transparent hover:bg-[var(--border-subtle)] active:bg-[var(--color-accent-blue)]/30 transition-colors group"
            onMouseDown={explorerResize.handleDragStart}
            onDoubleClick={explorerResize.resetWidth}
          >
            <div className="h-8 w-0.5 rounded-full bg-[var(--border-default)] opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        )}

        {isNarrow && explorerOpen && workspacePanel !== "browser" && (
          <button
            type="button"
            className="absolute inset-0 z-20 bg-black/45"
            aria-label="Close explorer overlay"
            onClick={() => setExplorerOpen(false)}
          />
        )}

        <section
          className={cn(
            "flex flex-col overflow-hidden border-r border-[var(--border-subtle)] bg-[var(--surface-app)]",
            workspacePanel === "browser" ? "min-w-[320px] flex-[0.8]" : "min-w-[320px] flex-1"
          )}
          aria-label="Harness terminal workspace"
        >
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-panel)] px-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setExplorerOpen((open) => !open)}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-md border border-transparent text-[var(--text-tertiary)] transition-colors",
                  explorerOpen
                    ? "bg-[var(--border-subtle)] text-[var(--text-secondary)]"
                    : "hover:border-[var(--border-default)] hover:bg-[var(--border-subtle)] hover:text-[var(--text-secondary)]",
                )}
                title="Toggle explorer"
                aria-label="Toggle explorer"
              >
                {explorerOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[11px] font-semibold text-[var(--text-secondary)]">Terminal</span>
                  <WorkflowModeIndicator />
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      runtimeReady && runtimeHealth === "healthy" ? "bg-[var(--color-accent-green)]" :
                      runtimeStatus === "error" ? "bg-[var(--color-accent-red)]" :
                      runtimeStatus === "initializing" ? "animate-pulse bg-[var(--color-accent-blue)]" :
                      "bg-[var(--text-quaternary)]",
                    )}
                    title={runtimeReady ? "Runtime ready" : runtimeError || runtimeMessage || "Initializing"}
                  />
                </div>
                <p className="truncate text-[9px] text-[var(--text-quaternary)]">
                  {rootPath.split(/[\\/]/).pop() || rootPath}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleToggleDiffReview}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-md transition-colors",
                  editorMode === "diff"
                    ? "bg-[var(--color-accent-blue)]/10 text-[var(--color-accent-blue)]"
                    : "text-[var(--text-tertiary)] hover:bg-[var(--border-subtle)] hover:text-[var(--text-secondary)]",
                )}
                title="Toggle diff review"
                aria-label="Toggle diff review"
              >
                <FileDiff className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !workspacePanelOpen
                  setWorkspacePanelOpen(next)
                  panelCtrlRef.current?.syncOpenState(next)
                }}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-md border border-transparent text-[var(--text-tertiary)] transition-colors",
                  workspacePanelOpen
                    ? "bg-[var(--border-subtle)] text-[var(--text-secondary)]"
                    : "hover:border-[var(--border-default)] hover:bg-[var(--border-subtle)] hover:text-[var(--text-secondary)]",
                )}
                title="Toggle workbench"
                aria-label="Toggle workbench"
              >
                {workspacePanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ErrorBoundary name="HarnessTerminal"><HarnessTerminalPanel /></ErrorBoundary>
          </div>
        </section>

        {workspacePanelOpen && !isNarrow && (
          <div
            className="flex w-1 cursor-col-resize shrink-0 items-center justify-center bg-transparent hover:bg-[var(--border-subtle)] active:bg-[var(--color-accent-blue)]/30 transition-colors group"
            onMouseDown={workspaceResize.handleDragStart}
            onDoubleClick={workspaceResize.resetWidth}
          >
            <div className="h-8 w-0.5 rounded-full bg-[var(--border-default)] opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        )}

        {workspacePanelOpen && (
          <aside
            className={cn(
              "z-30 flex h-full flex-col overflow-hidden bg-[var(--surface-panel)]",
              isNarrow
                ? "absolute inset-y-0 right-0 w-[min(620px,94vw)] border-l border-[var(--border-subtle)] shadow-2xl shadow-black/40"
                : "relative shrink-0 border-l border-[var(--border-subtle)]",
            )}
            style={isNarrow ? undefined : { width: workspaceResize.width }}
            aria-label="Workbench"
          >
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-panel)] px-2">
              <div className="flex min-w-0 items-center gap-1">
                {WORKSPACE_PANEL_OPTIONS.map((opt) => {
                  const Icon = opt.icon
                  const active = workspacePanel === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setWorkspacePanel(opt.id)
                        setWorkspacePanelOpen(true)
                        panelCtrlRef.current?.handleManualTabClick(opt.id)
                      }}
                      className={cn(
                        "flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors",
                        active
                          ? "bg-[var(--border-subtle)] text-[var(--text-primary)]"
                          : "text-[var(--text-tertiary)] hover:bg-[var(--border-subtle)] hover:text-[var(--text-secondary)]",
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5", active ? "text-[var(--accent-code)]" : "text-[var(--text-tertiary)]")} />
                      <span>{opt.label}</span>
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  setWorkspacePanelOpen(false)
                  panelCtrlRef.current?.syncOpenState(false)
                }}
                className="grid h-7 w-7 place-items-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--border-subtle)] hover:text-[var(--text-secondary)]"
                title="Close workbench"
                aria-label="Close workbench"
              >
                <PanelRightClose className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {workspacePanel === "code" ? (
                <WorkspaceErrorBoundary><CodeWorkspace /></WorkspaceErrorBoundary>
              ) : workspacePanel === "browser" ? (
                <WorkspaceErrorBoundary>
                  <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-[var(--text-tertiary)]">Loading browser...</div>}>
                    <BrowserWorkspace />
                  </Suspense>
                </WorkspaceErrorBoundary>
              ) : (
                <WorkspaceErrorBoundary>
                  <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-[var(--text-tertiary)]">Loading design...</div>}>
                    <DesignWorkspace />
                  </Suspense>
                </WorkspaceErrorBoundary>
              )}
            </div>
          </aside>
        )}

        {isNarrow && workspacePanelOpen && (
          <button
            type="button"
            className="absolute inset-0 z-20 bg-black/45"
            aria-label="Close workbench overlay"
            onClick={() => {
              setWorkspacePanelOpen(false)
              panelCtrlRef.current?.syncOpenState(false)
            }}
          />
        )}
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

      {/* Issue â†’ PR Dialog */}
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
