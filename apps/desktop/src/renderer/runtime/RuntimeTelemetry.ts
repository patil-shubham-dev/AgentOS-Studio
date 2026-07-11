import { emitTelemetry } from "@/lib/telemetry"
import { recordAgentExecution, recordToolExecution } from "@/lib/domain-telemetry"

export interface RuntimeTelemetryPoint {
  stage: string
  executionId: string
  timestamp: number
  durationMs?: number
  error?: string
  metadata?: Record<string, unknown>
}

let telemetryBuffer: RuntimeTelemetryPoint[] = []
const MAX_BUFFER = 200

export function recordTelemetry(point: RuntimeTelemetryPoint): void {
  telemetryBuffer.push(point)
  if (telemetryBuffer.length > MAX_BUFFER) {
    telemetryBuffer = telemetryBuffer.slice(-MAX_BUFFER)
  }
  emitTelemetry({
    type: "execution_complete",
    timestamp: point.timestamp,
    error: point.error,
    metadata: {
      stage: point.stage,
      executionId: point.executionId,
      durationMs: point.durationMs,
      ...point.metadata,
    },
  })
}

export function flushTelemetryBuffer(): RuntimeTelemetryPoint[] {
  const buf = telemetryBuffer.slice()
  telemetryBuffer = []
  return buf
}

export function getTelemetryBuffer(): readonly RuntimeTelemetryPoint[] {
  return telemetryBuffer
}

export function recordExecutionStage(
  stage: string,
  executionId: string,
  durationMs?: number,
  error?: string,
  metadata?: Record<string, unknown>,
): void {
  recordTelemetry({
    stage,
    executionId,
    timestamp: Date.now(),
    durationMs,
    error,
    metadata,
  })
}

export function recordProviderCall(
  provider: string,
  model: string,
  durationMs: number,
  success: boolean,
  executionId: string,
): void {
  recordTelemetry({
    stage: success ? "provider_success" : "provider_failure",
    executionId,
    timestamp: Date.now(),
    durationMs,
    metadata: { provider, model },
  })
  recordAgentExecution(durationMs, 0, 0)
}

export function recordToolCallTelemetry(
  toolName: string,
  durationMs: number,
  success: boolean,
  executionId: string,
): void {
  recordTelemetry({
    stage: success ? "tool_success" : "tool_failure",
    executionId,
    timestamp: Date.now(),
    durationMs,
    metadata: { toolName },
  })
  recordToolExecution(toolName, durationMs, success ? undefined : "error")
}
