import { motion } from "framer-motion"

export type ExecutionStage =
  | "idle"
  | "analyzing"
  | "planning"
  | "repository-analysis"
  | "editing"
  | "verifying"
  | "repairing"
  | "regression-check"
  | "completed"
  | "failed"

interface StageConfig {
  key: ExecutionStage
  label: string
  description: string
}

const STAGES: StageConfig[] = [
  { key: "analyzing", label: "Analyzing", description: "Analyzing request and building execution plan" },
  { key: "planning", label: "Planning", description: "Planning the approach and ordering dependencies" },
  { key: "repository-analysis", label: "Repository", description: "Analyzing repository structure and symbols" },
  { key: "editing", label: "Editing", description: "Applying changes to files" },
  { key: "verifying", label: "Verifying", description: "Running type checks, linting, and tests" },
  { key: "repairing", label: "Repair", description: "Fixing issues found during verification" },
  { key: "regression-check", label: "Regressions", description: "Checking for regressions in affected code" },
  { key: "completed", label: "Complete", description: "All checks passed" },
]

interface ExecutionStageBarProps {
  currentStage: ExecutionStage
  failed?: boolean
}

const STAGE_ORDER: Record<ExecutionStage, number> = {
  idle: -1,
  analyzing: 0,
  planning: 1,
  "repository-analysis": 2,
  editing: 3,
  verifying: 4,
  repairing: 5,
  "regression-check": 6,
  completed: 7,
  failed: 7,
}

export function ExecutionStageBar({ currentStage, failed }: ExecutionStageBarProps) {
  const currentIdx = STAGE_ORDER[currentStage] ?? -1

  return (
    <div className="flex items-center gap-1.5 p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
      {STAGES.map((stage, i) => {
        const isActive = i === currentIdx
        const isPast = i < currentIdx && !failed
        const isFailed = failed && i === currentIdx
        const isFuture = i > currentIdx || (failed && i > currentIdx)

        return (
          <div key={stage.key} className="flex items-center gap-1.5 flex-1 min-w-0">
            <div className="relative flex items-center gap-1.5 min-w-0">
              <motion.div
                animate={{
                  backgroundColor: isFailed ? "rgb(239 68 68)" : isActive ? "rgb(251 191 36)" : isPast ? "rgb(52 211 153)" : "rgb(255 255 255 / 0.1)",
                  scale: isActive ? 1.15 : 1,
                }}
                transition={{ duration: 0.3 }}
                className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? "shadow-[0_0_6px_rgba(251,191,36,0.5)]" : ""}`}
              />
              <motion.span
                animate={{
                  color: isActive ? "rgb(251 191 36)" : isPast ? "rgb(52 211 153)" : "rgb(255 255 255 / 0.35)",
                  fontWeight: isActive ? 600 : 400,
                }}
                className="text-[10px] truncate leading-none"
              >
                {stage.label}
              </motion.span>
              {isActive && !isFailed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute -right-1 top-0.5 w-1 h-1 rounded-full bg-amber-400"
                />
              )}
            </div>
            {i < STAGES.length - 1 && (
              <div className="flex-1 h-px mx-1" style={{ backgroundColor: isPast ? "rgb(52 211 153 / 0.5)" : "rgb(255 255 255 / 0.08)" }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
