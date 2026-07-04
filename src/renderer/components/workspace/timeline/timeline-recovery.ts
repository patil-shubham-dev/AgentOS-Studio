import { useTimelineStore } from "./timeline-store"
import { useChangeSetStore } from "@/runtime/changeset/ChangeSetStore"

export interface RecoveryReport {
  interruptedSessions: number
  restoredChangeSets: number
  timestamp: number
}

export function recoverTimeline(): RecoveryReport {
  const pendingChangeSets = useChangeSetStore.getState().getPendingChangeSets()
  const sessions = useTimelineStore.getState().agentSessions
  let interruptedSessions = 0
  for (const [, session] of sessions) {
    if (session.streamState === "cancelled" && session.error?.includes("interrupted")) {
      interruptedSessions++
    }
  }

  const report: RecoveryReport = {
    interruptedSessions,
    restoredChangeSets: pendingChangeSets.length,
    timestamp: Date.now(),
  }

  console.log(
    `[TimelineRecovery] ${report.interruptedSessions} interrupted session(s), ${report.restoredChangeSets} ChangeSet(s) restored`
  )
  return report
}
