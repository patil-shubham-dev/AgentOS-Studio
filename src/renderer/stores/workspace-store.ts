import { create } from "zustand"
import type { FileEntry, OpenFile, FileChangeEvent, RuntimeConfig } from "@/types"
import { requestRefresh, flushDeferredRefresh } from "@/runtime/runtime-coordinator"

export type OrchestrationState = "idle" | "analyzing" | "planning" | "executing" | "reviewing" | "error"
export type AiContextFile = { path: string; name: string; relevance: number; addedAt: number }

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  sandboxEnabled: true,
  workspacePath: "",
  executionTimeout: 60000,
  maxConcurrency: 3,
  autoApprovePatterns: [],
  blockPatterns: [],
}

interface WorkspaceStore {
  rootPath: string | null
  fileTree: FileEntry[]
  openFiles: OpenFile[]
  activeFilePath: string | null
  changedFiles: Set<string>
  isLoading: boolean

  // Orchestration metadata
  aiContextFiles: AiContextFile[]
  suggestedFiles: string[]
  recentlyModified: string[]

  // Workspace config
  runtimeConfig: RuntimeConfig
  workspaceLoaded: boolean

  setRootPath: (path: string | null) => void
  setFileTree: (tree: FileEntry[]) => void
  loadDirectory: (path: string) => Promise<FileEntry[]>
  setLoading: (loading: boolean) => void
  openFile: (file: OpenFile) => void
  closeFile: (path: string) => void
  setActiveFile: (path: string | null) => void
  updateFileContent: (path: string, content: string) => void
  markFileDirty: (path: string, dirty: boolean) => void
  handleFileChange: (event: FileChangeEvent) => void
  clearChangedFiles: () => void

  // Orchestration actions
  addAiContextFile: (path: string, name: string, relevance: number) => void
  removeAiContextFile: (path: string) => void
  clearAiContext: () => void
  setSuggestedFiles: (files: string[]) => void
  setRecentlyModified: (files: string[]) => void

  // Workspace config
  loadWorkspaceConfig: (path: string) => Promise<void>
  updateWorkspaceRuntimeConfig: (config: Partial<RuntimeConfig>) => void

  // Editor cursor / selection tracking (synced from Monaco editor)
  cursorLine: number
  cursorColumn: number
  selectedText: string
  visibleRangeStart: number
  visibleRangeEnd: number
  setCursorPosition: (line: number, column: number) => void
  setSelectedText: (text: string) => void
  setVisibleRange: (start: number, end: number) => void

  // User activity tracking
  isUserActive: boolean
  lastUserActivity: number
  setUserActive: (active: boolean) => void

  // File edit notification (for auto-open after AI edits)
  notifyFileEdited: (path: string, newContent: string) => void
  lastEditedFile: string | null
  recordFileEdit: (path: string) => void

  // Split editor
  splitMode: 'none' | 'horizontal' | 'vertical'
  splitFilePath: string | null
  setSplitMode: (mode: 'none' | 'horizontal' | 'vertical') => void
  setSplitFile: (path: string | null) => void

  // State persistence (open files, cursor, scroll)
  persistWorkspaceState: () => void
  restoreWorkspaceState: () => void
}

// ── Tree rendering limits (prevent context-window blowout) ──
const MAX_TREE_DEPTH = 5
const MAX_TREE_ENTRIES = 150

/** Format a byte count into a human-readable string (e.g. 1234 → "1.2KB") */
function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)}KB`
  return `${bytes}B`
}

/** Format a unix-epoch ms timestamp into a relative time string (e.g. "2m ago", "1h ago") */
function formatRelativeTime(ms: number): string {
  const seconds = Math.round((Date.now() - ms) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

/**
 * Recursively formats a FileEntry[] into an ASCII tree string,
 * mirroring what a developer sees in a file explorer sidebar.
 * Directories are listed first, then files, alphabetically within each group.
 * Respects depth and count limits to protect the context window.
 */
function formatFileTree(tree: FileEntry[], rootPath: string | null): string {
  let entryCount = 0

  function renderNode(entry: FileEntry, prefix: string, isLast: boolean, currentDepth: number): string[] {
    if (entryCount >= MAX_TREE_ENTRIES) return []
    if (currentDepth > MAX_TREE_DEPTH) {
      entryCount++
      const line = entry.is_dir
        ? `${prefix}${isLast ? '└── ' : '├── '}${entry.name}/ (${entry.children.length} items)`
        : `${prefix}${isLast ? '└── ' : '├── '}${entry.name}`
      return [line]
    }

    entryCount++
    const connector = isLast ? '└── ' : '├── '

    // Build metadata suffix — compact and informative for AI prioritization
    const metaParts: string[] = []
    if (!entry.is_dir && entry.size !== undefined) {
      metaParts.push(formatSize(entry.size))
    }
    if (entry.lastModified !== undefined) {
      metaParts.push(formatRelativeTime(entry.lastModified))
    }
    const meta = metaParts.length > 0 ? ` [${metaParts.join(', ')}]` : ''

    const line = `${prefix}${connector}${entry.name}${entry.is_dir ? '/' : ''}${meta}`
    const result = [line]

    if (entry.is_dir && entry.children.length > 0) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ')
      const sorted = [...entry.children].sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      for (let i = 0; i < sorted.length; i++) {
        result.push(...renderNode(sorted[i], childPrefix, i === sorted.length - 1, currentDepth + 1))
      }
    }

    return result
  }

  if (tree.length === 0) return ''

  const header = rootPath ? `Workspace root: ${rootPath}` : 'Workspace files'
  const lines: string[] = [header]

  const sorted = [...tree].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  for (let i = 0; i < sorted.length; i++) {
    lines.push(...renderNode(sorted[i], '', i === sorted.length - 1, 0))
  }

  const truncated = entryCount >= MAX_TREE_ENTRIES
    ? `\n_(${MAX_TREE_ENTRIES}+ entries shown; tree truncated for context budget)_`
    : ''

  return lines.join('\n') + truncated
}

/**
 * Get a flat snapshot of workspace state for AI context injection.
 * Called at request time — always reads fresh from the store.
 */
export function getWorkspaceContextSnapshot(): {
  activeFilePath: string | null
  activeFileName: string | null
  activeFileLanguage: string | null
  activeFileLines: number
  openFiles: { path: string; name: string; isDirty: boolean; language: string }[]
  selectedText: string
  cursorLine: number
  cursorColumn: number
  visibleRangeStart: number
  visibleRangeEnd: number
  unsavedChanges: number
  recentEdits: { path: string; timestamp: number }[]
  fileTreeSummary: string
  rootPath: string | null
  isUserActive: boolean
  lastUserActivity: number
} {
  const state = useWorkspaceStore.getState()
  const activeFile = state.openFiles.find((f) => f.path === state.activeFilePath)
  const ext = activeFile
    ? (activeFile.name.split(".").pop()?.toLowerCase() ?? "")
    : ""
  const EXT_LANG_MAP: Record<string, string> = {
    ts: "TypeScript", tsx: "TSX", js: "JavaScript", jsx: "JSX",
    css: "CSS", scss: "SCSS", html: "HTML", json: "JSON",
    md: "Markdown", py: "Python", rs: "Rust", toml: "TOML",
    yaml: "YAML", yml: "YAML", sh: "Shell", bash: "Shell",
    sql: "SQL", go: "Go", java: "Java", rb: "Ruby",
  }
  const language = EXT_LANG_MAP[ext] ?? "Text"

  const unsavedCount = state.openFiles.filter((f) => f.isDirty).length
  const recentEdits = state.recentlyModified.slice(0, 10).map((path) => ({
    path,
    timestamp: Date.now(),
  }))

  const treeSummary = state.fileTree.length > 0
    ? formatFileTree(state.fileTree, state.rootPath)
    : ""

  return {
    activeFilePath: state.activeFilePath,
    activeFileName: activeFile?.name ?? null,
    activeFileLanguage: language,
    activeFileLines: activeFile ? activeFile.content.split("\n").length : 0,
    openFiles: state.openFiles.map((f) => ({
      path: f.path,
      name: f.name,
      isDirty: f.isDirty,
      language: EXT_LANG_MAP[f.name.split(".").pop()?.toLowerCase() ?? ""] ?? "Text",
    })),
    selectedText: state.selectedText,
    cursorLine: state.cursorLine,
    cursorColumn: state.cursorColumn,
    visibleRangeStart: state.visibleRangeStart,
    visibleRangeEnd: state.visibleRangeEnd,
    unsavedChanges: unsavedCount,
    recentEdits,
    fileTreeSummary: treeSummary,
    rootPath: state.rootPath,
    isUserActive: state.isUserActive,
    lastUserActivity: state.lastUserActivity,
  }
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  rootPath: null,
  fileTree: [],
  openFiles: [],
  activeFilePath: null,
  changedFiles: new Set(),
  isLoading: false,

  aiContextFiles: [],
  suggestedFiles: [],
  recentlyModified: [],

  splitMode: 'none' as const,
  splitFilePath: null,

  runtimeConfig: { ...DEFAULT_RUNTIME_CONFIG },
  workspaceLoaded: false,

  setRootPath: async (path) => {
    set({
      rootPath: path,
      fileTree: [],
      openFiles: [],
      activeFilePath: null,
      aiContextFiles: [],
      suggestedFiles: [],
      workspaceLoaded: false,
    })
    if (path) {
      await get().loadWorkspaceConfig(path)
      requestRefresh("workspace_change")
    }
  },

  setFileTree: (tree) => {
    set({ fileTree: tree, isLoading: false })
  },

  loadDirectory: async (path: string) => {
    try {
      const { listDirectory } = await import("@/lib/filesystem")
      const children = await listDirectory(path)
      set((state) => {
        function updateEntry(entries: FileEntry[]): FileEntry[] {
          return entries.map((entry) => {
            if (entry.path === path) {
              return { ...entry, children }
            }
            if (entry.is_dir && entry.children.length > 0) {
              return { ...entry, children: updateEntry(entry.children) }
            }
            return entry
          })
        }
        return { fileTree: updateEntry(state.fileTree), isLoading: false }
      })
      return children
    } catch (err) {
      console.error(`[workspace-store] Failed to load directory: ${path}`, err)
      return []
    }
  },

  setLoading: (loading) => {
    set({ isLoading: loading })
    if (loading) {
      // Auto-reset loading after 30s to prevent stuck spinner
      setTimeout(() => {
        const current = useWorkspaceStore.getState().isLoading
        if (current) {
          set({ isLoading: false })
        }
      }, 30000)
    }
  },

  /** Open files capped at 30 (newest) */
  openFile: (file) =>
    set((store) => {
      const exists = store.openFiles.find((f) => f.path === file.path)
      if (exists) {
        if (store.activeFilePath !== file.path) {
          requestRefresh("workspace_change")
        }
        return {
          activeFilePath: file.path,
          openFiles: store.openFiles.map((f) =>
            f.path === file.path ? { ...f, content: file.content, isDirty: file.isDirty } : f
          ),
        }
      }
      requestRefresh("workspace_change")
      const openFiles = [...store.openFiles, file]
      if (openFiles.length > 30) openFiles.splice(0, openFiles.length - 30)
      return { openFiles, activeFilePath: file.path }
    }),

  closeFile: (path) =>
    set((store) => {
      const filtered = store.openFiles.filter((f) => f.path !== path)
      const newActive = store.activeFilePath === path
        ? (filtered.length > 0 ? filtered[filtered.length - 1].path : null)
        : store.activeFilePath
      // Refresh context if the active file changes (closing the current tab)
      if (store.activeFilePath !== newActive && newActive !== null) {
        requestRefresh("workspace_change")
      }
      return { openFiles: filtered, activeFilePath: newActive }
    }),

  setActiveFile: (path) =>
    set((store) => {
      if (store.activeFilePath !== path) {
        requestRefresh("workspace_change")
      }
      return { activeFilePath: path }
    }),

  updateFileContent: (path, content) =>
    set((store) => ({
      openFiles: store.openFiles.map((f) =>
        f.path === path ? { ...f, content, isDirty: true } : f
      ),
    })),

  markFileDirty: (path, dirty) =>
    set((store) => ({
      openFiles: store.openFiles.map((f) =>
        f.path === path ? { ...f, isDirty: dirty } : f
      ),
    })),

  handleFileChange: (event) => {
    const store = get()
    const newChanged = new Set(store.changedFiles)
    if (event.kind === "removed") {
      newChanged.delete(event.path)
    } else {
      newChanged.add(event.path)
    }
    set({ changedFiles: newChanged })
  },

  clearChangedFiles: () => set({ changedFiles: new Set() }),

  addAiContextFile: (path, name, relevance) =>
    set((store) => {
      if (store.aiContextFiles.some((f) => f.path === path)) return store
      return {
        aiContextFiles: [...store.aiContextFiles, { path, name, relevance, addedAt: Date.now() }]
          .sort((a, b) => b.relevance - a.relevance),
      }
    }),
  removeAiContextFile: (path) =>
    set((store) => ({
      aiContextFiles: store.aiContextFiles.filter((f) => f.path !== path),
    })),
  clearAiContext: () => set({ aiContextFiles: [] }),
  setSuggestedFiles: (files) => set({ suggestedFiles: files }),
  setRecentlyModified: (files) => set({ recentlyModified: files }),

  loadWorkspaceConfig: async (path: string) => {
    const key = `agentic-workspace-config:${path}`
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const config = JSON.parse(raw)
        set({
          runtimeConfig: { ...DEFAULT_RUNTIME_CONFIG, ...config.runtimeConfig },
          workspaceLoaded: true,
        })
        return
      }
    } catch { /* config may not exist */ }
    set({
      runtimeConfig: { ...DEFAULT_RUNTIME_CONFIG, workspacePath: path },
      workspaceLoaded: true,
    })
  },

  updateWorkspaceRuntimeConfig: (config) =>
    set((store) => ({
      runtimeConfig: { ...store.runtimeConfig, ...config },
    })),

  setSplitMode: (mode) => set({ splitMode: mode }),
  setSplitFile: (path) => set({ splitFilePath: path }),

  cursorLine: 1,
  cursorColumn: 1,
  selectedText: "",
  visibleRangeStart: 1,
  visibleRangeEnd: 1,

  setCursorPosition: (line, column) => set({ cursorLine: line, cursorColumn: column }),
  setSelectedText: (text) => set({ selectedText: text }),
  setVisibleRange: (start, end) => set({ visibleRangeStart: start, visibleRangeEnd: end }),

  isUserActive: false,
  lastUserActivity: 0,
  setUserActive: (active) => {
    if (!active) {
      // Flush any deferred AI context refreshes now that the editor is blurred
      flushDeferredRefresh()
    }
    return set((s) => ({
      isUserActive: active,
      lastUserActivity: active ? Date.now() : s.lastUserActivity,
    }))
  },

  lastEditedFile: null,

  notifyFileEdited: (path, newContent) => {
    set((state) => {
      const existingFile = state.openFiles.find(f => f.path === path)
      if (existingFile) {
        return {
          openFiles: state.openFiles.map(f =>
            f.path === path ? { ...f, content: newContent, isDirty: false } : f
          ),
          activeFilePath: path,
          lastEditedFile: path,
        }
      } else {
        const name = path.split('/').pop() ?? path.split('\\').pop() ?? path
        return {
          openFiles: [...state.openFiles, { path, name, content: newContent, isDirty: false }],
          activeFilePath: path,
          lastEditedFile: path,
        }
      }
    })
  },

  recordFileEdit: (path) => set({ lastEditedFile: path }),

  persistWorkspaceState: () => {
    const { openFiles, activeFilePath, cursorLine, cursorColumn, visibleRangeStart, visibleRangeEnd } = get()
    const persistData = {
      openFiles: openFiles.map(f => ({ path: f.path, name: f.name })),
      activeFilePath,
      cursorLine,
      cursorColumn,
      visibleRangeStart,
      visibleRangeEnd,
    }
    try {
      localStorage.setItem('agentic-workspace-state', JSON.stringify(persistData))
    } catch { /* quota exceeded, ignore */ }
  },

  restoreWorkspaceState: () => {
    try {
      const raw = localStorage.getItem('agentic-workspace-state')
      if (!raw) return
      const data = JSON.parse(raw) as {
        openFiles: { path: string; name: string }[]
        activeFilePath: string | null
        cursorLine: number
        cursorColumn: number
        visibleRangeStart: number
        visibleRangeEnd: number
      }
      // Only restore if the root path matches (per-workspace)
      const storedRoot = localStorage.getItem('agentic-workspace-root')
      if (storedRoot !== get().rootPath) return
      set({
        activeFilePath: data.activeFilePath,
        cursorLine: data.cursorLine ?? 1,
        cursorColumn: data.cursorColumn ?? 1,
        visibleRangeStart: data.visibleRangeStart ?? 1,
        visibleRangeEnd: data.visibleRangeEnd ?? 1,
        // Reconstruct openFiles from stored paths — content is loaded on open
        openFiles: data.openFiles.map(f => ({ path: f.path, name: f.name, content: '', isDirty: false })),
      })
    } catch { /* ignore corrupt data */ }
  },
}))
