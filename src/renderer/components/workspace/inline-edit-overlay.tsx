import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
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
  viewMode: "edit" | "diff"
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

function generateUnifiedDiff(original: string, edited: string): string {
  if (original === edited) return ""
  const origLines = original.split("\n")
  const editLines = edited.split("\n")
  let startOld = 0, startNew = 0, endOld = origLines.length, endNew = editLines.length
  while (startOld < origLines.length && startNew < editLines.length && origLines[startOld] === editLines[startNew]) { startOld++; startNew++ }
  while (endOld > startOld && endNew > startNew && origLines[endOld - 1] === editLines[endNew - 1]) { endOld--; endNew-- }
  const oldCount = endOld - startOld
  const newCount = endNew - startNew
  if (oldCount === 0 && newCount === 0) return ""
  const lines = [`@@ -${startOld + 1},${oldCount} +${startNew + 1},${newCount} @@`]
  for (let i = startOld; i < endOld; i++) lines.push(`-${origLines[i]}`)
  for (let i = startNew; i < endNew; i++) lines.push(`+${editLines[i]}`)
  return lines.join("\n")
}

function StreamingProgress({ tokenCount, text }: { tokenCount: number; text: string }) {
  const lines = text.split("\n")
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
        <span className="text-[11px] text-blue-400 font-medium">Generating edit...</span>
        <span className="text-[9px] text-white/30 font-mono ml-auto">{tokenCount} chars</span>
      </div>
      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className="h-full bg-blue-500/50 rounded-full"
          animate={{ width: ["20%", "60%", "40%", "80%"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      {lines.length > 0 && (
        <div className="max-h-24 overflow-y-auto rounded-lg bg-white/[0.03] p-2 font-mono text-[10px] text-white/50 leading-relaxed">
          <span className="text-green-400/60">+ </span>
          {text}
          <span className="animate-pulse text-blue-400">▌</span>
        </div>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
        <span className="text-[11px] text-blue-400 font-medium">Generating edit...</span>
      </div>
      {[80, 60, 90, 45, 70].map((w, i) => (
        <motion.div
          key={i}
          className="h-3 rounded bg-white/[0.06]"
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
      className="h-3 rounded bg-white/[0.06]"
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
        <div className="rounded-xl border border-white/[0.08] bg-[#0c0c0d]/95 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[11px] font-medium text-white/70">Inline AI Edit</span>
              <span className="text-[9px] text-white/30 px-1.5 py-0.5 rounded bg-white/[0.04] font-mono">{language}</span>
            </div>
            <button
              onClick={() => { abortRef.current?.abort(); onClose() }}
              className="rounded p-1 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
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
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                <div className="flex items-center gap-2 text-red-400 text-[11px]">
                  <X className="h-3 w-3 shrink-0" />
                  <span>{state.error}</span>
                </div>
              </div>
              <button
                onClick={handleRegenerate}
                className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-white/50 hover:text-white/70 hover:bg-white/[0.04] transition-all"
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
              <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2">
                <button
                  onClick={handleRegenerate}
                  disabled={streaming}
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] transition-all",
                    streaming
                      ? "text-white/20 cursor-not-allowed"
                      : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]",
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
                      ? "border-white/[0.04] text-white/20 cursor-not-allowed"
                      : "border-white/[0.08] text-white/50 hover:bg-white/[0.04]",
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
                      ? "border-white/[0.04] text-white/20 cursor-not-allowed"
                      : "bg-green-500/20 border-green-500/30 text-green-400 hover:bg-green-500/30",
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
                  className="w-full bg-transparent text-[12px] text-white/80 placeholder:text-white/25 resize-none outline-none min-h-[60px] leading-relaxed"
                  rows={3}
                />
              </div>
              <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-2">
                <span className="text-[9px] text-white/20">
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
                        ? "bg-white/[0.06] border border-white/[0.08] text-white/50 hover:bg-white/[0.08]"
                        : "bg-white/[0.04] border border-white/[0.06] text-white/20 cursor-not-allowed",
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
                        ? "bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30"
                        : "bg-white/[0.04] border border-white/[0.06] text-white/20 cursor-not-allowed",
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
