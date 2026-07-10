import { create } from "zustand"
import type { FileEntry, OpenFile, FileChangeEvent, RuntimeConfig } from "@/types"
import { requestRefresh, flushDeferredRefresh } from "@/runtime/runtime-coordinator"
import { removeFromCaches } from "@/components/workspace/editor-utils"
import { listDirectory, readFile } from "@/lib/filesystem"

export type OrchestrationState = "idle" | "analyzing" | "planning" | "executing" | "reviewing" | "error"
export type AiContextFile = { path: string; name: string; relevance: number; addedAt: number }
export type EditorMode = "editor" | "diff" | "history" | "problems" | "search"

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  sandboxEnabled: true,
  workspacePath: "",
  executionTimeout: 60000,
  maxConcurrency: 3,
  autoApprovePatterns: [],
  blockPatterns: [],
}

function toRelativeWorkspacePath(path: string, rootPath: string | null): string {
  const normalizedPath = path.replace(/\\/g, "/")
  const normalizedRoot = rootPath?.replace(/\\/g, "/").replace(/\/$/, "") ?? ""
  if (normalizedRoot && normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1)
  }
  return normalizedPath
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
  closeWorkspace: () => void
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

  // Editor mode (Editor/Diff/History/Problems/Search)
  editorMode: EditorMode
  diffReviewFile: string | null
  setEditorMode: (mode: EditorMode) => void
  openFileInDiffMode: (filePath: string) => void

  // Global search overlay
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void

  // Pinned files
  pinnedFiles: string[]
  recentlyOpened: { path: string; timestamp: number }[]

  // State persistence (open files, cursor, scroll)
  pinFile: (path: string) => void
  unpinFile: (path: string) => void
  togglePinFile: (path: string) => void
  persistWorkspaceState: () => void
  restoreWorkspaceState: () => void

  // Reveal a path in the file explorer tree (set by BreadcrumbNav, consumed by WorkspaceExplorer)
  revealInExplorer: string | null
  setRevealInExplorer: (path: string | null) => void
}

// ── Tree rendering limits (prevent context-window blowout) ──
const MAX_TREE_DEPTH = 5
const MAX_TREE_ENTRIES = 150
const MAX_CHANGED_FILES = 1000
const MAX_PINNED_FILES = 100

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
  if (tree.length === 0) return ''

  const header = rootPath ? `Workspace root: ${rootPath}` : 'Workspace files'
  const lines: string[] = [header]
  let entryCount = 0

  interface StackFrame {
    entries: FileEntry[]
    prefix: string
    depth: number
  }

  const stack: StackFrame[] = [
    { entries: tree, prefix: '', depth: 0 },
  ]

  while (stack.length > 0) {
    const { entries, prefix, depth } = stack.pop()!
    const sorted = [...entries].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    for (let i = sorted.length - 1; i >= 0; i--) {
      if (entryCount >= MAX_TREE_ENTRIES) break
      const entry = sorted[i]
      const isLast = i === sorted.length - 1
      const connector = isLast ? '└── ' : '├── '

      if (depth > MAX_TREE_DEPTH) {
        entryCount++
        const line = entry.is_dir
          ? `${prefix}${connector}${entry.name}/ (${entry.children.length} items)`
          : `${prefix}${connector}${entry.name}`
        lines.push(line)
        continue
      }

      entryCount++
      const metaParts: string[] = []
      if (!entry.is_dir && entry.size !== undefined) {
        metaParts.push(formatSize(entry.size))
      }
      if (entry.lastModified !== undefined) {
        metaParts.push(formatRelativeTime(entry.lastModified))
      }
      const meta = metaParts.length > 0 ? ` [${metaParts.join(', ')}]` : ''

      lines.push(`${prefix}${connector}${entry.name}${entry.is_dir ? '/' : ''}${meta}`)

      if (entry.is_dir && entry.children.length > 0) {
        const childPrefix = prefix + (isLast ? '    ' : '│   ')
        stack.push({ entries: entry.children, prefix: childPrefix, depth: depth + 1 })
      }
    }
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
  pinnedFiles: string[]
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
    pinnedFiles: state.pinnedFiles,
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

  editorMode: "editor" as EditorMode,
  diffReviewFile: null,

  runtimeConfig: { ...DEFAULT_RUNTIME_CONFIG },
  workspaceLoaded: false,

  searchOpen: false,

  pinnedFiles: [],
  recentlyOpened: [],
  revealInExplorer: null,

  setRootPath: async (path) => {
    set({
      rootPath: path,
      fileTree: [],
      openFiles: [],
      activeFilePath: null,
      aiContextFiles: [],
      suggestedFiles: [],
      recentlyOpened: [],
      workspaceLoaded: false,
    })
    if (path) {
      await get().loadWorkspaceConfig(path)
      requestRefresh("workspace_change")
    }
  },

  closeWorkspace: () => {
    const state = get()
    state.persistWorkspaceState()
    set({
      rootPath: null,
      fileTree: [],
      openFiles: [],
      activeFilePath: null,
      aiContextFiles: [],
      suggestedFiles: [],
      recentlyModified: [],
      changedFiles: new Set(),
      pinnedFiles: [],
      recentlyOpened: [],
      workspaceLoaded: false,
      isLoading: false,
    })
    localStorage.removeItem('agentic-workspace-root')
    requestRefresh("workspace_change")
  },

  setFileTree: (tree) => {
    set({ fileTree: tree, isLoading: false })
  },

  insertFileEntry: (parentPath: string, entry: FileEntry) => {
    set((state) => {
      const stack = [{ entries: state.fileTree, parent: null as FileEntry[] | null, idx: -1 }]
      while (stack.length > 0) {
        const frame = stack.pop()!
        for (let i = 0; i < frame.entries.length; i++) {
          const e = frame.entries[i]
          if (e.path === parentPath && e.is_dir) {
            const exists = e.children.some(c => c.path === entry.path)
            if (!exists) {
              frame.entries[i] = { ...e, children: [...e.children, entry] }
            }
            return { fileTree: state.fileTree, isLoading: false }
          }
          if (e.is_dir && e.children.length > 0) {
            stack.push({ entries: e.children, parent: frame.entries, idx: i })
          }
        }
      }
      return { fileTree: state.fileTree, isLoading: false }
    })
  },

  removeFileEntry: (targetPath: string) => {
    set((state) => {
      const stack = [{ entries: state.fileTree, parent: null as FileEntry[] | null }]
      while (stack.length > 0) {
        const frame = stack.pop()!
        const filtered = frame.entries.filter(e => e.path !== targetPath)
        if (filtered.length < frame.entries.length) {
          frame.entries.length = 0
          frame.entries.push(...filtered)
        }
        for (const e of frame.entries) {
          if (e.is_dir && e.children.length > 0) {
            stack.push({ entries: e.children, parent: null })
          }
        }
      }
      return { isLoading: false }
    })
  },

  renameFileEntry: (oldPath: string, newPath: string) => {
    set((state) => {
      const stack = [{ entries: state.fileTree, parent: null as FileEntry[] | null }]
      while (stack.length > 0) {
        const frame = stack.pop()!
        for (let i = 0; i < frame.entries.length; i++) {
          const e = frame.entries[i]
          if (e.path === oldPath) {
            const name = newPath.split('/').pop() || newPath
            frame.entries[i] = { ...e, name, path: newPath }
            return { isLoading: false }
          }
          if (e.is_dir && e.children.length > 0) {
            stack.push({ entries: e.children, parent: null })
          }
        }
      }
      return { isLoading: false }
    })
  },

  loadDirectory: async (path: string) => {
    try {
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
      const now = Date.now()
      const updatedRecent = [
        { path: file.path, timestamp: now },
        ...store.recentlyOpened.filter((r) => r.path !== file.path),
      ].slice(0, 50)
      if (exists) {
        if (store.activeFilePath !== file.path) {
          requestRefresh("workspace_change")
        }
        return {
          activeFilePath: file.path,
          openFiles: store.openFiles.map((f) =>
            f.path === file.path ? { ...f, content: file.content, isDirty: file.isDirty } : f
          ),
          recentlyOpened: updatedRecent,
        }
      }
      requestRefresh("workspace_change")
      const openFiles = [...store.openFiles, file]
      if (openFiles.length > 30) openFiles.splice(0, openFiles.length - 30)
      return { openFiles, activeFilePath: file.path, recentlyOpened: updatedRecent }
    }),

  closeFile: (path) =>
    set((store) => {
      const filtered = store.openFiles.filter((f) => f.path !== path)
      const closedIdx = store.openFiles.findIndex((f) => f.path === path)
      const newActive = store.activeFilePath === path
        ? (filtered.length > 0
            ? filtered[Math.min(closedIdx, filtered.length - 1)].path
            : null)
        : store.activeFilePath
      // Refresh context if the active file changes (closing the current tab)
      if (store.activeFilePath !== newActive && newActive !== null) {
        requestRefresh("workspace_change")
      }
      removeFromCaches(path)
      return { openFiles: filtered, activeFilePath: newActive }
    }),

  pinFile: (path) =>
    set((store) => {
      if (store.pinnedFiles.includes(path)) return store
      if (store.pinnedFiles.length >= MAX_PINNED_FILES) return store
      return { pinnedFiles: [...store.pinnedFiles, path] }
    }),

  unpinFile: (path) =>
    set((store) => ({
      pinnedFiles: store.pinnedFiles.filter((p) => p !== path),
    })),

  togglePinFile: (path) =>
    set((store) => {
      if (store.pinnedFiles.includes(path)) {
        return { pinnedFiles: store.pinnedFiles.filter((p) => p !== path) }
      }
      return { pinnedFiles: [...store.pinnedFiles, path] }
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
    const relativePath = toRelativeWorkspacePath(event.path, store.rootPath)
    const newChanged = new Set(store.changedFiles)
    if (event.kind === "removed") {
      newChanged.delete(relativePath)
    } else {
      if (newChanged.size >= MAX_CHANGED_FILES) {
        const earliest = newChanged.values().next().value
        if (earliest) newChanged.delete(earliest)
      }
      newChanged.add(relativePath)
    }

    const nextState: Partial<WorkspaceStore> & { changedFiles: Set<string> } = {
      changedFiles: newChanged,
    }

    if (event.kind === "removed") {
      nextState.fileTree = store.fileTree
      nextState.openFiles = store.openFiles
      nextState.activeFilePath = store.activeFilePath

      nextState.fileTree = (function remove(entries: FileEntry[]): FileEntry[] {
        return entries
          .filter((entry) => entry.path !== relativePath)
          .map((entry) => {
            if (entry.is_dir && entry.children.length > 0) {
              return { ...entry, children: remove(entry.children) }
            }
            return entry
          })
      })(store.fileTree)

      const removedOpenFile = store.openFiles.find((file) => file.path === relativePath)
      if (removedOpenFile && !removedOpenFile.isDirty) {
        const filtered = store.openFiles.filter((file) => file.path !== relativePath)
        const removedIndex = store.openFiles.findIndex((file) => file.path === relativePath)
        nextState.openFiles = filtered
        nextState.activeFilePath = store.activeFilePath === relativePath
          ? (filtered.length > 0 ? filtered[Math.min(removedIndex, filtered.length - 1)].path : null)
          : store.activeFilePath
        removeFromCaches(relativePath)
      }

      // If the file being diff-reviewed was deleted, exit diff mode
      if (store.diffReviewFile === relativePath) {
        nextState.editorMode = "editor"
        nextState.diffReviewFile = null
      }
    }

    set(nextState)
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

  setEditorMode: (mode) => {
    const state = get()
    if (mode === "diff") {
      const reviewFile = state.diffReviewFile
      const isValid = reviewFile != null && (
        state.openFiles.some(f => f.path === reviewFile) ||
        state.changedFiles.has(reviewFile)
      )
      if (!isValid) {
        const fallback = state.changedFiles.values().next().value ?? state.openFiles[0]?.path ?? null
        set({ editorMode: "diff", diffReviewFile: fallback })
        return
      }
    }
    set({
      editorMode: mode,
      diffReviewFile: mode === "diff" ? state.diffReviewFile : null,
    })
  },

  openFileInDiffMode: (filePath) => {
    const state = get()
    const existing = state.openFiles.find(f => f.path === filePath)
    const nextOpenFiles = existing
      ? state.openFiles
      : [...state.openFiles, { path: filePath, name: filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath, content: '', isDirty: false }]

    if (state.activeFilePath !== filePath) {
      requestRefresh("workspace_change")
    }

    set({
      openFiles: nextOpenFiles,
      activeFilePath: filePath,
      editorMode: "diff",
      diffReviewFile: filePath,
    })

    if (!existing && state.rootPath) {
      const absolutePath = `${state.rootPath}\\${filePath.replace(/\//g, "\\")}`
      void readFile(absolutePath).then((content) => {
        set((current) => ({
          openFiles: current.openFiles.map((openFile) =>
            openFile.path === filePath
              ? { ...openFile, content, isDirty: false }
              : openFile,
          ),
        }))
      }).catch((error) => {
        console.warn(`[workspace-store] Failed to hydrate diff review file "${filePath}":`, error)
      })
    }
  },

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
      flushDeferredRefresh()
    }
    return set((s) => ({
      isUserActive: active,
      lastUserActivity: active ? Date.now() : s.lastUserActivity,
    }))
  },

  setSearchOpen: (open) => set({ searchOpen: open }),

  lastEditedFile: null,

  notifyFileEdited: (path, newContent) => {
    set((state) => {
      const normalizedPath = toRelativeWorkspacePath(path, state.rootPath)
      const existingFile = state.openFiles.find(f => f.path === normalizedPath)
      if (existingFile) {
        return {
          openFiles: state.openFiles.map(f =>
            f.path === normalizedPath ? { ...f, content: newContent, isDirty: false } : f
          ),
          activeFilePath: normalizedPath,
          lastEditedFile: normalizedPath,
        }
      } else {
        const name = normalizedPath.split('/').pop() ?? normalizedPath.split('\\').pop() ?? normalizedPath
        return {
          openFiles: [...state.openFiles, { path: normalizedPath, name, content: newContent, isDirty: false }],
          activeFilePath: normalizedPath,
          lastEditedFile: normalizedPath,
        }
      }
    })
  },

  recordFileEdit: (path) => set({ lastEditedFile: path }),

  setRevealInExplorer: (path) => set({ revealInExplorer: path }),

  persistWorkspaceState: () => {
    const { openFiles, activeFilePath, cursorLine, cursorColumn, visibleRangeStart, visibleRangeEnd, splitMode, splitFilePath, editorMode, diffReviewFile, pinnedFiles } = get()
    const persistData = {
      openFiles: openFiles.map(f => ({ path: f.path, name: f.name })),
      activeFilePath,
      cursorLine,
      cursorColumn,
      visibleRangeStart,
      visibleRangeEnd,
      splitMode,
      splitFilePath,
      editorMode,
      diffReviewFile,
      pinnedFiles,
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
        splitMode?: 'none' | 'horizontal' | 'vertical'
        splitFilePath?: string | null
        editorMode?: 'editor' | 'diff'
        diffReviewFile?: string | null
        pinnedFiles?: string[]
      }
      // Only restore if the root path matches (per-workspace)
      const storedRoot = localStorage.getItem('agentic-workspace-root')
      if (storedRoot !== get().rootPath) return
      const reviewFile = data.diffReviewFile ?? null
      const reconstructedOpenFiles = data.openFiles.map(f => ({ path: f.path, name: f.name, content: '', isDirty: false }))
      const isValidReview = data.editorMode === "diff" && reviewFile != null && (
        reconstructedOpenFiles.some(f => f.path === reviewFile) ||
        get().changedFiles.has(reviewFile)
      )
      const activeInFiles = data.activeFilePath != null && reconstructedOpenFiles.some(f => f.path === data.activeFilePath)
      set({
        activeFilePath: activeInFiles ? data.activeFilePath : (reconstructedOpenFiles[0]?.path ?? null),
        cursorLine: data.cursorLine ?? 1,
        cursorColumn: data.cursorColumn ?? 1,
        visibleRangeStart: data.visibleRangeStart ?? 1,
        visibleRangeEnd: data.visibleRangeEnd ?? 1,
        splitMode: data.splitMode ?? 'none',
        splitFilePath: data.splitFilePath ?? null,
        editorMode: isValidReview ? "diff" : (data.editorMode ?? "editor"),
        diffReviewFile: isValidReview ? reviewFile : null,
        openFiles: reconstructedOpenFiles,
        pinnedFiles: data.pinnedFiles ?? [],
      })
    } catch { /* ignore corrupt data */ }
  },
}))
