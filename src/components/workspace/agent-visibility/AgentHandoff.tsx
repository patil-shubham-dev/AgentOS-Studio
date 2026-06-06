import { useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAgentStore } from "@/stores/agent-store"
import { getAgentLabel } from "./AgentActivityMapper"
import { cn } from "@/lib/utils"

interface HandoffNode {
  role: string
  status: "pending" | "running" | "done" | "failed"
  description: string
  reason?: string
  timestamp: number
}

const NODE_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  pending: { icon: "○", color: "text-white/25 border-white/[0.08]", label: "Waiting" },
  running: { icon: "●", color: "text-amber-400 border-amber-500/30 bg-amber-500/[0.06]", label: "Active" },
  done: { icon: "✓", color: "text-emerald-400 border-emerald-500/25 bg-emerald-500/[0.06]", label: "Complete" },
  failed: { icon: "✗", color: "text-red-400 border-red-500/25 bg-red-500/[0.06]", label: "Failed" },
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
    <div className="px-3 pb-3">
      <div className="relative">
        <div className="absolute left-[15px] top-3 bottom-3 w-px bg-white/[0.06]" />
        <AnimatePresence mode="popLayout">
          {handoffs.map((node, i) => {
            const cfg = NODE_ICONS[node.status] ?? NODE_ICONS.pending
            return (
              <motion.div
                key={`${node.role}-${i}`}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.08 }}
                className="relative"
              >
                {/* Arrow connector */}
                {i > 0 && (
                  <div className="flex items-center pl-[13px] py-0.5">
                    <span className="text-[9px] text-white/[0.08]">┃</span>
                    <span className="text-[8px] text-white/[0.08] ml-3">↓ delegates to</span>
                  </div>
                )}

                <div className="flex items-start gap-3 py-1">
                  {/* Status node */}
                  <div className={cn(
                    "relative z-10 w-[30px] h-[30px] rounded-full border flex items-center justify-center shrink-0",
                    cfg.color,
                    node.status === "running" ? "animate-pulse" : "",
                  )}>
                    <span className="text-[11px]">{cfg.icon}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[12px] font-medium",
                        node.status === "done" ? "text-white/60" :
                        node.status === "running" ? "text-white/80" :
                        "text-white/40",
                      )}>
                        {getAgentLabel(node.role)}
                      </span>
                      <span className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded-full border font-medium",
                        cfg.color,
                      )}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-white/30 mt-0.5">
                      {node.description}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
