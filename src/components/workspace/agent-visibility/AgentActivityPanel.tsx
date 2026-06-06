import { useState, useEffect, useRef } from "react"
import { useTimelineStore } from "@/components/workspace/timeline/timeline-store"
import { useAgentStore } from "@/stores/agent-store"
import { AgentStatusPanel } from "./AgentStatusPanel"
import { ToolTimeline } from "./ToolTimeline"
import { AgentHandoff } from "./AgentHandoff"
import { ChevronDown, ChevronRight, Activity, GitBranch, Users, PanelRight } from "lucide-react"
import { cn } from "@/lib/utils"

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen,
  children,
}: {
  title: string
  icon: typeof Activity
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)

  return (
    <div className="border-b border-white/[0.06]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-white/20 uppercase tracking-wider hover:text-white/40 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Icon className="h-3 w-3" />
        <span>{title}</span>
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  )
}

export function AgentActivityPanel() {
  const agentStatuses = useAgentStore((s) => s.agentStatuses)
  const orchestrationSteps = useAgentStore((s) => s.orchestrationSteps)
  const sessions = useTimelineStore((s) => s.agentSessions)
  const hasActivity = Object.keys(agentStatuses).length > 0

  const hasRunning = Object.values(agentStatuses).some(
    (a) => a.state !== "idle" && a.state !== "complete" && a.state !== "failed",
  )

  if (!hasActivity && orchestrationSteps.length === 0) return null

  return (
    <div className="border-b border-white/[0.06]">
      {/* Live agent status — always shown when active */}
      <AgentStatusPanel />

      {/* Delegation chain — shown when agents hand off */}
      {orchestrationSteps.length > 0 && (
        <CollapsibleSection title="Delegation" icon={Users} defaultOpen={true}>
          <AgentHandoff />
        </CollapsibleSection>
      )}

      {/* Tool activity timeline */}
      <CollapsibleSection title="Activity Log" icon={Activity} defaultOpen={hasRunning}>
        <ToolTimeline maxHeight={160} />
      </CollapsibleSection>
    </div>
  )
}
