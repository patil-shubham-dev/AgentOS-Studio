import { motion, AnimatePresence } from "framer-motion"
import { Check, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { AiChangeOverlay, type AIChange } from "./AiChangeOverlay"

export interface InlineEditState {
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
}

interface EditorOverlaysProps {
  showAiOverlay: boolean
  pendingChange: AIChange | null
  onAcceptChange: () => void
  onRejectChange: () => void
  onTimeoutChange: () => void
  inlineEdit: InlineEditState
  onInlineEditChange: (partial: Partial<InlineEditState>) => void
  onInlineEditClose: () => void
  onApplyEdit: (editedCode: string) => void
  editorRef: React.MutableRefObject<any>
  monacoRef: React.MutableRefObject<any>
  activeFile: { path: string; content: string; name: string } | undefined
  language: string
  isInAiContext: boolean
  saved: boolean
  saveMethod: "tauri" | "download" | null
}

export function EditorOverlays({
  showAiOverlay,
  pendingChange,
  onAcceptChange,
  onRejectChange,
  onTimeoutChange,
  inlineEdit,
  onInlineEditChange,
  onInlineEditClose,
  onApplyEdit,
  editorRef,
  monacoRef,
  activeFile,
  language,
  isInAiContext,
  saved,
  saveMethod,
}: EditorOverlaysProps) {
  return (
    <>
      <AnimatePresence>
        {showAiOverlay && pendingChange && (
          <AiChangeOverlay
            change={pendingChange}
            onAccept={onAcceptChange}
            onReject={onRejectChange}
            onTimeout={onTimeoutChange}
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
    </>
  )
}
