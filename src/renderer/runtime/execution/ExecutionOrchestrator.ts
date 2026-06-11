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
import { fastChatCompletion } from "@/lib/agents/orchestrator"
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

  static getInstance(): ExecutionOrchestrator {
    if (!ExecutionOrchestrator.instance) {
      ExecutionOrchestrator.instance = new ExecutionOrchestrator()
    }
    return ExecutionOrchestrator.instance
  }

  cancel(): void {
    this.currentCtrl?.abort()
    StreamManager.getInstance().clearAll()
    this.isExecuting = false
  }

  static cancelCurrent(): void {
    ExecutionOrchestrator.getInstance().cancel()
  }

  async *execute(options: ExecuteOptions): AsyncGenerator<ExecutionEvent> {
    if (this.isExecuting) {
      console.warn("[Orchestrator] execute called while already executing — rejecting duplicate")
      throw new Error("An execution is already in progress. Please wait for it to complete or cancel it.")
    }
    if (options.signal?.aborted) {
      console.warn("[Orchestrator] execute called with already-aborted signal — rejecting")
      throw new DOMException("Execution cancelled before start", "AbortError")
    }
    // Check circuit breaker before starting execution
    const cb = ReliabilityManager.getInstance().circuitBreakers.getOrCreate("execution")
    if (!cb.allowRequest()) {
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

    yield { type: "EXECUTION_CREATED", executionId, input, timestamp: Date.now() }
    recordExecutionStage("execution_started", executionId)

    const runtimeState = useWorkspaceRuntime.getState()
    const providers = useAppStore.getState().providers ?? []

    yield { type: "THINKING_STARTED", executionId, label: "Routing", timestamp: Date.now() }

    trace(traceId, "routing_start")
    const runtimeRoles = runtimeState.wiredRuntimeRoles
    const decision = this.assignAgentForTask(input, runtimeRoles, executionId)
    trace(traceId, "routing_end", { strategy: decision.executionStrategy, roles: decision.selectedRoles })

    if (runtimeState.status === "uninitialized" || runtimeState.status === "initializing") {
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

    // Workspace guard: tool-driven capability check
    // If no workspace is open, check if the selected roles have tools that require it
    const workspaceRoot = useWorkspaceStore.getState().rootPath
    const workspaceOpen = !!workspaceRoot

    if (!workspaceOpen && decision.requiresDelegation) {
      const needsWorkspace = this.checkWorkspaceRequired(decision, executionId)
      if (needsWorkspace) {
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
        yield* this.handleDirectResponse(input, activeRole, ctrl, executionId, correlationId)
      } else {
        yield* this.handleDelegatedExecution(input, activeRole, decision, ctrl, executionId, providers, t0, correlationId)
      }
    } finally {
      wd.unregister(wdId)
    }

    // Record success with circuit breaker
    cb.recordSuccess()
    endTrace(traceId)
  } finally {
    this.isExecuting = false
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
    const executionMode = store.executionMode
    const constrainedRoles = applyModeConstraints(executionMode, [...decision.selectedRoles], decision.intentCategory)
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
          combinedSignal.abort(new DOMException("Provider timed out after 30s", "TimeoutError"))
        }
      }, { once: true })
      const result = await fastChatCompletion(
        fcProvider.baseUrl, fcProvider.apiKey, wiredForFastChat.model,
        input, this.getProcessedHistory(activeRole), combinedSignal.signal,
        (token: string) => {
          streamedContent += token
          streamTokenCount++
          fcTokenCount++
          streamManager.append(stepId, token, fcTokenCount <= 5)
        },
      )
      ctrl.signal.removeEventListener("abort", onAbort)

      const fcDurationMsCall = Math.round(performance.now() - fcT0)
      recordProviderCall(fcProvider.name, wiredForFastChat.model, fcDurationMsCall, true, executionId)
      yield { type: "PROVIDER_CONNECTED", executionId, model: wiredForFastChat.model, provider: fcProvider.name, temperature: wiredForFastChat.temperature, timestamp: Date.now() }

      if (streamTokenCount === 0 && result.response.length > 0) {
        streamManager.append(stepId, result.response)
        streamManager.flushImmediate()
        streamedContent = result.response
      }

      streamManager.complete(stepId)

      const finalContent = streamedContent
      if (!finalContent) {
        emitTelemetry({ type: "provider_failure", timestamp: Date.now(), error: "Provider returned empty response", metadata: { executionId } })
        yield { type: "EXECUTION_FAILED", executionId, error: "Provider returned empty response", durationMs: Math.round(performance.now() - fcT0), timestamp: Date.now() }
        return
      }

      const fcDurationMs = Math.round(performance.now() - fcT0)
      recordAgentExecution(fcDurationMs, 0, 0)
      yield { type: "MESSAGE_COMPLETE", executionId, stepId, content: finalContent, finishReason: "stop", timestamp: Date.now() }
      yield { type: "EXECUTION_COMPLETE", executionId, content: finalContent, filesEdited: 0, commandsRun: 0, toolCalls: 0, durationMs: fcDurationMs, timestamp: Date.now() }
    } catch (err) {
      streamManager.complete(stepId)
      const errMsg = err instanceof Error ? err.message : String(err)
      recordProviderCall(fcProvider.name, wiredForFastChat.model, Math.round(performance.now() - fcT0), false, executionId)
      emitTelemetry({ type: "provider_failure", timestamp: Date.now(), error: errMsg, metadata: { executionId } })
      yield { type: "EXECUTION_FAILED", executionId, error: errMsg, durationMs: Math.round(performance.now() - fcT0), timestamp: Date.now() }
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

    let failures = 0
    let totalFilesEdited = 0
    let totalCommandsRun = 0
    let totalBrowserActions = 0
    let totalToolCalls = 0
    const agentResults: { role: string; content: string }[] = []

    for (const selectedRole of decision.selectedRoles) {
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

      let streamedContent = ""

      try {
        const agentMode = this.resolveMode(decision)
        const executor = new AgentExecutor({
          executionId,
          mode: agentMode,
          role: runtimeRole as RuntimeRole,
          input,
          history: this.getProcessedHistory(activeRole),
          signal: ctrl.signal,
        })

        let tokenCount = 0
        for await (const event of executor.execute()) {
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

        if (streamedContent) {
          yield { type: "MESSAGE_COMPLETE", executionId, stepId, content: streamedContent, finishReason: "stop", timestamp: Date.now() }
          agentResults.push({ role: runtimeRole, content: streamedContent })
        }
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e)
        console.error(`[Orchestrator] Agent ${role} failed:`, errMsg)
        emitTelemetry({ type: "tool_failure", timestamp: Date.now(), error: errMsg.slice(0, 300), metadata: { executionId, role, stepId } })

        StreamManager.getInstance().complete(stepId)
        yield { type: "EXECUTION_FAILED", executionId, error: errMsg.slice(0, 300), durationMs: 0, timestamp: Date.now() }
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
