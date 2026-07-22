import { memo, useCallback, useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, X, Terminal, Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/stores/workspace-store"

interface InlineAIEditProps {
  filePath: string
  language: string
  value: string
  cursorPosition: { line: number; ch: number }
  onChange: (value: string) => void
  onClose: () => void
}

export const InlineAIEdit = memo(function InlineAIEdit({
  filePath, language, value, cursorPosition, onChange, onClose,
}: InlineAIEditProps) {
  const [prompt, setPrompt] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootPath = useWorkspaceStore((s) => s.rootPath)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isProcessing) return
    setIsProcessing(true)
    try {
      const beforeCursor = value.slice(0, cursorPosition.ch)
      const afterCursor = value.slice(cursorPosition.ch)
      const full = `${beforeCursor}\n${prompt}\n${afterCursor}`
      setSuggestion(full)
    } catch {
      setSuggestion(null)
    } finally {
      setIsProcessing(false)
    }
  }, [prompt, value, cursorPosition, isProcessing])

  const handleAccept = useCallback(() => {
    if (suggestion) onChange(suggestion)
    onClose()
  }, [suggestion, onChange, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose()
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate()
  }, [onClose, handleGenerate])

  return (
    <div className="absolute z-50 left-4 right-4 bottom-2" style={{ pointerEvents: "auto" }}>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        className="rounded-xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--surface-panel)",
          borderColor: "var(--border-default)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <Sparkles className="h-3 w-3" style={{ color: "var(--color-accent-brand)" }} />
          <span className="text-[10px] font-medium" style={{ color: "var(--text-secondary)" }}>
            AI Edit — {filePath.split("/").pop()}
          </span>
          <button
            onClick={onClose}
            className="ml-auto p-0.5 rounded hover:bg-white/[0.06] transition-colors"
            style={{ color: "var(--text-quaternary)" }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        <div className="p-2">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the edit (e.g. 'add error handling', 'rename to...')"
              className="flex-1 bg-transparent text-[11px] outline-none px-2 py-1 rounded-md"
              style={{
                color: "var(--text-primary)",
                backgroundColor: "rgba(255,255,255,0.03)",
                border: "1px solid var(--border-subtle)",
              }}
            />
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isProcessing}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-all disabled:opacity-30"
              style={{
                backgroundColor: "var(--color-accent-brand)",
                color: "white",
                opacity: !prompt.trim() || isProcessing ? 0.3 : 1,
              }}
            >
              {isProcessing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Terminal className="h-3 w-3" />
              )}
              <span>{isProcessing ? "Thinking..." : "Generate"}</span>
            </button>
          </div>

          <AnimatePresence>
            {suggestion && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="mt-2 rounded-lg p-2"
                style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-medium" style={{ color: "var(--text-quaternary)" }}>Preview</span>
                  <button
                    onClick={handleAccept}
                    className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-medium transition-colors"
                    style={{
                      color: "var(--text-secondary)",
                      backgroundColor: "rgba(255,255,255,0.04)",
                    }}
                  >
                    <Check className="h-2.5 w-2.5" />
                    Accept
                  </button>
                </div>
                <pre className="text-[10px] font-mono leading-relaxed max-h-24 overflow-y-auto" style={{ color: "var(--text-secondary)" }}>
                  {suggestion.slice(0, 300)}
                  {suggestion.length > 300 && "..."}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
})
