import { useMemo, useRef, useEffect } from "react"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { getActivityForToolCall, getAgentLabel } from "./AgentActivityMapper"
import { cn } from "@/lib/utils"

const TYPE_ICONS: Record<string, string> = {
  searching: "◇", researching: "◇", browsing: "◇",
  reading: "◎", editing: "●", writing: "●",
  running: "▶", validating: "◆", analyzing: "◎",
  planning: "◎", finalizing: "►", initializing: "○",
  idle: "○", complete: "✓", failed: "✗",
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

export function ToolTimeline() {
  const agentSessions = useTimelineStore((s) => s.agentSessions)
  const bottomRef = useRef<HTMLDivElement>(null)

  const items = useMemo(() => {
    const result: Array<{
      id: string
      time: number
      agent: string
      icon: string
      color: string
      label: string
      detail?: string
    }> = []

    for (const session of agentSessions) {
      const agentLabel = getAgentLabel(session.role).replace(" Agent", "")
      for (const msg of session.messages) {
        for (const toolCall of (msg as any).toolCalls ?? []) {
          const activity = getActivityForToolCall(toolCall.toolName ?? toolCall.name, toolCall.args)
          result.push({
            id: `${session.id}-${toolCall.id ?? toolCall.toolName}-${result.length}`,
            time: (msg as any).timestamp ?? Date.now(),
            agent: agentLabel,
            icon: TYPE_ICONS[activity.type] ?? "○",
            color: TYPE_COLORS[activity.type] ?? "text-white/25",
            label: activity.label,
            detail: activity.detail,
          })
        }
      }
    }

    for (const session of agentSessions) {
      if (session.status === "running" || session.status === "complete" || session.status === "failed") {
        result.push({
          id: `session-${session.id}`,
          time: session.updatedAt ?? Date.now(),
          agent: getAgentLabel(session.role).replace(" Agent", ""),
          icon: session.status === "complete" ? "✓" : session.status === "failed" ? "✗" : "○",
          color: session.status === "complete" ? "text-emerald-400/70" : session.status === "failed" ? "text-red-400/70" : "text-white/20",
          label: session.status === "complete" ? "Completed" : session.status === "failed" ? "Failed" : "Processing",
        })
      }
    }

    result.sort((a, b) => b.time - a.time)
    return result.slice(0, 50)
  }, [agentSessions])

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
