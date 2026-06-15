import { useAgentStore } from "@/stores/agent-store"
import { useAppStore } from "@/stores/app-store"
import { useToastStore } from "@/stores/toast-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { route as managerRoute } from "@/runtime/manager-routing-engine"
import type { RoutingDecision } from "@/runtime/manager-routing-engine"
import { applyModeConstraints } from "@/runtime/execution-mode"
import { compressConversationHistory } from "@/runtime/context/HistoryCompressor"
import { summarizeMessages, getMemoryPressure } from "@/runtime/memory-manager"
import { RUNTIME_TOKEN_LIMITS } from "@/runtime/runtime-token-config"
import { AgentExecutor, type AgentMode } from "@/runtime/agents/AgentExecutor"
import { RuntimeOS } from "@/runtime/RuntimeOS"
import { StreamManager } from "@/runtime/streaming/StreamManager"
import { normalizeRole } from "@/lib/role-identity"
import { ProviderRuntime } from "@/runtime/providers/ProviderRuntime"
import { FAST_CHAT_PROMPT } from "@/runtime/runtime-role-registry"
import type { RuntimeRole } from "@/types"
import { startTrace, trace, endTrace } from "@/lib/execution-trace"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import { emitTelemetry } from "@/lib/telemetry"
import { recordAgentExecution, recordToolExecution } from "@/lib/domain-telemetry"
import { RuntimeCleanupManager } from "@/runtime/RuntimeCleanupManager"
import { ReliabilityManager } from "@/runtime/reliability/ReliabilityManager"
import { WatchdogTargetType } from "@/runtime/reliability/Watchdog"
import { recordExecutionStage, recordProviderCall, recordToolCallTelemetry } from "@/runtime/RuntimeTelemetry"

// Tool capabilities that require an active workspace
const WORKSPACE_CAPABILITIES = {
  requiresTerminal: new Set(["run_command", "bash", "terminal"]),
  requiresFilesystem: new Set(["read_file", "write_file", "edit_file", "file_delete", "file_move", "file_copy", "folder_create", "folder_delete", "folder_list", "list_files"]),
  requiresGit: new Set(["git_diff", "git_commit", "git_push", "git_status", "git_log"]),
  requiresSearch: new Set(["grep_files", "glob_files", "search_files", "find_files", "file_tree", "workspace_index", "project_analysis"]),
  requiresBuild: new Set(["build_project", "run_tests"]),
}

// Tools that work without any workspace
const WORKSPACE_FREE_TOOLS = new Set([
  "web_search", "web_fetch",
  "browser_navigate", "browser_click", "browser_type", "browser_snapshot",
  "think", "reasoning", "plan",
  "delegate_task", "spawn_agent",
])

export type AgentModeOption = "fast" | "full" | "multi"

export interface ExecuteOptions {
  input: string
  activeRole: RuntimeRole
  correlationId?: string
  mode?: AgentModeOption
  signal?: AbortSignal
}

export class ExecutionOrchestrator {
  private static instance: ExecutionOrchestrator
  private currentCtrl: AbortController | null = null
  private isExecuting = false
  private executeLock = false

  static getInstance(): ExecutionOrchestrator {
    if (!ExecutionOrchestrator.instance) {
      ExecutionOrchestrator.instance = new ExecutionOrchestrator()
    }
    return ExecutionOrchestrator.instance
  }

  cancel(): void {
    const ctrl = this.currentCtrl
    this.isExecuting = false
    this.executeLock = false
    StreamManager.getInstance().clearAll()
    if (ctrl && !ctrl.signal.aborted) {
      ctrl.abort()
    }
  }

  static cancelCurrent(): void {
    const inst = ExecutionOrchestrator.instance
    if (inst) inst.cancel()
  }

  async *execute(options: ExecuteOptions): AsyncGenerator<ExecutionEvent> {
    // Atomic check-and-set to prevent TOCTOU race
    if (this.executeLock) {
      console.warn("[Orchestrator] execute called while already executing — rejecting duplicate")
      throw new Error("An execution is already in progress. Please wait for it to complete or cancel it.")
    }
    this.executeLock = true
    if (options.signal?.aborted) {
      this.executeLock = false
      console.warn("[Orchestrator] execute called with already-aborted signal — rejecting")
      throw new DOMException("Execution cancelled before start", "AbortError")
    }
    // Check circuit breaker before starting execution
    const cb = ReliabilityManager.getInstance().circuitBreakers.getOrCreate("execution")
    if (!cb.allowRequest()) {
      this.executeLock = false
      throw new Error("Execution circuit breaker is open — too many recent failures. Please wait and try again.")
    }
    this.isExecuting = true
    let cleanupId = ""
    let cleanupRegistered = false
    let onUserAbort: (() => void) | null = null
    let onShutdown: (() => void) | null = null
    let userSignal: AbortSignal | undefined
    let shutdownSignal: AbortSignal | undefined
    try {
    const { input, activeRole, correlationId, signal: sig } = options
    userSignal = sig
    const t0 = performance.now()
    const executionId = `exec_${Date.now()}`
    const traceId = `msg_${Date.now()}`
    const ctrl = new AbortController()
    const sdSignal = RuntimeCleanupManager.getInstance().signal
    shutdownSignal = sdSignal
    this.currentCtrl = ctrl
    cleanupId = `orchestrator_exec_${Date.now()}`
    RuntimeCleanupManager.getInstance().register(
      { type: "abort-controller", id: cleanupId, controller: ctrl },
      "execution",
    )
    cleanupRegistered = true
    if (userSignal && !userSignal.aborted) {
      onUserAbort = () => ctrl.abort()
      userSignal.addEventListener("abort", onUserAbort, { once: true })
    } else if (userSignal?.aborted) {
      ctrl.abort()
    }

    if (!shutdownSignal.aborted) {
      onShutdown = () => ctrl.abort()
      shutdownSignal.addEventListener("abort", onShutdown, { once: true })
    }

    startTrace(traceId)
    trace(traceId, "message_received", { length: input.length })
    const orchTag = "[Orchestrator]"

    console.log(`${orchTag} ▶ execute start (executionId=${executionId}, inputLen=${input.length}, role=${activeRole})`)
    yield { type: "EXECUTION_CREATED", executionId, input, timestamp: Date.now() }
    recordExecutionStage("execution_started", executionId)

    const runtimeState = useWorkspaceRuntime.getState()
    const providers = useAppStore.getState().providers ?? []

    yield { type: "THINKING_STARTED", executionId, label: "Routing", timestamp: Date.now() }

    trace(traceId, "routing_start")
    const runtimeRoles = runtimeState.wiredRuntimeRoles
    const decision = this.assignAgentForTask(input, runtimeRoles, executionId)
    trace(traceId, "routing_end", { strategy: decision.executionStrategy, roles: decision.selectedRoles })
    console.log(`${orchTag} routing: strategy=${decision.executionStrategy}, roles=${decision.selectedRoles?.join(",")}, delegation=${decision.requiresDelegation} (${Math.round(performance.now() - t0)}ms)`)

    if (runtimeState.status === "uninitialized" || runtimeState.status === "initializing") {
      console.log(`${orchTag} ✗ runtime not ready (${runtimeState.status})`)
      yield { type: "EXECUTION_FAILED", executionId, error: "Runtime is still initializing", durationMs: 0, timestamp: Date.now() }
      return
    }

    if (runtimeState.wiredRoles === 0 && runtimeState.wiredAgents.length === 0) {
      console.log(`${orchTag} ✗ no agents configured`)
      yield { type: "EXECUTION_FAILED", executionId, error: "No agents configured", durationMs: 0, timestamp: Date.now() }
      return
    }

    if (!runtimeState.managerWired) {
      console.log(`${orchTag} ✗ manager not wired`)
      yield { type: "EXECUTION_FAILED", executionId, error: "Manager agent not configured", durationMs: 0, timestamp: Date.now() }
      return
    }

    // Workspace guard: tool-driven capability check
    // If no workspace is open, check if the selected roles have tools that require it
    const workspaceRoot = useWorkspaceStore.getState().rootPath
    const workspaceOpen = !!workspaceRoot

    if (!workspaceOpen && decision.requiresDelegation) {
      const needsWorkspace = this.checkWorkspaceRequired(decision, executionId)
      if (needsWorkspace) {
        console.log(`${orchTag} workspace required but none open — returning early`)
        yield { type: "THINKING_STARTED", executionId, label: "No workspace open", timestamp: Date.now() }
        const noWsMsg = "I can't inspect files or run commands because no workspace is currently open. Open a folder and I'll immediately inspect its contents."
        yield { type: "AGENT_ASSIGNED", executionId, correlationId, roleId: "assistant", roleName: "Assistant", modelName: "", providerName: "", stepId: `${executionId}_step`, timestamp: Date.now() }
        StreamManager.getInstance().append(`${executionId}_step`, noWsMsg)
        StreamManager.getInstance().complete(`${executionId}_step`)
        yield { type: "MESSAGE_COMPLETE", executionId, stepId: `${executionId}_step`, content: noWsMsg, finishReason: "stop", timestamp: Date.now() }
        const durationMs = Math.round(performance.now() - t0)
        recordAgentExecution(durationMs, 0, 0)
        yield { type: "EXECUTION_COMPLETE", executionId, content: noWsMsg, filesEdited: 0, commandsRun: 0, toolCalls: 0, durationMs, timestamp: Date.now() }
        endTrace(traceId)
        return
      }
    }

    const agentMode: AgentMode = this.resolveMode(decision, options.mode)
    console.log(`${orchTag} mode=${agentMode} (${Math.round(performance.now() - t0)}ms)`)

    // Register watchdog for this execution
    const wd = ReliabilityManager.getInstance().watchdog
    const wdId = `orchestrator_${executionId}`
    wd.register({
      id: wdId,
      type: WatchdogTargetType.AGENT,
      label: `Execution ${executionId.slice(-8)}`,
      timeoutMs: 300_000,
      abortController: ctrl,
    })

    try {
      if (!decision.requiresDelegation || agentMode === "FAST") {
        console.log(`${orchTag} ● handleDirectResponse (${Math.round(performance.now() - t0)}ms)`)
        yield* this.handleDirectResponse(input, activeRole, ctrl, executionId, correlationId)
      } else {
        console.log(`${orchTag} ● handleDelegatedExecution (${Math.round(performance.now() - t0)}ms)`)
        yield* this.handleDelegatedExecution(input, activeRole, decision, ctrl, executionId, providers, t0, correlationId)
      }
    } finally {
      wd.unregister(wdId)
    }

    // Record success with circuit breaker
    cb.recordSuccess()
    endTrace(traceId)
    console.log(`${orchTag} ✓ execute complete (${Math.round(performance.now() - t0)}ms)`)
  } finally {
    this.isExecuting = false
    this.executeLock = false
    this.currentCtrl = null
    if (onUserAbort && userSignal && !userSignal.aborted) {
      userSignal.removeEventListener("abort", onUserAbort)
    }
    if (onShutdown && shutdownSignal && !shutdownSignal.aborted) {
      shutdownSignal.removeEventListener("abort", onShutdown)
    }
    if (cleanupRegistered) {
      RuntimeCleanupManager.getInstance().unregister(cleanupId)
    }
  }
}

  /** Check if any tool available to the selected roles requires workspace access */
  private checkWorkspaceRequired(decision: RoutingDecision, executionId: string): boolean {
    try {
      const runtimeOS = RuntimeOS.getInstance()
      for (const role of decision.selectedRoles) {
        const roleTools = runtimeOS.toolRegistry.getByMode(role)
        for (const tool of roleTools) {
          for (const [, tools] of Object.entries(WORKSPACE_CAPABILITIES)) {
            if (tools.has(tool.name)) return true
          }
        }
      }
    } catch {
      // If RuntimeOS isn't available, fall through to allow
    }
    return false
  }

  private resolveMode(decision: RoutingDecision, requestedMode?: AgentModeOption): AgentMode {
    if (requestedMode === "fast") return "FAST"
    if (requestedMode === "multi") return "MULTI"
    if (requestedMode === "full") return "FULL"
    if (!decision.requiresDelegation) return "FAST"
    if (decision.executionStrategy === "multi-agent") return "MULTI"
    return "FULL"
  }

  private assignAgentForTask(userInput: string, wiredRoles: RuntimeRole[], executionId: string): RoutingDecision {
    const store = useAgentStore.getState()
    store.clearAssignments()
    store.clearOrchestrationSteps()

    const decision = managerRoute(userInput, wiredRoles)
    const constrainedRoles = applyModeConstraints("autonomous", [...decision.selectedRoles], decision.intentCategory)
      .filter((role, index, roles) => roles.indexOf(role) === index)
    const constrainedDecision: RoutingDecision = {
      ...decision,
      selectedRoles: constrainedRoles as RoutingDecision["selectedRoles"],
    }

    for (const role of constrainedDecision.selectedRoles) {
      store.addAgentAssignment({ role, reason: constrainedDecision.reasoning, status: "active", startedAt: Date.now() })
    }

    store.addOrchestrationStep({
      type: constrainedDecision.requiresDelegation ? "delegate" : "analyze",
      agent: constrainedDecision.selectedRoles[0] ?? "manager",
      description: constrainedDecision.reasoning,
      status: "running",
    })

    return constrainedDecision
  }

  private async *handleDirectResponse(
    input: string,
    activeRole: RuntimeRole,
    ctrl: AbortController,
    executionId: string,
    correlationId?: string,
  ): AsyncGenerator<ExecutionEvent> {
    const runtimeState = useWorkspaceRuntime.getState()
    const wiredForFastChat = runtimeState.wiredAgents.find((a) => a.runtimeRole === "manager") ?? runtimeState.wiredAgents[0]

    if (!wiredForFastChat) {
      yield { type: "EXECUTION_FAILED", executionId, error: "No agent available", durationMs: 0, timestamp: Date.now() }
      return
    }

    const providers = useAppStore.getState().providers ?? []
    const fcProvider = providers.find((p) => p.id === wiredForFastChat.providerId)
    if (!fcProvider) {
      emitTelemetry({ type: "provider_failure", timestamp: Date.now(), error: `Provider ${wiredForFastChat.providerId} not found`, metadata: { executionId, providerId: wiredForFastChat.providerId, role: wiredForFastChat.runtimeRole } })
      yield { type: "EXECUTION_FAILED", executionId, error: `Provider ${wiredForFastChat.providerId} not found`, durationMs: 0, timestamp: Date.now() }
      return
    }

    const stepId = `${executionId}_step`

    yield {
      type: "AGENT_ASSIGNED",
      executionId,
      correlationId,
      roleId: wiredForFastChat.runtimeRole,
      roleName: wiredForFastChat.runtimeRole.charAt(0).toUpperCase() + wiredForFastChat.runtimeRole.slice(1),
      modelName: wiredForFastChat.model,
      providerName: fcProvider.name,
      stepId,
      timestamp: Date.now(),
    }

    const streamManager = StreamManager.getInstance()
    let streamedContent = ""
    let streamTokenCount = 0
    const fcT0 = performance.now()
    const orchTag = "[Orchestrator]"

    console.log(`${orchTag} ● handleDirectResponse start (model=${wiredForFastChat.model}, provider=${fcProvider.name})`)
    yield { type: "THINKING_STARTED", executionId, label: "Thinking", timestamp: Date.now() }
    yield { type: "PROVIDER_CONNECTING", executionId, model: wiredForFastChat.model, provider: fcProvider.name, temperature: wiredForFastChat.temperature, timestamp: Date.now() }

    try {
      const PROVIDER_TIMEOUT_MS = 30_000
      let fcTokenCount = 0
      const timeoutSignal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
      const combinedSignal = new AbortController()
      const onAbort = () => combinedSignal.abort()
      ctrl.signal.addEventListener("abort", onAbort, { once: true })
      timeoutSignal.addEventListener("abort", () => {
        if (!ctrl.signal.aborted) {
          console.log(`${orchTag} ✗ provider timeout ${PROVIDER_TIMEOUT_MS}ms reached (${Math.round(performance.now() - fcT0)}ms)`)
          combinedSignal.abort(new DOMException("Provider timed out after 30s", "TimeoutError"))
        }
      }, { once: true })

      const history = this.getProcessedHistory(activeRole)
      const providerRuntime = new ProviderRuntime(fcProvider.baseUrl, fcProvider.apiKey)
      providerRuntime.setDefaultModel(wiredForFastChat.model)

      console.log(`${orchTag} ● calling ProviderRuntime.stream (${Math.round(performance.now() - fcT0)}ms)`)

      let finalContent = ''
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
          fcTokenCount++
          streamManager.append(stepId, chunk.text, fcTokenCount <= 5)
        } else if (chunk.type === 'done') {
          finalContent = chunk.fullText
        } else if (chunk.type === 'error') {
          throw new Error(chunk.error)
        }
      }

      ctrl.signal.removeEventListener("abort", onAbort)

      const fcDurationMsCall = Math.round(performance.now() - fcT0)
      console.log(`${orchTag} ✓ ProviderRuntime.stream returned (${fcDurationMsCall}ms, streamTokens=${streamTokenCount}, contentLen=${finalContent.length})`)
      recordProviderCall(fcProvider.name, wiredForFastChat.model, fcDurationMsCall, true, executionId)
      yield { type: "PROVIDER_CONNECTED", executionId, model: wiredForFastChat.model, provider: fcProvider.name, temperature: wiredForFastChat.temperature, timestamp: Date.now() }

      if (streamTokenCount === 0 && finalContent.length > 0) {
        console.log(`${orchTag} ⚠ streaming produced 0 tokens, using non-streaming response (len=${finalContent.length})`)
        streamManager.append(stepId, finalContent)
        streamManager.flushImmediate()
        streamedContent = finalContent
      }

      streamManager.complete(stepId)

      if (!streamedContent) {
        console.log(`${orchTag} ✗ empty response from provider (${Math.round(performance.now() - fcT0)}ms)`)
        emitTelemetry({ type: "provider_failure", timestamp: Date.now(), error: "Provider returned empty response", metadata: { executionId } })
        yield { type: "EXECUTION_FAILED", executionId, error: "Provider returned empty response", durationMs: Math.round(performance.now() - fcT0), timestamp: Date.now() }
        return
      }

      const fcDurationMs = Math.round(performance.now() - fcT0)
      console.log(`${orchTag} ✓ handleDirectResponse complete (${fcDurationMs}ms, tokens=${streamTokenCount}, finalLen=${streamedContent.length})`)
      recordAgentExecution(fcDurationMs, 0, 0)
      yield { type: "MESSAGE_COMPLETE", executionId, stepId, content: streamedContent, finishReason: "stop", timestamp: Date.now() }
      yield { type: "EXECUTION_COMPLETE", executionId, content: streamedContent, filesEdited: 0, commandsRun: 0, toolCalls: 0, durationMs: fcDurationMs, timestamp: Date.now() }
    } catch (err) {
      streamManager.complete(stepId)
      const errMsg = err instanceof Error ? err.message : String(err)
      const elapsed = Math.round(performance.now() - fcT0)
      console.log(`${orchTag} ✗ ProviderRuntime.stream error at ${elapsed}ms: ${errMsg}`)
      recordProviderCall(fcProvider.name, wiredForFastChat.model, elapsed, false, executionId)
      emitTelemetry({ type: "provider_failure", timestamp: Date.now(), error: errMsg, metadata: { executionId } })
      yield { type: "EXECUTION_FAILED", executionId, error: errMsg, durationMs: elapsed, timestamp: Date.now() }
      return
    }
  }

  private async *handleDelegatedExecution(
    input: string,
    activeRole: RuntimeRole,
    decision: RoutingDecision,
    ctrl: AbortController,
    executionId: string,
    providers: any[],
    t0: number,
    correlationId?: string,
  ): AsyncGenerator<ExecutionEvent> {
    const store = useAgentStore.getState()
    const runtimeState = useWorkspaceRuntime.getState()

    // ── Subtask pipeline ordering ──
    // Order agents so output flows: research → coder → browser → verification → manager synthesis
    const PIPELINE_ORDER: Record<string, number> = {
      research: 0,
      coder: 1,
      browser: 2,
      vision: 3,
      qa: 4,
      verification: 5,
      runtime: 6,
      "fast-inference": 7,
      design: 8,
      memory: 9,
      manager: 10,
    }
    const orderedRoles = [...decision.selectedRoles].sort(
      (a, b) => (PIPELINE_ORDER[a] ?? 99) - (PIPELINE_ORDER[b] ?? 99)
    )

    let failures = 0
    let totalFilesEdited = 0
    let totalCommandsRun = 0
    let totalBrowserActions = 0
    let totalToolCalls = 0
    const agentResults: { role: string; content: string }[] = []
    let previousAgentOutput = ""

    for (const selectedRole of orderedRoles) {
      if (ctrl.signal.aborted) break

      const role = selectedRole
      const runtimeRole = normalizeRole(role) ?? role
      if (!runtimeRole) {
        failures++
        continue
      }

      const wiredAgentInfo = runtimeState.wiredAgents.find((a) => a.runtimeRole === runtimeRole || a.roleId === runtimeRole)
      const stepId = `${executionId}_${runtimeRole}`

      yield {
        type: "AGENT_ASSIGNED",
        executionId,
        correlationId,
        roleId: runtimeRole,
        roleName: runtimeRole.charAt(0).toUpperCase() + runtimeRole.slice(1),
        modelName: wiredAgentInfo?.model,
        providerName: wiredAgentInfo?.providerName,
        stepId,
        timestamp: Date.now(),
      }

      // ── Special handler: Verification Agent ──
      // Instead of running an LLM agent, run the actual verification pipeline
      if (runtimeRole === "verification") {
        const changedFiles = agentResults.filter((r) => r.role === "coder").flatMap((r) => this.extractChangedFiles(r.content))
        if (changedFiles.length > 0) {
          const { VerificationPipeline } = await import("@/runtime/verification/VerificationPipeline")
          const pipeline = VerificationPipeline.getInstance()
          yield { type: "THINKING_STARTED", executionId, label: "Verification Agent: Running 8-stage pipeline", timestamp: Date.now() }

          const verifyResult = await pipeline.verifyChanges(changedFiles, ctrl.signal)
          agentResults.push({ role: "verification", content: verifyResult.llmFormatted ?? "" })

          if (verifyResult.passed) {
            yield { type: "VERIFY_PASSED", executionId, stepId, details: verifyResult.details, recovered: false, timestamp: Date.now() }
          } else {
            // Try auto-fix once
            const fixAttempt = await pipeline.autoFixWithRetry(verifyResult, changedFiles, ctrl.signal)
            if (fixAttempt.fixed) {
              yield { type: "VERIFY_PASSED", executionId, stepId, details: fixAttempt.finalResult.details, recovered: true, timestamp: Date.now() }
            } else {
              yield { type: "VERIFY_FAILED", executionId, stepId, lintErrors: verifyResult.lintErrors, typeErrors: verifyResult.typeErrors, buildErrors: verifyResult.buildErrors, testFailures: verifyResult.testFailures, details: verifyResult.details, autoFixApplied: true, timestamp: Date.now() }
            }
          }
        }
        previousAgentOutput = `Verification Agent completed for changed files: ${changedFiles.join(", ")}`
        continue // skip normal AgentExecutor path
      }

      // ── Subtask input construction ──
      // Pass previous agent output as context to the next agent
      // This creates a pipeline: research → coder → verification → synthesis
      let agentInput = input
      if (previousAgentOutput && agentResults.length > 0) {
        const prevRole = agentResults[agentResults.length - 1].role
        switch (runtimeRole) {
          case "coder":
            agentInput = `The research/investigation phase produced the following findings:\n\n${previousAgentOutput}\n\n---\n\nNow implement the solution based on those findings. Original request: ${input}`
            break
          case "qa":
          case "verification":
            agentInput = `The implementation phase produced the following code:\n\n${previousAgentOutput}\n\n---\n\nNow review, test, and validate this implementation. Original request: ${input}`
            break
          case "browser":
            agentInput = `Research findings:\n\n${previousAgentOutput}\n\n---\n\nNow perform browser-based investigation or validation. Original request: ${input}`
            break
          case "design":
            agentInput = `Previous analysis found:\n\n${previousAgentOutput}\n\n---\n\nNow create the design based on these findings. Original request: ${input}`
            break
          default:
            agentInput = `Previous agent (${prevRole}) produced:\n\n${previousAgentOutput}\n\n---\n\nNow handle your part. Original request: ${input}`
        }
      }

      let streamedContent = ""
      const agentTimeoutMs = 120_000
      const agentT0 = performance.now()

      try {
        const agentMode = this.resolveMode(decision)
        const executor = new AgentExecutor({
          executionId,
          mode: agentMode,
          role: runtimeRole as RuntimeRole,
          input: agentInput,
          history: this.getProcessedHistory(activeRole),
          signal: ctrl.signal,
        })

        let tokenCount = 0
        for await (const event of executor.execute()) {
          if (ctrl.signal.aborted) break
          if (performance.now() - agentT0 > agentTimeoutMs) {
            throw new Error(`Agent ${runtimeRole} exceeded timeout of ${agentTimeoutMs}ms`)
          }
          if (event.type === "TOKEN") {
            tokenCount++
            StreamManager.getInstance().append(stepId, event.token, tokenCount <= 5)
            continue
          }
          if (event.type === "TOOL_START" || event.type === "TOOL_COMPLETE") {
            totalToolCalls++
          }
          if (event.type === "MESSAGE_COMPLETE") {
            streamedContent = event.content
            continue
          }
          yield event
        }

        StreamManager.getInstance().complete(stepId)

        if (!ctrl.signal.aborted) {
          yield { type: "MESSAGE_COMPLETE", executionId, stepId, content: streamedContent || "", finishReason: "stop", timestamp: Date.now() }
          agentResults.push({ role: runtimeRole, content: streamedContent || "" })
          previousAgentOutput = streamedContent
        }
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e)
        console.error(`[Orchestrator] Agent ${role} failed:`, errMsg)
        emitTelemetry({ type: "tool_failure", timestamp: Date.now(), error: errMsg, metadata: { executionId, role, stepId } })

        StreamManager.getInstance().complete(stepId)
        if (!ctrl.signal.aborted) {
          yield { type: "EXECUTION_FAILED", executionId, error: errMsg, durationMs: 0, timestamp: Date.now() }
        }
        failures++
      }
    }

    if (agentResults.length === 0 && failures > 0) {
      yield { type: "EXECUTION_FAILED", executionId, error: `All ${failures} agent(s) failed`, durationMs: Math.round(performance.now() - t0), timestamp: Date.now() }
      return
    }

    if (decision.executionStrategy === "multi-agent" && agentResults.length > 0) {
      try {
        const { SynthesisEngine } = await import("@/runtime/execution/SynthesisEngine")
        const synthesisEngine = new SynthesisEngine()
        const synthGen = synthesisEngine.synthesize(input, agentResults, [], executionId, ctrl.signal)
        let synthesized = ""
        for await (const event of synthGen) {
          synthesized = event.type === "MESSAGE_COMPLETE" ? event.content : synthesized
          yield event
        }
        yield { type: "SYNTHESIS_COMPLETE", executionId, role: activeRole, content: synthesized, timestamp: Date.now() }
      } catch (e) {
        console.error("[Orchestrator] Synthesis failed:", e)
        emitTelemetry({ type: "provider_failure", timestamp: Date.now(), error: e instanceof Error ? e.message : String(e), metadata: { executionId, phase: "synthesis" } })
        useToastStore.getState().addToast("Failed to synthesize agent results into a final response.", "error", 5000)
      }
    }

    const agentDurationMs = Math.round(performance.now() - t0)
    recordExecutionStage("execution_completed", executionId, agentDurationMs, undefined, { filesEdited: totalFilesEdited, toolCalls: totalToolCalls, agents: agentResults.length })
    recordAgentExecution(agentDurationMs, 0, totalToolCalls)
    yield { type: "EXECUTION_COMPLETE", executionId, content: agentResults.map((r) => r.content).join("\n"), filesEdited: totalFilesEdited, commandsRun: totalCommandsRun, toolCalls: totalToolCalls, durationMs: agentDurationMs, timestamp: Date.now() }
  }

  /** Extract changed file paths from an agent's output content */
  private extractChangedFiles(content: string): string[] {
    const files: string[] = []
    const filePattern = /(?:edited|created|updated|modified|wrote|changed)\s+(?:file\s+)?(?:`([^`]+)`|([^\s,.]+))/gi
    let match
    while ((match = filePattern.exec(content)) !== null) {
      const path = (match[1] ?? match[2]).trim()
      if (path && path.match(/\.(ts|tsx|js|jsx|json|css|html|md)$/) && !files.includes(path)) {
        files.push(path)
      }
    }
    return files
  }

  private getProcessedHistory(activeRole: RuntimeRole): any[] {
    const conversations = useAgentStore.getState().conversations
    const currentMessages = conversations[activeRole]?.messages ?? []
    const history = currentMessages.filter((m: any) => m.role !== "system")

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
}
