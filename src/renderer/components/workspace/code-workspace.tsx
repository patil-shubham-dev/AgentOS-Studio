import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Editor, { DiffEditor, type OnMount, type OnChange } from "@monaco-editor/react"
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
import { TerminalWorkspace } from "./terminal-workspace"
import { OutputPanel } from "./OutputPanel"
import { SymbolSearch, type SymbolItem } from "./symbol-search"
import { BreadcrumbNav } from "./BreadcrumbNav"
import { SplitEditor } from "./SplitEditor"
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

import { requestRefresh } from "@/runtime/runtime-coordinator"
import { useHaptic } from "@/lib/haptics"
import {
  WrapText, Minus, Plus, X, FileCode,
  Sparkles, Brain, Check, Save,
  Columns3, FileDown, Pencil, AlertCircle, AlertTriangle, GitBranch,
  Bug, FileSearch, PanelRight, PanelRightClose, Terminal, Logs, History,
  Code2, GitCompare, ListTodo, Search, FileText, CheckCheck, XCircle,
  ChevronLeft, ChevronRight, Eye, EyeOff,
} from "lucide-react"
import { registerInlineCompletionProvider, unregisterInlineCompletionProvider, setupCompletionTracking, cleanupCompletionTracking } from "@/lib/completion/completion-provider"
import { InlineEditOverlay } from "./inline-edit-overlay"
import { useStreamingState } from "./use-streaming-state"
import {
  acceptAllDiffReviews,
  acceptDiffReviewFile,
  acceptDiffReviewHunk,
  rejectAllDiffReviews,
  rejectDiffReviewFile,
  rejectDiffReviewHunk,
  getReviewedContent,
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

// ── Diff Mode View ──

const DIFF_EDITOR_OPTIONS: editor.IStandaloneDiffEditorConstructionOptions = {
  fontSize: 11,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  lineNumbers: "on",
  renderSideBySide: true,
  readOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  folding: true,
  automaticLayout: true,
  wordWrap: "off",
  lineDecorationsWidth: 4,
  lineNumbersMinChars: 3,
  glyphMargin: false,
  renderWhitespace: "boundary",
  scrollbar: {
    verticalScrollbarSize: 6,
    horizontalScrollbarSize: 6,
    useShadows: false,
  },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  bracketPairColorization: { enabled: true },
  originalEditable: false,
  enableSplitViewResizing: true,
  splitViewDefaultRatio: 0.5,
  diffCodeLens: false,
  renderIndicators: true,
  ignoreTrimWhitespace: true,
  maxComputationTime: 5000,
}

function DiffModeView({
  activeFile,
  diffReviewFile,
  onSwitchToEditor,
}: {
  activeFile: { path: string; name: string; content: string } | undefined
  diffReviewFile: string | null
  onSwitchToEditor: () => void
}) {
  const diffFiles = useDiffStore((s) => s.files)

  const fileList = useMemo(() => Array.from(diffFiles.values()), [diffFiles])
  const [showSidebar, setShowSidebar] = useState(true)
  const [focusedHunk, setFocusedHunk] = useState(0)

  const targetPath = diffReviewFile ?? activeFile?.path
  const currentDiff = targetPath ? diffFiles.get(targetPath) ?? null : null

  const [selectedPath, setSelectedPath] = useState<string | null>(
    currentDiff?.path ?? fileList[0]?.path ?? null
  )

  useEffect(() => {
    if (currentDiff && currentDiff.path !== selectedPath) {
      setSelectedPath(currentDiff.path)
    }
  }, [currentDiff?.path])

  const selectedFile = selectedPath ? diffFiles.get(selectedPath) ?? null : null

  const totals = useMemo(() => {
    let additions = 0, deletions = 0, pending = 0
    for (const f of fileList) {
      if (f.status === "pending") pending++
      for (const h of f.hunks) {
        additions += h.additions
        deletions += h.deletions
      }
    }
    return { files: fileList.length, additions, deletions, pending }
  }, [fileList])

  const hunkSummary = selectedFile
    ? `${selectedFile.hunks.length} hunk${selectedFile.hunks.length !== 1 ? "s" : ""}`
    : null

  const currentIndex = selectedPath ? fileList.findIndex((f) => f.path === selectedPath) : -1

  function navigatePrev() {
    if (currentIndex > 0) {
      const prev = fileList[currentIndex - 1]
      setSelectedPath(prev.path)
      useWorkspaceStore.getState().openFileInDiffMode(prev.path)
    }
  }

  function navigateNext() {
    if (currentIndex < fileList.length - 1) {
      const next = fileList[currentIndex + 1]
      setSelectedPath(next.path)
      useWorkspaceStore.getState().openFileInDiffMode(next.path)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Diff toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.04] bg-black/10 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onSwitchToEditor}
            className="rounded px-1.5 py-0.5 text-[9px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all"
            title="Return to editor"
          >
            <ChevronLeft className="h-3 w-3 inline mr-1" />
            Back
          </button>

          <span className="text-white/15 text-[8px]">|</span>

          <span className="text-[9px] font-medium text-white/30 uppercase tracking-widest">Changes</span>
          <span className="text-[9px] text-white/20 bg-white/[0.04] rounded px-1 py-0.5">
            {totals.files} file{totals.files !== 1 ? "s" : ""}
          </span>
          <span className="text-[9px] text-green-400/60 font-mono">+{totals.additions}</span>
          <span className="text-[9px] text-red-400/60 font-mono">-{totals.deletions}</span>
          {totals.pending > 0 && (
            <span className="text-[9px] text-amber-400/60 font-mono">{totals.pending} pending</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowSidebar((v) => !v)}
            className="rounded px-1.5 py-0.5 text-[9px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all"
          >
            {showSidebar ? <EyeOff className="h-2.5 w-2.5 inline" /> : <Eye className="h-2.5 w-2.5 inline" />}
          </button>

          <div className="w-px h-4 bg-white/[0.06]" />

          <button
            onClick={() => { void rejectAllDiffReviews() }}
            disabled={totals.pending === 0}
            className="rounded px-1.5 py-0.5 text-[9px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:text-white/15 disabled:cursor-not-allowed"
          >
            <XCircle className="h-2.5 w-2.5 inline mr-1" />
            Reject All
          </button>
          <button
            onClick={() => { void acceptAllDiffReviews() }}
            disabled={totals.pending === 0}
            className="rounded px-1.5 py-0.5 text-[9px] text-green-400/60 hover:text-green-400 hover:bg-green-500/10 transition-all disabled:text-white/15 disabled:cursor-not-allowed"
          >
            <CheckCheck className="h-2.5 w-2.5 inline mr-1" />
            Accept All
          </button>
        </div>
      </div>

      {/* Main content: sidebar + diff viewer */}
      <div className="flex flex-1 min-h-0">
        {/* File sidebar */}
        <AnimatePresence>
          {showSidebar && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 200, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeInOut" }}
              className="flex-shrink-0 border-r border-white/[0.06] overflow-hidden"
            >
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/[0.04]">
                  <span className="text-[9px] font-medium text-white/20 uppercase tracking-wider">Files</span>
                  <span className="text-[8px] text-white/15">{fileList.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 py-1">
                  {fileList.map((file) => {
                    const isSelected = selectedPath === file.path
                    return (
                      <button
                        key={file.path}
                        onClick={() => {
                          setSelectedPath(file.path)
                          useWorkspaceStore.getState().openFileInDiffMode(file.path)
                        }}
                        className={cn(
                          "flex items-center gap-2 w-full px-2.5 py-1.5 text-left transition-colors",
                          isSelected ? "bg-blue-500/8" : "hover:bg-white/[0.03]",
                        )}
                      >
                        <div className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          file.status === "accepted" ? "bg-green-400" :
                          file.status === "rejected" ? "bg-red-400" : "bg-amber-400",
                        )} />
                        <div className="flex-1 min-w-0">
                          <span className={cn("text-[10px] font-mono truncate block", isSelected ? "text-white/80" : "text-white/50")}>
                            {file.path.split("/").pop()}
                          </span>
                          <span className="text-[8px] text-white/20 truncate block">{file.path}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[8px] text-green-400/50 font-mono">
                            +{file.hunks.reduce((s, h) => s + h.additions, 0)}
                          </div>
                          <div className="text-[8px] text-red-400/50 font-mono">
                            -{file.hunks.reduce((s, h) => s + h.deletions, 0)}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Diff content */}
        <div className="flex-1 flex flex-col min-h-0">
          {selectedFile ? (
            <>
              {/* File header with navigation */}
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.04] bg-white/[0.01] shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-white/30" />
                  <span className="text-[11px] font-medium text-white/70">{selectedFile.path.split("/").pop()}</span>
                  <span className="text-[9px] text-white/30 font-mono">{selectedFile.path}</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[9px] font-medium border",
                    selectedFile.status === "accepted" ? "text-green-400 border-green-500/20 bg-green-500/8" :
                    selectedFile.status === "rejected" ? "text-red-400 border-red-500/20 bg-red-500/8" :
                    "text-amber-400 border-amber-500/20 bg-amber-500/8",
                  )}>
                    {selectedFile.status === "accepted" ? "Accepted" : selectedFile.status === "rejected" ? "Rejected" : "Pending"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {/* Prev/Next navigation */}
                  <button
                    onClick={navigatePrev}
                    disabled={currentIndex <= 0}
                    className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all disabled:text-white/10 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <span className="text-[9px] text-white/30 min-w-[4ch] text-center">
                    {currentIndex + 1}/{fileList.length}
                  </span>
                  <button
                    onClick={navigateNext}
                    disabled={currentIndex >= fileList.length - 1}
                    className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all disabled:text-white/10 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>

                  {/* Accept/Reject */}
                  {selectedFile.status === "pending" && (
                    <>
                      <div className="w-px h-4 bg-white/[0.06]" />
                      <button
                        onClick={() => { void rejectDiffReviewFile(selectedFile.path) }}
                        className="rounded px-1.5 py-0.5 text-[9px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => { void acceptDiffReviewFile(selectedFile.path) }}
                        className="rounded px-1.5 py-0.5 text-[9px] text-green-400/60 hover:text-green-400 hover:bg-green-500/10 transition-all"
                      >
                        Accept
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Monaco DiffEditor */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <DiffEditor
                  key={selectedFile.path}
                  original={selectedFile.originalContent}
                  modified={getReviewedContent(selectedFile)}
                  language={selectedFile.path.split(".").pop()?.toLowerCase() ?? "plaintext"}
                  options={DIFF_EDITOR_OPTIONS}
                  theme="vs-dark"
                />
              </div>

              {/* Hunk list at bottom — keyboard navigable */}
              {selectedFile.hunks.length > 0 && (
                <div
                  className="border-t border-white/[0.06] bg-white/[0.01] max-h-[120px] overflow-y-auto shrink-0"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault()
                      const next = (focusedHunk + 1) % selectedFile.hunks.length
                      setFocusedHunk(next)
                      return
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault()
                      const prev = (focusedHunk - 1 + selectedFile.hunks.length) % selectedFile.hunks.length
                      setFocusedHunk(prev)
                      return
                    }
                    if (e.key === "Enter" && focusedHunk >= 0) {
                      const hunk = selectedFile.hunks[focusedHunk]
                      if (hunk.status === "pending") {
                        e.preventDefault()
                        void acceptDiffReviewHunk(selectedFile.path, hunk.hunkIndex)
                      }
                      return
                    }
                    if ((e.key === "Delete" || e.key === "Backspace") && focusedHunk >= 0) {
                      const hunk = selectedFile.hunks[focusedHunk]
                      if (hunk.status === "pending") {
                        e.preventDefault()
                        void rejectDiffReviewHunk(selectedFile.path, hunk.hunkIndex)
                      }
                      return
                    }
                  }}
                >
                  <div className="flex items-center gap-1.5 px-3 py-1 border-b border-white/[0.04]">
                    <span className="text-[9px] font-medium text-white/20 uppercase tracking-wider">
                      Changes ({selectedFile.hunks.length})
                    </span>
                    <span className="text-[7px] text-white/15 ml-auto">
                      Focus: ↑↓ Enter=accept Delete=reject
                    </span>
                  </div>
                  <div className="divide-y divide-white/[0.03]">
                    {selectedFile.hunks.map((hunk, idx) => (
                      <div
                        key={idx}
                        onClick={() => setFocusedHunk(idx)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1 cursor-pointer transition-colors",
                          focusedHunk === idx
                            ? "bg-blue-500/10 ring-1 ring-blue-500/30"
                            : hunk.status === "accepted" ? "bg-green-500/5" :
                            hunk.status === "rejected" ? "bg-red-500/5" : "hover:bg-white/[0.02]",
                        )}
                      >
                        <span className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          hunk.status === "accepted" ? "bg-green-400" :
                          hunk.status === "rejected" ? "bg-red-400" : "bg-amber-400/60",
                        )} />
                        <code className="text-[9px] font-mono text-white/40 flex-1 truncate">{hunk.header}</code>
                        <span className="text-[8px] text-green-400/50 font-mono">+{hunk.additions}</span>
                        <span className="text-[8px] text-red-400/50 font-mono">-{hunk.deletions}</span>
                        {hunk.status === "pending" && (
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={(ev) => { ev.stopPropagation(); void rejectDiffReviewHunk(selectedFile.path, hunk.hunkIndex) }}
                              className="rounded p-0.5 text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                            <button
                              onClick={(ev) => { ev.stopPropagation(); void acceptDiffReviewHunk(selectedFile.path, hunk.hunkIndex) }}
                              className="rounded p-0.5 text-white/20 hover:text-green-400 hover:bg-green-500/10 transition-all"
                            >
                              <Check className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-[11px] text-white/20">
              {fileList.length === 0
                ? "No pending changes to review"
                : "Select a file from the sidebar to view its diff"}
            </div>
          )}
        </div>
      </div>
    </div>
  )
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
  const [showTerminal, setShowTerminal] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false)
  const historyOpen = useHistoryStore((s) => s.open)
  const toggleHistory = useHistoryStore((s) => s.toggleOpen)
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
    viewMode: "edit" | "diff"
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
    <div className="flex h-full flex-col bg-[#0a0a0b] min-h-0">
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
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 12px', background: 'rgba(245,158,11,0.1)',
          borderBottom: '1px solid rgba(245,158,11,0.2)',
          fontSize: '11px', color: '#f59e0b',
        }}>
          <AlertTriangle size={12} />
          <span>Large file — editing may be slow. Saving will write to disk normally.</span>
          <button
            onClick={() => setLargeFileWarning(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '12px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Breadcrumb navigation */}
      <BreadcrumbNav />

      {/* Editor toolbar */}
      <div className="flex items-center justify-between border-b border-white/[0.04] bg-black/10 px-3 py-1 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-medium text-white/40 uppercase">{language}</span>
          <span className="text-white/15 text-[8px]">|</span>
          <span className="text-[10px] text-white/30">
            Ln {editorRef.current?.getPosition()?.lineNumber || 1}, Col {editorRef.current?.getPosition()?.column || 1}
          </span>

          {/* ── AI writing indicator ── */}
          {liveStreamActive && liveEditingFile === activeFilePath && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-1.5 rounded-full bg-green-500/15 border border-green-500/30 px-2 py-1"
            >
              <Pencil className="h-2.5 w-2.5 text-green-400" />
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                className="text-[9px] font-medium text-green-400"
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
              className="flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-1"
            >
              <Pencil className="h-2.5 w-2.5 text-blue-400" />
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                className="text-[9px] font-medium text-blue-400"
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
              className="flex items-center gap-1 text-[9px] text-white/25 font-mono"
            >
              <span className="text-white/15 text-[8px]">|</span>
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
                  showGitPanel ? "bg-blue-500/10 text-blue-400" : "text-white/40 hover:text-white/60 hover:bg-white/[0.03]",
                )}
              >
                <GitBranch className="h-2.5 w-2.5" />
                {gitInfo.branch}
                {gitInfo.changes > 0 && (
                  <span className="text-amber-400 font-medium">{gitInfo.changes}</span>
                )}
              </motion.button>
            </Tooltip>
          )}

          <span className="text-white/10 text-[8px]">|</span>

          {/* Problems badge */}
          <Tooltip content={`${errorCount} errors, ${warningCount} warnings — click to toggle problems panel`}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowProblems((p) => !p)}
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-all",
                showProblems ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
              )}
            >
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <AlertCircle className="h-2.5 w-2.5" />
                  {errorCount}
                </span>
              )}
              {warningCount > 0 && (
                <span className="flex items-center gap-1 text-yellow-400">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {warningCount}
                </span>
              )}
              {errorCount === 0 && warningCount === 0 && (
                <span className="text-white/30">
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
              className={cn("rounded p-1 transition-all", isInAiContext ? "text-blue-400 bg-blue-500/10" : "text-white/30 hover:text-white/60")}
            >
              <Brain className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <span className="text-white/10 text-[8px]">|</span>

          <Tooltip content={showMinimap ? "Hide minimap" : "Show minimap"}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { pulse("click"); setShowMinimap(!showMinimap) }}
              className={cn("rounded p-1 transition-colors", showMinimap ? "text-white/60" : "text-white/20 hover:text-white/40")}
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
              className={cn("rounded p-1 transition-colors", splitMode !== "none" ? "text-blue-400 bg-blue-500/10" : "text-white/20 hover:text-white/40")}
            >
              <PanelRight className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <Tooltip content={wordWrap ? "Disable word wrap" : "Enable word wrap"}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { pulse("click"); setWordWrap(!wordWrap) }}
              className={cn("rounded p-1 transition-colors", wordWrap ? "text-white/60 bg-white/10" : "text-white/20 hover:text-white/40")}
            >
              <WrapText className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <span className="text-white/10 text-[8px]">|</span>

          <Tooltip content="Decrease font size">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { pulse("click"); setFontSize((s) => Math.max(10, s - 1)) }}
              className="rounded p-1 text-white/20 hover:text-white/40"
            >
              <Minus className="h-3 w-3" />
            </motion.button>
          </Tooltip>
          <motion.span
            key={fontSize}
            initial={{ y: -5, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-[10px] font-mono text-white/40 w-5 text-center select-none"
          >
            {fontSize}
          </motion.span>
          <Tooltip content="Increase font size">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { pulse("click"); setFontSize((s) => Math.min(24, s + 1)) }}
              className="rounded p-1 text-white/20 hover:text-white/40"
            >
              <Plus className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <span className="text-white/10 text-[8px]">|</span>

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
              className="rounded p-1 text-white/25 hover:text-white/60 transition-colors"
            >
              <FileSearch className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          {/* Debug panel toggle */}          {/* File History toggle */}
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
                historyOpen ? "text-amber-400 bg-amber-500/10" : "text-white/25 hover:text-white/60",
              )}
            >
              <History className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <span className="text-white/10 text-[8px]">|</span>

          <Tooltip content="Debug (⌘⇧D)">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowDebugPanel((p) => !p)}
              className={cn(
                "rounded p-1 transition-colors",
                showDebugPanel ? "text-blue-400 bg-blue-500/10" : "text-white/25 hover:text-white/60",
              )}
            >
              <Bug className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <span className="text-white/10 text-[8px]">|</span>

          {/* Download as file (web fallback) */}
          <Tooltip content="Download as file">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDownload}
              className="rounded p-1 text-white/25 hover:text-cyan-400 transition-colors"
            >
              <FileDown className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <Tooltip content="Save (⌘S)">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSave}
              className="rounded p-1 text-white/30 hover:text-white/60"
            >
              <Save className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <span className="text-white/10 text-[8px]">|</span>

          <Tooltip content={showTerminal ? "Hide terminal" : "Show terminal"}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { pulse("click"); setShowTerminal((p) => !p) }}
              className={cn("rounded p-1 transition-colors", showTerminal ? "text-blue-400 bg-blue-500/10" : "text-white/20 hover:text-white/40")}
            >
              <Terminal className="h-3 w-3" />
            </motion.button>
          </Tooltip>

          <Tooltip content={showOutput ? "Hide output" : "Show output"}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { pulse("click"); setShowOutput((p) => !p) }}
              className={cn("rounded p-1 transition-colors", showOutput ? "text-blue-400 bg-blue-500/10" : "text-white/20 hover:text-white/40")}
            >
              <Logs className="h-3 w-3" />
            </motion.button>
          </Tooltip>
        </div>
      </div>

      {/* ── Editor mode tabs ── */}
      <div className="flex items-center border-b border-white/[0.04] bg-black/5 px-2 shrink-0">
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
                  setSymbolSearchOpen(true)
                } else {
                  setEditorMode(opt.id)
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium transition-all border-b-2 -mb-[1px]",
                isActive
                  ? "text-blue-400 border-blue-400/70"
                  : "text-white/30 border-transparent hover:text-white/50 hover:border-white/10",
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
        <div className="h-[2px] bg-white/[0.03]">
          {liveStreamActive && (
            <motion.div
              className="h-full bg-gradient-to-r from-green-500/80 via-emerald-400/60 to-green-500/80 rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${Math.round(streamProgress * 100)}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          )}
        </div>
      </div>

      {/* Editor — switched based on mode */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        {editorMode === "diff" ? (
          <DiffModeView
            activeFile={activeFile}
            diffReviewFile={diffReviewFile}
            onSwitchToEditor={() => setEditorMode("editor")}
          />
        ) : splitMode === "none" ? (
          <Editor
            key="monaco-editor"
            defaultLanguage={language}
            language={language}
            onChange={handleContentChange}
            onMount={handleEditorMount}
            options={{
              ...EDITOR_OPTIONS,
              wordWrap: wordWrap ? "on" : "off",
              fontSize,
              minimap: { enabled: showMinimap },
              readOnly: false,
            }}
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
            <div className="flex items-center gap-1.5 rounded-full bg-blue-500/15 border border-blue-500/25 px-2.5 py-1 text-[9px] text-blue-400">
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
              className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-green-500/20 border border-green-500/30 px-3 py-1.5 text-[10px] text-green-400 shadow-lg"
            >
              <Check className="h-3 w-3" />
              <span>Saved</span>
              {saveMethod === "download" && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[8px] text-green-400/60 ml-1"
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
            className="border-t border-white/[0.06] overflow-hidden shrink-0"
          >
            <div className="flex items-center justify-between px-2 py-1 bg-black/20 border-b border-white/[0.04]">
              <span className="text-[9px] font-medium text-white/30 uppercase tracking-wider">
                <GitBranch className="h-2.5 w-2.5 inline mr-1" />
                Git Changes
              </span>
              <button
                onClick={() => setShowGitPanel(false)}
                className="rounded p-0.5 text-white/30 hover:text-white/60 transition-colors"
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

      {/* Terminal panel at bottom */}
      <AnimatePresence>
        {showTerminal && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 200, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="border-t border-white/[0.06] overflow-hidden shrink-0"
          >
            <div className="flex items-center justify-between px-2 py-1 bg-black/20 border-b border-white/[0.04]">
              <span className="text-[9px] font-medium text-white/30 uppercase tracking-wider flex items-center gap-1">
                <Terminal className="h-2.5 w-2.5" />
                Terminal
              </span>
              <button
                onClick={() => setShowTerminal(false)}
                className="rounded p-0.5 text-white/30 hover:text-white/60 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="h-full">
              <TerminalWorkspace />
            </div>
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
            className="border-t border-white/[0.06] overflow-hidden shrink-0"
          >
            <div className="flex items-center justify-between px-2 py-1 bg-black/20 border-b border-white/[0.04]">
              <span className="text-[9px] font-medium text-white/30 uppercase tracking-wider">Debug</span>
              <button
                onClick={() => setShowDebugPanel(false)}
                className="rounded p-0.5 text-white/30 hover:text-white/60 transition-colors"
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
