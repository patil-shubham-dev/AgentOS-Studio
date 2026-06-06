import { useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAgentStore } from "@/stores/agent-store"
import { getAgentLabel, getAgentStateIcon } from "./AgentActivityMapper"

interface HandoffNode {
  role: string
  status: "pending" | "running" | "done" | "failed"
  description: string
  timestamp: number
}

export function AgentHandoff() {
  const orchestrationSteps = useAgentStore((s) => s.orchestrationSteps)

  const handoffs = useMemo(() => {
    const nodes: HandoffNode[] = []
    for (const step of orchestrationSteps) {
      if (step.type === "delegate" || step.type === "execute") {
        nodes.push({
          role: step.agent,
          status: step.status,
          description: step.description,
          timestamp: step.timestamp,
        })
      }
    }
    return nodes
  }, [orchestrationSteps])

  if (handoffs.length === 0) return null

  return (
    <div className="border-b border-white/[0.06]">
      <div className="px-3 py-1.5 text-[10px] font-medium text-white/20 uppercase tracking-wider">
        Delegation Chain
      </div>
      <div className="px-3 pb-2 space-y-0.5">
        <AnimatePresence mode="popLayout">
          {handoffs.map((node, i) => (
            <motion.div
              key={`${node.role}-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15, delay: i * 0.05 }}
            >
              <div className="flex items-center gap-2 py-1">
                {/* Arrow from previous */}
                {i > 0 && (
                  <div className="w-3 shrink-0 flex flex-col items-center text-white/10">
                    <span className="text-[9px] leading-none">|</span>
                    <span className="text-[9px] leading-none">v</span>
                  </div>
                )}
                {i === 0 && <div className="w-3 shrink-0" />}

                {/* Agent node */}
                <span className={`w-3.5 text-center text-[10px] shrink-0 ${
                  node.status === "running" ? "text-amber-400 animate-pulse" :
                  node.status === "done" ? "text-emerald-400" :
                  node.status === "failed" ? "text-red-400" :
                  "text-white/30"
                }`}>
                  {getAgentStateIcon(node.status === "done" ? "complete" : node.status === "failed" ? "failed" : node.status === "running" ? "planning" : "idle")}
                </span>
                <span className="text-[11px] text-white/50 min-w-[80px] shrink-0">
                  {getAgentLabel(node.role)}
                </span>
                <span className="text-[10px] text-white/30 truncate">
                  {node.description}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
