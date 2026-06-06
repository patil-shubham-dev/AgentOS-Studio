import { useState } from "react"
import { useAgentStore } from "@/stores/agent-store"
import { AgentHandoff } from "./AgentHandoff"
import { ChevronDown, ChevronRight, Users } from "lucide-react"

export function AgentActivityPanel() {
  const orchestrationSteps = useAgentStore((s) => s.orchestrationSteps)
  const [open, setOpen] = useState(true)

  if (orchestrationSteps.length === 0) return null

  return (
    <div className="border-b border-white/[0.06]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-white/20 uppercase tracking-wider hover:text-white/40 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Users className="h-3 w-3" />
        <span>Delegation</span>
        <span className="text-[10px] text-white/15 font-normal normal-case ml-1">
          {orchestrationSteps.length} step{orchestrationSteps.length !== 1 ? "s" : ""}
        </span>
      </button>
      {open && (
        <div className="pb-1">
          <AgentHandoff />
        </div>
      )}
    </div>
  )
}
