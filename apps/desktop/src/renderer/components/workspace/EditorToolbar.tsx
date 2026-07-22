import { memo } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Badge, TooltipSimple as Tooltip } from "@agentic-os/ui"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useHistoryStore } from "@/stores/history-store"
import { useCheckpointStore } from "@/stores/checkpoint-store"
import {
  WrapText, Minus, Plus, X, FileCode,
  Sparkles, Brain, Check, Save,
  Columns3, FileDown, Pencil, AlertCircle, AlertTriangle, GitBranch,
  Bug, FileSearch, PanelRight, Logs, History, RotateCcw,
  Code2, GitCompare, ListTodo, Search, FileText, CheckCheck, XCircle,
  ChevronLeft, ChevronRight, Eye, EyeOff,
} from "lucide-react"
import { useHaptic } from "@/lib/haptics"
import { formatCount } from "./editor-utils"
import type { editor } from "monaco-editor"

interface EditorToolbarProps {
  language: string
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>
  monacoRef: React.MutableRefObject<any>
  wordWrap: boolean
  fontSize: number
  showMinimap: boolean
  showProblems: boolean
  showDebugPanel: boolean
  showGitPanel: boolean
  showOutput: boolean
  splitMode: string
  liveStreamActive: boolean
  liveEditingFile: string | undefined
  activeFilePath: string | undefined
  isInAiContext: boolean
  errorCount: number
  warningCount: number
  gitInfo: { branch: string; changes: number } | null
  historyOpen: boolean
  checkpointOpen: boolean
  sessionTokens: number
  sessionChars: number
  onToggleWordWrap: () => void
  onSetFontSize: (size: number) => void
  onToggleMinimap: () => void
  onToggleProblems: () => void
  onToggleDebugPanel: () => void
  onToggleGitPanel: () => void
  onToggleOutput: () => void
  onToggleAiContext: () => void
  onToggleSplit: () => void
  onToggleHistory: () => void
  onToggleCheckpoint: () => void
  onSymbolSearch: (symbols: any[]) => void
  onOpenSymbolSearch: () => void
  onSave: () => void
  onDownload: () => void
}

export const EditorToolbar = memo(function EditorToolbar({
  language, editorRef, monacoRef, wordWrap, fontSize, showMinimap,
  showProblems, showDebugPanel, showGitPanel, showOutput, splitMode,
  liveStreamActive, liveEditingFile, activeFilePath, isInAiContext,
  errorCount, warningCount, gitInfo, historyOpen, checkpointOpen,
  sessionTokens, sessionChars,
  onToggleWordWrap, onSetFontSize, onToggleMinimap, onToggleProblems,
  onToggleDebugPanel, onToggleGitPanel, onToggleOutput, onToggleAiContext,
  onToggleSplit, onToggleHistory, onToggleCheckpoint,
  onSymbolSearch, onOpenSymbolSearch, onSave, onDownload,
}: EditorToolbarProps) {
  const { pulse } = useHaptic()

  const handleSymbolSearch = () => {
    const ed = editorRef.current
    const monaco = monacoRef.current
    if (ed && monaco) {
      const model = ed.getModel()
      if (model) {
        monaco.languages.provideDocumentSymbols(model).then((symbols: any) => {
          if (symbols) {
            onSymbolSearch(symbols.map((s: any) => ({
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
            onOpenSymbolSearch()
          }
        }).catch(() => {})
      }
    }
  }

  return (
    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-panel)]/50 px-3 py-1 shrink-0">
      <div className="flex items-center gap-2.5">
        <span className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase">{language}</span>
        <span className="text-[var(--text-quaternary)] text-[8px]">|</span>
        <span className="text-[10px] text-[var(--text-tertiary)]">
          Ln {editorRef.current?.getPosition()?.lineNumber || 1}, Col {editorRef.current?.getPosition()?.column || 1}
        </span>

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

        {gitInfo && (
          <Tooltip content={`${gitInfo.changes} changed file(s) on ${gitInfo.branch} — click for details`}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onToggleGitPanel}
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

        <Tooltip content={`${errorCount} errors, ${warningCount} warnings — click to toggle`}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onToggleProblems}
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
            onClick={onToggleAiContext}
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
            onClick={() => { pulse("click"); onToggleMinimap() }}
            className={cn("rounded p-1 transition-colors", showMinimap ? "text-[var(--text-secondary)]" : "text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)]")}
          >
            <Columns3 className="h-3 w-3" />
          </motion.button>
        </Tooltip>

        <Tooltip content={splitMode === "none" ? "Split editor" : "Close split"}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { pulse("click"); onToggleSplit() }}
            className={cn("rounded p-1 transition-colors", splitMode !== "none" ? "text-[var(--accent-code)] bg-[var(--accent-code)]/10" : "text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)]")}
          >
            <PanelRight className="h-3 w-3" />
          </motion.button>
        </Tooltip>

        <Tooltip content={wordWrap ? "Disable word wrap" : "Enable word wrap"}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { pulse("click"); onToggleWordWrap() }}
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
            onClick={() => onSetFontSize(Math.max(10, fontSize - 1))}
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
            onClick={() => onSetFontSize(Math.min(24, fontSize + 1))}
            className="rounded p-1 text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)]"
          >
            <Plus className="h-3 w-3" />
          </motion.button>
        </Tooltip>

        <span className="text-[var(--text-quaternary)] text-[8px]">|</span>

        <Tooltip content="Go to Symbol (⌘⇧O)">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSymbolSearch}
            className="rounded p-1 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <FileSearch className="h-3 w-3" />
          </motion.button>
        </Tooltip>

        <Tooltip content="File History">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              pulse("click")
              onToggleHistory()
            }}
            className={cn(
              "rounded p-1 transition-colors",
              historyOpen ? "text-[var(--color-accent-amber)] bg-[var(--color-accent-amber)]/10" : "text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]",
            )}
          >
            <History className="h-3 w-3" />
          </motion.button>
        </Tooltip>

        <Tooltip content="Checkpoints — restore previous tool states">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onToggleCheckpoint}
            className={cn(
              "rounded p-1 transition-colors",
              checkpointOpen ? "text-[var(--accent-code)] bg-[var(--accent-code)]/10" : "text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]",
            )}
          >
            <RotateCcw className="h-3 w-3" />
          </motion.button>
        </Tooltip>

        <span className="text-[var(--text-quaternary)] text-[8px]">|</span>

        <Tooltip content="Toggle debug panel">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onToggleDebugPanel}
            className={cn(
              "rounded p-1 transition-colors",
              showDebugPanel ? "text-[var(--accent-code)] bg-[var(--accent-code)]/10" : "text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]",
            )}
          >
            <Bug className="h-3 w-3" />
          </motion.button>
        </Tooltip>

        <span className="text-[var(--text-quaternary)] text-[8px]">|</span>

        <Tooltip content="Download as file">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onDownload}
            className="rounded p-1 text-[var(--text-quaternary)] hover:text-[var(--accent-browser)] transition-colors"
          >
            <FileDown className="h-3 w-3" />
          </motion.button>
        </Tooltip>

        <Tooltip content="Save (⌘S)">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onSave}
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
            onClick={() => { pulse("click"); onToggleOutput() }}
            className={cn("rounded p-1 transition-colors", showOutput ? "text-[var(--accent-code)] bg-[var(--accent-code)]/10" : "text-[var(--text-quaternary)] hover:text-[var(--text-tertiary)]")}
          >
            <Logs className="h-3 w-3" />
          </motion.button>
        </Tooltip>
      </div>
    </div>
  )
})
