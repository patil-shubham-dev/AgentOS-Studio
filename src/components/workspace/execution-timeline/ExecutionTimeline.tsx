import { useMemo, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useTimelineStore, type AgentSession } from "@/components/workspace/timeline/timeline-store"
import { useAgentStore, type AgentStatus } from "@/stores/agent-store"
import { getActivityForToolCall, mapPhaseToActivity, getAgentLabel, getAgentStateIcon } from "@/components/workspace/agent-visibility/AgentActivityMapper"
import { cn } from "@/lib/utils"

interface TimelineEntry {
  id: string
  order: number
  agentLabel: string
  label: string
  detail?: string
  icon: string
  isRunning: boolean
  timestamp: number
}

function buildTimeline(sessions: Map<string, AgentSession>, agentStatuses: Record<string, AgentStatus>): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  let order = 0

  const activeEntry = buildActiveAgentEntry(agentStatuses)
  if (activeEntry) entries.push({ ...activeEntry, order: order++, id: "active-agent-timeline-entry" })

  for (const [, session] of sessions) {
    const role = session.roleId ?? "assistant"
    const agentLabel = getAgentLabel(role)
    const baseTime = session.startedAt ?? Date.now()

    for (const tc of session.toolCalls) {
      const activity = getActivityForToolCall(tc.name)
      const isRunning = tc.status === "running"
      entries.push({
        id: `tool-${tc.id}-${order}-timeline-entry`,
        order: order++,
        agentLabel,
        label: activity.label,
        detail: activity.detail,
        icon: isRunning ? getAgentStateIcon("planning") : "✓",
        isRunning,
        timestamp: baseTime + order,
      })
    }

    for (const fe of session.fileEdits) {
      entries.push({
        id: `edit-${fe.path}-${order}-timeline-entry`,
        order: order++,
        agentLabel,
        label: "Edited file",
        detail: fe.path.split("/").pop() || fe.path,
        icon: getAgentStateIcon("editing"),
        isRunning: false,
        timestamp: baseTime + order,
      })
    }

    if (session.streamState === "completed") {
      entries.push({
        id: `complete-${session.stepId}-timeline-entry`,
        order: order++,
        agentLabel,
        label: "Preparing response",
        icon: getAgentStateIcon("complete"),
        isRunning: false,
        timestamp: baseTime + order,
      })
    }
  }

  entries.sort((a, b) => a.order - b.order)
  return entries.slice(-40)
}

function buildActiveAgentEntry(agentStatuses: Record<string, AgentStatus>): { agentLabel: string; label: string; detail?: string; icon: string; isRunning: boolean; timestamp: number } | null {
  const priority = ["manager", "research", "browser", "coder", "qa", "memory"]
  for (const role of priority) {
    const status = agentStatuses[role]
    if (status && status.state !== "idle" && status.state !== "complete" && status.state !== "failed") {
      return {
        agentLabel: getAgentLabel(role),
        label: status.currentTask || "Working",
        detail: status.lastAction,
        icon: getAgentStateIcon(status.state),
        isRunning: true,
        timestamp: Date.now(),
      }
    }
  }
  return null
}

export function ExecutionTimeline({ maxVisible = 40 }: { maxVisible?: number }) {
  const allSessions = useTimelineStore((s) => s.agentSessions)
  const agentStatuses = useAgentStore((s) => s.agentStatuses)
  const scrollRef = useRef<HTMLDivElement>(null)

  const entries = useMemo(() => buildTimeline(allSessions, agentStatuses), [allSessions, agentStatuses])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries.length])

  const visible = entries.slice(-maxVisible)
  const hasRunning = visible.some((e) => e.isRunning)

  if (visible.length === 0) return null

  return (
    <div className="bg-[#0c0c0d] border-b border-white/[0.06]">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-[10px] font-medium text-white/20 uppercase tracking-wider">Execution</span>
        {hasRunning && (
          <span className="flex items-center gap-1.5 text-[10px] text-amber-400/70">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Running
          </span>
        )}
        <span className="text-[10px] text-white/15 ml-auto">{visible.length} step{visible.length !== 1 ? "s" : ""}</span>
      </div>
      <div ref={scrollRef} className="overflow-y-auto max-h-[180px] scrollbar-thin">
        <div className="relative px-4 pb-2">
          <div className="absolute left-[17px] top-1 bottom-3 w-px bg-white/[0.06]" />
          <AnimatePresence mode="popLayout">
            {visible.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, delay: i === visible.length - 1 ? 0 : 0 }}
                className="relative flex items-start gap-3 py-1"
              >
                <div className={cn(
                  "relative z-10 w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 mt-0.5",
                  entry.isRunning ? "bg-amber-500/15" : "bg-white/[0.04]",
                )}>
                  <span className={cn(
                    "text-[9px]",
                    entry.isRunning ? "text-amber-400" : "text-emerald-400/60",
                  )}>{entry.icon}</span>
                </div>
                <div className="flex-1 min-w-0 pt-[2px]">
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "text-[11px] font-medium truncate",
                      entry.isRunning ? "text-white/70" : "text-white/50",
                    )}>
                      {entry.agentLabel}
                    </span>
                    <span className="text-[11px] text-white/30">·</span>
                    <span className={cn(
                      "text-[11px] truncate",
                      entry.isRunning ? "text-white/60" : "text-white/35",
                    )}>
                      {entry.label}
                    </span>
                  </div>
                  {entry.detail && (
                    <div className="text-[10px] text-white/20 truncate mt-0.5 font-mono">{entry.detail}</div>
                  )}
                </div>
                {entry.isRunning && (
                  <span className="flex gap-0.5 pt-2 pr-1">
                    <span className="w-0.5 h-0.5 rounded-full bg-amber-400/60 animate-pulse" style={{ animationDelay: "0ms" }} />
                    <span className="w-0.5 h-0.5 rounded-full bg-amber-400/60 animate-pulse" style={{ animationDelay: "200ms" }} />
                    <span className="w-0.5 h-0.5 rounded-full bg-amber-400/60 animate-pulse" style={{ animationDelay: "400ms" }} />
                  </span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
