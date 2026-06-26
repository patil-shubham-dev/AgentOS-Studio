import { memo } from "react"
import { useTimelineStore } from "../timeline-store"
import { StableMarkdownRenderer } from "./StableMarkdownRenderer"

interface ResponseStreamProps {
  text: string
  isStreaming: boolean
}

export const ResponseStream = memo(function ResponseStream({ text, isStreaming }: ResponseStreamProps) {
  const streamingMetrics = useTimelineStore((s) => s.streamingMetrics)
  const tps = streamingMetrics.tokensPerSecond
  const latency = streamingMetrics.totalLatency > 0 ? performance.now() - streamingMetrics.totalLatency + streamingMetrics.firstTokenLatency : 0

  return (
    <StableMarkdownRenderer
      text={text}
      isStreaming={isStreaming}
      tokensPerSecond={tps}
      latency={latency}
    />
  )
})
