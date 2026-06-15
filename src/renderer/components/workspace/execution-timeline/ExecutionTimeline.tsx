import { useMemo } from "react"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { useAgentStore } from "@/stores/agent-store"
import { getAgentLabel } from "@/components/workspace/agent-visibility/AgentActivityMapper"

interface ExecutionTimelineProps {
  showDetails?: boolean
}

export function ExecutionTimeline({ showDetails = false }: ExecutionTimelineProps) {
  const allSessions = useTimelineStore((s) => s.agentSessions)
  const agentStatuses = useAgentStore((s) => s.agentStatuses)

  const summary = useMemo(() => {
    let filesEdited = 0
    let commandsRun = 0
    let toolCount = 0
    for (const [, session] of allSessions) {
      filesEdited += session.fileEdits.length
      for (const tc of session.toolCalls) {
        if (tc.status === "running") toolCount++
      }
    }
    commandsRun = toolCount

    const activeAgents: string[] = []
    if (showDetails) {
      const priority = ["manager", "research", "browser", "coder", "qa", "memory"]
      for (const role of priority) {
        const status = agentStatuses[role]
        if (status && status.state !== "idle" && status.state !== "complete" && status.state !== "failed") {
          activeAgents.push(getAgentLabel(role))
        }
      }
    }

    return { filesEdited, commandsRun, toolCount, activeAgents }
  }, [allSessions, agentStatuses, showDetails])

  const hasActivity = summary.filesEdited > 0 || summary.commandsRun > 0 || summary.activeAgents.length > 0
  if (!hasActivity) return null

  const parts: string[] = []
  if (summary.activeAgents.length > 0) {
    parts.push(`${summary.activeAgents.join(", ")} active`)
  }
  if (summary.filesEdited > 0) {
    parts.push(`${summary.filesEdited} file${summary.filesEdited > 1 ? "s" : ""} edited`)
  }

  return (
    <div className="bg-[#0c0c0d] border-b border-white/[0.06]">
      <div className="flex items-center gap-2 px-3 py-1">
        <span className="text-[10px] text-white/30">{parts.join(" · ")}</span>
      </div>
    </div>
  )
}
