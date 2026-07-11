import { useMemo } from "react"
import { useShallow } from "zustand/shallow"
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
  const sessionTokens = useTimelineStore((s) => s.streamingMetrics.tokensReceived)
  const streamingFilePath = useTimelineStore(
    useShallow((s) => {
      for (const [, session] of s.agentSessions) {
        if (session.streamState === "streaming" && session.fileEdits.length > 0) {
          return session.fileEdits[session.fileEdits.length - 1].filePath ?? null
        }
      }
      return null
    })
  )

  return useMemo(() => {
    const isStreaming = streamingTexts.size > 0
    const sessionChars = Array.from(streamingTexts.values()).reduce((acc, t) => acc + t.length, 0)
    const streamProgress = isStreaming ? Math.min(sessionChars / 5000, 0.95) : 0
    return { isStreaming, streamingFilePath, streamProgress, sessionTokens, sessionChars }
  }, [streamingTexts, sessionTokens, streamingFilePath])
}
