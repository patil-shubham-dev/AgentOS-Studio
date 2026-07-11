import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Editor, { type OnMount, type OnChange } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import { useWorkspaceStore, type EditorMode } from "@/stores/workspace-store"
import { useDiagnosticsStore, type Diagnostic } from "@/stores/diagnostics-store"
import { useDiffStore } from "@/stores/diff-store"
import type { OpenFile } from "@/types"
import { cn } from "@/lib/utils"
import { loadFileTree } from "@/lib/filesystem"
import { Badge, TooltipSimple as Tooltip } from "@agentic-os/ui"
import { PremiumEmptyState, getCodeEmptyState } from "./premium-empty-state"
import { DiagnosticsPanel } from "./diagnostics-panel"
import { GitPanel } from "./git-panel"

import { OutputPanel } from "./OutputPanel"
import { SymbolSearch, type SymbolItem } from "./symbol-search"
import { BreadcrumbNav } from "./BreadcrumbNav"
import { SplitEditor } from "./SplitEditor"
import { DiffViewerPane } from "./diff-viewer/DiffViewerPane"
import { DebugPanel } from "./debug-panel"
import { debugService } from "@/lib/debug/debug-service"
import { useDebugStore } from "@/stores/debug-store"
import { WelcomePage } from "./WelcomePage"
import { EditorTabs } from "./EditorTabs"
import { AiChangeOverlay, type AIChange } from "./AiChangeOverlay"
import { saveFile, formatCount, getOrCreateModel, setMonacoInstance, editorViewStateCache, isLargeFile } from "./editor-utils"
import { dirtyBufferManager } from "@/lib/dirty-buffer-manager"
import { gitStatus } from "@/lib/git"
import type { GitStatus } from "@/lib/git"
import { useHistoryStore } from "@/stores/history-store"
import { HistoryPanel } from "@/components/workspace/file-history/HistoryPanel"
import { CheckpointPanel } from "@/components/workspace/checkpoint-panel"
import { useCheckpointStore } from "@/stores/checkpoint-store"

import { requestRefresh } from "@/runtime/runtime-coordinator"
import { useHaptic } from "@/lib/haptics"
import {
  WrapText, Minus, Plus, X, FileCode,
  Sparkles, Brain, Check, Save,
  Columns3, FileDown, Pencil, AlertCircle, AlertTriangle, GitBranch,
  Bug, FileSearch, PanelRight, PanelRightClose, Logs, History, RotateCcw,
  Code2, GitCompare, ListTodo, Search, FileText, CheckCheck, XCircle,
  ChevronLeft, ChevronRight, Eye, EyeOff,
} from "lucide-react"
import { registerInlineCompletionProvider, unregisterInlineCompletionProvider, setupCompletionTracking, cleanupCompletionTracking } from "@/lib/completion/completion-provider"
import { InlineEditOverlay } from "./inline-edit-overlay"
import { useStreamingState } from "./use-streaming-state"
import {
  acceptDiffReviewFile,
} from "@/lib/diff-review"

const EXT_LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  css: "css", scss: "scss", html: "html", json: "json",
  md: "markdown", py: "python", rs: "rust", toml: "toml",
  yaml: "yaml", yml: "yaml", sh: "shell", bash: "shell",
  sql: "sql", go: "go", java: "java", rb: "ruby",
  svelte: "html", vue: "html", astro: "html",
}

function getMonacoLang(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  return EXT_LANG_MAP[ext] ?? "plaintext"
}

/** Default Monaco editor options */
const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontLigatures: true,
  minimap: { enabled: true, scale: 1, showSlider: "mouseover" },
  scrollBeyondLastLine: false,
  lineNumbers: "on",
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: true,
  foldingHighlight: true,
  renderLineHighlight: "all",
  renderWhitespace: "selection",
  bracketPairColorization: { enabled: true },
  autoClosingBrackets: "always",
  autoClosingQuotes: "always",
  formatOnPaste: true,
  smoothScrolling: true,
  cursorBlinking: "smooth",
  cursorSmoothCaretAnimation: "on",
  stickyScroll: { enabled: true },
  codeLens: true,
  wordWrap: "off",
  tabSize: 2,
  insertSpaces: true,
  renderControlCharacters: false,
  padding: { top: 12 },
  suggest: {
    showMethods: true, showFunctions: true, showConstructors: true,
    showDeprecated: false, showFields: true, showVariables: true,
    showClasses: true, showStructs: true, showInterfaces: true,
    showModules: true, showProperties: true, showEvents: true,
    showOperators: true, showUnits: true, showValues: true,
    showConstants: true, showEnums: true, showEnumMembers: true,
    showKeywords: true, showWords: true, showColors: true,
    showFiles: true, showReferences: true, showSnippets: true,
    showTypeParameters: true,
  },
  "semanticHighlighting.enabled": true,
}

// ── Main Component ──

export function CodeWorkspace() {
  const openFiles = useWorkspaceStore((s) => s.openFiles)
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)
  const openFileInStore = useWorkspaceStore((s) => s.openFile)
  const closeFile = useWorkspaceStore((s) => s.closeFile)
  const updateFileContent = useWorkspaceStore((s) => s.updateFileContent)
  const markFileDirty = useWorkspaceStore((s) => s.markFileDirty)
  const aiContextFiles = useWorkspaceStore((s) => s.aiContextFiles)
  const addAiContextFile = useWorkspaceStore((s) => s.addAiContextFile)
  const removeAiContextFile = useWorkspaceStore((s) => s.removeAiContextFile)
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const splitMode = useWorkspaceStore((s) => s.splitMode)
  const setSplitMode = useWorkspaceStore((s) => s.setSplitMode)
  const setSplitFile = useWorkspaceStore((s) => s.setSplitFile)
  const { pulse, notify } = useHaptic()

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<any>(null)
  const themeGuardRef = useRef(false)
  const [saved, setSaved] = useState(false)
  const [wordWrap, setWordWrap] = useState(false)
  const [fontSize, setFontSize] = useState(13)
  const [showMinimap, setShowMinimap] = useState(true)
  const [showProblems, setShowProblems] = useState(false)
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [showGitPanel, setShowGitPanel] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false)
  const historyOpen = useHistoryStore((s) => s.open)
  const toggleHistory = useHistoryStore((s) => s.toggleOpen)
  const checkpointOpen = useCheckpointStore((s) => s.isOpen)
  const toggleCheckpoint = useCheckpointStore((s) => s.togglePanel)
  const [currentFileSymbols, setCurrentFileSymbols] = useState<SymbolItem[]>([])
  const [aiChanges, setAiChanges] = useState<AIChange[]>([])
  const [showAiOverlay, setShowAiOverlay] = useState(false)
  const [saveMethod, setSaveMethod] = useState<"tauri" | "download" | null>(null)
  const [largeFileWarning, setLargeFileWarning] = useState<string | null>(null)

  const [gitInfo, setGitInfo] = useState<{ branch: string; changes: number } | null>(null)

  // ── Editor mode ──
  const editorMode = useWorkspaceStore((s) => s.editorMode)
  const setEditorMode = useWorkspaceStore((s) => s.setEditorMode)
  const diffReviewFile = useWorkspaceStore((s) => s.diffReviewFile)

  const MODE_OPTIONS: { id: EditorMode; label: string; icon: React.ElementType }[] = [
    { id: "editor", label: "Editor", icon: Code2 },
    { id: "diff", label: "Diff", icon: GitCompare },
    { id: "history", label: "History", icon: History },
    { id: "problems", label: "Problems", icon: ListTodo },
    { id: "search", label: "Search", icon: Search },
  ]

  // ── Inline AI Edit state ──
  const [inlineEdit, setInlineEdit] = useState<{
    active: boolean
    selectedRange: { startLine: number; startCol: number; endLine: number; endCol: number } | null
    selectedText: string
    instruction: string
    generatedPatch: string | null
    editedCode: string | null
    loading: boolean
    streaming: boolean
    tokenCount: number
    error: string | null
    viewMode: "edit" | "diff" | "explain" | "optimize"
  }>({
    active: false,
    selectedRange: null,
    selectedText: "",
    instruction: "",
    generatedPatch: null,
    editedCode: null,
    loading: false,
    streaming: false,
    tokenCount: 0,
    error: null,
    viewMode: "edit",
  })

  const { isStreaming: liveStreamActive, streamingFilePath: liveEditingFile, streamProgress, sessionTokens, sessionChars } = useStreamingState()

  const activeFile = openFiles.find((f) => f.path === activeFilePath)
  const isInAiContext = activeFile ? aiContextFiles.some((f) => f.path === activeFile.path) : false
  const errorCount = useDiagnosticsStore((s) => s.diagnostics.filter((d) => d.severity === "error").length)
  const warningCount = useDiagnosticsStore((s) => s.diagnostics.filter((d) => d.severity === "warning").length)

  // ── Workspace store cursor/selection sync ──
  const setCursorPosition = useWorkspaceStore((s) => s.setCursorPosition)
  const setSelectedText = useWorkspaceStore((s) => s.setSelectedText)
  const setVisibleRange = useWorkspaceStore((s) => s.setVisibleRange)
  const setUserActive = useWorkspaceStore((s) => s.setUserActive)

  // ── Monaco mount handler ──
  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    setMonacoInstance(monaco)

    // Configure dark theme (once, skip if already registered)
    const themeName = "agentic-dark"
    if (!themeGuardRef.current) {
      themeGuardRef.current = true
      monaco.editor.defineTheme(themeName, {
        base: "vs-dark",
        inherit: true,
        rules: [
          { token: "comment", foreground: "6A9955", fontStyle: "italic" },
          { token: "keyword", foreground: "569CD6" },
          { token: "string", foreground: "CE9178" },
          { token: "number", foreground: "B5CEA8" },
          { token: "type", foreground: "4EC9B0" },
          { token: "function", foreground: "DCDCAA" },
          { token: "variable", foreground: "9CDCFE" },
          { token: "constant", foreground: "4FC1FF" },
          { token: "regexp", foreground: "D16969" },
        ],
        colors: {
          "editor.background": "#0a0a0b",
          "editor.foreground": "#d4d4d4",
          "editor.lineHighlightBackground": "#ffffff08",
          "editor.selectionBackground": "#264f78",
          "editor.inactiveSelectionBackground": "#3a3d41",
          "editorCursor.foreground": "#569CD6",
          "editorLineNumber.foreground": "#858585",
          "editorLineNumber.activeForeground": "#c6c6c6",
          "editor.selectionHighlightBackground": "#add6ff26",
          "editor.wordHighlightBackground": "#49483E",
          "editor.wordHighlightStrongBackground": "#49483E",
          "editorBracketMatch.background": "#0d3a58",
          "editorBracketMatch.border": "#569cd6",
          "editorGutter.background": "#0c0c0d",
          "editorRuler.foreground": "#ffffff0d",
          "editorWidget.background": "#0c0c0d",
          "editorWidget.border": "#ffffff12",
          "input.background": "#0a0a0b",
          "input.border": "#ffffff12",
          "input.foreground": "#d4d4d4",
          "list.activeSelectionBackground": "#094771",
          "list.hoverBackground": "#2a2d2e",
          "scrollbar.shadow": "#00000000",
          "scrollbarSlider.background": "#ffffff20",
          "scrollbarSlider.hoverBackground": "#ffffff30",
          "scrollbarSlider.activeBackground": "#ffffff40",
          "minimap.background": "#0a0a0b",
        },
      })
    }
    monaco.editor.setTheme(themeName)

    // ── Sync cursor position to workspace store ──
    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition(e.position.lineNumber, e.position.column)
    })

    // ── Sync selection to workspace store ──
    editor.onDidChangeCursorSelection((e) => {
      const model = editor.getModel()
      if (model) {
        const selection = e.selection
        const selected = model.getValueInRange(selection)
        setSelectedText(selected)
      }
    })

    // ── Sync visible range to workspace store ──
    editor.onDidScrollChange(() => {
      const visibleRange = editor.getVisibleRanges()
      if (visibleRange.length > 0) {
        setVisibleRange(visibleRange[0].startLineNumber, visibleRange[0].endLineNumber)
      }
    })

    // ── Track user focus/activity ──
    editor.onDidFocusEditorText(() => {
      setUserActive(true)
    })
    editor.onDidBlurEditorText(() => {
      setUserActive(false)
    })

    // ── Register inline completion provider (ghost text autocomplete) ──
    registerInlineCompletionProvider(monaco, editor)

    // ── Track completion accept/reject for metrics ──
    setupCompletionTracking(editor)

    // ── Enable inline suggestions in editor options ──
    editor.updateOptions({ inlineSuggest: { enabled: true } })

    // ── Register code action provider for AI-powered fixes ──
    const codeActionDisposable = monaco.languages.registerCodeActionProvider("*", {
      provideCodeActions: (model, range) => {
        const diagnostics = monaco.editor.getModelMarkers({ resource: model.uri })
        const lineDiags = diagnostics.filter((d) =>
          range.startLineNumber <= d.startLineNumber && d.startLineNumber <= range.endLineNumber
        )
        const actions: import("monaco-editor").languages.CodeAction[] = []
        for (const diag of lineDiags.slice(0, 3)) {
          actions.push({
            title: `Fix: ${diag.message.slice(0, 60)}`,
            kind: "quickfix",
            diagnostics: [diag],
          })
        }
        if (range.startLineNumber === range.endLineNumber) {
          actions.push({
            title: "Explain this line",
            kind: "refactor.extract",
          })
        } else {
          actions.push({
            title: "Explain selected code",
            kind: "refactor.extract",
          })
          actions.push({
            title: "Optimize selected code",
            kind: "refactor.rewrite",
          })
        }
        return { actions, dispose: () => {} }
      },
    })
    editor.onDidDispose(() => codeActionDisposable.dispose())

    // Keyboard shortcuts
    editor.addAction({
      id: "save-file",
      label: "Save File",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => { handleSave() },
    })

    editor.addAction({
      id: "toggle-minimap",
      label: "Toggle Minimap",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyM],
      run: () => { setShowMinimap((p) => !p) },
    })

    editor.addAction({
      id: "toggle-problems",
      label: "Toggle Problems Panel",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyPeriod],
      run: () => { setShowProblems((p) => !p) },
    })

    // ── Inline AI Edit (Cmd+K) ──
    editor.addAction({
      id: "inline-ai-edit",
      label: "Inline AI Edit",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
      contextMenuGroupId: "1_modification",
      run: (ed) => {
        const selection = ed.getSelection()
        if (!selection || selection.isEmpty()) return
        const model = ed.getModel()
        if (!model) return
        const selected = model.getValueInRange(selection)
        if (!selected.trim()) return

        setInlineEdit({
          active: true,
          selectedRange: {
            startLine: selection.startLineNumber,
            startCol: selection.startColumn,
            endLine: selection.endLineNumber,
            endCol: selection.endColumn,
          },
          selectedText: selected,
          instruction: "",
          generatedPatch: null,
          editedCode: null,
          loading: false,
          streaming: false,
          tokenCount: 0,
          error: null,
          viewMode: "edit",
        })
      },
    })

    // ── Symbol search action (Ctrl+Shift+O) ──
    editor.addAction({
      id: "symbol-search",
      label: "Go to Symbol",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyO],
      run: () => {
        const model = editor.getModel()
        if (model) {
          monaco.languages.provideDocumentSymbols(model).then((symbols: any) => {
            if (symbols) {
              const items: SymbolItem[] = symbols.map((s: any) => ({
                name: s.name,
                kind: s.kind,
                detail: s.detail,
                range: {
                  startLineNumber: s.range.startLineNumber,
                  startColumn: s.range.startColumn,
                },
                containerName: s.containerName,
                tags: s.tags,
              }))
              setCurrentFileSymbols(items)
              setSymbolSearchOpen(true)
            }
          }).catch((err) => console.error("Symbol search failed:", err))
        }
      },
    })

    // ── Debug panel toggle (Ctrl+Shift+D) ──
    editor.addAction({
      id: "toggle-debug-panel",
      label: "Toggle Debug Panel",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyD],
      run: () => { setShowDebugPanel((p) => !p) },
    })

    // ── Format Document (Shift+Alt+F) ──
    editor.addAction({
      id: "format-document",
      label: "Format Document",
      keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      run: (ed) => { ed.getAction("editor.action.formatDocument")?.run() },
    })

    // ── Rename Symbol (F2) ──
    editor.addAction({
      id: "rename-symbol",
      label: "Rename Symbol",
      keybindings: [monaco.KeyCode.F2],
      run: (ed) => { ed.getAction("editor.action.rename")?.run() },
    })

    // ── AI Explain (Ctrl+Shift+E) ──
    editor.addAction({
      id: "ai-explain",
      label: "AI: Explain Selection",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE],
      contextMenuGroupId: "navigation",
      run: (ed) => {
        const selection = ed.getSelection()
        if (!selection) return
        const model = ed.getModel()
        if (!model) return
        const selected = model.getValueInRange(selection)
        if (!selected.trim()) return
        setInlineEdit({
          active: true,
          selectedRange: {
            startLine: selection.startLineNumber,
            startCol: selection.startColumn,
            endLine: selection.endLineNumber,
            endCol: selection.endColumn,
          },
          selectedText: selected,
          instruction: "Explain this code in detail, covering what it does and how it works.",
          generatedPatch: null,
          editedCode: null,
          loading: true,
          streaming: false,
          tokenCount: 0,
          error: null,
          viewMode: "explain",
        })
      },
    })

    // ── AI Optimize (Ctrl+Shift+O) — note: reuses the same keybind as symbol search, we'll use a different one
    editor.addAction({
      id: "ai-optimize",
      label: "AI: Optimize Selection",
      contextMenuGroupId: "navigation",
      run: (ed) => {
        const selection = ed.getSelection()
        if (!selection) return
        const model = ed.getModel()
        if (!model) return
        const selected = model.getValueInRange(selection)
        if (!selected.trim()) return
        setInlineEdit({
          active: true,
          selectedRange: {
            startLine: selection.startLineNumber,
            startCol: selection.startColumn,
            endLine: selection.endLineNumber,
            endCol: selection.endColumn,
          },
          selectedText: selected,
          instruction: "Optimize this code for better performance and readability.",
          generatedPatch: null,
          editedCode: null,
          loading: true,
          streaming: false,
          tokenCount: 0,
          error: null,
          viewMode: "optimize",
        })
      },
    })

    // ── Debug gutter: click to add/remove breakpoints ──
    editor.onMouseDown((e) => {
      if (
        e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
      ) {
        const line = e.target.position?.lineNumber
        if (line) {
          const model = editor.getModel()
          if (model) {
            const filePath = model.uri.path.replace("/workspace/", "")
            debugService.toggleBreakpoint(line, filePath)
          }
        }
      }
    })

    // ── Mount debug service ──
    debugService.mount(editor, monaco)

    // ── Sync Monaco markers (diagnostics) to diagnostics store ──
    const m = monaco
    m.editor.onDidChangeMarkers((resources: any[]) => {
      for (const resource of resources) {
        const markers = m.editor.getModelMarkers({ resource })
        const diagnostics: Diagnostic[] = markers.map((marker: any) => ({
          filePath: resource.path.replace("/workspace/", ""),
          fileName: resource.path.split("/").pop() ?? "",
          line: marker.startLineNumber,
          column: marker.startColumn,
          message: marker.message,
          severity: marker.severity === monaco.MarkerSeverity.Error
            ? "error"
            : marker.severity === monaco.MarkerSeverity.Warning
              ? "warning"
              : "info",
          code: typeof marker.code === "string" ? marker.code : marker.code?.toString(),
        }))
        useDiagnosticsStore.getState().addDiagnostics(diagnostics)
      }
    })
  }, [])

  // ── Use cached model for the active file — instant tab switching ──
  useEffect(() => {
    const ed = editorRef.current
    const monaco = monacoRef.current
    if (!ed || !monaco || !activeFile) return

    if (isLargeFile(activeFile.content)) {
      setLargeFileWarning(activeFile.path)
    } else {
      setLargeFileWarning(null)
    }

    const language = getMonacoLang(activeFile.name)
    const model = getOrCreateModel(monaco, activeFile.path, activeFile.content, language)

    // Save current editor view state before switching models
    const currentModel = ed.getModel()
    if (currentModel) {
      const currentPath = currentModel.uri.path.replace('/workspace/', '')
      const position = ed.getPosition()
      if (position) {
        editorViewStateCache.set(currentPath, {
          cursor: { lineNumber: position.lineNumber, column: position.column },
          scrollTop: ed.getScrollTop(),
          scrollLeft: ed.getScrollLeft(),
        })
      }
    }

    // Switch to the cached model
    ed.setModel(model)

    // Restore cursor and scroll for the new file from cache
    const restored = editorViewStateCache.get(activeFile.path)
    if (restored) {
      ed.setPosition(restored.cursor)
      ed.setScrollTop(restored.scrollTop)
      ed.setScrollLeft(restored.scrollLeft)
      ed.revealPositionInCenterIfOutsideViewport(restored.cursor)
    }
  }, [activeFilePath])

  // ── Update editor options when settings change ──
  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    ed.updateOptions({
      wordWrap: wordWrap ? "on" : "off",
      fontSize,
      minimap: { enabled: showMinimap },
    })
  }, [wordWrap, fontSize, showMinimap])

  // ── Git status polling ──
  useEffect(() => {
    if (!rootPath) return
    const rp = rootPath
    async function poll() {
      try {
        const status = await gitStatus(rp)
        setGitInfo({ branch: status.branch, changes: status.changes.length })
      } catch {
        setGitInfo(null)
      }
    }
    poll()
    const interval = setInterval(poll, 30000)
    return () => clearInterval(interval)
  }, [rootPath])

  // ── Save handler ──
  async function handleSave() {
    const state = useWorkspaceStore.getState()
    const currentFile = state.openFiles.find((f) => f.path === state.activeFilePath)
    if (!currentFile) return

    pulse("medium")

    const result = await saveFile(currentFile.path, currentFile.name, currentFile.content, state.rootPath ?? undefined)

    if (result.success) {
      markFileDirty(currentFile.path, false)
      dirtyBufferManager.markClean(currentFile.path)
      if (result.method !== "error") {
        setSaveMethod(result.method)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      notify(`Save failed: ${result.error ?? "Unknown error"}`, "error", "error")
    }
  }

  // ── Download as file (explicit export) ──
  async function handleDownload() {
    if (!activeFile) return
    pulse("light")
    const result = await saveFile(activeFile.path, activeFile.name, activeFile.content, undefined)
    if (result.success) {
      notify(`Downloaded ${activeFile.name}`, "success", "success")
    }
  }

  // ── Debounced refresh on file content changes ──
  const contentRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Content change handler ──
  const handleContentChange: OnChange = useCallback((value) => {
    if (!activeFile || value === undefined) return
    const current = useWorkspaceStore.getState().openFiles.find((f) => f.path === activeFile.path)
    if (current && current.content !== value) {
      updateFileContent(activeFile.path, value)
      dirtyBufferManager.markDirty(activeFile.path, value)
    }
    // Debounced context refresh: AI sees the new content 2s after user stops typing
    if (contentRefreshRef.current) clearTimeout(contentRefreshRef.current)
    contentRefreshRef.current = setTimeout(() => {
      requestRefresh("workspace_change")
    }, 2000)
  }, [activeFile, updateFileContent])

  // ── Toggle AI context ──
  function toggleAiContext() {
    if (!activeFile) return
    pulse("selection")
    if (isInAiContext) {
      removeAiContextFile(activeFile.path)
    } else {
      addAiContextFile(activeFile.path, activeFile.name, 100)
    }
  }

  // ── Navigate to diagnostic location ──
  const handleNavigateToDiagnostic = useCallback((filePath: string, line: number, column: number) => {
    const ed = editorRef.current
    if (ed) {
      ed.setPosition({ lineNumber: line, column })
      ed.revealPositionInCenter({ lineNumber: line, column })
      ed.focus()
    }
  }, [])

  // ── Accept/reject AI changes ──
  function acceptAiChange(change: AIChange) {
    updateFileContent(change.filePath, change.newContent)
    setAiChanges((prev) => prev.filter((c) => c.filePath !== change.filePath))
    setShowAiOverlay(false)
    pulse("success")
    notify("AI change applied", "success", "success", 2000)
  }

  function rejectAiChange(change: AIChange) {
    setAiChanges((prev) => prev.filter((c) => c.filePath !== change.filePath))
    setShowAiOverlay(false)
    pulse("light")
  }

  function timeoutAiChange(change: AIChange) {
    setAiChanges((prev) => prev.filter((c) => c.filePath !== change.filePath))
    setShowAiOverlay(false)
  }

  // ── Listen for AI-generated changes from the execution timeline ──
  const activeFileRef = useRef(activeFile)
  activeFileRef.current = activeFile
  const aiChangeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up content-change debounce timer and completion provider on unmount
  useEffect(() => {
    return () => {
      if (contentRefreshRef.current) clearTimeout(contentRefreshRef.current)
      const ed = editorRef.current
      if (ed) {
        unregisterInlineCompletionProvider(ed)
        cleanupCompletionTracking(ed)
      }
    }
  }, [])

  useEffect(() => {
    const unsub = useWorkspaceStore.subscribe((state) => {
      const currentFile = activeFileRef.current
      const lastFile = state.openFiles[state.openFiles.length - 1]
      if (lastFile && lastFile.isDirty && currentFile?.path === lastFile.path) {
        if (aiChangeDebounceRef.current) {
          clearTimeout(aiChangeDebounceRef.current)
        }
        aiChangeDebounceRef.current = setTimeout(() => {
          requestAnimationFrame(() => {
            setAiChanges((prev) => {
              if (prev.some((c) => c.filePath === lastFile.path)) return prev
              return [...prev, {
                filePath: lastFile.path,
                originalContent: currentFile?.content || "",
                newContent: lastFile.content,
                applied: false,
                rejected: false,
              }]
            })
            setShowAiOverlay(true)
            pulse("medium")
          })
        }, 300)
      }
    })
    return () => {
      unsub()
      if (aiChangeDebounceRef.current) {
        clearTimeout(aiChangeDebounceRef.current)
      }
    }
  }, [])

  // ── Keyboard shortcuts for editor mode switching / diff navigation ──
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const state = useWorkspaceStore.getState()
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault()
        state.setEditorMode(state.editorMode === "diff" ? "editor" : "diff")
        return
      }
      if (state.editorMode === "diff") {
        const diffFiles = useDiffStore.getState().files
        const fileList = Array.from(diffFiles.values())
        const currentTargetPath = state.diffReviewFile ?? state.activeFilePath
        const currentIdx = fileList.findIndex((f) => f.path === currentTargetPath)
        if (e.ctrlKey && e.altKey && e.key === "ArrowRight") {
          e.preventDefault()
          if (currentIdx < fileList.length - 1) {
            state.openFileInDiffMode(fileList[currentIdx + 1].path)
          }
          return
        }
        if (e.ctrlKey && e.altKey && e.key === "ArrowLeft") {
          e.preventDefault()
          if (currentIdx > 0) {
            state.openFileInDiffMode(fileList[currentIdx - 1].path)
          }
          return
        }
        if (e.ctrlKey && e.key === "Enter") {
          e.preventDefault()
          const targetPath = state.diffReviewFile ?? state.activeFilePath
          if (targetPath) {
            void acceptDiffReviewFile(targetPath)
          }
          return
        }
        if (e.key === "Escape") {
          e.preventDefault()
          state.setEditorMode("editor")
          return
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const language = activeFile ? getMonacoLang(activeFile.name) : "plaintext"

  const isLarge = activeFile ? isLargeFile(activeFile.content) : false
  const editorOptions = useMemo(() => {
    if (isLarge) {
      return {
        ...EDITOR_OPTIONS,
        wordWrap: "off",
        fontSize,
        minimap: { enabled: false },
        readOnly: false,
        renderWhitespace: "boundary" as const,
        bracketPairColorization: { enabled: false },
        codeLens: false,
        stickyScroll: { enabled: false },
        smoothScrolling: false,
        cursorSmoothCaretAnimation: "off" as const,
        folding: false,
        foldingHighlight: false,
      }
    }
    return {
      ...EDITOR_OPTIONS,
      wordWrap: wordWrap ? "on" : "off",
      fontSize,
      minimap: { enabled: showMinimap },
      readOnly: false,
    }
  }, [wordWrap, fontSize, showMinimap, isLarge])

  // ── Empty state ──
  if (!activeFile) {
    if (openFiles.length > 0) {
      return (
        <PremiumEmptyState config={getCodeEmptyState(true, undefined, rootPath)} />
      )
    }
    return (
      <WelcomePage
        rootPath={rootPath}
        onOpenWorkspace={async () => {
          try {
            const { dialogOpen } = await import("@/lib/electron-api")
            const selected = await dialogOpen({ directory: true, multiple: false, title: "Open Workspace" })
            if (selected) {
              const { setRootPath, setFileTree, setLoading } = useWorkspaceStore.getState()
              await setRootPath(String(selected))
              setLoading(true)
              const tree = await loadFileTree(String(selected))
              setFileTree(tree)
            }
          } catch {
            const path = prompt("Enter workspace folder path:")
            if (path) {
              const { setRootPath, setFileTree, setLoading } = useWorkspaceStore.getState()
              await setRootPath(path)
              setLoading(true)
              const tree = await loadFileTree(path)
              setFileTree(tree)
            }
          }
        }}
      />
    )
  }

  const pendingChange = aiChanges.find((c) => c.filePath === activeFile.path && !c.applied && !c.rejected)

  return (
    <div className="flex h-full flex-col bg-[var(--surface-app)] min-h-0">
      {/* Editor Tabs */}
      <EditorTabs
        openFiles={openFiles}
        activeFilePath={activeFilePath}
        liveEditingFile={liveEditingFile}
        onOpen={openFileInStore}
        onClose={closeFile}
      />

      {/* Large file warning */}
      {largeFileWarning && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-accent-amber)] bg-[var(--color-accent-amber)]/10 border-b border-[var(--color-accent-amber)]/20">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="flex-1">Large file — minimap, folding, and other visual features disabled for performance.</span>
          <button
            onClick={() => setLargeFileWarning(null)}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] text-xs leading-none"
          >
            ✕
          </button>
        </div>
      )}

      {/* Breadcrumb navigation */}
      <BreadcrumbNav />

      {/* Editor toolbar */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-panel)]/50 px-3 py-1 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase">{language}</span>
          <span className="text-[var(--text-quaternary)] text-[8px]">|</span>
          <span className="text-[10px] text-[var(--text-tertiary)]">
            Ln {editorRef.current?.getPosition()?.lineNumber || 1}, Col {editorRef.current?.getPosition()?.column || 1}
          </span>

          {/* ── AI writing indicator ── */}
          {liveStreamActive && liveEditingFile === activeFilePath && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-1.5 rounded-full bg-[var(--color-accent-green)]/15 border border-[var(--color-accent-green)]/30 px-2 py-1"
            >
              <Pencil className="h-2.5 w-2.5 text-[var(--color-accent-green)]" />
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                className="text-[9px] font-medium text-[var(--color-accent-green)]"
              >
                AI writing
              </motion.span>
            </motion.div>
          )}

          {/* ── AI writing to a different tab ── */}
          {liveStreamActive && liveEditingFile && liveEditingFile !== activeFilePath && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-1.5 rounded-full bg-[var(--accent-code)]/10 border border-[var(--accent-code)]/20 px-2 py-1"
            >
              <Pencil className="h-2.5 w-2.5 text-[var(--accent-code)]" />
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                className="text-[9px] font-medium text-[var(--accent-code)]"
              >
                AI editing {liveEditingFile.split("/").pop()}
              </motion.span>
            </motion.div>
          )}

          {/* ── Session streaming counter ── */}
          {sessionTokens > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-1 text-[9px] text-[var(--text-quaternary)] font-mono"
            >
              <span className="text-[var(--text-quaternary)] text-[8px]">|</span>
                          <span className="tabular-nums">
                {formatCount(sessionTokens)} tok · {formatCount(sessionChars)} chars
              </span>
            </motion.div>
          )}

          {isInAiContext && (
            <Badge variant="info" size="sm">
              <Brain className="h-2.5 w-2.5 mr-0.5" /> AI Context
            </Badge>
          )}

          {/* Git branch indicator — click to toggle Git panel */}
          {gitInfo && (
            <Tooltip content={`${gitInfo.changes} changed file(s) on ${gitInfo.branch} — click for details`}>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowGitPanel((p) => !p)}
                className={cn(
                  "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-all",
                  showGitPanel ? "bg-[var(--accent-code)]/10 text-[var(--accent-code)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]",
                )}
              >
                <GitBranch className="h-2.5 w-2.5" />
                {gitInfo.branch}
                {gitInfo.changes > 0 && (
                  <span className="text-[var(--color-accent-amber)] font-medium">{gitInfo.changes}</span>
                )}
              </motion.button>
            </Tooltip>
          )}

          <span className="text-[var(--text-quaternary)] text-[8px]">|</span>

          {/* Problems badge */}
          <Tooltip content={`${errorCount} errors, ${warningCount} warnings — click to toggle problems panel`}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowProblems((p) => !p)}
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-all",
                showProblems ? "bg-[var(--border-default)]" : "hover:bg-[var(--border-subtle)]",
              )}
            >
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-[var(--color-accent-red)]">
                  <AlertCircle className="h-2.5 w-2.5" />
                  {errorCount}
                </span>
              )}
              {warningCount > 0 && (
                <span className="flex items-center gap-1 text-[var(--color-accent-amber)]">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {warningCount}
                </span>
              )}
              {errorCount === 0 && warningCount === 0 && (
                <span className="text-[var(--text-tertiary)]">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
            </motion.button>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1.5">
          <Tooltip content={isInAiContext ? "Remove from AI context" : "Add to AI context"}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleAiContext}
              className={cn("rounded p-1 transition-all", isInAiContext ? "text-[var(--accent-code)] bg-[var(--accent-code)]/10" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]")}
            >
              <Brain className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <span className="text-[var(--text-quaternary)] text-[8px]">|</span>

          <Tooltip content={showMinimap ? "Hide minimap" : "Show minimap"}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { pulse("click"); setShowMinimap(!showMinimap) }}
              className={cn("rounded p-1 transition-colors", showMinimap ? "text-[var(--text-secondary)]" : "text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)]")}
            >
                <Columns3 className="h-3 w-3" />
              </motion.button>
            </Tooltip>

          <Tooltip content={splitMode === "none" ? "Split editor" : "Close split"}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                pulse("click")
                if (splitMode === "none") {
                  setSplitMode("vertical")
                  setSplitFile(activeFile?.path ?? null)
                } else {
                  setSplitMode("none")
                }
              }}
              className={cn("rounded p-1 transition-colors", splitMode !== "none" ? "text-[var(--accent-code)] bg-[var(--accent-code)]/10" : "text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)]")}
            >
              <PanelRight className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <Tooltip content={wordWrap ? "Disable word wrap" : "Enable word wrap"}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { pulse("click"); setWordWrap(!wordWrap) }}
              className={cn("rounded p-1 transition-colors", wordWrap ? "text-[var(--text-secondary)] bg-[var(--border-default)]" : "text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)]")}
            >
              <WrapText className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <span className="text-[var(--text-quaternary)] text-[8px]">|</span>

          <Tooltip content="Decrease font size">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { pulse("click"); setFontSize((s) => Math.max(10, s - 1)) }}
              className="rounded p-1 text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)]"
            >
              <Minus className="h-3 w-3" />
            </motion.button>
          </Tooltip>
          <motion.span
            key={fontSize}
            initial={{ y: -5, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-[10px] font-mono text-[var(--text-tertiary)] w-5 text-center select-none"
          >
            {fontSize}
          </motion.span>
          <Tooltip content="Increase font size">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { pulse("click"); setFontSize((s) => Math.min(24, s + 1)) }}
              className="rounded p-1 text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)]"
            >
              <Plus className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <span className="text-[var(--text-quaternary)] text-[8px]">|</span>

          {/* Symbol search */}
          <Tooltip content="Go to Symbol (⌘⇧O)">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                const ed = editorRef.current
                const monaco = monacoRef.current
                if (ed && monaco) {
                  const model = ed.getModel()
                  if (model) {
                    monaco.languages.provideDocumentSymbols(model).then((symbols: any) => {
                      if (symbols) {
                        setCurrentFileSymbols(symbols.map((s: any) => ({
                          name: s.name,
                          kind: s.kind,
                          detail: s.detail,
                          range: {
                            startLineNumber: s.range.startLineNumber,
                            startColumn: s.range.startColumn,
                          },
                          containerName: s.containerName,
                          tags: s.tags,
                        })))
                        setSymbolSearchOpen(true)
                      }
                    }).catch((err) => console.error("Symbol search failed:", err))
                  }
                }
              }}
              className="rounded p-1 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              <FileSearch className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          {/* File History toggle */}
          <Tooltip content="File History — view snapshots before agent edits">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                pulse("click")
                toggleHistory()
                if (!historyOpen && activeFilePath) {
                  useHistoryStore.getState().loadFileHistory(activeFilePath)
                }
              }}
              className={cn(
                "rounded p-1 transition-colors",
                historyOpen ? "text-[var(--color-accent-amber)] bg-[var(--color-accent-amber)]/10" : "text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]",
              )}
            >
              <History className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          {/* Checkpoint panel toggle */}
          <Tooltip content="Checkpoints — restore previous tool states">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => toggleCheckpoint()}
              className={cn(
                "rounded p-1 transition-colors",
                checkpointOpen ? "text-[var(--accent-code)] bg-[var(--accent-code)]/10" : "text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]",
              )}
            >
              <RotateCcw className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <span className="text-[var(--text-quaternary)] text-[8px]">|</span>

          <Tooltip content="Debug (⌘⇧D)">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowDebugPanel((p) => !p)}
              className={cn(
                "rounded p-1 transition-colors",
                showDebugPanel ? "text-[var(--accent-code)] bg-[var(--accent-code)]/10" : "text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]",
              )}
            >
              <Bug className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <span className="text-[var(--text-quaternary)] text-[8px]">|</span>

          {/* Download as file (web fallback) */}
          <Tooltip content="Download as file">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDownload}
              className="rounded p-1 text-[var(--text-quaternary)] hover:text-[var(--accent-browser)] transition-colors"
            >
              <FileDown className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <Tooltip content="Save (⌘S)">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSave}
              className="rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              <Save className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <span className="text-[var(--text-quaternary)] text-[8px]">|</span>

          <Tooltip content={showOutput ? "Hide output" : "Show output"}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { pulse("click"); setShowOutput((p) => !p) }}
              className={cn("rounded p-1 transition-colors", showOutput ? "text-[var(--accent-code)] bg-[var(--accent-code)]/10" : "text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)]")}
            >
              <Logs className="h-3 w-3" />
            </motion.button>
          </Tooltip>
        </div>
      </div>

      {/* ── Editor mode tabs ── */}
      <div className="flex items-center border-b border-[var(--border-subtle)] bg-[var(--surface-panel)]/30 px-2 shrink-0">
        {MODE_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const isActive = editorMode === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => {
                if (opt.id === "editor") {
                  setEditorMode("editor")
                } else if (opt.id === "history") {
                  setEditorMode("history")
                  toggleHistory()
                } else if (opt.id === "problems") {
                  setEditorMode("problems")
                  setShowProblems((p) => !p)
                } else if (opt.id === "search") {
                  setEditorMode("search")
                  useWorkspaceStore.getState().setSearchOpen(true)
                } else {
                  setEditorMode(opt.id)
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium transition-all border-b-2 -mb-[1px]",
                isActive
                  ? "text-[var(--accent-code)] border-[var(--accent-code)]/70"
                  : "text-[var(--text-tertiary)] border-transparent hover:text-[var(--text-secondary)] hover:border-[var(--border-hover)]",
              )}
            >
              <Icon className="h-3 w-3" />
              <span>{opt.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── AI streaming progress bar (gutter between toolbar and editor) ── */}
      <div className="relative shrink-0">
        <div className="h-[2px] bg-[var(--border-subtle)]">
          {liveStreamActive && (
            <motion.div
              className="h-full bg-gradient-to-r from-[var(--color-accent-green)]/80 via-[var(--color-accent-green)]/60 to-[var(--color-accent-green)]/80 rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${Math.round(streamProgress * 100)}%` }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
        </div>
      </div>

      {/* Editor — switched based on mode */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        {editorMode === "diff" ? (
          <DiffViewerPane
            onSwitchToEditor={() => setEditorMode("editor")}
            diffReviewFile={diffReviewFile}
          />
        ) : splitMode === "none" ? (
          <Editor
            key="monaco-editor"
            defaultLanguage={language}
            language={language}
            onChange={handleContentChange}
            onMount={handleEditorMount}
            options={editorOptions}
            theme="agentic-dark"
            loading={
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full items-center justify-center"
              >
                <div className="flex items-center gap-2 text-white/30">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <motion.span
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-[11px]"
                  >
                    Loading editor...
                  </motion.span>
                </div>
              </motion.div>
            }
          />
        ) : (
          <SplitEditor
            activeFile={activeFile}
            language={language}
            handleEditorMount={handleEditorMount}
            handleContentChange={handleContentChange}
          />
        )}

        <AnimatePresence>
          {showAiOverlay && pendingChange && (
            <AiChangeOverlay
              change={pendingChange}
              onAccept={() => acceptAiChange(pendingChange)}
              onReject={() => rejectAiChange(pendingChange)}
              onTimeout={() => timeoutAiChange(pendingChange)}
            />
          )}
        </AnimatePresence>

        {/* ── Inline AI Edit Overlay ── */}
        <AnimatePresence>
          {inlineEdit.active && (
            <InlineEditOverlay
              state={inlineEdit}
              onStateChange={(partial) => setInlineEdit((prev) => ({ ...prev, ...partial }))}
              onApplyEdit={(editedCode) => {
                const ed = editorRef.current
                if (!ed) return
                const selection = ed.getSelection()
                if (!selection) return
                const range = new (monacoRef.current!.Range)(
                  selection.startLineNumber,
                  selection.startColumn,
                  selection.endLineNumber,
                  selection.endColumn,
                )
                ed.executeEdits("inline-ai-edit", [
                  { range, text: editedCode, forceMoveMarkers: true },
                ])
                ed.focus()
              }}
              onClose={() => setInlineEdit((prev) => ({ ...prev, active: false }))}
              filePath={activeFile?.path ?? ""}
              language={language}
              fullFileContent={activeFile?.content ?? ""}
            />
          )}
        </AnimatePresence>

        {isInAiContext && !showAiOverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute top-2 right-2"
          >
            <div className="flex items-center gap-1.5 rounded-full bg-[var(--accent-code)]/15 border border-[var(--accent-code)]/25 px-2.5 py-1 text-[9px] text-[var(--accent-code)]">
              <Sparkles className="h-2.5 w-2.5" />
              AI Aware
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {saved && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-[var(--color-accent-green)]/20 border border-[var(--color-accent-green)]/30 px-3 py-1.5 text-[10px] text-[var(--color-accent-green)] shadow-lg"
            >
              <Check className="h-3 w-3" />
              <span>Saved</span>
              {saveMethod === "download" && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[8px] text-[var(--color-accent-green)]/60 ml-1"
                >
                  (downloaded)
                </motion.span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Diagnostics panel at bottom */}
      <AnimatePresence>
        <DiagnosticsPanel
          open={showProblems}
          onClose={() => setShowProblems(false)}
          onNavigateTo={handleNavigateToDiagnostic}
        />
      </AnimatePresence>

      {/* Git panel at bottom */}
      <AnimatePresence>
        {showGitPanel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 250, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="border-t border-[var(--border-default)] overflow-hidden shrink-0"
          >
            <div className="flex items-center justify-between px-2 py-1 bg-[var(--surface-panel)]/50 border-b border-[var(--border-subtle)]">
              <span className="text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                <GitBranch className="h-2.5 w-2.5 inline mr-1" />
                Git Changes
              </span>
              <button
                onClick={() => setShowGitPanel(false)}
                className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="h-full overflow-y-auto">
              <GitPanel />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File History panel at bottom */}
      <AnimatePresence>
        {historyOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="shrink-0"
          >
            <HistoryPanel
              activeFilePath={activeFilePath}
              onClose={() => useHistoryStore.getState().setOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Output panel at bottom */}
      <OutputPanel open={showOutput} onClose={() => setShowOutput(false)} />

      {/* Debug panel at bottom-right */}
      <AnimatePresence>
        {showDebugPanel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 200, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="border-t border-[var(--border-default)] overflow-hidden shrink-0"
          >
            <div className="flex items-center justify-between px-2 py-1 bg-[var(--surface-panel)]/50 border-b border-[var(--border-subtle)]">
              <span className="text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Debug</span>
              <button
                onClick={() => setShowDebugPanel(false)}
                className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="h-full">
              <DebugPanel />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Checkpoint overlay panel */}
      <CheckpointPanel />

      {/* Symbol search overlay */}
      <SymbolSearch
        open={symbolSearchOpen}
        onClose={() => setSymbolSearchOpen(false)}
        onNavigate={(line, column) => {
          const ed = editorRef.current
          if (ed) {
            ed.setPosition({ lineNumber: line, column })
            ed.revealPositionInCenter({ lineNumber: line, column })
            ed.focus()
          }
        }}
        currentFileSymbols={currentFileSymbols}
      />
    </div>
  )
}
