import { useMemo } from "react"
import { useAgentStore, type AgentStatus } from "@/stores/agent-store"
import { getAgentLabel, getAgentStateIcon, getAgentStateLabel } from "./AgentActivityMapper"
import { cn } from "@/lib/utils"

const STATE_CONFIG: Record<string, { icon: string; color: string }> = {
  idle: { icon: "○", color: "text-white/20" },
  planning: { icon: "◎", color: "text-blue-400" },
  researching: { icon: "◇", color: "text-cyan-400" },
  browsing: { icon: "◇", color: "text-emerald-400" },
  editing: { icon: "●", color: "text-amber-400" },
  validating: { icon: "◆", color: "text-purple-400" },
  complete: { icon: "✓", color: "text-emerald-400" },
  failed: { icon: "✗", color: "text-red-400" },
}

const ROLE_PRIORITY = ["manager", "research", "browser", "coder", "qa", "memory", "design", "vision", "runtime"]
const STATE_ORDER: Record<string, number> = {
  editing: 0, validating: 1, browsing: 2, researching: 3,
  planning: 4, idle: 5, complete: 6, failed: 7,
}

function sortAgents(agents: AgentStatus[]): AgentStatus[] {
  return [...agents].sort((a, b) => {
    const aOrder = STATE_ORDER[a.state] ?? 99
    const bOrder = STATE_ORDER[b.state] ?? 99
    if (aOrder !== bOrder) return aOrder - bOrder
    return ROLE_PRIORITY.indexOf(a.role) - ROLE_PRIORITY.indexOf(b.role)
  })
}

export function AgentStatusPanel() {
  const agentStatuses = useAgentStore((s) => s.agentStatuses)
  const agentAssignments = useAgentStore((s) => s.agentAssignments)

  const orderedAgents = useMemo(() => {
    const agentMap = new Map<string, AgentStatus>()
    for (const [id, status] of Object.entries(agentStatuses)) {
      agentMap.set(id, { ...status })
    }
    for (const assignment of agentAssignments) {
      if (!agentMap.has(assignment.role)) {
        agentMap.set(assignment.role, {
          id: assignment.role,
          role: assignment.role,
          state: assignment.status === "active" ? "planning" : assignment.status === "completed" ? "complete" : "idle",
          currentTask: assignment.reason,
          lastUpdated: assignment.startedAt ?? Date.now(),
        })
      }
    }
    return sortAgents(Array.from(agentMap.values()))
  }, [agentStatuses, agentAssignments])

  const activeCount = orderedAgents.filter(
    (a) => a.state !== "idle" && a.state !== "complete" && a.state !== "failed"
  ).length

  if (orderedAgents.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-white/[0.04]">
        <span className="text-[10px] font-medium text-white/25 uppercase tracking-widest">Agents</span>
        {activeCount > 0 && (
          <span className="text-[9px] text-blue-400/50 ml-auto">{activeCount} active</span>
        )}
      </div>
      <div className="flex flex-col gap-px px-1 py-1">
        {orderedAgents.map((agent) => {
          const cfg = STATE_CONFIG[agent.state] ?? STATE_CONFIG.idle
          const isActive = agent.state !== "idle" && agent.state !== "complete" && agent.state !== "failed"
          return (
            <div
              key={agent.id}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-all",
                isActive ? "bg-white/[0.04]" : "text-white/20",
              )}
              title={`${getAgentLabel(agent.role)}: ${agent.currentTask || getAgentStateLabel(agent.state)}`}
            >
              <span className={cn("shrink-0 text-xs", isActive ? cfg.color : "")}>
                {cfg.icon}
              </span>
              <span className={cn("shrink-0", isActive ? "text-white/70" : "")}>
                {agent.role === "manager" ? "Manager" :
                 agent.role === "research" ? "Research" :
                 agent.role === "browser" ? "Browser" :
                 agent.role === "coder" ? "Coder" :
                 agent.role === "qa" ? "QA" :
                 agent.role === "memory" ? "Memory" :
                 agent.role === "design" ? "Design" :
                 getAgentLabel(agent.role).replace(" Agent", "")}
              </span>
              {isActive && agent.currentTask && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="text-white/50 truncate max-w-[120px]">{agent.currentTask}</span>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
