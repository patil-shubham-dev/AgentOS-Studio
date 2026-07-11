let counter = 0
const activeRequests = new Map<string, RequestTrace>()

export interface TraceStage {
  stage: string
  timestamp: number
  caller: string
  stack?: string
}

export interface RequestTrace {
  requestId: string
  input: string
  startedAt: number
  stages: TraceStage[]
}

export function generateRequestId(): string {
  counter++
  return `req_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export function traceStage(requestId: string, stage: string, extra?: Record<string, unknown>): void {
  const stack = new Error().stack?.split("\n").slice(2, 5).join(" → ") ?? "no stack"
  const entry: TraceStage = {
    stage,
    timestamp: Date.now(),
    caller: stack,
    stack,
  }
  let trace = activeRequests.get(requestId)
  if (!trace) {
    trace = { requestId, input: "", startedAt: Date.now(), stages: [] }
    activeRequests.set(requestId, trace)
  }
  trace.stages.push(entry)

  const parts = [`[REQ:${requestId}]`, stage, `t=${entry.timestamp}`]
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      parts.push(`${k}=${typeof v === "string" ? v.slice(0, 120) : JSON.stringify(v).slice(0, 120)}`)
    }
  }
  console.log(parts.join(" │ "))
  console.log(`[REQ:${requestId}] stack │ ${stack}`)
}

export function createRequestTrace(input: string): string {
  const requestId = generateRequestId()
  const trace: RequestTrace = {
    requestId,
    input: input.slice(0, 200),
    startedAt: Date.now(),
    stages: [],
  }
  activeRequests.set(requestId, trace)
  traceStage(requestId, "REQUEST_CREATED", { inputLen: input.length })
  return requestId
}

export function getRequestTrace(requestId: string): RequestTrace | undefined {
  return activeRequests.get(requestId)
}

export function clearRequestTrace(requestId: string): void {
  activeRequests.delete(requestId)
}

export function getAllActiveTraces(): RequestTrace[] {
  return Array.from(activeRequests.values())
}

export function assertSingleExecution(requestId: string): void {
  const trace = activeRequests.get(requestId)
  if (!trace) return
  const executeStages = trace.stages.filter(s => s.stage === "UnifiedExecutor.execute")
  if (executeStages.length > 1) {
    console.error(`[REQ:${requestId}] CRITICAL: ${executeStages.length} executions detected for single request!`)
    console.error(`[REQ:${requestId}] Stages:`, trace.stages.map(s => `${s.stage}@${s.timestamp}`).join(" → "))
  }
}
