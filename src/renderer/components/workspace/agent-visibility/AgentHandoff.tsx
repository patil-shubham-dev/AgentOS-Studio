import { useMemo } from "react"
import { useAgentStore } from "@/stores/agent-store"
import { getAgentLabel } from "./AgentActivityMapper"
import { cn } from "@/lib/utils"

const STEP_ICONS: Record<string, string> = {
  analyze: "◎",
  delegate: "→",
  execute: "▶",
  review: "◆",
  complete: "✓",
  error: "✗",
}

const STEP_COLORS: Record<string, string> = {
  analyze: "text-blue-400",
  delegate: "text-amber-400",
  execute: "text-emerald-400",
  review: "text-purple-400",
  complete: "text-emerald-400",
  error: "text-red-400",
}

export function AgentHandoff() {
  const orchestrationSteps = useAgentStore((s) => s.orchestrationSteps)

  const recentSteps = useMemo(() => {
    return orchestrationSteps.slice(-8)
  }, [orchestrationSteps])

  if (recentSteps.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-white/[0.04]">
        <span className="text-[10px] font-medium text-white/25 uppercase tracking-widest">Delegation</span>
      </div>
      <div className="flex flex-col gap-px px-1 py-1">
        {recentSteps.map((step, i) => (
          <div
            key={step.id}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px]"
          >
            <span className={cn("shrink-0", STEP_COLORS[step.type] ?? "text-white/25")}>
              {STEP_ICONS[step.type] ?? "○"}
            </span>
            <span className="text-white/30">
              {getAgentLabel(step.agent).replace(" Agent", "")}
            </span>
            <span className="text-white/20 mx-0.5">→</span>
            <span className="text-white/50 truncate max-w-[160px]">{step.description}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
