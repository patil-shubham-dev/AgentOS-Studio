import { memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, GitBranch } from "lucide-react"
import { DiagnosticsPanel } from "./diagnostics-panel"
import { GitPanel } from "./git-panel"
import { OutputPanel } from "./OutputPanel"
import { DebugPanel } from "./debug-panel"
import { HistoryPanel } from "@/components/workspace/file-history/HistoryPanel"
import { useHistoryStore } from "@/stores/history-store"
import { useWorkspaceStore } from "@/stores/workspace-store"

interface EditorBottomPanelsProps {
  showProblems: boolean
  showGitPanel: boolean
  historyOpen: boolean
  showOutput: boolean
  showDebugPanel: boolean
  activeFilePath: string | undefined
  onCloseProblems: () => void
  onCloseGitPanel: () => void
  onCloseDebugPanel: () => void
  onCloseOutput: () => void
  onNavigateToDiagnostic: (filePath: string, line: number, column: number) => void
}

export const EditorBottomPanels = memo(function EditorBottomPanels({
  showProblems,
  showGitPanel,
  historyOpen,
  showOutput,
  showDebugPanel,
  activeFilePath,
  onCloseProblems,
  onCloseGitPanel,
  onCloseDebugPanel,
  onCloseOutput,
  onNavigateToDiagnostic,
}: EditorBottomPanelsProps) {
  return (
    <>
      <AnimatePresence>
        <DiagnosticsPanel
          open={showProblems}
          onClose={onCloseProblems}
          onNavigateTo={onNavigateToDiagnostic}
        />
      </AnimatePresence>

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
                onClick={onCloseGitPanel}
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

      <OutputPanel open={showOutput} onClose={onCloseOutput} />

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
                onClick={onCloseDebugPanel}
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
    </>
  )
})
