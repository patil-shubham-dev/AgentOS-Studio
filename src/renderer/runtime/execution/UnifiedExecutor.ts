import type { RuntimeRole } from "@/types"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type { RoutingDecision } from "@/runtime/manager-routing-engine"
import type { AgentMode } from "@/runtime/agents/AgentExecutor"
import { routeWithLLMFallback } from "@/runtime/manager-routing-engine"
import { applyModeConstraints } from "@/runtime/execution-mode"
import { useAppStore } from "@/stores/app-store"
import { useAgentStore } from "@/stores/agent-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { usePlanStore } from "@/stores/plan-store"
import { useSandboxStore } from "@/stores/sandbox-store"
import { useToastStore } from "@/stores/toast-store"
import { ProviderRuntime } from "@/runtime/providers/ProviderRuntime"
import { StreamManager } from "@/runtime/streaming/StreamManager"
import { PlanGenerator } from "@/runtime/planning/PlanGenerator"
import { ComplexityAnalyzer } from "@/runtime/planning/ComplexityAnalyzer"
import type { ImplementationPlan } from "@/runtime/planning/PlanTypes"
import { RuntimeOS } from "@/runtime/RuntimeOS"
import { AgentExecutor } from "@/runtime/agents/AgentExecutor"
import { ExecutionScratchpad } from "@/runtime/execution/ExecutionScratchpad"
import { ExecutionQueue } from "@/runtime/execution/ExecutionQueue"
import { RuntimeCleanupManager } from "@/runtime/RuntimeCleanupManager"
import { ReliabilityManager } from "@/runtime/reliability/ReliabilityManager"
import { WatchdogTargetType } from "@/runtime/reliability/Watchdog"
import { FeatureFlagManager } from "@/runtime/feature-flags/FeatureFlagManager"
import { BrowserExecutionBridge } from "@/runtime/browser/BrowserExecutionBridge"
import { VerificationPipeline } from "@/runtime/verification/VerificationPipeline"
import { normalizeRole } from "@/lib/role-identity"
import { compressConversationHistory } from "@/runtime/context/HistoryCompressor"
import { summarizeMessages, getMemoryPressure } from "@/runtime/memory-manager"
import { RUNTIME_TOKEN_LIMITS } from "@/runtime/runtime-token-config"
import { FAST_CHAT_PROMPT } from "@/runtime/runtime-role-registry"
import { startTrace, trace, endTrace } from "@/lib/execution-trace"
import { emitTelemetry } from "@/lib/telemetry"
import { recordAgentExecution, recordToolExecution } from "@/lib/domain-telemetry"
import { recordExecutionStage, recordProviderCall, recordToolCallTelemetry } from "@/runtime/RuntimeTelemetry"
import { safeCapitalize } from "@/lib/safeCapitalize"
import { WorktreeSandboxManager } from "@/lib/git/WorktreeSandbox"
import { ContextBudgetManager } from "@/runtime/execution/ContextBudgetManager"
import { ExecutionProfiler } from "@/runtime/execution/ExecutionProfiler"
import { ExecutionReliabilitySuite } from "@/runtime/execution/ExecutionReliabilitySuite"
import { AutonomousExecutionPath } from "@/runtime/execution/AutonomousExecutionPath"
import { VerificationRecoveryLoop } from "@/runtime/execution/VerificationRecoveryLoop"
import { matchErrorToCode, getStructuredError } from "@/lib/error-schema"

const WORKSPACE_CAPABILITIES = {
  requiresTerminal: new Set(["run_command", "bash", "terminal"]),
  requiresFilesystem: new Set(["read_file", "write_file", "edit_file", "file_delete", "file_move", "file_copy", "folder_create", "folder_delete", "folder_list", "list_files"]),
  requiresGit: new Set(["git_diff", "git_commit", "git_push", "git_status", "git_log"]),
  requiresSearch: new Set(["grep_files", "glob_files", "search_files", "find_files", "file_tree", "workspace_index", "project_analysis"]),
  requiresBuild: new Set(["build_project", "run_tests"]),
}

const WORKSPACE_FREE_TOOLS = new Set([
  "web_search", "web_fetch",
  "browser_navigate", "browser_click", "browser_type", "browser_snapshot",
  "think", "reasoning", "plan",
  "delegate_task", "spawn_agent",
])

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

const FIRST_EVENT_TIMEOUT_MS = 45_000
const PROVIDER_TIMEOUT_MS = 30_000
const AGENT_TIMEOUT_MS = 120_000
/** How long to wait for a single provider stream before attempting a fallback */
const FAST_PATH_ATTEMPT_TIMEOUT_MS = 60_000

export class UnifiedExecutor {
  private static instance: UnifiedExecutor
  private queue = new ExecutionQueue()
  private executionCount = 0
  private autonomousPath: AutonomousExecutionPath

  private constructor() {
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

    if (sig && !sig.aborted) {
      sig.addEventListener("abort", () => ctrl.abort(), { once: true })
    } else if (sig?.aborted) {
      ctrl.abort()
    }

    const sdSignal = RuntimeCleanupManager.getInstance().signal
    if (!sdSignal.aborted) {
      sdSignal.addEventListener("abort", () => ctrl.abort(), { once: true })
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

    // Check circuit breaker via reliability suite
    const reliabilitySuite = ExecutionReliabilitySuite.getInstance()
    if (!reliabilitySuite.isAllowed("execution")) {
      yield { type: "EXECUTION_FAILED", executionId, error: "Execution circuit breaker is open", durationMs: 0, timestamp: Date.now() }
      return
    }

    // Begin profiling
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

      const runtimeState = useWorkspaceRuntime.getState()
      const providers = useAppStore.getState().providers ?? []

      yield { type: "THINKING_STARTED", executionId, label: "Routing", timestamp: Date.now() }
      trace(traceId, "routing_start")

      const runtimeRoles = runtimeState.wiredRuntimeRoles
      const decision = await this.assignAgentForTask(input, runtimeRoles, providers, executionId, reqMode)
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
        const needsWorkspace = this.checkWorkspaceRequired(decision)
        if (needsWorkspace) {
          yield { type: "THINKING_STARTED", executionId, label: "No workspace open", timestamp: Date.now() }
          const noWsMsg = "I can't inspect files or run commands because no workspace is currently open."
          yield { type: "AGENT_ASSIGNED", executionId, correlationId, roleId: "assistant", roleName: "Assistant", modelName: "", providerName: "", stepId: `${executionId}_step`, timestamp: Date.now() }
          StreamManager.getInstance().append(`${executionId}_step`, noWsMsg)
          StreamManager.getInstance().complete(`${executionId}_step`)
          yield { type: "MESSAGE_COMPLETE", executionId, stepId: `${executionId}_step`, content: noWsMsg, finishReason: "stop", timestamp: Date.now() }
          const durationMs = Math.round(performance.now() - t0)
          recordAgentExecution(durationMs, 0, 0)
          yield { type: "EXECUTION_COMPLETE", executionId, content: noWsMsg, filesEdited: 0, commandsRun: 0, toolCalls: 0, durationMs, timestamp: Date.now() }
          return
        }
      }

      const agentMode = this.resolveMode(decision, reqMode)
      console.log(`${orchTag} mode=${agentMode} (${Math.round(performance.now() - t0)}ms)`)

      const wd = ReliabilityManager.getInstance().watchdog
      const wdId = `ue_${executionId}`
      wd.register({
        id: wdId, type: WatchdogTargetType.AGENT, label: `Exec ${executionId.slice(-8)}`,
        timeoutMs: 300_000, abortController: ctrl,
      })

      try {
        if (this.shouldGeneratePlan(input)) {
          yield* this.runPlanPhase(input, executionId, ctrl, t0)
        }
        profileStage("impact-preview", stageStart)
        stageStart = performance.now()
        if (reqMode === "fast" || activeRole === "fast-inference") {
          yield* this.fastPath(input, activeRole, ctrl, executionId, correlationId, t0)
        } else if (reqMode === "autonomous" || goalId) {
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
      if (queueSlotAcquired) {
        this.queue.completeExecution(executionId)
      }
      if (cleanupRegistered) {
        RuntimeCleanupManager.getInstance().unregister(cleanupId)
      }
    }
  }

  private async *fastPath(
    input: string,
    activeRole: RuntimeRole,
    ctrl: AbortController,
    executionId: string,
    correlationId?: string,
    t0?: number,
  ): AsyncGenerator<ExecutionEvent> {
    const runtimeState = useWorkspaceRuntime.getState()
    const wiredAgents = runtimeState.wiredAgents
    const primaryAgent = wiredAgents.find((a) => a.runtimeRole === "manager") ?? wiredAgents[0]
    if (!primaryAgent) {
      yield { type: "EXECUTION_FAILED", executionId, error: "No agent available", durationMs: 0, timestamp: Date.now() }
      return
    }

    const providers = useAppStore.getState().providers ?? []

    // Build ordered attempt list: primary first, then any fallback agents
    const attempts: Array<{ agent: typeof primaryAgent; provider: (typeof providers)[0] }> = []
    const seenProviderIds = new Set<string>()
    for (const agent of [primaryAgent, ...wiredAgents.filter((a) => a.providerId !== primaryAgent.providerId)]) {
      const p = providers.find((pp) => pp.id === agent.providerId)
      if (p && !seenProviderIds.has(p.id)) {
        seenProviderIds.add(p.id)
        attempts.push({ agent, provider: p })
      }
      if (attempts.length >= 2) break
    }

    const stepId = `${executionId}_step`
    const fcT0 = performance.now()
    let lastError: string | null = null
    let firstAttempt = true

    for (const { agent, provider } of attempts) {
      if (ctrl.signal.aborted) break
      if (!firstAttempt) {
        const retryLabel = `Retrying with ${provider.name}...`
        yield { type: "THINKING_UPDATE", executionId, label: retryLabel, timestamp: Date.now() }
        yield { type: "PROVIDER_CONNECTING", executionId, model: agent.model, provider: provider.name, temperature: agent.temperature, timestamp: Date.now() }
        console.log(`[UnifiedExecutor] fastPath fallback: trying ${provider.name}/${agent.model}`)
      } else {
        yield { type: "AGENT_ASSIGNED", executionId, correlationId, roleId: agent.runtimeRole, roleName: safeCapitalize(agent.runtimeRole, ""), modelName: agent.model, providerName: provider.name, stepId, timestamp: Date.now() }
        yield { type: "THINKING_STARTED", executionId, label: "Thinking", timestamp: Date.now() }
        yield { type: "PROVIDER_CONNECTING", executionId, model: agent.model, provider: provider.name, temperature: agent.temperature, timestamp: Date.now() }
        firstAttempt = false
      }

      // Emit a progress heartbeat every 10s while waiting for the first token
      let heartbeatInterval: ReturnType<typeof setInterval> | null = null
      if (!ctrl.signal.aborted) {
        heartbeatInterval = setInterval(() => {
          if (!ctrl.signal.aborted) {
            const elapsed = Math.round((performance.now() - fcT0) / 1000)
            console.log(`[UnifiedExecutor] fastPath waiting... (${elapsed}s)`)
          }
        }, 10_000)
      }

      const streamManager = StreamManager.getInstance()
      let streamedContent = ""
      let streamTokenCount = 0
      const attemptStart = performance.now()
      const timeoutSignal = AbortSignal.timeout(FAST_PATH_ATTEMPT_TIMEOUT_MS)
      const combinedSignal = new AbortController()
      const onAbort = () => { combinedSignal.abort(); heartbeatInterval && clearInterval(heartbeatInterval) }
      const onTimeout = () => {
        if (!ctrl.signal.aborted) {
          combinedSignal.abort(new DOMException(`Provider ${provider.name} timed out after ${FAST_PATH_ATTEMPT_TIMEOUT_MS}ms`, "TimeoutError"))
          heartbeatInterval && clearInterval(heartbeatInterval)
        }
      }
      ctrl.signal.addEventListener("abort", onAbort, { once: true })
      timeoutSignal.addEventListener("abort", onTimeout, { once: true })

      try {
        const history = this.getProcessedHistory(activeRole)

        const budgetMgr = ContextBudgetManager.getInstance()
        const budgetConfig = budgetMgr.createConfig()
        const budgetUsage = budgetMgr.checkBudget(budgetConfig, history)
        if (budgetUsage.shouldCompress) {
          const strategy = budgetMgr.applyCompressionStrategy(budgetUsage, budgetConfig)
          console.log(`[ContextBudget] ${strategy}`)
        }

        const providerRuntime = new ProviderRuntime(provider.baseUrl, provider.apiKey)
        providerRuntime.setDefaultModel(agent.model)

        let finalContent = ""
        const stream = providerRuntime.stream({
          systemPrompt: FAST_CHAT_PROMPT,
          messages: [
            ...history.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
            { role: 'user' as const, content: input },
          ],
          maxTokens: 4096,
          signal: combinedSignal.signal,
        })

        for await (const chunk of stream) {
          if (chunk.type === 'token') {
            streamedContent += chunk.text
            streamTokenCount++
            streamManager.append(stepId, chunk.text, streamTokenCount <= 5)
          } else if (chunk.type === 'done') {
            finalContent = chunk.fullText
          } else if (chunk.type === 'error') {
            throw new Error(chunk.error)
          }
        }

        const attemptDuration = Math.round(performance.now() - attemptStart)
        recordProviderCall(provider.name, agent.model, attemptDuration, true, executionId)
        yield { type: "PROVIDER_CONNECTED", executionId, model: agent.model, provider: provider.name, temperature: agent.temperature, timestamp: Date.now() }

        if (streamTokenCount === 0 && finalContent.length > 0) {
          streamManager.append(stepId, finalContent)
          streamManager.flushImmediate()
          streamedContent = finalContent
        }
        streamManager.complete(stepId)

        if (!streamedContent) {
          lastError = "Empty response"
          continue
        }

        const totalDuration = t0 ? Math.round(performance.now() - t0) : attemptDuration
        recordAgentExecution(attemptDuration, 0, 0)
        yield { type: "MESSAGE_COMPLETE", executionId, stepId, content: streamedContent, finishReason: "stop", timestamp: Date.now() }
        yield { type: "EXECUTION_COMPLETE", executionId, content: streamedContent, filesEdited: 0, commandsRun: 0, toolCalls: 0, durationMs: totalDuration, timestamp: Date.now() }
        return
      } catch (err) {
        streamManager.complete(stepId)
        const errMsg = err instanceof Error ? err.message : String(err)
        const elapsed = Math.round(performance.now() - attemptStart)
        recordProviderCall(provider.name, agent.model, elapsed, false, executionId)
        emitTelemetry({ type: "provider_failure", timestamp: Date.now(), error: errMsg, metadata: { executionId, attempt: attempts.length > 1 ? "fallback" : "primary" } })
        lastError = errMsg
        console.log(`[UnifiedExecutor] fastPath attempt failed (${elapsed}ms): ${errMsg}`)
      } finally {
        ctrl.signal.removeEventListener("abort", onAbort)
        timeoutSignal.removeEventListener("abort", onTimeout)
        if (heartbeatInterval) clearInterval(heartbeatInterval)
      }
    }

    // All attempts failed
    yield { type: "EXECUTION_FAILED", executionId, error: lastError ?? "All providers failed", durationMs: Math.round(performance.now() - fcT0), timestamp: Date.now() }
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
    const scratchpad = new ExecutionScratchpad(input.slice(0, 200))
    const orderedRoles = this.orderPipelineRoles(decision.selectedRoles)
    const results: { role: string; content: string }[] = []
    let previousOutput = ""

    const sandboxMode = useAppStore.getState().sandboxMode
    const hasWriteAgent = decision.selectedRoles.some((r) => r === 'coder' || r === 'design' || r === 'manager')
    const workspaceRoot = useWorkspaceStore.getState().rootPath
    if (sandboxMode === 'on' && hasWriteAgent && workspaceRoot) {
      const sm = WorktreeSandboxManager.getInstance()
      const sandbox = await sm.create(workspaceRoot, executionId)
      if (sandbox) {
        useSandboxStore.getState().setActiveSandbox(sandbox)
      }
    }

    for (const role of orderedRoles) {
      if (ctrl.signal.aborted) break
      const runtimeRole = normalizeRole(role) ?? role
      if (!runtimeRole) continue

      const runtimeState = useWorkspaceRuntime.getState()
      const wired = runtimeState.wiredAgents.find((a) => a.runtimeRole === runtimeRole || a.roleId === runtimeRole)
      const stepId = `${executionId}_${runtimeRole}`

      yield { type: "AGENT_ASSIGNED", executionId, correlationId, roleId: runtimeRole, roleName: safeCapitalize(runtimeRole), modelName: wired?.model, providerName: wired?.providerName, stepId, timestamp: Date.now() }

      if (runtimeRole === "verification") {
        yield* this.runVerificationAgent(results, ctrl, executionId, stepId)
        continue
      }

      const agentInput = previousOutput
        ? `Previous agent (${results[results.length - 1]?.role}) produced:\n\n${previousOutput}\n\n---\n\nOriginal request: ${input}`
        : input

      const agentT0 = performance.now()
      const executor = new AgentExecutor({
        executionId, mode: "FULL", role: runtimeRole as RuntimeRole,
        input: agentInput, history: this.getProcessedHistory(activeRole), signal: ctrl.signal,
      })
      executor.setScratchpad(scratchpad)

      let content = ""
      for await (const event of executor.execute()) {
        if (ctrl.signal.aborted) break
        if (performance.now() - agentT0 > AGENT_TIMEOUT_MS) {
          throw new Error(`Agent ${runtimeRole} timed out`)
        }
        if (event.type === "MESSAGE_COMPLETE") { content = event.content; continue }
        yield event
      }

      StreamManager.getInstance().complete(stepId)
      if (!ctrl.signal.aborted) {
        yield { type: "MESSAGE_COMPLETE", executionId, stepId, content: content || "", finishReason: "stop", timestamp: Date.now() }
        results.push({ role: runtimeRole, content: content || "" })
        previousOutput = content
      }
    }

    if (decision.executionStrategy === "multi-agent" && results.length > 0) {
      try {
        const { SynthesisEngine } = await import("@/runtime/execution/SynthesisEngine")
        const engine = new SynthesisEngine()
        let synthesized = ""
        for await (const event of engine.synthesize(input, results, [], executionId, ctrl.signal)) {
          if (event.type === "MESSAGE_COMPLETE") synthesized = event.content
          yield event
        }
        yield { type: "SYNTHESIS_COMPLETE", executionId, role: activeRole, content: synthesized, timestamp: Date.now() }
      } catch (e) {
        console.error("[UnifiedExecutor] Synthesis failed:", e)
      }
    }

    const activeSandbox = useSandboxStore.getState().activeSandbox
    if (activeSandbox && activeSandbox.status === 'active') {
      WorktreeSandboxManager.getInstance().getDiff(activeSandbox)
        .then((diff) => useSandboxStore.getState().setDiff(diff))
        .catch(() => {})
    }

    // ── Verification + recovery for full path ──
    const changedFiles = results.flatMap(r => this.extractChangedFiles(r.content))
    const uniqueFiles = [...new Set(changedFiles)]
    if (uniqueFiles.length > 0) {
      const verifier = VerificationPipeline.getInstance()
      yield { type: "THINKING_STARTED" as const, executionId, label: "Verifying changes", timestamp: Date.now() }
      let vr = await verifier.verifyChanges(uniqueFiles, ctrl.signal)
      if (!vr.passed) {
        yield { type: "THINKING_STARTED" as const, executionId, label: "Running recovery", timestamp: Date.now() }
        const recoveryLoop = new VerificationRecoveryLoop()
        const recoveryResult = await recoveryLoop.run(uniqueFiles, input, ctrl.signal)
        vr = recoveryResult.finalResult
        yield { type: recoveryResult.recovered ? "VERIFY_PASSED" as const : "VERIFY_FAILED" as const, executionId, stepId: `${executionId}_v`, details: vr.details, lintErrors: vr.lintErrors, typeErrors: vr.typeErrors, buildErrors: vr.buildErrors, testFailures: vr.testFailures, recovered: recoveryResult.recovered, timestamp: Date.now() }
      } else {
        yield { type: "VERIFY_PASSED" as const, executionId, stepId: `${executionId}_v`, details: vr.details, timestamp: Date.now(), recovered: false }
      }
    }

    const durationMs = Math.round(performance.now() - t0)
    yield { type: "EXECUTION_COMPLETE", executionId, content: results.map((r) => r.content).join("\n"), filesEdited: uniqueFiles.length, commandsRun: 0, toolCalls: 0, durationMs, timestamp: Date.now() }
  }

  private async *runPlanPhase(
    input: string,
    executionId: string,
    ctrl: AbortController,
    t0: number,
  ): AsyncGenerator<ExecutionEvent> {
    yield { type: "THINKING_STARTED", executionId, label: "Planning approach", timestamp: Date.now() }
    const plan = await PlanGenerator.getInstance().generatePlan(input, ctrl.signal)
    const complexity = ComplexityAnalyzer.getInstance().analyze(input)

    const enriched: ImplementationPlan = {
      ...plan,
      complexityInfo: { score: complexity.score, signals: complexity.signals, triggeredPlan: complexity.shouldPlan },
    }
    usePlanStore.getState().setPlan(enriched)

    yield { type: "PLAN_PROPOSED", executionId, planId: plan.id, title: plan.title, overview: plan.overview, steps: plan.steps.map((s) => ({ id: s.id, title: s.title, description: s.description })), verificationCriteria: plan.verificationCriteria, timestamp: Date.now() }

    const approved = await this.waitForPlanApproval(plan.id, ctrl.signal)
    if (!approved) {
      yield { type: "PLAN_REJECTED", executionId, planId: plan.id, reason: "User rejected the plan", timestamp: Date.now() }
      yield { type: "EXECUTION_FAILED", executionId, error: "Plan rejected", durationMs: Math.round(performance.now() - t0), timestamp: Date.now() }
      usePlanStore.getState().clearPlan()
      return
    }

    yield { type: "PLAN_APPROVED", executionId, planId: plan.id, timestamp: Date.now() }
    const current = usePlanStore.getState().currentPlan
    if (current) {
      usePlanStore.getState().setPlan({ ...current, status: "executing" })
    }
  }

  private async *runVerificationAgent(
    results: { role: string; content: string }[],
    ctrl: AbortController,
    executionId: string,
    stepId: string,
  ): AsyncGenerator<ExecutionEvent> {
    const changedFiles = results.filter((r) => r.role === "coder").flatMap((r) => this.extractChangedFiles(r.content))
    if (changedFiles.length === 0) return
    const pipeline = VerificationPipeline.getInstance()
    yield { type: "THINKING_STARTED", executionId, label: "Verification Agent", timestamp: Date.now() }
    const result = await pipeline.verifyChanges(changedFiles, ctrl.signal)
    if (result.passed) {
      yield { type: "VERIFY_PASSED", executionId, stepId, details: result.details, recovered: false, timestamp: Date.now() }
    } else {
      const fix = await pipeline.autoFixWithRetry(result, changedFiles, ctrl.signal)
      if (fix.fixed) {
        yield { type: "VERIFY_PASSED", executionId, stepId, details: fix.finalResult.details, recovered: true, timestamp: Date.now() }
      } else {
        yield { type: "VERIFY_FAILED", executionId, stepId, lintErrors: result.lintErrors, typeErrors: result.typeErrors, buildErrors: result.buildErrors, testFailures: result.testFailures, details: result.details, autoFixApplied: true, timestamp: Date.now() }
      }
    }
  }

  private async assignAgentForTask(input: string, wiredRoles: RuntimeRole[], providers: any[], executionId: string, reqMode?: ExecutionMode): Promise<RoutingDecision> {
    const store = useAgentStore.getState()
    store.clearAssignments()
    store.clearOrchestrationSteps()

    // Build an LLM classifier for fallback when regex patterns yield low confidence
    const fastProvider = providers.find((p: any) => p.id === "fast-inference" || p.id === "manager")
    const llmClassifier = fastProvider ? async (text: string) => {
      try {
        const { ProviderRuntime } = await import("@/runtime/providers/ProviderRuntime")
        const runtime = new ProviderRuntime(fastProvider.baseUrl, fastProvider.apiKey)
        runtime.setDefaultModel(fastProvider.model)
        const result = await runtime.chat({ messages: [{ role: 'user', content: `Classify the following user request into exactly one category: conversation, coding, research, execution, planning, browser-task, ui-analysis, multi-agent. Reply with only the category name and confidence (0-1), nothing else.\n\nRequest: ${text.slice(0, 500)}` }] })
        const categoryMatch = result.content.match(/(conversation|coding|research|execution|planning|browser-task|ui-analysis|multi-agent)/i)
        const confidenceMatch = result.content.match(/(\d\.\d+)/)
        return {
          category: (categoryMatch?.[1]?.toLowerCase() ?? "conversation") as any,
          confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.6,
        }
      } catch {
        return { category: "conversation" as const, confidence: 0.5 }
      }
    } : undefined

    const decision = await routeWithLLMFallback(input, wiredRoles, llmClassifier)
    const mode = reqMode ?? "full"
    const constrained = applyModeConstraints(mode, [...decision.selectedRoles], decision.intentCategory)
      .filter((role, i, arr) => arr.indexOf(role) === i)
    const result: RoutingDecision = { ...decision, selectedRoles: constrained as RoutingDecision["selectedRoles"] }
    for (const role of result.selectedRoles) {
      store.addAgentAssignment({ role, reason: result.reasoning, status: "active", startedAt: Date.now() })
    }
    store.addOrchestrationStep({
      type: result.requiresDelegation ? "delegate" : "analyze",
      agent: result.selectedRoles[0] ?? "manager",
      description: result.reasoning,
      status: "running",
    })
    return result
  }

  private resolveMode(decision: RoutingDecision, requestedMode?: ExecutionMode): AgentMode {
    if (requestedMode === "fast") return "FAST"
    if (requestedMode === "full" || requestedMode === "autonomous") return "FULL"
    if (!decision.requiresDelegation) return "FAST"
    if (decision.executionStrategy === "multi-agent") return "FULL"
    return "FULL"
  }

  private shouldGeneratePlan(input?: string): boolean {
    const planMode = useAppStore.getState().planMode
    if (planMode === "never") return false
    if (planMode === "always") return true
    const text = input ?? ""
    if (!text.trim()) return false
    return ComplexityAnalyzer.getInstance().analyze(text).shouldPlan
  }

  private async waitForPlanApproval(planId: string, signal?: AbortSignal): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (signal?.aborted) { reject(new DOMException("Cancelled", "AbortError")); return }
        const plan = usePlanStore.getState().currentPlan
        if (!plan || plan.id !== planId) { resolve(false); return }
        if (plan.status === "approved") { resolve(true); return }
        if (plan.status === "rejected") { resolve(false); return }
        setTimeout(check, 200)
      }
      setTimeout(check, 100)
    })
  }

  private orderPipelineRoles(roles: string[]): string[] {
    const ORDER: Record<string, number> = {
      research: 0, coder: 1, browser: 2, vision: 3, qa: 4,
      verification: 5, runtime: 6, "fast-inference": 7, design: 8, memory: 9, manager: 10,
    }
    return [...roles].sort((a, b) => (ORDER[a] ?? 99) - (ORDER[b] ?? 99))
  }

  private checkWorkspaceRequired(decision: RoutingDecision): boolean {
    try {
      const os = RuntimeOS.getInstance()
      for (const role of decision.selectedRoles) {
        for (const tool of os.toolRegistry.getByMode(role)) {
          for (const [, tools] of Object.entries(WORKSPACE_CAPABILITIES)) {
            if (tools.has(tool.name)) return true
          }
        }
      }
    } catch { }
    return false
  }

  private getProcessedHistory(activeRole: RuntimeRole): any[] {
    const conversations = useAgentStore.getState().conversations
    const msgs = conversations[activeRole]?.messages ?? []
    const history = msgs.filter((m: any) => m.role !== "system")
    if (history.length > RUNTIME_TOKEN_LIMITS.MAX_CONTEXT_MESSAGES) {
      const compressed = summarizeMessages(history, RUNTIME_TOKEN_LIMITS.MAX_HISTORY_TOKENS)
      const pressure = getMemoryPressure(compressed)
      const runtime = useWorkspaceRuntime.getState()
      runtime.setMemoryPressure(pressure)
      runtime.setTokenUsage(compressed.totalTokens)
      return compressConversationHistory(history)
    }
    return history
  }

  private extractChangedFiles(content: string): string[] {
    const files: string[] = []
    const pattern = /(?:edited|created|updated|modified|wrote|changed)\s+(?:file\s+)?(?:`([^`]+)`|([^\s,.]+))/gi
    let match
    while ((match = pattern.exec(content)) !== null) {
      const path = (match[1] ?? match[2]).trim()
      if (path && path.match(/\.(ts|tsx|js|jsx|json|css|html|md)$/) && !files.includes(path)) {
        files.push(path)
      }
    }
    return files
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
