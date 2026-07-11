import { memo, useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ChevronRight, Brain, Clock } from "lucide-react"
import { useTimelineStore } from "../timeline/timeline-store"
import { useAppStore } from "@/stores/app-store"
import { ANIM } from "./chat-animations"
import { cn } from "@/lib/utils"

interface ReasoningBlockProps {
  content: string
  stepId: string
  isStreaming?: boolean
  reasoningTokens?: number
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

function ThinkingBeam() {
  return (
    <span className="flex gap-[3px] items-center ml-auto">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-[5px] w-[5px] rounded-full"
          style={{ backgroundColor: "var(--color-accent-brand)" }}
          animate={{ scale: [0.6, 1, 0.6], opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
        />
      ))}
    </span>
  )
}

function StreamingCursor() {
  return (
    <motion.span
      className="inline-block w-[2px] h-[14px] ml-[1px] align-text-bottom rounded-[1px]"
      style={{ backgroundColor: "var(--color-accent-brand)" }}
      animate={{ opacity: [1, 0] }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "steps(2)" }}
    />
  )
}

function RainbowIcon({ isStreaming }: { isStreaming: boolean }) {
  if (!isStreaming) {
    return (
      <div
        className="flex items-center justify-center h-[18px] w-[18px] shrink-0 rounded-md"
        style={{ backgroundColor: "var(--color-accent-brand-muted)" }}
      >
        <Brain className="h-[10px] w-[10px]" style={{ color: "var(--color-accent-brand-text)" }} />
      </div>
    )
  }

  return (
    <div className="thinking-rainbow-glow flex items-center justify-center h-[18px] w-[18px] shrink-0 rounded-md"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-accent-brand) 12%, transparent)" }}
    >
      <span className="relative flex h-[10px] w-[10px] items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: "var(--color-accent-brand)" }}
          animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
        />
        <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: "var(--color-accent-brand)" }} />
      </span>
    </div>
  )
}

export const ReasoningBlock = memo(function ReasoningBlock({
  content, stepId, isStreaming, reasoningTokens,
}: ReasoningBlockProps) {
  const isTimelineCollapsed = useTimelineStore((s) => s.collapsedSections.has(`reasoning-${stepId}`))
  const toggleCollapse = useTimelineStore((s) => s.toggleCollapse)
  const { visualizationMode, collapseBehavior, showTokenCount, showElapsedTime } = useAppStore((s) => s.thinkingConfig)

  const showRainbow = isStreaming && visualizationMode === "rainbow"
  const isClassic = visualizationMode === "classic"

  const isCollapsed = collapseBehavior === "always_collapsed"
    ? true
    : collapseBehavior === "always_expanded"
      ? false
      : isTimelineCollapsed
  const expanded = !isCollapsed

  const startTimeRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isStreaming) return
    startTimeRef.current = Date.now()
    setElapsed(0)
    const id = setInterval(() => setElapsed(Date.now() - startTimeRef.current), 200)
    return () => clearInterval(id)
  }, [isStreaming])

  const hasContent = content.length > 0
  const showLabel = isStreaming || hasContent
  if (!showLabel) return null

  const elapsedDisplay = showElapsedTime && isStreaming && elapsed > 2000 ? formatDuration(elapsed) : null
  const isFreshThinking = isStreaming && !hasContent

  return (
    <motion.div {...ANIM.slideDown} className="py-[2px]">
      <div className={cn("relative rounded-xl", showRainbow && !expanded && "thinking-rainbow-border")}>
        <button
          onClick={() => {
            if (collapseBehavior === "always_expanded" || collapseBehavior === "always_collapsed") return
            toggleCollapse(`reasoning-${stepId}`)
          }}
          className={cn(
            "relative flex items-center gap-2 w-full text-left px-2.5 py-[5px] rounded-xl transition-all duration-150 group",
            showRainbow && "thinking-rainbow-glow",
          )}
          style={{
            backgroundColor: expanded
              ? "color-mix(in srgb, var(--color-accent-brand) 8%, transparent)"
              : isStreaming
                ? "color-mix(in srgb, var(--color-accent-brand) 4%, transparent)"
                : "transparent",
          }}
        >
          {isClassic ? (
            <div
              className="flex items-center justify-center h-[18px] w-[18px] shrink-0 rounded-md"
              style={{ backgroundColor: isStreaming ? "var(--color-accent-brand-muted)" : "color-mix(in srgb, var(--color-accent-brand) 8%, transparent)" }}
            >
              <Brain className="h-[10px] w-[10px]" style={{ color: "var(--color-accent-brand-text)" }} />
            </div>
          ) : (
            <RainbowIcon isStreaming={isStreaming} />
          )}

          <span
            className="text-[11px] font-medium tracking-tight"
            style={{
              color: isStreaming
                ? "var(--color-accent-brand-text)"
                : expanded
                  ? "var(--text-secondary)"
                  : "var(--text-tertiary)",
            }}
          >
            {isFreshThinking
              ? "Thinking..."
              : isStreaming
                ? "Thinking..."
                : expanded
                  ? "Hide reasoning"
                  : "Show reasoning"}
          </span>

          {elapsedDisplay && (
            <span className="text-[9px] font-mono tabular-nums flex items-center gap-1" style={{ color: "var(--text-quaternary)" }}>
              <Clock className="h-[9px] w-[9px]" />
              {elapsedDisplay}
            </span>
          )}

          {isStreaming && !expanded && <ThinkingBeam />}

          {isStreaming && expanded && hasContent && (
            <span className="ml-auto text-[9px]" style={{ color: "var(--text-quaternary)" }}>
              <StreamingCursor />
            </span>
          )}

          {!isStreaming && collapseBehavior === "auto" && (
            <div className="ml-auto flex items-center gap-1.5">
              {showTokenCount && reasoningTokens ? (
                <span className="text-[8px] font-mono" style={{ color: "var(--text-quaternary)" }}>
                  {reasoningTokens.toLocaleString()} tok
                </span>
              ) : null}
              <span style={{ color: "var(--text-quaternary)" }}>
                {expanded ? (
                  <ChevronDown className="h-[10px] w-[10px]" />
                ) : (
                  <ChevronRight className="h-[10px] w-[10px]" />
                )}
              </span>
            </div>
          )}
        </button>
      </div>

      <AnimatePresence>
        {expanded && hasContent && (
          <motion.div
            {...ANIM.expandCollapse}
            className="overflow-hidden ml-[26px] mt-[5px]"
          >
            <div
              className="relative rounded-lg border overflow-hidden"
              style={{
                borderColor: isStreaming
                  ? "var(--color-accent-brand-border)"
                  : "var(--border-subtle)",
                backgroundColor: isStreaming
                  ? "color-mix(in srgb, var(--color-accent-brand) 3%, transparent)"
                  : "var(--surface-panel)",
              }}
            >
              {showRainbow && (
                <div
                  className="absolute left-0 top-0 bottom-0 w-[2px]"
                  style={{
                    background: "linear-gradient(to bottom, #ff6b6b, #ffd93d, #6bcb77, #4d96ff, #9b59b6, #ff6b6b)",
                    backgroundSize: "100% 300%",
                    animation: "rainbow-shimmer 3s ease-in-out infinite",
                  }}
                />
              )}

              <div className="px-3.5 py-2.5 overflow-x-auto">
                <div
                  className="whitespace-pre-wrap text-[12.5px] leading-[1.65]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {content}
                  {isStreaming && <StreamingCursor />}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
