import type { RuntimeRole } from "@/types"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type { RoutingDecision } from "@/runtime/manager-routing-engine"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useSandboxStore } from "@/stores/sandbox-store"
import { AgentExecutor } from "@/runtime/agents/AgentExecutor"
import { ExecutionScratchpad } from "@/runtime/execution/ExecutionScratchpad"
import { StreamManager } from "@/runtime/streaming/StreamManager"
import { VerificationPipeline } from "@/runtime/verification/VerificationPipeline"
import { VerificationRecoveryLoop } from "@/runtime/execution/VerificationRecoveryLoop"
import { normalizeRole } from "@/lib/role-identity"
import { safeCapitalize } from "@/lib/safeCapitalize"
import { WorktreeSandboxManager } from "@/lib/git/WorktreeSandbox"
import { orderPipelineRoles, checkMultiAgentEligibility } from "./ExecutionRouter"
import { execTrace } from "@/runtime/execution-tracer"
import { traceStage as reqTraceStage } from "@/runtime/RequestTracer"
import { runtimeDebugLog, runtimeDebugTrace } from "@/runtime/runtime-debug"

type GetHistoryFn = (role: RuntimeRole) => any[]

export class AgentPipelineOrchestrator {
  private getProcessedHistory: GetHistoryFn

  constructor(deps: { getProcessedHistory: GetHistoryFn }) {
    this.getProcessedHistory = deps.getProcessedHistory
  }

  async *execute(
    input: string,
    activeRole: RuntimeRole,
    decision: RoutingDecision,
    ctrl: AbortController,
    executionId: string,
    providers: any[],
    t0: number,
    correlationId?: string,
    requestId?: string,
  ): AsyncGenerator<ExecutionEvent> {
    const _traceId = correlationId ?? executionId
    const _reqId = requestId ?? _traceId
    execTrace("AgentPipelineOrchestrator.execute", _traceId, { inputLen: input.length, role: activeRole, executionId, correlationId, selectedRoles: decision.selectedRoles, mode: decision.mode })
    if (requestId) {
      reqTraceStage(requestId, "Planner", { selectedRoles: decision.selectedRoles, strategy: decision.executionStrategy })
    }
    runtimeDebugTrace(`[XTRACE:${_traceId}] AgentPipelineOrchestrator.execute CALL STACK`)
    const scratchpad = new ExecutionScratchpad(input.slice(0, 200))
    const orderedRoles = orderPipelineRoles(decision.selectedRoles)
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

    const useMultiAgent = await checkMultiAgentEligibility(input)
    if (useMultiAgent) {
      yield { type: "THINKING_STARTED", executionId, label: "Multi-agent orchestration", timestamp: Date.now() }
      const { MultiAgentOrchestrator } = await import("@/runtime/multi-agent")
      const orchestrator = new MultiAgentOrchestrator()
      let goalFailed = false
      let goalFailedReason = ""
      for await (const event of orchestrator.execute(executionId, input, correlationId, ctrl.signal)) {
        if (event.type === "GOAL_FAILED") {
          goalFailed = true
          goalFailedReason = (event as any).reason ?? "Multi-agent execution failed"
        }
        yield event
      }
      if (goalFailed) {
        const durMs = Math.round(performance.now() - t0)
        yield { type: "EXECUTION_FAILED", executionId, error: goalFailedReason, durationMs: durMs, timestamp: Date.now() }
        return
      }
      const finalContent = orchestrator.getMessages().map((m: any) => m.summary).join("\n")
      results.push({ role: "multi-agent", content: finalContent })
      previousOutput = finalContent
      const stepId = `${executionId}_multi`
      StreamManager.getInstance().complete(stepId)
      yield { type: "MESSAGE_COMPLETE", executionId, stepId, content: finalContent, finishReason: "stop", timestamp: Date.now(), tokensIn: 0, tokensOut: 0 }
      const durMs = Math.round(performance.now() - t0)
      yield { type: "EXECUTION_COMPLETE", executionId, content: finalContent, filesEdited: 0, commandsRun: 0, toolCalls: 0, durationMs: durMs, timestamp: Date.now(), executionMode: "full" }
      return
    }

    for (const role of orderedRoles) {
      runtimeDebugLog("[FLOW:3] AgentPipelineOrchestrator.execute: role=" + role + " (index " + orderedRoles.indexOf(role) + "/" + orderedRoles.length + ")")
      if (ctrl.signal.aborted) break
      const runtimeRole = normalizeRole(role) ?? role
      if (!runtimeRole) continue

      const runtimeState = useWorkspaceRuntime.getState()
      const wired = runtimeState.wiredAgents.find((a) => a.runtimeRole === runtimeRole || a.roleId === runtimeRole)
      const stepId = `${executionId}_${runtimeRole}`

      yield { type: "AGENT_ASSIGNED", executionId, correlationId, roleId: runtimeRole, roleName: safeCapitalize(runtimeRole), modelName: wired?.model, providerName: wired?.providerName, stepId, executionStrategy: decision.executionStrategy, timestamp: Date.now() }

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
      let agentFailed = false
      let totalTokensIn = 0
      let totalTokensOut = 0
      for await (const event of executor.execute()) {
        if (ctrl.signal.aborted) break
        if (performance.now() - agentT0 > 120_000) {
          throw new Error(`Agent ${runtimeRole} timed out`)
        }
        if (event.type === "MESSAGE_COMPLETE") { content = event.content; totalTokensIn += event.tokensIn; totalTokensOut += event.tokensOut; continue }
        if (event.type === "EXECUTION_FAILED") { agentFailed = true }
        yield event
      }

      runtimeDebugLog("[FLOW:12] AgentPipelineOrchestrator.execute: agent for-await complete for role=" + role)
      StreamManager.getInstance().complete(stepId)
      if (!ctrl.signal.aborted) {
        yield { type: "MESSAGE_COMPLETE", executionId, stepId, content: content || "", finishReason: agentFailed ? "error" : "stop", timestamp: Date.now(), tokensIn: totalTokensIn, tokensOut: totalTokensOut }
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
        console.error("[AgentPipelineOrchestrator] Synthesis failed:", e)
      }
    }

    const activeSandbox = useSandboxStore.getState().activeSandbox
    if (activeSandbox && activeSandbox.status === 'active') {
      WorktreeSandboxManager.getInstance().getDiff(activeSandbox)
        .then((diff) => useSandboxStore.getState().setDiff(diff))
        .catch(() => {})
    }

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
    runtimeDebugLog("[FLOW:13] AgentPipelineOrchestrator.execute: yielding EXECUTION_COMPLETE")
    yield { type: "EXECUTION_COMPLETE", executionId, content: results.map((r) => r.content).join("\n"), filesEdited: uniqueFiles.length, commandsRun: 0, toolCalls: 0, durationMs, timestamp: Date.now(), executionMode: "full" }
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
}
