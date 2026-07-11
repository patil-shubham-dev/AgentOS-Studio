import { memo } from "react"
import { useTimelineStore } from "../timeline-store"
import { StableMarkdownRenderer } from "./StableMarkdownRenderer"

interface ResponseStreamProps {
  text?: string
  stepId?: string
  isStreaming: boolean
}

export const ResponseStream = memo(function ResponseStream({ text, stepId, isStreaming }: ResponseStreamProps) {
  const liveText = useTimelineStore((s) => stepId ? s.streamingTexts.get(stepId) : undefined)
  const tps = useTimelineStore((s) => s.streamingMetrics.tokensPerSecond)
  const totalLatency = useTimelineStore((s) => s.streamingMetrics.totalLatency)
  const firstTokenLatency = useTimelineStore((s) => s.streamingMetrics.firstTokenLatency)
  const displayText = liveText ?? text ?? ""
  const latency = totalLatency > 0 ? performance.now() - totalLatency + firstTokenLatency : 0

  return (
    <StableMarkdownRenderer
      text={displayText}
      isStreaming={isStreaming}
      tokensPerSecond={tps}
      latency={latency}
    />
  )
})
