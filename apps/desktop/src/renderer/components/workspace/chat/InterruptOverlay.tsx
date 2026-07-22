import { memo, useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, X, CornerUpLeft, Loader2, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

interface InterruptOverlayProps {
  open: boolean
  onSendCorrection: (text: string) => void
  onDismiss: () => void
  isProcessing: boolean
}

export const InterruptOverlay = memo(function InterruptOverlay({
  open, onSendCorrection, onDismiss, isProcessing,
}: InterruptOverlayProps) {
  const [text, setText] = useState("")
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150)
    } else {
      setText("")
    }
  }, [open])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node) && open) {
        onDismiss()
      }
    }
    if (open) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, onDismiss])

  const handleSubmit = useCallback(() => {
    if (!text.trim()) return
    onSendCorrection(text.trim())
    setText("")
  }, [text, onSendCorrection])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === "Escape") {
      onDismiss()
    }
  }, [handleSubmit, onDismiss])

  if (!open) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      ref={overlayRef}
      className="rounded-xl border shadow-2xl overflow-hidden"
      style={{
        backgroundColor: "var(--surface-panel)",
        borderColor: "var(--border-default)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <CornerUpLeft className="h-3 w-3" style={{ color: "var(--color-accent-brand)" }} />
        <span className="text-[10px] font-medium" style={{ color: "var(--text-secondary)" }}>
          Interrupt & redirect
        </span>
        <span className="text-[8px]" style={{ color: "var(--text-quaternary)" }}>
          — correction will apply after current step
        </span>
        <button
          onClick={onDismiss}
          className="ml-auto p-0.5 rounded hover:bg-white/[0.06] transition-colors"
          style={{ color: "var(--text-quaternary)" }}
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="p-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your correction or new direction..."
          className="w-full bg-transparent text-[11px] outline-none resize-none px-2 py-1.5 leading-relaxed min-h-[52px]"
          style={{ color: "var(--text-primary)" }}
          rows={2}
        />
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <span className="text-[8px]" style={{ color: "var(--text-quaternary)" }}>
          {isProcessing ? "AI will adapt after current action" : "Send to adjust the response"}
        </span>
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[9px] font-medium transition-all disabled:opacity-30"
          style={{
            backgroundColor: text.trim() ? "var(--color-accent-brand)" : "rgba(255,255,255,0.04)",
            color: text.trim() ? "white" : "var(--text-quaternary)",
          }}
        >
          {isProcessing ? (
            <Zap className="h-2.5 w-2.5" />
          ) : (
            <Send className="h-2.5 w-2.5" />
          )}
          <span>{isProcessing ? "Inject" : "Send"}</span>
          <kbd className="text-[7px] opacity-60 ml-0.5">⌘↵</kbd>
        </button>
      </div>
    </motion.div>
  )
})
