import { useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAgentStore, type AgentStatus } from "@/stores/agent-store"
import { getAgentLabel, getAgentStateIcon, formatDuration } from "./AgentActivityMapper"

const STATE_COLORS: Record<string, string> = {
  idle: "text-white/20",
  planning: "text-blue-400",
  researching: "text-cyan-400",
  browsing: "text-emerald-400",
  editing: "text-amber-400",
  validating: "text-purple-400",
  complete: "text-green-400",
  failed: "text-red-400",
}

function AgentRow({ agent }: { agent: AgentStatus }) {
  const icon = getAgentStateIcon(agent.state)
  const color = STATE_COLORS[agent.state] ?? "text-white/20"
  const isActive = agent.state !== "idle" && agent.state !== "complete" && agent.state !== "failed"

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 4 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-2 px-3 py-1.5 text-xs"
    >
      <span className={`w-4 text-center shrink-0 ${color} ${isActive ? "animate-pulse" : ""}`}>
        {icon}
      </span>
      <span className="text-white/60 min-w-[90px] shrink-0">{getAgentLabel(agent.role)}</span>
      <span className={`flex-1 truncate ${color}`}>{agent.currentTask || (agent.state === "idle" ? "Idle" : agent.state)}</span>
      {agent.progress !== undefined && (
        <div className="w-12 h-1 rounded-full bg-white/[0.06] overflow-hidden shrink-0">
          <div
            className={`h-full rounded-full transition-all duration-300 ${isActive ? "bg-blue-400/60" : "bg-white/10"}`}
            style={{ width: `${Math.min(agent.progress * 100, 100)}%` }}
          />
        </div>
      )}
    </motion.div>
  )
}

interface AgentStatusPanelProps {
  compact?: boolean
}

export function AgentStatusPanel({ compact }: AgentStatusPanelProps) {
  const agentStatuses = useAgentStore((s) => s.agentStatuses)
  const agentAssignments = useAgentStore((s) => s.agentAssignments)

  // Collect active agents from both statuses and assignments, ordered by role priority
  const orderedAgents = useMemo(() => {
    const roleOrder = ["manager", "research", "browser", "coder", "qa", "memory", "runtime", "design", "vision"]
    const agentMap = new Map<string, AgentStatus>()

    for (const [id, status] of Object.entries(agentStatuses)) {
      agentMap.set(id, status)
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
      } else {
        const existing = agentMap.get(id)!
        if (existing.state === "idle" && assignment.status === "active") {
          agentMap.set(id, { ...existing, state: "planning" })
        }
      }
    }

    return roleOrder
      .map((role) => agentMap.get(role))
      .filter((a): a is AgentStatus => !!a)
  }, [agentStatuses, agentAssignments])

  const activeCount = orderedAgents.filter((a) => a.state !== "idle" && a.state !== "complete" && a.state !== "failed").length

  if (orderedAgents.length === 0) return null

  return (
    <div className="border-b border-white/[0.06]">
      <div className="px-3 py-1.5 text-[10px] font-medium text-white/20 uppercase tracking-wider flex items-center gap-2">
        <span>Agent Activity</span>
        {activeCount > 0 && (
          <span className="text-[10px] text-blue-400/60 font-normal normal-case">
            {activeCount} active
          </span>
        )}
      </div>
      <AnimatePresence mode="popLayout">
        {orderedAgents.map((agent) => (
          <AgentRow key={agent.id} agent={agent} />
        ))}
      </AnimatePresence>
    </div>
  )
}
