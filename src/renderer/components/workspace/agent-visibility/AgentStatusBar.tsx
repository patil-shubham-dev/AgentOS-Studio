import { useMemo } from "react"
import { useAgentStore, type AgentStatus } from "@/stores/agent-store"
import { getAgentLabel, getAgentStateIcon, getAgentStateLabel } from "./AgentActivityMapper"
import { cn } from "@/lib/utils"

const STATE_CONFIG: Record<string, { icon: string; color: string; bar: string }> = {
  idle: { icon: "○", color: "text-white/20", bar: "bg-white/[0.04]" },
  planning: { icon: "◎", color: "text-blue-400", bar: "bg-blue-500/30" },
  researching: { icon: "◇", color: "text-cyan-400", bar: "bg-cyan-500/30" },
  browsing: { icon: "◇", color: "text-emerald-400", bar: "bg-emerald-500/30" },
  editing: { icon: "●", color: "text-amber-400", bar: "bg-amber-500/30" },
  validating: { icon: "◆", color: "text-purple-400", bar: "bg-purple-500/30" },
  complete: { icon: "✓", color: "text-emerald-400", bar: "bg-emerald-500/30" },
  failed: { icon: "✗", color: "text-red-400", bar: "bg-red-500/30" },
}

const ROLE_PRIORITY = ["manager", "research", "browser", "coder", "qa", "memory", "design", "vision", "runtime"]

const STATE_ORDER: Record<string, number> = {
  editing: 0,
  validating: 1,
  browsing: 2,
  researching: 3,
  planning: 4,
  idle: 5,
  complete: 6,
  failed: 7,
}

function sortAgents(agents: AgentStatus[]): AgentStatus[] {
  return [...agents].sort((a, b) => {
    const aOrder = STATE_ORDER[a.state] ?? 99
    const bOrder = STATE_ORDER[b.state] ?? 99
    if (aOrder !== bOrder) return aOrder - bOrder
    return ROLE_PRIORITY.indexOf(a.role) - ROLE_PRIORITY.indexOf(b.role)
  })
}

export function AgentStatusBar() {
  const agentStatuses = useAgentStore((s) => s.agentStatuses)
  const agentAssignments = useAgentStore((s) => s.agentAssignments)

  const orderedAgents = useMemo(() => {
    const agentMap = new Map<string, AgentStatus>()

    for (const [id, status] of Object.entries(agentStatuses)) {
      agentMap.set(id, { ...status })
    }

    for (const assignment of agentAssignments) {
      const id = assignment.role
      if (!agentMap.has(id)) {
        agentMap.set(id, {
          id,
          role: id,
          state: assignment.status === "active" ? "planning" : assignment.status === "completed" ? "complete" : "idle",
          currentTask: assignment.reason,
          lastUpdated: assignment.startedAt ?? Date.now(),
        })
      }
    }

    return sortAgents(Array.from(agentMap.values()))
  }, [agentStatuses, agentAssignments])

  const activeCount = orderedAgents.filter((a) => a.state !== "idle" && a.state !== "complete" && a.state !== "failed").length

  if (orderedAgents.length === 0) return null

  return (
    <div className="border-b border-white/[0.06] bg-[#0c0c0d]">
      <div className="flex items-center gap-1.5 px-3 py-1">
        {orderedAgents.map((agent) => {
          const cfg = STATE_CONFIG[agent.state] ?? STATE_CONFIG.idle
          const isActive = agent.state !== "idle" && agent.state !== "complete" && agent.state !== "failed"

          return (
            <div
              key={agent.id}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-all",
                isActive
                  ? "bg-white/[0.06] border border-white/[0.08]"
                  : "text-white/20",
              )}
              title={`${getAgentLabel(agent.role)}: ${agent.currentTask || getAgentStateLabel(agent.state)}${agent.lastAction ? ` — ${agent.lastAction}` : ""}`}
            >
              <span className={cn("shrink-0", isActive ? cfg.color : "")}>
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
                  <span className="text-white/50 truncate max-w-[100px]">{agent.currentTask}</span>
                </>
              )}
            </div>
          )
        })}
        {activeCount > 0 && (
          <span className="text-[10px] text-blue-400/50 ml-auto shrink-0">
            {activeCount} active
          </span>
        )}
      </div>
    </div>
  )
}
