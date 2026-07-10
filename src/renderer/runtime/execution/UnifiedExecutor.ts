import type { RuntimeRole } from "@/types"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type { RoutingDecision } from "@/runtime/manager-routing-engine"
import type { AgentMode } from "@/runtime/agents/AgentExecutor"
import { useAppStore } from "@/stores/app-store"
import { useAgentStore } from "@/stores/agent-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { usePlanStore } from "@/stores/plan-store"
import { StreamManager } from "@/runtime/streaming/StreamManager"
import { ExecutionQueue } from "@/runtime/execution/ExecutionQueue"
import { RuntimeCleanupManager } from "@/runtime/RuntimeCleanupManager"
import { ReliabilityManager } from "@/runtime/reliability/ReliabilityManager"
import { WatchdogTargetType } from "@/runtime/reliability/Watchdog"
import { compressConversationHistory } from "@/runtime/context/HistoryCompressor"
import { summarizeMessages, getMemoryPressure } from "@/runtime/memory-manager"
import { RUNTIME_TOKEN_LIMITS } from "@/runtime/runtime-token-config"
import { startTrace, trace, endTrace } from "@/lib/execution-trace"
import { recordAgentExecution } from "@/lib/domain-telemetry"
import { recordExecutionStage } from "@/runtime/RuntimeTelemetry"
import { ExecutionProfiler } from "@/runtime/execution/ExecutionProfiler"
import { ExecutionReliabilitySuite } from "@/runtime/execution/ExecutionReliabilitySuite"
import { AutonomousExecutionPath } from "@/runtime/execution/AutonomousExecutionPath"
import { matchErrorToCode, getStructuredError } from "@/lib/error-schema"
import { assignAgentForTask, checkWorkspaceRequired } from "./ExecutionRouter"
import { runPlanPhase, shouldGeneratePlan } from "./PlanManager"
import { mockExecutionPath } from "./MockExecutionEngine"
import { FastPathExecutor } from "./FastPathExecutor"
import { AgentPipelineOrchestrator } from "./AgentPipelineOrchestrator"
import { autoCompact, shouldAutoCompact } from "@/runtime/context/autoCompact"
import { TokenEstimator } from "@/runtime/context/TokenEstimator"
import { BackgroundTaskManager } from "@/runtime/BackgroundTaskManager"

export type ExecutionMode = "fast" | "full" | "autonomous"

export interface ExecuteOptions {
  input: string
  activeRole: RuntimeRole
  correlationId?: string
  mode?: ExecutionMode
  signal?: AbortSignal
  goalId?: string
  goalObjective?: string
}

const AGENT_TIMEOUT_MS = 120_000

export function resolveExecutionMode(decision: RoutingDecision, requestedMode?: ExecutionMode): AgentMode {
  if (requestedMode === "fast") return "FAST"
  if (requestedMode === "autonomous") return "FULL"
  if (decision.executionStrategy === "direct" && decision.mode === "fast") return "FAST"
  if (requestedMode === "full") return "FULL"
  if (decision.mode === "fast") return "FAST"
  return "FULL"
}

export class UnifiedExecutor {
  private static instance: UnifiedExecutor
  private queue = new ExecutionQueue()
  private executionCount = 0
  private autonomousPath: AutonomousExecutionPath
  private fastPathExecutor: FastPathExecutor
  private orchestrator: AgentPipelineOrchestrator

  private constructor() {
    this.fastPathExecutor = new FastPathExecutor({
      getProcessedHistory: this.getProcessedHistory.bind(this),
    })
    this.orchestrator = new AgentPipelineOrchestrator({
      getProcessedHistory: this.getProcessedHistory.bind(this),
    })
    this.autonomousPath = new AutonomousExecutionPath({
      fullPath: this.fullPath.bind(this),
      getProcessedHistory: this.getProcessedHistory.bind(this),
      getWorkspaceSnapshot: this.getWorkspaceSnapshot.bind(this),
      detectFileChanges: this.detectFileChanges.bind(this),
    })
  }

  static getInstance(): UnifiedExecutor {
    if (!UnifiedExecutor.instance) {
      UnifiedExecutor.instance = new UnifiedExecutor()
    }
    return UnifiedExecutor.instance
  }

  getQueue(): ExecutionQueue {
    return this.queue
  }

  cancel(): void {
    this.queue.cancelAll()
    StreamManager.getInstance().clearAll()
    BackgroundTaskManager.getInstance().cancelAll()
  }

  isBusy(): boolean {
    return this.queue.isBusy()
  }

  cancelExecution(id: string): void {
    this.queue.cancel(id)
  }

  async *execute(options: ExecuteOptions): AsyncGenerator<ExecutionEvent> {
    const { input, activeRole, correlationId, mode: reqMode, signal: sig, goalId, goalObjective } = options
    const executionId = `exec_${Date.now()}_${++this.executionCount}`
    const traceId = `msg_${Date.now()}`
    const t0 = performance.now()
    const ctrl = new AbortController()
    const orchTag = "[UnifiedExecutor]"

    const onSigAbort = () => ctrl.abort()
    const onSdAbort = () => ctrl.abort()

    if (sig && !sig.aborted) {
      sig.addEventListener("abort", onSigAbort, { once: true })
    } else if (sig?.aborted) {
      ctrl.abort()
    }

    const sdSignal = RuntimeCleanupManager.getInstance().signal
    if (!sdSignal.aborted) {
      sdSignal.addEventListener("abort", onSdAbort, { once: true })
    }

    const cleanupId = `ue_exec_${Date.now()}`
    RuntimeCleanupManager.getInstance().register(
      { type: "abort-controller", id: cleanupId, controller: ctrl },
      "execution",
    )
    const cleanupRegistered = true

    const cb = ReliabilityManager.getInstance().circuitBreakers.getOrCreate("execution")
    if (!cb.allowRequest()) {
      yield { type: "EXECUTION_FAILED", executionId, error: "Circuit breaker is open", durationMs: 0, timestamp: Date.now() }
      return
    }

    const reliabilitySuite = ExecutionReliabilitySuite.getInstance()
    if (!reliabilitySuite.isAllowed("execution")) {
      yield { type: "EXECUTION_FAILED", executionId, error: "Execution circuit breaker is open", durationMs: 0, timestamp: Date.now() }
      return
    }

    const profiler = ExecutionProfiler.getInstance()
    const profile = profiler.beginProfile(executionId, input.slice(0, 200))
    const profileStage = (stage: string, startTime: number) => {
      profiler.recordStage(profile, stage as any, performance.now() - startTime)
    }
    let stageStart = performance.now()

    startTrace(traceId)
    trace(traceId, "message_received", { length: input.length })

    let queueSlotAcquired = false
    try {
      await this.queue.enqueue(input, executionId, ctrl.signal).promise
      queueSlotAcquired = true
    } catch (qErr) {
      yield { type: "EXECUTION_FAILED", executionId, error: `Queue full or cancelled: ${qErr instanceof Error ? qErr.message : String(qErr)}`, durationMs: Math.round(performance.now() - t0), timestamp: Date.now() }
      return
    }

    try {
      console.log(`${orchTag} ▶ execute start (executionId=${executionId}, inputLen=${input.length}, role=${activeRole})`)
      yield { type: "EXECUTION_CREATED", executionId, input, timestamp: Date.now() }
      recordExecutionStage("execution_started", executionId)

      if (useAppStore.getState().mockMode) {
        yield* mockExecutionPath(input, executionId, activeRole, correlationId, t0)
        const durationMs = Math.round(performance.now() - t0)
        profileStage("total", stageStart)
        profiler.finishProfile(profile)
        endTrace(traceId)
        console.log(`${orchTag} ✓ mock execute complete (${durationMs}ms)`)
        return
      }

      const runtimeState = useWorkspaceRuntime.getState()
      const providers = useAppStore.getState().providers ?? []

      yield { type: "THINKING_STARTED", executionId, label: "Routing", timestamp: Date.now() }
      trace(traceId, "routing_start")

      const runtimeRoles = runtimeState.wiredRuntimeRoles
      const decision = await assignAgentForTask(input, runtimeRoles, providers, executionId, reqMode)
      trace(traceId, "routing_end", { strategy: decision.executionStrategy, roles: decision.selectedRoles })
      console.log(`${orchTag} routing: strategy=${decision.executionStrategy}, roles=${decision.selectedRoles?.join(",")} (${Math.round(performance.now() - t0)}ms)`)
      profileStage("gateway", stageStart)
      stageStart = performance.now()
      if (runtimeState.status === 'uninitialized' || runtimeState.status === 'initializing') {
        yield { type: "EXECUTION_FAILED", executionId, error: "Runtime is still initializing", durationMs: 0, timestamp: Date.now() }
        return
      }
      if (runtimeState.wiredRoles === 0 && runtimeState.wiredAgents.length === 0) {
        yield { type: "EXECUTION_FAILED", executionId, error: "No agents configured", durationMs: 0, timestamp: Date.now() }
        return
      }
      if (!runtimeState.managerWired) {
        yield { type: "EXECUTION_FAILED", executionId, error: "Manager agent not configured", durationMs: 0, timestamp: Date.now() }
        return
      }
      if (providers.length === 0) {
        yield { type: "EXECUTION_FAILED", executionId, error: "No providers configured", durationMs: 0, timestamp: Date.now() }
        return
      }

      const workspaceRoot = useWorkspaceStore.getState().rootPath
      const workspaceOpen = !!workspaceRoot
      if (!workspaceOpen && decision.requiresDelegation) {
        const needsWorkspace = checkWorkspaceRequired(decision)
        if (needsWorkspace) {
          yield { type: "THINKING_STARTED", executionId, label: "No workspace open", timestamp: Date.now() }
          const noWsMsg = "I can't inspect files or run commands because no workspace is currently open."
          yield { type: "AGENT_ASSIGNED", executionId, correlationId, roleId: "assistant", roleName: "Assistant", modelName: "", providerName: "", stepId: `${executionId}_step`, executionStrategy: "single-agent", timestamp: Date.now() }
          StreamManager.getInstance().append(`${executionId}_step`, noWsMsg)
          StreamManager.getInstance().complete(`${executionId}_step`)
          yield { type: "MESSAGE_COMPLETE", executionId, stepId: `${executionId}_step`, content: noWsMsg, finishReason: "stop", timestamp: Date.now() }
          const durationMs = Math.round(performance.now() - t0)
          recordAgentExecution(durationMs, 0, 0)
          yield { type: "EXECUTION_COMPLETE", executionId, content: noWsMsg, filesEdited: 0, commandsRun: 0, toolCalls: 0, durationMs, timestamp: Date.now(), executionMode: "fast" }
          return
        }
      }

      const agentMode = resolveExecutionMode(decision, reqMode)
      console.log(`${orchTag} mode=${agentMode} (${Math.round(performance.now() - t0)}ms)`)

      const wd = ReliabilityManager.getInstance().watchdog
      const wdId = `ue_${executionId}`
      wd.register({
        id: wdId, type: WatchdogTargetType.AGENT, label: `Exec ${executionId.slice(-8)}`,
        timeoutMs: 300_000, abortController: ctrl,
      })

      try {
        if (agentMode !== "FAST" && shouldGeneratePlan(input)) {
          yield* runPlanPhase(input, executionId, ctrl, t0)
        }
        profileStage("impact-preview", stageStart)
        stageStart = performance.now()

        // Auto-compact: if conversation is too large, summarize old messages via a fast model
        if (agentMode !== "FAST") {
          const conversations = useAgentStore.getState().conversations
          const msgs = conversations[activeRole]?.messages ?? []
          const toolMsgCount = msgs.filter((m: any) => m.role === "tool").length
          const userMsgCount = msgs.filter((m: any) => m.role === "user").length
          if (toolMsgCount > 15 || userMsgCount > RUNTIME_TOKEN_LIMITS.MAX_CONTEXT_MESSAGES) {
            const compactResult = await autoCompact(msgs, activeRole)
            if (compactResult.summaryGenerated) {
              useAgentStore.getState().setMessages(activeRole, compactResult.compacted as any)
              console.log(`${orchTag} auto-compact replaced older messages with summary (${compactResult.compacted.length} messages remaining)`)
            }
          }
        }

        console.log("[FLOW:2] UnifiedExecutor.execute: entering path (mode=" + agentMode + ", activeRole=" + activeRole + ")")
        if (agentMode === "FAST") {
          yield* this.fastPathExecutor.execute(input, activeRole, ctrl, executionId, correlationId, t0)
        } else if (reqMode === "autonomous") {
          yield* this.autonomousPath.execute(input, activeRole, decision, ctrl, executionId, providers, t0, correlationId, goalId, goalObjective)
        } else {
          yield* this.fullPath(input, activeRole, decision, ctrl, executionId, providers, t0, correlationId)
        }

        if (usePlanStore.getState().currentPlan?.status === "executing") {
          const plan = usePlanStore.getState().currentPlan
          usePlanStore.getState().setPlan({
            ...plan!, status: "completed",
            steps: plan!.steps.map((s) => ({ ...s, status: "completed" as const })),
          })
        }
      } finally {
        wd.unregister(wdId)
      }

      cb.recordSuccess()
      reliabilitySuite.recordSuccess("execution")
      profileStage("total", stageStart)
      profiler.finishProfile(profile)
      endTrace(traceId)
      console.log(`${orchTag} ✓ execute complete (${Math.round(performance.now() - t0)}ms)`)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const structured = getStructuredError(matchErrorToCode(errMsg), "UnifiedExecutor")
      console.error(`${orchTag} ✗ execute failed: [${structured.code}] ${structured.problem}`)
      reliabilitySuite.recordFailure("execution")
      profileStage("total", stageStart)
      profiler.finishProfile(profile)
      yield {
        type: "EXECUTION_FAILED", executionId,
        error: `${structured.code}: ${structured.problem}`,
        structuredError: structured,
        durationMs: Math.round(performance.now() - t0), timestamp: Date.now(),
      }
    } finally {
      if (sig && !sig.aborted) sig.removeEventListener("abort", onSigAbort)
      if (!sdSignal.aborted) sdSignal.removeEventListener("abort", onSdAbort)
      if (queueSlotAcquired) {
        this.queue.completeExecution(executionId)
      }
      if (cleanupRegistered) {
        RuntimeCleanupManager.getInstance().unregister(cleanupId)
      }
    }
  }

  private async *fullPath(
    input: string,
    activeRole: RuntimeRole,
    decision: RoutingDecision,
    ctrl: AbortController,
    executionId: string,
    providers: any[],
    t0: number,
    correlationId?: string,
  ): AsyncGenerator<ExecutionEvent> {
    yield* this.orchestrator.execute(input, activeRole, decision, ctrl, executionId, providers, t0, correlationId)
  }

  private getProcessedHistory(activeRole: RuntimeRole): any[] {
    const conversations = useAgentStore.getState().conversations
    const msgs = conversations[activeRole]?.messages ?? []
    const history = msgs.filter((m: any) => m.role !== "system")

    const deduped: any[] = []
    for (const m of history) {
      const last = deduped[deduped.length - 1]
      if (m.role === "user" && last?.role === "user" && last.content === m.content) {
        continue
      }
      deduped.push(m)
    }

    if (deduped.length > RUNTIME_TOKEN_LIMITS.MAX_CONTEXT_MESSAGES) {
      const compressed = summarizeMessages(deduped, RUNTIME_TOKEN_LIMITS.MAX_HISTORY_TOKENS)
      const pressure = getMemoryPressure(compressed)
      const runtime = useWorkspaceRuntime.getState()
      runtime.setMemoryPressure(pressure)
      runtime.setTokenUsage(compressed.totalTokens)
      return compressConversationHistory(deduped)
    }
    return deduped
  }

  private getWorkspaceSnapshot(): Record<string, string> {
    const ws = useWorkspaceStore.getState()
    const snapshot: Record<string, string> = {}
    const walk = (entries: any[]) => {
      for (const e of entries) {
        snapshot[e.path] = "exists"
        if (e.is_dir && e.children?.length > 0) walk(e.children)
      }
    }
    if (ws.fileTree?.length > 0) walk(ws.fileTree)
    return snapshot
  }

  private detectFileChanges(before: Record<string, string>): string[] {
    const after = this.getWorkspaceSnapshot()
    const changed: string[] = []
    for (const [path] of Object.entries(after)) { if (!before[path]) changed.push(path) }
    for (const [path] of Object.entries(before)) { if (!after[path]) changed.push(path) }
    return changed
  }
}
