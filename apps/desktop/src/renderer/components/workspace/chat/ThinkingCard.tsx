import { memo, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"

import { AgentSignal } from "@/components/ui/PanelIcons"
import { useReducedMotion } from "@/lib/reduced-motion"
import { cn } from "@/lib/utils"

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

interface ThinkingCardProps {
  isThinking: boolean
  reasoningText?: string
  startedAt?: number
  reasoningTokens?: number
  stepId?: string
  liveStepTitle?: string
}

export const ThinkingCard = memo(function ThinkingCard({
  isThinking,
  reasoningText = "",
  startedAt,
  reasoningTokens,
  stepId,
  liveStepTitle = "Analyzing context",
}: ThinkingCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const completedRef = useRef(false)
  const { reducedMotion } = useReducedMotion()

  const hasReasoning = reasoningText.length > 0
  const elapsedMs = startedAt ? Date.now() - startedAt : elapsed * 1000
  const showElapsed = isThinking && elapsedMs > 2000
  const showTokens = Boolean(reasoningTokens && reasoningTokens > 0 && !isThinking)
  const detailId = stepId ? `${stepId}-reasoning-detail` : undefined

  useEffect(() => {
    if (!isThinking && !completedRef.current) {
      completedRef.current = true
    }
    if (isThinking) {
      completedRef.current = false
    }
  }, [isThinking])

  useEffect(() => {
    if (!isThinking) return
    const id = setInterval(() => setElapsed((seconds) => seconds + 1), 1000)
    return () => clearInterval(id)
  }, [isThinking])

  if (!isThinking && !hasReasoning) return null

  return (
    <div
      className={cn("rounded-md border px-2.5 py-2", isThinking && "thinking-card-pulse")}
      style={{
        background: "linear-gradient(180deg, var(--surface-elevated), transparent)",
        borderColor: isThinking ? "var(--color-ai-border)" : "var(--border-subtle)",
      }}
    >
      <button
        type="button"
        onClick={() => hasReasoning && setExpanded((value) => !value)}
        aria-expanded={hasReasoning ? expanded : undefined}
        aria-controls={detailId}
        className={cn("group flex min-w-0 w-full select-none items-center gap-2 text-left")}
        style={{ cursor: hasReasoning ? "pointer" : "default" }}
      >
        {isThinking ? (
          <AgentSignal size={10} active />
        ) : (
          <span
            className="inline-flex items-center justify-center rounded-full"
            style={{ width: 10, height: 10, backgroundColor: "var(--color-success-muted)" }}
          >
            <svg
              viewBox="0 0 8 8"
              className="h-[6px] w-[6px]"
              fill="none"
              stroke="var(--color-success-text)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1.5 4 3 5.5 6.5 2" />
            </svg>
          </span>
        )}

        <span
          className="text-[11px] font-medium"
          style={{ color: isThinking ? "var(--color-ai)" : "var(--text-secondary)" }}
        >
          {isThinking ? "Thinking" : "Reasoned"}
        </span>

        <span className="min-w-0 flex-1 truncate text-[11px] font-normal" style={{ color: "var(--text-tertiary)" }}>
          {isThinking ? liveStepTitle : hasReasoning ? "Reasoning detail available" : "No reasoning detail captured"}
        </span>

        {showElapsed && (
          <span className="shrink-0 font-mono text-[10px] tabular-nums" style={{ color: "var(--text-quaternary)" }}>
            {formatDuration(elapsedMs)}
          </span>
        )}

        {showTokens && (
          <span className="shrink-0 font-mono text-[9px]" style={{ color: "var(--text-quaternary)" }}>
            {reasoningTokens!.toLocaleString()} tok
          </span>
        )}

        {hasReasoning && (
          <span
            className="flex items-center justify-center opacity-50 transition-opacity motion-safe:duration-120 group-hover:opacity-80"
            style={{ color: "var(--text-quaternary)", width: 14, height: 14 }}
          >
            <svg
              viewBox="0 0 10 10"
              className="h-[9px] w-[9px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: reducedMotion ? "none" : "transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <path d="m2 3.5 3 3 3-3" />
            </svg>
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && hasReasoning && (
          <motion.div
            id={detailId}
            key="reasoning-body"
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pl-[18px] pt-2">
              <div
                className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded border px-2.5 py-2 text-[12px] leading-relaxed font-[350]"
                data-reasoning-detail
                style={{
                  color: "var(--text-tertiary)",
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--surface-app)",
                }}
              >
                {reasoningText}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isThinking && !hasReasoning && (
        <div className="flex items-center gap-[3px] pl-[18px] pt-2">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-[3px] w-[3px] rounded-full motion-safe:animate-pulse"
              style={{
                backgroundColor: "var(--color-ai)",
                opacity: 0.4,
                animationDelay: `${index * 0.25}s`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
})
