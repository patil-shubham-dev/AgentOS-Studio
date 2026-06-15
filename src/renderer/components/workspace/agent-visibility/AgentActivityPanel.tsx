import { AgentStatusPanel } from "./AgentStatusPanel"
import { AgentHandoff } from "./AgentHandoff"
import { ToolTimeline } from "./ToolTimeline"

interface AgentActivityPanelProps {
  showHandoff?: boolean
  showTimeline?: boolean
  className?: string
}

export function AgentActivityPanel({ showHandoff = true, showTimeline = true }: AgentActivityPanelProps) {
  return (
    <div className="flex flex-col gap-0 text-white/80">
      <AgentStatusPanel />
      {showHandoff && <AgentHandoff />}
      {showTimeline && <ToolTimeline />}
    </div>
  )
}
