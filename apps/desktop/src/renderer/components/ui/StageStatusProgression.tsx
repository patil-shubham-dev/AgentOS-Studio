import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { DURATION, EASING } from "@/lib/motion"

export type StepStatus = "pending" | "running" | "complete" | "error"

export interface StageStep {
  id: string
  label: string
  status: StepStatus
}

interface StageStatusProgressionProps {
  steps: StageStep[]
  showProgressBar?: boolean
  className?: string
  accentVar?: string
  completeVar?: string
  errorVar?: string
}

const dotVariants = {
  pending: {},
  running: {
    scale: [1, 1.8],
    opacity: [0.3, 0],
  },
  complete: {},
  error: {},
}

const dotInnerVariants = {
  pending: {},
  running: {},
  complete: {
    pathLength: [0, 1],
  },
  error: {},
}

export function StageStatusProgression({
  steps,
  showProgressBar = true,
  className,
  accentVar = "--color-accent-brand",
  completeVar = "--color-accent-green",
  errorVar = "--color-accent-red",
}: StageStatusProgressionProps) {
  const runningCount = steps.filter((s) => s.status === "running").length
  const completeCount = steps.filter((s) => s.status === "complete").length
  const totalCount = steps.length
  const progressPercent = totalCount > 0 ? ((runningCount + completeCount) / totalCount) * 100 : 0

  return (
    <div className={cn("space-y-1.5", className)}>
      {steps.map((step, idx) => {
        const isRunning = step.status === "running"
        const isComplete = step.status === "complete"
        const isError = step.status === "error"
        const isPending = step.status === "pending"
        const accentColor = isError ? `var(${errorVar})` : isRunning ? `var(${accentVar})` : `var(${completeVar})`

        return (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: DURATION.normal, ease: EASING.default, delay: idx * 0.05 }}
            className="flex items-center gap-2.5"
          >
            {/* Status indicator dot */}
            <div className="relative flex h-[6px] w-[6px] items-center justify-center shrink-0">
              {isRunning && (
                <motion.span
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundColor: accentColor }}
                  animate={{ scale: [1, 1.8], opacity: [0.3, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              {isComplete ? (
                <svg viewBox="0 0 10 10" className="h-[6px] w-[6px] shrink-0" fill="none" stroke={`var(${completeVar})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <motion.path
                    d="M2 5l2 2 4-4"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.3, ease: EASING.default }}
                  />
                </svg>
              ) : isError ? (
                <svg viewBox="0 0 10 10" className="h-[6px] w-[6px] shrink-0" fill="none" stroke={`var(${errorVar})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 2l6 6M8 2l-6 6" />
                </svg>
              ) : (
                <span
                  className="h-[4px] w-[4px] rounded-full"
                  style={{
                    backgroundColor: isRunning ? accentColor : "var(--text-quaternary)",
                    opacity: isPending ? 0.5 : 1,
                  }}
                />
              )}
            </div>

            {/* Label */}
            <span
              className="text-[10px]"
              style={{
                color: isRunning || isError ? accentColor : isComplete ? "var(--text-tertiary)" : "var(--text-quaternary)",
                fontWeight: isRunning ? 500 : 400,
              }}
            >
              {step.label}
            </span>
          </motion.div>
        )
      })}

      {/* Progress bar */}
      {showProgressBar && progressPercent > 0 && (
        <div className="h-[2px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--border-subtle)" }}>
          <motion.div
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, var(${accentVar}), color-mix(in srgb, var(${accentVar}) 60%, var(${completeVar})))`,
            }}
            initial={{ width: "0%" }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: DURATION.normal, ease: EASING.default }}
          />
        </div>
      )}
    </div>
  )
}
