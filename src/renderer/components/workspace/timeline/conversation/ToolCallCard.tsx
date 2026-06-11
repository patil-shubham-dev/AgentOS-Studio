import { memo, useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, XCircle, Loader2, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { mapToolToActivity } from "../../agent-visibility/AgentActivityMapper"
import type { ToolCallRecord } from "../types"

interface ToolCallCardProps {
  toolCall: ToolCallRecord
  index?: number
}

function getToolDetail(tc: ToolCallRecord): string | undefined {
  try {
    const args = JSON.parse(tc.args) as Record<string, unknown>
    if (args.path && typeof args.path === "string") return args.path
    if (args.url && typeof args.url === "string") return args.url
    if (args.pattern && typeof args.pattern === "string") return args.pattern
    if (args.command && typeof args.command === "string") {
      return args.command.length > 40 ? args.command.slice(0, 40) + "..." : args.command
    }
  } catch {}
  return undefined
}

const STATUS_COLORS = {
  pending: "border-white/[0.06] text-white/30",
  running: "border-amber-500/15 text-amber-400/70",
  complete: "border-emerald-500/15 text-emerald-400/70",
  error: "border-red-500/15 text-red-400/70",
}

const STATUS_BG = {
  pending: "",
  running: "bg-amber-500/[0.03]",
  complete: "bg-emerald-500/[0.02]",
  error: "bg-red-500/[0.03]",
}

const SPRING = { type: "spring" as const, stiffness: 400, damping: 30, mass: 0.8 }
const SPRING_HEAVY = { type: "spring" as const, stiffness: 350, damping: 25, mass: 1 }

const StatusIcon = memo(function StatusIcon({ status, name }: { status: ToolCallRecord["status"]; name: string }) {
  switch (status) {
    case "pending":
      return (
        <span className="relative flex h-4 w-4 items-center justify-center">
          <Clock className="h-3 w-3 text-white/30" />
        </span>
      )
    case "running":
      return (
        <span className="relative flex h-4 w-4 items-center justify-center">
          <span className="absolute inset-0 rounded-full animate-pulse-ring-soft" />
          <Loader2 className="h-3 w-3 text-amber-400/70 animate-spin" />
        </span>
      )
    case "complete":
      return (
        <span className="relative flex h-4 w-4 items-center justify-center">
          <span className="absolute inset-0 rounded-full animate-pulse-ring-green" />
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5 text-emerald-400/80"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M3 8.5L6.5 12L13 4.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            />
          </svg>
        </span>
      )
    case "error":
      return (
        <span className="relative flex h-4 w-4 items-center justify-center">
          <XCircle className="h-3.5 w-3.5 text-red-400/70" />
        </span>
      )
  }
})

export const ToolCallCard = memo(function ToolCallCard({ toolCall, index = 0 }: ToolCallCardProps) {
  const { status, name, result } = toolCall
  const activity = mapToolToActivity(name)
  const detail = getToolDetail(toolCall)
  const [expanded, setExpanded] = useState(status === "running")
  const hasResult = status === "complete" || status === "error"
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (status === "running") {
      setExpanded(true)
    } else if (hasResult) {
      autoCollapseTimer.current = setTimeout(() => setExpanded(false), 3000)
    }
    return () => {
      if (autoCollapseTimer.current) clearTimeout(autoCollapseTimer.current)
    }
  }, [status, hasResult])

  const toggleExpand = useCallback(() => {
    setExpanded((e) => !e)
  }, [])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, scale: 0.96 }}
      transition={{ ...SPRING, delay: index * 0.04 }}
      className="py-0.5"
    >
      <motion.button
        layout
        onClick={toggleExpand}
        className={cn(
          "flex items-center gap-2.5 w-full text-left",
          "rounded-xl border px-3 py-2",
          "transition-colors duration-200",
          STATUS_BG[status],
          STATUS_COLORS[status],
          hasResult && !expanded && "opacity-60 hover:opacity-100",
        )}
        whileHover={hasResult && !expanded ? { opacity: 1 } : undefined}
        whileTap={{ scale: 0.995 }}
      >
        <StatusIcon status={status} name={name} />

        <span className="text-[12px] font-medium text-white/75 flex-shrink-0 leading-tight">
          {activity.label}
        </span>

        {detail && (
          <span className="text-[11px] text-white/35 font-mono truncate flex-1 min-w-0 leading-tight">
            {detail}
          </span>
        )}

        {hasResult && !expanded && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
              "text-[9px] font-medium ml-auto flex-shrink-0",
              status === "complete" ? "text-emerald-400/50" : "text-red-400/50",
            )}
          >
            {status === "complete" ? "Done" : "Failed"}
          </motion.span>
        )}
      </motion.button>

      <AnimatePresence>
        {expanded && (hasResult && result) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_HEAVY}
            className="overflow-hidden"
          >
            <motion.div
              initial={{ y: -4 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="mx-3 mt-1.5 mb-2 px-3 py-2 rounded-lg bg-black/25 border border-white/[0.04]"
            >
              <pre className="text-[10px] font-mono text-white/35 whitespace-pre-wrap break-all leading-relaxed max-h-[120px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/[0.03] scrollbar-track-transparent">
                {result}
              </pre>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
