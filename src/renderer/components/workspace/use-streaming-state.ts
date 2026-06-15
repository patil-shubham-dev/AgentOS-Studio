import { useMemo } from "react"
import { useTimelineStore } from "./timeline/timeline-store"

export interface StreamingState {
  isStreaming: boolean
  streamingFilePath: string | null
  streamProgress: number
  sessionTokens: number
  sessionChars: number
}

export function useStreamingState(): StreamingState {
  const streamingTexts = useTimelineStore((s) => s.streamingTexts)
  const streamingMetrics = useTimelineStore((s) => s.streamingMetrics)
  const agentSessions = useTimelineStore((s) => s.agentSessions)

  return useMemo(() => {
    const isStreaming = streamingTexts.size > 0
    const sessionTokens = streamingMetrics.tokensReceived
    const sessionChars = Array.from(streamingTexts.values()).reduce((acc, t) => acc + t.length, 0)

    let streamingFilePath: string | null = null
    for (const [, session] of agentSessions) {
      if (session.streamState === "streaming" && session.fileEdits.length > 0) {
        const lastEdit = session.fileEdits[session.fileEdits.length - 1]
        streamingFilePath = lastEdit.filePath
        break
      }
    }

    const streamProgress = isStreaming ? Math.min(sessionChars / 5000, 0.95) : 0

    return { isStreaming, streamingFilePath, streamProgress, sessionTokens, sessionChars }
  }, [streamingTexts, streamingMetrics, agentSessions])
}
