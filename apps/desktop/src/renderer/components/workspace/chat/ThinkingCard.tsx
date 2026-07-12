import { memo, useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { DURATION, EASING } from "@/lib/motion"

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

const STEPS = [
  { id: "understanding", label: "Understanding request" },
  { id: "planning", label: "Planning approach" },
  { id: "searching", label: "Searching project files" },
  { id: "executing", label: "Executing tools" },
  { id: "writing", label: "Writing response" },
] as const

type StepId = (typeof STEPS)[number]["id"]

function activityToStepIndex(activity?: string): number {
  if (!activity) return -1
  const a = activity.toLowerCase()
  if (a.includes("understand") || a.includes("read") || a.includes("analy")) return 0
  if (a.includes("plan") || a.includes("design") || a.includes("architect")) return 1
  if (a.includes("search") || a.includes("grep") || a.includes("find") || a.includes("glob")) return 2
  if (a.includes("execut") || a.includes("run") || a.includes("edit") || a.includes("write") || a.includes("creat") || a.includes("termin") || a.includes("bash") || a.includes("browser")) return 3
  if (a.includes("response") || a.includes("summar") || a.includes("result")) return 4
  return -1
}

interface ThinkingCardProps {
  isThinking: boolean
  reasoningText?: string
  activityLabel?: string
  startedAt?: number
}

export const ThinkingCard = memo(function ThinkingCard({
  isThinking,
  reasoningText,
  activityLabel,
  startedAt,
}: ThinkingCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const completedRef = useRef(false)

  const hasReasoning = (reasoningText?.length ?? 0) > 0
  const activeStepIndex = activityToStepIndex(activityLabel)

  // Auto-collapse 1.5s after completing
  useEffect(() => {
    if (!isThinking && !completedRef.current) {
      completedRef.current = true
      const timer = setTimeout(() => setExpanded(false), 1500)
      return () => clearTimeout(timer)
    }
    if (isThinking) {
      completedRef.current = false
    }
  }, [isThinking])

  // Live timer
  useEffect(() => {
    if (!isThinking) return
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [isThinking])

  if (!isThinking && !hasReasoning) return null

  const showElapsed = elapsed >= 3 && isThinking
  const progressPercent = isThinking
    ? Math.min(((activeStepIndex + 1) / STEPS.length) * 100, 90)
    : 100

  // Collapsed state: single line with gentle pulse
  if (!expanded) {
    return (
      <motion.button
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION.normal, ease: EASING.default }}
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 w-full mb-3 group cursor-pointer"
      >
        <div className="flex items-center justify-center h-[18px] w-[18px] rounded-lg shrink-0" style={{ backgroundColor: "var(--color-accent-brand-muted)" }}>
          {isThinking ? (
            <span className="relative flex h-[6px] w-[6px] items-center justify-center">
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: "var(--color-accent-brand-text)" }}
                animate={{ scale: [1, 1.8], opacity: [0.3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
              />
              <span className="h-[4px] w-[4px] rounded-full" style={{ backgroundColor: "var(--color-accent-brand-text)" }} />
            </span>
          ) : (
            <svg viewBox="0 0 10 10" className="h-[5px] w-[5px]" fill="none" style={{ stroke: "var(--color-success-text)", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }}>
              <path d="M2 5l2 2 4-4" />
            </svg>
          )}
        </div>
        <span
          className="text-[11px] font-medium tracking-tight transition-colors duration-300"
          style={{
            color: isThinking
              ? "var(--color-accent-brand-text)"
              : "var(--color-success-text)",
            opacity: isThinking ? 0.6 : 0.5,
          }}
        >
          {isThinking ? "Thinking..." : "Thinking"}
          {showElapsed && (
            <span className="ml-2 text-[9px] font-mono tabular-nums" style={{ color: "var(--text-quaternary)" }}>{formatDuration(elapsed * 1000)}</span>
          )}
        </span>
        {!isThinking && (
          <span className="flex items-center gap-1.5 ml-auto">
            <span className="text-[8px] font-medium" style={{ color: "var(--color-success-text)", opacity: 0.4 }}>Done</span>
          </span>
        )}
      </motion.button>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: DURATION.card, ease: EASING.default }}
      className="mb-3"
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded(false)}
        className="flex items-center gap-2.5 w-full text-left group cursor-pointer"
      >
        <div
          className="flex items-center justify-center h-[22px] w-[22px] rounded-lg shrink-0 transition-all duration-300"
          style={{
            backgroundColor: isThinking
              ? "var(--color-accent-brand-muted)"
              : "var(--color-success-muted)",
          }}
        >
          {isThinking ? (
            <motion.div
              className="relative flex h-[10px] w-[10px] items-center justify-center"
              animate={{ scale: [1, 0.85, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: "var(--color-accent-brand-text)" }}
                animate={{ scale: [1, 2], opacity: [0.3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
              />
              <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: "var(--color-accent-brand-text)" }} />
            </motion.div>
          ) : (
            <svg viewBox="0 0 12 12" className="h-[10px] w-[10px]" fill="none" style={{ stroke: "var(--color-success-text)", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }}>
              <motion.path
                d="M2.5 6L5 8.5L9.5 3"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, ease: EASING.default }}
              />
            </svg>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-semibold tracking-tight transition-colors duration-300"
            style={{
              color: isThinking
                ? "var(--color-accent-brand-text)"
                : "var(--color-success-text)",
              opacity: isThinking ? 0.8 : 0.7,
            }}
          >
            {isThinking ? "Thinking" : "Thinking"}
          </span>
          {!isThinking && (
            <span className="text-[9px]" style={{ color: "var(--color-success-text)", opacity: 0.5 }}>✓</span>
          )}
          {showElapsed && (
            <span className="text-[9px] font-mono tabular-nums" style={{ color: "var(--text-quaternary)" }}>{formatDuration(elapsed * 1000)}</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {isThinking && (
            <span className="flex gap-[2px]">
              <motion.span
                className="h-[4px] w-[4px] rounded-full"
                style={{ backgroundColor: "var(--color-accent-brand-text)" }}
                animate={{ scale: [0.6, 1, 0.6], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0, ease: "easeInOut" }}
              />
              <motion.span
                className="h-[4px] w-[4px] rounded-full"
                style={{ backgroundColor: "var(--color-accent-brand-text)" }}
                animate={{ scale: [0.6, 1, 0.6], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.2, ease: "easeInOut" }}
              />
              <motion.span
                className="h-[4px] w-[4px] rounded-full"
                style={{ backgroundColor: "var(--color-accent-brand-text)" }}
                animate={{ scale: [0.6, 1, 0.6], opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.4, ease: "easeInOut" }}
              />
            </span>
          )}
          <motion.svg
            viewBox="0 0 10 10"
            className="h-[10px] w-[10px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            style={{ color: "var(--text-quaternary)" }}
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: DURATION.fast, ease: EASING.default }}
          >
            <path d="M2 3.5l3 3 3-3" />
          </motion.svg>
        </div>
      </button>

      {/* Step timeline */}
      <div className="mt-2.5 ml-[31px]">
        <div className="space-y-1.5">
          {STEPS.map((step, idx) => {
            const isActive = idx === activeStepIndex && isThinking
            const isComplete = idx < activeStepIndex || (!isThinking && idx < STEPS.length)
            const isPending = idx > activeStepIndex

            if (isPending && isThinking) {
              return (
                <div key={step.id} className="flex items-center gap-2.5">
                  <span className="h-[6px] w-[6px] rounded-full shrink-0" style={{ backgroundColor: "var(--text-quaternary)" }} />
                  <span className="text-[10px]" style={{ color: "var(--text-quaternary)" }}>{step.label}</span>
                </div>
              )
            }

            if (isActive) {
              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: DURATION.normal, ease: EASING.default }}
                  className="flex items-center gap-2.5"
                >
                  <span className="relative flex h-[6px] w-[6px] items-center justify-center shrink-0">
                    <motion.span
                      className="absolute inset-0 rounded-full"
                      style={{ backgroundColor: "var(--color-accent-brand)" }}
                      animate={{ scale: [1, 1.8], opacity: [0.3, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                    />
                    <span className="h-[4px] w-[4px] rounded-full" style={{ backgroundColor: "var(--color-accent-brand)" }} />
                  </span>
                  <span className="text-[10px] font-medium" style={{ color: "var(--color-accent-brand)" }}>{step.label}</span>
                </motion.div>
              )
            }

            if (isComplete) {
              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: DURATION.normal, ease: EASING.default }}
                  className="flex items-center gap-2.5"
                >
                  <svg viewBox="0 0 10 10" className="h-[6px] w-[6px] shrink-0" fill="none" style={{ stroke: "var(--color-success-text)", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }}>
                    <motion.path
                      d="M2 5l2 2 4-4"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.3, ease: EASING.default }}
                    />
                  </svg>
                  <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{step.label}</span>
                </motion.div>
              )
            }

            // Pending (completed thinking, unsed steps)
            return (
              <div key={step.id} className="flex items-center gap-2.5">
                <svg viewBox="0 0 10 10" className="h-[6px] w-[6px] shrink-0" fill="none" style={{ stroke: "var(--color-success-text)", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="M2 5l2 2 4-4" />
                </svg>
                <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{step.label}</span>
              </div>
            )
          })}
        </div>

        {/* Progress bar */}
        <div className="mt-2.5 h-[2px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--border-subtle)" }}>
          <motion.div
            className="h-full rounded-full"
            style={{
              background: isThinking
                ? "linear-gradient(90deg, var(--color-accent-brand), rgba(167,139,250,0.6))"
                : "var(--color-success-text)",
              opacity: isThinking ? 1 : 0.5,
            }}
            initial={{ width: "0%" }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: DURATION.normal, ease: EASING.default }}
          />
        </div>
      </div>

      {/* Expanded reasoning content */}
      <AnimatePresence>
        {hasReasoning && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DURATION.normal, ease: EASING.default }}
            className="overflow-hidden"
          >
            <div
              className="relative rounded-lg border mt-2 ml-[31px] overflow-hidden"
              style={{
                backgroundColor: "var(--color-accent-brand-muted)",
                borderColor: "var(--color-accent-brand-border)",
              }}
            >
              <div
                className="absolute left-0 top-0 bottom-0 w-[2px]"
                style={{ backgroundColor: isThinking ? "var(--color-accent-brand-border)" : "var(--color-success-border)" }}
              />
              <div className="px-3.5 py-2.5 overflow-x-auto">
                <div
                  className="whitespace-pre-wrap text-[12px] leading-relaxed font-[350]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {reasoningText}
                  {isThinking && (
                    <span
                      className="inline-block w-[2px] h-[13px] ml-[1px] rounded-[1px] animate-pulse align-text-bottom"
                      style={{ backgroundColor: "var(--color-accent-brand)" }}
                    />
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
