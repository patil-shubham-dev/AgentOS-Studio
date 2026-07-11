import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { generateUnifiedDiff } from "@/lib/diff-engine"
import { InlineDiffViewer } from "./inline-diff-viewer"
import { requestAIEdit } from "@/lib/ai-edit/ai-edit-service"
import { streamAIEdit, type StreamingEditState } from "@/lib/ai-edit/ai-edit-streaming-service"
import { Sparkles, X, Check, RefreshCw, Loader2, Code2 } from "lucide-react"

interface InlineEditState {
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

interface InlineEditOverlayProps {
  state: InlineEditState
  onStateChange: (state: Partial<InlineEditState>) => void
  onApplyEdit: (editedCode: string) => void
  onClose: () => void
  filePath: string
  language: string
  fullFileContent: string
}

function StreamingProgress({ tokenCount, text }: { tokenCount: number; text: string }) {
  const lines = text.split("\n")
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="h-3.5 w-3.5 text-[var(--accent-code)] animate-spin" />
        <span className="text-[11px] text-[var(--accent-code)] font-medium">Generating edit...</span>
        <span className="text-[9px] text-[var(--text-tertiary)] font-mono ml-auto">{tokenCount} chars</span>
      </div>
      <div className="h-1 rounded-full bg-[var(--border-default)] overflow-hidden">
        <motion.div
          className="h-full bg-[var(--accent-code)]/50 rounded-full"
          animate={{ width: ["20%", "60%", "40%", "80%"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      {lines.length > 0 && (
        <div className="max-h-24 overflow-y-auto rounded-lg bg-[var(--border-subtle)] p-2 font-mono text-[10px] text-[var(--text-secondary)] leading-relaxed">
          <span className="text-[var(--accent-diff)]/60">+ </span>
          {text}
          <span className="animate-pulse text-[var(--accent-code)]">▌</span>
        </div>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Loader2 className="h-3.5 w-3.5 text-[var(--accent-code)] animate-spin" />
        <span className="text-[11px] text-[var(--accent-code)] font-medium">Generating edit...</span>
      </div>
      {[80, 60, 90, 45, 70].map((w, i) => (
        <motion.div
          key={i}
          className="h-3 rounded bg-[var(--border-default)]"
          style={{ width: `${w}%` }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
        />
      ))}
    </div>
  )
}

function SkeletonBar({ width }: { width: string }) {
  return (
    <motion.div
      className="h-3 rounded bg-[var(--border-default)]"
      style={{ width }}
      animate={{ opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
    />
  )
}

export function InlineEditOverlay({
  state,
  onStateChange,
  onApplyEdit,
  onClose,
  filePath,
  language,
  fullFileContent,
}: InlineEditOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (state.active && !state.loading && !state.streaming && !state.generatedPatch) {
      textareaRef.current?.focus()
    }
  }, [state.active, state.loading, state.streaming, state.generatedPatch])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && state.active && !state.loading && !state.streaming) onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [state.active, state.loading, state.streaming, onClose])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node) && state.active && !state.loading && !state.streaming) onClose()
    }
    window.addEventListener("mousedown", handleClickOutside)
    return () => window.removeEventListener("mousedown", handleClickOutside)
  }, [state.active, state.loading, state.streaming, onClose])

  const handleGenerate = useCallback(async () => {
    if (!state.instruction.trim() || !state.selectedText) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    onStateChange({ loading: true, streaming: false, error: null, generatedPatch: null, editedCode: null, tokenCount: 0 })

    try {
      const result = await requestAIEdit(
        { filePath, language, selectedCode: state.selectedText, fullFileContent, instruction: state.instruction },
        controller.signal,
      )
      onStateChange({
        loading: false,
        generatedPatch: result.patch,
        editedCode: result.editedCode,
        viewMode: "diff",
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      onStateChange({ loading: false, error: err instanceof Error ? err.message : "Failed to generate edit" })
    }
  }, [state.instruction, state.selectedText, filePath, language, fullFileContent, onStateChange])

  const handleStreamingGenerate = useCallback(async () => {
    if (!state.instruction.trim() || !state.selectedText) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    onStateChange({ loading: false, streaming: true, error: null, generatedPatch: null, editedCode: null, tokenCount: 0 })

    let fullText = ""
    let lastPatch = ""

    await streamAIEdit(
      { filePath, language, selectedCode: state.selectedText, fullFileContent, instruction: state.instruction },
      (s: StreamingEditState) => {
        if (s.error) {
          onStateChange({ streaming: false, error: s.error })
          return
        }
        fullText = s.fullText
        const patch = generateUnifiedDiff(state.selectedText, fullText)
        if (patch !== lastPatch) {
          lastPatch = patch
          onStateChange({ editedCode: fullText, generatedPatch: patch, tokenCount: s.tokenCount, viewMode: "diff" })
        }
        if (s.done) {
          onStateChange({ streaming: false, editedCode: fullText, generatedPatch: patch, tokenCount: s.tokenCount })
        }
      },
      controller.signal,
    )
  }, [state.instruction, state.selectedText, filePath, language, fullFileContent, onStateChange])

  const handleRegenerate = useCallback(() => {
    onStateChange({ generatedPatch: null, editedCode: null })
    handleStreamingGenerate()
  }, [handleStreamingGenerate, onStateChange])

  const handleAccept = useCallback(() => {
    if (state.editedCode) { onApplyEdit(state.editedCode); onClose() }
  }, [state.editedCode, onApplyEdit, onClose])

  if (!state.active) return null

  const streaming = state.streaming
  const loading = state.loading

  return (
    <div className="absolute inset-0 z-40 flex items-start justify-center pt-20 pointer-events-none">
      <motion.div
        ref={overlayRef}
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="pointer-events-auto w-full max-w-lg mx-4"
      >
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)]/95 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[11px] font-medium text-[var(--text-primary)]">Inline AI Edit</span>
              <span className="text-[9px] text-[var(--text-tertiary)] px-1.5 py-0.5 rounded bg-[var(--border-subtle)] font-mono">{language}</span>
            </div>
            <button
              onClick={() => { abortRef.current?.abort(); onClose() }}
              className="rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-default)] transition-all"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Streaming progress */}
          {streaming && <StreamingProgress tokenCount={state.tokenCount} text={state.editedCode ?? ""} />}

          {/* Loading skeleton (non-streaming fallback) */}
          {loading && !streaming && <LoadingSkeleton />}

          {/* Error */}
          {state.error && !loading && !streaming && (
            <div className="p-3">
              <div className="rounded-lg bg-[var(--color-accent-red)]/10 border border-[var(--color-accent-red)]/20 px-3 py-2">
                <div className="flex items-center gap-2 text-[var(--color-accent-red)] text-[11px]">
                  <X className="h-3 w-3 shrink-0" />
                  <span>{state.error}</span>
                </div>
              </div>
              <button
                onClick={handleRegenerate}
                className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-default)] px-3 py-2 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition-all"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </div>
          )}

          {/* Diff view */}
          {(state.generatedPatch || streaming) && !loading && (
            <div className="max-h-80 overflow-hidden flex flex-col">
              <div className="flex-1 min-h-0">
                <InlineDiffViewer
                  original={state.selectedText}
                  edited={state.editedCode ?? ""}
                  patch={state.generatedPatch ?? ""}
                  onAcceptAll={handleAccept}
                  onRejectAll={onClose}
                  streaming={streaming}
                />
              </div>
              <div className="flex items-center gap-2 border-t border-[var(--border-default)] px-3 py-2">
                <button
                  onClick={handleRegenerate}
                  disabled={streaming}
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] transition-all",
                    streaming
                      ? "text-[var(--text-quaternary)] cursor-not-allowed"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]",
                  )}
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </button>
                <div className="flex-1" />
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onClose}
                  disabled={streaming}
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[10px] transition-all",
                    streaming
                      ? "border-[var(--border-subtle)] text-[var(--text-quaternary)] cursor-not-allowed"
                      : "border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]",
                  )}
                >
                  <X className="h-3 w-3" />
                  Reject
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAccept}
                  disabled={streaming}
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[10px] transition-all",
                    streaming
                      ? "border-[var(--border-subtle)] text-[var(--text-quaternary)] cursor-not-allowed"
                      : "bg-[var(--accent-diff)]/20 border-[var(--accent-diff)]/30 text-[var(--accent-diff)] hover:bg-[var(--accent-diff)]/30",
                  )}
                >
                  <Check className="h-3 w-3" />
                  Accept
                </motion.button>
              </div>
            </div>
          )}

          {/* Input area */}
          {!loading && !streaming && !state.generatedPatch && !state.error && (
            <>
              <div className="p-3">
                <textarea
                  ref={textareaRef}
                  value={state.instruction}
                  onChange={(e) => onStateChange({ instruction: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleStreamingGenerate() }
                  }}
                  placeholder="Describe the edit you want to make..."
                  className="w-full bg-transparent text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] resize-none outline-none min-h-[60px] leading-relaxed"
                  rows={3}
                />
              </div>
              <div className="flex items-center justify-between border-t border-[var(--border-default)] px-3 py-2">
                <span className="text-[9px] text-[var(--text-quaternary)]">
                  {state.selectedText.split("\n").length} line(s) selected
                </span>
                <div className="flex items-center gap-1.5">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleGenerate}
                    disabled={!state.instruction.trim()}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-all",
                      state.instruction.trim()
                        ? "bg-[var(--border-default)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--border-hover)]"
                        : "bg-[var(--border-subtle)] border border-[var(--border-default)] text-[var(--text-quaternary)] cursor-not-allowed",
                    )}
                    title="Generate without streaming"
                  >
                    <Code2 className="h-3 w-3" />
                    Generate
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleStreamingGenerate}
                    disabled={!state.instruction.trim()}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-all",
                      state.instruction.trim()
                        ? "bg-[var(--accent-design)]/20 border border-[var(--accent-design)]/30 text-[var(--accent-design)] hover:bg-[var(--accent-design)]/30"
                        : "bg-[var(--border-subtle)] border border-[var(--border-default)] text-[var(--text-quaternary)] cursor-not-allowed",
                    )}
                  >
                    <Sparkles className="h-3 w-3" />
                    Stream
                  </motion.button>
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
