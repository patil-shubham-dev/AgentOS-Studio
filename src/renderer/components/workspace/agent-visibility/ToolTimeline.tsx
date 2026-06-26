import { useMemo, useRef, useEffect } from "react"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { getActivityForToolCall, getAgentLabel } from "./AgentActivityMapper"
import type { AgentSession } from "@/components/workspace/timeline/timeline-store"
import { cn } from "@/lib/utils"

const TYPE_ICONS: Record<string, string> = {
  searching: "\u25C7", researching: "\u25C7", browsing: "\u25C7",
  reading: "\u25CE", editing: "\u25CF", writing: "\u25CF",
  running: "\u25B6", validating: "\u25C6", analyzing: "\u25CE",
  planning: "\u25CE", finalizing: "\u25BA", initializing: "\u25CB",
  idle: "\u25CB", complete: "\u2713", failed: "\u2717",
}
const TYPE_COLORS: Record<string, string> = {
  searching: "text-cyan-400/70", researching: "text-cyan-400/70",
  browsing: "text-emerald-400/70", reading: "text-blue-400/70",
  editing: "text-amber-400/70", writing: "text-amber-400/70",
  running: "text-emerald-400/70", validating: "text-purple-400/70",
  analyzing: "text-blue-400/70", planning: "text-blue-400/70",
  finalizing: "text-white/40", initializing: "text-white/20",
  idle: "text-white/20", complete: "text-emerald-400/70", failed: "text-red-400/70",
}

interface TimelineItem {
  id: string
  time: number
  agent: string
  icon: string
  color: string
  label: string
  detail?: string
}

export function buildTimelineItems(agentSessions: Map<string, AgentSession>): TimelineItem[] {
  const result: TimelineItem[] = []

  for (const [, session] of agentSessions) {
    if (!session) continue
    const roleName = session.roleName || session.roleId || ""
    const agentLabel = getAgentLabel(roleName).replace(" Agent", "")

    for (const toolCall of session.toolCalls ?? []) {
      if (!toolCall) continue
      const activity = getActivityForToolCall(toolCall.name, toolCall.args)
      result.push({
        id: `${session.stepId}-${toolCall.id}-${result.length}`,
        time: session.startedAt ?? Date.now(),
        agent: agentLabel,
        icon: TYPE_ICONS[activity.type] ?? "\u25CB",
        color: TYPE_COLORS[activity.type] ?? "text-white/25",
        label: activity.label,
        detail: activity.detail,
      })
    }
  }

  for (const [, session] of agentSessions) {
    if (!session) continue
    if (session.status === "running" || session.status === "complete" || session.status === "error") {
      const roleName = session.roleName || session.roleId || ""
      result.push({
        id: `session-${session.stepId}`,
        time: session.completedAt ?? session.startedAt ?? Date.now(),
        agent: getAgentLabel(roleName).replace(" Agent", ""),
        icon: session.status === "complete" ? "\u2713" : session.status === "error" ? "\u2717" : "\u25CB",
        color: session.status === "complete" ? "text-emerald-400/70" : session.status === "error" ? "text-red-400/70" : "text-white/20",
        label: session.status === "complete" ? "Completed" : session.status === "error" ? "Failed" : "Processing",
      })
    }
  }

  result.sort((a, b) => b.time - a.time)
  return result.slice(0, 50)
}

export function ToolTimeline() {
  const agentSessions = useTimelineStore((s) => s.agentSessions)
  const bottomRef = useRef<HTMLDivElement>(null)

  const items = useMemo(() => buildTimelineItems(agentSessions), [agentSessions])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [items.length])

  if (items.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-white/[0.04]">
        <span className="text-[10px] font-medium text-white/25 uppercase tracking-widest">Recent Activity</span>
      </div>
      <div className="flex flex-col gap-px px-1 py-1 max-h-[200px] overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] hover:bg-white/[0.03]"
            title={item.detail}
          >
            <span className={cn("shrink-0 text-[10px]", item.color)}>{item.icon}</span>
            <span className="text-white/30 shrink-0">{item.agent}</span>
            <span className="text-white/50 truncate max-w-[180px]">{item.label}</span>
            {item.detail && (
              <span className="text-white/25 truncate max-w-[100px] ml-auto">{item.detail}</span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
