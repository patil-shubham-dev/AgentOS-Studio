import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { AnimatePresence } from "framer-motion"
import type { OnChange } from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useDiagnosticsStore } from "@/stores/diagnostics-store"
import { loadFileTree } from "@/lib/filesystem"
import { PremiumEmptyState, getCodeEmptyState } from "./premium-empty-state"

import { SymbolSearch, type SymbolItem } from "./symbol-search"
import { BreadcrumbNav } from "./BreadcrumbNav"
import { WelcomePage } from "./WelcomePage"
import { EditorTabs } from "./EditorTabs"
import { EditorToolbar } from "./EditorToolbar"
import { EditorModeTabs } from "./EditorModeTabs"
import { EditorBottomPanels } from "./EditorBottomPanels"
import type { AIChange } from "./AiChangeOverlay"
import { saveFile, getOrCreateModel, editorViewStateCache, isLargeFile, getMonacoLang, DEFAULT_EDITOR_OPTIONS } from "./editor-utils"
import { dirtyBufferManager } from "@/lib/dirty-buffer-manager"
import { gitStatus } from "@/lib/git"
import { useHistoryStore } from "@/stores/history-store"
import { useAiChanges } from "./useAiChanges"
import { EditPredictor } from "./EditPredictor"
import { InteractiveTerminalPane } from "./InteractiveTerminalPane"

import { requestRefresh } from "@/runtime/runtime-coordinator"
import { useHaptic } from "@/lib/haptics"
import { unregisterInlineCompletionProvider, cleanupCompletionTracking } from "@/lib/completion/completion-provider"
import { EditorArea } from "./EditorArea"
import { EditorOverlays, type InlineEditState } from "./EditorOverlays"
import { useStreamingState } from "./use-streaming-state"
import { useDiffNavigation } from "./useKeyboardShortcuts"
import { useMonacoMount } from "./useMonacoMount"
import { LargeFileWarningBanner } from "./LargeFileWarningBanner"
import { StreamingProgressBar } from "./StreamingProgressBar"
import { TerminalToggleButton } from "./TerminalToggleButton"

// EXT_LANG_MAP, getMonacoLang, and DEFAULT_EDITOR_OPTIONS moved to editor-utils.ts

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
  const [saved, setSaved] = useState(false)
  const [wordWrap, setWordWrap] = useState(false)
  const [fontSize, setFontSize] = useState(13)
  const [showMinimap, setShowMinimap] = useState(true)
  const [showProblems, setShowProblems] = useState(false)
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [showGitPanel, setShowGitPanel] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
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

  const [inlineEdit, setInlineEdit] = useState<InlineEditState>({
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

  const { handleEditorMount } = useMonacoMount({
    setCursorPosition, setSelectedText, setVisibleRange, setUserActive,
    setShowMinimap, setShowProblems, setShowDebugPanel,
    setSymbolSearchOpen, setCurrentFileSymbols, setInlineEdit,
    onSave: handleSave,
  })

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
  useAiChanges(activeFile, setAiChanges, setShowAiOverlay)

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

  useDiffNavigation(showTerminal, setShowTerminal)

  const language = activeFile ? getMonacoLang(activeFile.name) : "plaintext"

  const isLarge = activeFile ? isLargeFile(activeFile.content) : false
  const editorOptions = useMemo(() => {
    if (isLarge) {
      return {
        ...DEFAULT_EDITOR_OPTIONS,
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
      ...DEFAULT_EDITOR_OPTIONS,
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

      <LargeFileWarningBanner filePath={largeFileWarning} onDismiss={() => setLargeFileWarning(null)} />

      {/* Breadcrumb navigation */}
      <BreadcrumbNav />

      <EditorToolbar
        language={language}
        editorRef={editorRef}
        monacoRef={monacoRef}
        wordWrap={wordWrap}
        fontSize={fontSize}
        showMinimap={showMinimap}
        showProblems={showProblems}
        showDebugPanel={showDebugPanel}
        showGitPanel={showGitPanel}
        showOutput={showOutput}
        splitMode={splitMode}
        liveStreamActive={liveStreamActive}
        liveEditingFile={liveEditingFile}
        activeFilePath={activeFilePath}
        isInAiContext={isInAiContext}
        errorCount={errorCount}
        warningCount={warningCount}
        gitInfo={gitInfo}
        historyOpen={historyOpen}
        sessionTokens={sessionTokens}
        sessionChars={sessionChars}
        onToggleWordWrap={() => setWordWrap((p) => !p)}
        onSetFontSize={(s) => setFontSize(s)}
        onToggleMinimap={() => setShowMinimap((p) => !p)}
        onToggleProblems={() => setShowProblems((p) => !p)}
        onToggleDebugPanel={() => setShowDebugPanel((p) => !p)}
        onToggleGitPanel={() => setShowGitPanel((p) => !p)}
        onToggleOutput={() => setShowOutput((p) => !p)}
        onToggleAiContext={toggleAiContext}
        onToggleSplit={() => {
          if (splitMode === "none") {
            setSplitMode("vertical")
            setSplitFile(activeFile?.path ?? null)
          } else {
            setSplitMode("none")
          }
        }}
        onToggleHistory={() => {
          toggleHistory()
          if (!historyOpen && activeFilePath) {
            useHistoryStore.getState().loadFileHistory(activeFilePath)
          }
        }}
        onSymbolSearch={(symbols) => {
          setCurrentFileSymbols(symbols)
          setSymbolSearchOpen(true)
        }}
        onOpenSymbolSearch={() => {}}
        onSave={handleSave}
        onDownload={handleDownload}
      />

      <EditorModeTabs
        editorMode={editorMode}
        onSelectMode={setEditorMode}
        onToggleHistory={toggleHistory}
        onToggleProblems={() => setShowProblems((p) => !p)}
        onToggleSearch={() => useWorkspaceStore.getState().setSearchOpen(true)}
      />

      <StreamingProgressBar active={liveStreamActive} progress={streamProgress} />

      <EditorArea
        editorMode={editorMode}
        diffReviewFile={diffReviewFile}
        onSwitchToEditor={() => setEditorMode("editor")}
        splitMode={splitMode}
        language={language}
        activeFile={activeFile}
        editorOptions={editorOptions}
        handleEditorMount={handleEditorMount}
        handleContentChange={handleContentChange}
      >
        <EditorOverlays
          showAiOverlay={showAiOverlay}
          pendingChange={pendingChange}
          onAcceptChange={() => acceptAiChange(pendingChange!)}
          onRejectChange={() => rejectAiChange(pendingChange!)}
          onTimeoutChange={() => timeoutAiChange(pendingChange!)}
          inlineEdit={inlineEdit}
          onInlineEditChange={(partial) => setInlineEdit((prev) => ({ ...prev, ...partial }))}
          onInlineEditClose={() => setInlineEdit((prev) => ({ ...prev, active: false }))}
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
          editorRef={editorRef}
          monacoRef={monacoRef}
          activeFile={activeFile}
          language={language}
          isInAiContext={isInAiContext}
          saved={saved}
          saveMethod={saveMethod}
        />
      </EditorArea>

      <EditPredictor />

      <TerminalToggleButton showTerminal={showTerminal} onToggle={() => setShowTerminal((p) => !p)} />

      {/* Terminal pane */}
      <AnimatePresence>
        {showTerminal && (
          <InteractiveTerminalPane onClose={() => setShowTerminal(false)} />
        )}
      </AnimatePresence>

      <EditorBottomPanels
        showProblems={showProblems}
        showGitPanel={showGitPanel}
        historyOpen={historyOpen}
        showOutput={showOutput}
        showDebugPanel={showDebugPanel}
        activeFilePath={activeFilePath}
        onCloseProblems={() => setShowProblems(false)}
        onCloseGitPanel={() => setShowGitPanel(false)}
        onCloseDebugPanel={() => setShowDebugPanel(false)}
        onCloseOutput={() => setShowOutput(false)}
        onNavigateToDiagnostic={handleNavigateToDiagnostic}
      />

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
