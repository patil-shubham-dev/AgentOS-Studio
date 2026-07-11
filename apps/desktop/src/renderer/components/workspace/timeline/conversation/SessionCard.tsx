import { memo, useMemo } from "react"
import { motion } from "framer-motion"
import { CheckCircle2, XCircle, Loader2, MinusCircle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { getSpringConfig } from "@/lib/motion"
import type { AgentSession } from "../timeline-store"

type SessionStatus = "running" | "complete" | "error"

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: "border-amber-500/15",
  complete: "border-emerald-500/10",
  error: "border-red-500/12",
}

const STATUS_BORDER_ACCENT: Record<SessionStatus, string> = {
  running: "border-l-amber-500/30",
  complete: "border-l-emerald-500/20",
  error: "border-l-red-500/25",
}

interface SessionCardProps {
  session: AgentSession
  children: React.ReactNode
}

const ENTRANCE_SPRING = getSpringConfig("default")

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export const SessionCard = memo(function SessionCard({ session, children }: SessionCardProps) {
  const streamState = session.streamState
  const isRunning = streamState === "streaming" || streamState === "not_started" || streamState === "loading_slowly"
  const isComplete = streamState === "completed"
  const isError = streamState === "failed"
  const isCancelled = streamState === "cancelled"

  const status: SessionStatus = isError ? "error" : isComplete ? "complete" : "running"

  const duration = useMemo(() => {
    if (session.completedAt && session.startedAt) {
      return formatDuration(session.completedAt - session.startedAt)
    }
    return null
  }, [session.completedAt, session.startedAt])

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={ENTRANCE_SPRING}
      className={cn(
        "w-full rounded-xl border border-l-2",
        "bg-gradient-to-r from-white/[0.01] to-transparent",
        STATUS_COLORS[status],
        STATUS_BORDER_ACCENT[status],
      )}
    >
      {/* Session header — visible during/after execution */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-0.5 select-none">
        <StatusIcon streamState={streamState} />

        <span className="text-[11px] font-medium text-white/40 leading-tight">
          {session.roleName}
        </span>

        {session.modelName && (
          <span className="text-[9px] text-white/20 font-mono hidden sm:inline">
            {session.modelName}
          </span>
        )}

        {session.providerName && (
          <span className="text-[8px] text-white/12 hidden sm:inline">
            {session.providerName}
          </span>
        )}

        {isRunning && (
          <span className="text-[9px] text-amber-400/50 ml-1">In progress&hellip;</span>
        )}

        <div className="flex-1" />

        {(isComplete || isError || isCancelled) && duration && (
          <span className="flex items-center gap-1 text-[9px] font-mono text-white/15 tabular-nums">
            <Clock className="h-2.5 w-2.5" />
            {duration}
          </span>
        )}

        {isComplete && session.roleName && (
          <span className="text-[9px] text-emerald-400/40">
            Complete
          </span>
        )}
        {isError && (
          <span className="text-[9px] text-red-400/50">
            Failed
          </span>
        )}
        {isCancelled && (
          <span className="text-[9px] text-white/20">
            Cancelled
          </span>
        )}
      </div>

      {/* Content area */}
      <div className="px-3 pb-2.5 pt-0.5">
        {children}
      </div>
    </motion.div>
  )
})

function StatusIcon({ streamState }: { streamState: string }) {
  switch (streamState) {
    case "streaming":
    case "not_started":
      return (
        <span className="relative flex h-3.5 w-3.5 items-center justify-center">
          <span className="absolute inset-0 rounded-full animate-pulse-ring-soft" />
          <Loader2 className="h-2.5 w-2.5 text-amber-400/70 animate-spin" />
        </span>
      )
    case "loading_slowly":
      return (
        <span className="relative flex h-3.5 w-3.5 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-orange-400/20 animate-ping" />
          <svg className="h-2.5 w-2.5 text-orange-400/70 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" strokeDashoffset="18" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        </span>
      )
    case "completed":
      return (
        <span className="relative flex h-3.5 w-3.5 items-center justify-center">
          <span className="absolute inset-0 rounded-full animate-pulse-ring-green" />
          <svg
            viewBox="0 0 14 14"
            className="h-3 w-3 text-emerald-400/70"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M3 7L5.5 9.5L11 4"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            />
          </svg>
        </span>
      )
    case "failed":
      return (
        <span className="relative flex h-3.5 w-3.5 items-center justify-center">
          <XCircle className="h-3 w-3 text-red-400/70" />
        </span>
      )
    case "cancelled":
      return (
        <span className="relative flex h-3.5 w-3.5 items-center justify-center">
          <MinusCircle className="h-2.5 w-2.5 text-white/30" />
        </span>
      )
    default:
      return null
  }
}
