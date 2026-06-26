import { AgentStatusPanel } from "./AgentStatusPanel"
import { AgentHandoff } from "./AgentHandoff"
import { ToolTimeline } from "./ToolTimeline"
import { ExecutionExperienceLayer } from "@/components/workspace/execution/ExecutionExperienceLayer"
import { TrustLayer } from "@/components/workspace/execution/TrustLayer"
import { VerificationResultsPanel } from "@/components/workspace/execution/VerificationResultsPanel"
import { UndoPanel } from "@/components/workspace/execution/UndoPanel"
import { ToolActivityFeed } from "@/components/workspace/execution/ToolActivityFeed"

interface AgentActivityPanelProps {
  showHandoff?: boolean
  showTimeline?: boolean
  showExperience?: boolean
  showTrust?: boolean
  showActivityFeed?: boolean
  showVerification?: boolean
  showUndo?: boolean
}

export function AgentActivityPanel({
  showHandoff = true,
  showTimeline = true,
  showExperience = true,
  showTrust = true,
  showActivityFeed = true,
  showVerification = true,
  showUndo = true,
}: AgentActivityPanelProps) {
  return (
    <div className="flex flex-col gap-0 text-white/80">
      {showExperience && <ExecutionExperienceLayer />}
      <AgentStatusPanel />
      {showHandoff && <AgentHandoff />}
      {showActivityFeed && <ToolActivityFeed />}
      {showTimeline && <ToolTimeline />}
      {showVerification && <VerificationResultsPanel />}
      {showUndo && <UndoPanel />}
      {showTrust && <TrustLayer />}
    </div>
  )
}
