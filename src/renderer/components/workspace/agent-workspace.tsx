import { useMemo } from "react"
import { useAgentStore, type AgentStatus } from "@/stores/agent-store"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { getAgentLabel, getAgentStateIcon, formatDuration } from "@/components/workspace/agent-visibility/AgentActivityMapper"
import { cn } from "@/lib/utils"
import { Bot, Activity, CheckCircle2, XCircle, Clock, FileText, Loader2 } from "lucide-react"

const AGENT_ROLE_PRIORITY = ["manager", "research", "browser", "coder", "qa", "memory", "design", "vision", "runtime"]

const STATE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  idle: { icon: "○", color: "text-white/20", label: "Idle" },
  planning: { icon: "◎", color: "text-blue-400", label: "Planning" },
  researching: { icon: "◇", color: "text-cyan-400", label: "Researching" },
  browsing: { icon: "◇", color: "text-emerald-400", label: "Browsing" },
  editing: { icon: "●", color: "text-amber-400", label: "Editing" },
  validating: { icon: "◆", color: "text-purple-400", label: "Validating" },
  complete: { icon: "✓", color: "text-emerald-400", label: "Complete" },
  failed: { icon: "✗", color: "text-red-400", label: "Failed" },
}

export function AgentWorkspace() {
  const agentStatuses = useAgentStore((s) => s.agentStatuses)
  const agentAssignments = useAgentStore((s) => s.agentAssignments)
  const orchestrationSteps = useAgentStore((s) => s.orchestrationSteps)
  const allSessions = useTimelineStore((s) => s.agentSessions)

  const agents = useMemo(() => {
    const map = new Map<string, AgentStatus>()
    for (const [id, status] of Object.entries(agentStatuses)) {
      map.set(id, { ...status })
    }
    for (const assignment of agentAssignments) {
      const id = assignment.role
      if (!map.has(id)) {
        map.set(id, {
          id, role: id,
          state: assignment.status === "active" ? "planning" : assignment.status === "completed" ? "complete" : "idle",
          currentTask: assignment.reason,
          lastUpdated: assignment.startedAt ?? Date.now(),
        })
      }
    }
    return AGENT_ROLE_PRIORITY.map((r) => map.get(r)).filter(Boolean) as AgentStatus[]
  }, [agentStatuses, agentAssignments])

  const activeCount = agents.filter((a) => a.state !== "idle" && a.state !== "complete" && a.state !== "failed").length

  const sessionCount = allSessions.size

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]">
        <Bot className="h-4 w-4 text-cyan-400" />
        <span className="text-sm font-medium text-white/70">Agent Workspace</span>
        {activeCount > 0 && (
          <span className="flex items-center gap-1.5 text-[10px] text-cyan-400/60 ml-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            {activeCount} active
          </span>
        )}
        <span className="text-[10px] text-white/20">{sessionCount} sessions</span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Agent list */}
        <div className="p-3 space-y-2">
          {agents.length === 0 ? (
            <div className="text-center py-8">
              <Bot className="h-8 w-8 mx-auto mb-2 text-white/10" />
              <p className="text-xs text-white/20">No agents active</p>
              <p className="text-[10px] text-white/10 mt-1">Agents appear here when they start working</p>
            </div>
          ) : (
            agents.map((agent) => {
              const cfg = STATE_CONFIG[agent.state] ?? STATE_CONFIG.idle
              const isActive = agent.state !== "idle" && agent.state !== "complete" && agent.state !== "failed"

              const sessionEntries = Array.from(allSessions.entries()).filter(
                ([, s]) => s.roleId === agent.role
              )
              const session = sessionEntries[0]?.[1]
              const toolCount = session?.toolCalls.length ?? 0
              const editCount = session?.fileEdits.length ?? 0
              const terminalCount = session?.terminalOutputs.length ?? 0

              return (
                <div
                  key={agent.id}
                  className={cn(
                    "rounded-lg border p-3 transition-all",
                    isActive
                      ? "border-cyan-500/20 bg-cyan-500/[0.03]"
                      : agent.state === "complete"
                        ? "border-emerald-500/15 bg-emerald-500/[0.02]"
                        : agent.state === "failed"
                          ? "border-red-500/15 bg-red-500/[0.02]"
                          : "border-white/[0.06] bg-white/[0.02]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      isActive ? "bg-cyan-500/10" : "bg-white/[0.04]",
                    )}>
                      <span className={cn("text-sm", cfg.color, isActive ? "animate-pulse" : "")}>
                        {cfg.icon}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white/70">
                          {getAgentLabel(agent.role)}
                        </span>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border", cfg.color)}>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="text-xs text-white/40 mt-0.5">
                        {agent.currentTask || (agent.state === "idle" ? "Waiting for tasks" : agent.state)}
                      </div>
                      {agent.lastAction && (
                        <div className="text-[10px] text-white/20 mt-1 font-mono">
                          Last: {agent.lastAction}
                        </div>
                      )}
                      {agent.progress !== undefined && (
                        <div className="w-full h-1 rounded-full bg-white/[0.06] overflow-hidden mt-2">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              isActive ? "bg-cyan-500/50" : "bg-white/10",
                            )}
                            style={{ width: `${Math.min(agent.progress * 100, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {toolCount > 0 && (
                        <span className="text-[10px] text-white/25 flex items-center gap-0.5" title="Tool calls">
                          <Activity className="h-2.5 w-2.5" />
                          {toolCount}
                        </span>
                      )}
                      {editCount > 0 && (
                        <span className="text-[10px] text-amber-400/40 flex items-center gap-0.5" title="File edits">
                          <FileText className="h-2.5 w-2.5" />
                          {editCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Delegation history */}
        {orchestrationSteps.length > 0 && (
          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 px-1 py-2 text-[10px] font-medium text-white/20 uppercase tracking-wider">
              <Activity className="h-3 w-3" />
              Delegation History
            </div>
            <div className="space-y-1">
              {orchestrationSteps.map((step, i) => (
                <div key={step.id || i} className="flex items-center gap-2 px-2 py-1 text-[11px] text-white/40">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    step.status === "running" ? "bg-amber-400 animate-pulse" :
                    step.status === "done" ? "bg-emerald-400" :
                    step.status === "failed" ? "bg-red-400" : "bg-white/20",
                  )} />
                  <span className="font-medium text-white/50 shrink-0">{getAgentLabel(step.agent)}</span>
                  <span className="truncate">{step.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
