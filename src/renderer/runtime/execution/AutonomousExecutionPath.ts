import type { RuntimeRole } from "@/types"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import type { RoutingDecision } from "@/runtime/manager-routing-engine"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { providerGateway } from "@/runtime/providers/ProviderGateway"
import { AgentExecutor } from "@/runtime/agents/AgentExecutor"
import { ExecutionScratchpad } from "@/runtime/execution/ExecutionScratchpad"
import { ExecutionBudgetManager } from "@/runtime/execution/ExecutionBudgetManager"
import { VerificationPipeline } from "@/runtime/verification/VerificationPipeline"
import { BrowserExecutionBridge } from "@/runtime/browser/BrowserExecutionBridge"
import { FeatureFlagManager } from "@/runtime/feature-flags/FeatureFlagManager"
import { GoalState } from "@/runtime/autonomous/GoalState"
import type { GoalSnapshot } from "@/runtime/autonomous/GoalState"
import { MemoryArchitecture } from "@/runtime/memory/unified/MemoryArchitecture"

type FullPathFn = (
  input: string,
  activeRole: RuntimeRole,
  decision: RoutingDecision,
  ctrl: AbortController,
  executionId: string,
  providers: any[],
  t0: number,
  correlationId?: string,
) => AsyncGenerator<ExecutionEvent>

type GetProcessedHistoryFn = (activeRole: RuntimeRole) => any[]
type GetWorkspaceSnapshotFn = () => Record<string, string>
type DetectFileChangesFn = (before: Record<string, string>) => string[]

export class AutonomousExecutionPath {
  private fullPath: FullPathFn
  private getProcessedHistory: GetProcessedHistoryFn
  private getWorkspaceSnapshot: GetWorkspaceSnapshotFn
  private detectFileChanges: DetectFileChangesFn

  constructor(deps: {
    fullPath: FullPathFn
    getProcessedHistory: GetProcessedHistoryFn
    getWorkspaceSnapshot: GetWorkspaceSnapshotFn
    detectFileChanges: DetectFileChangesFn
  }) {
    this.fullPath = deps.fullPath
    this.getProcessedHistory = deps.getProcessedHistory
    this.getWorkspaceSnapshot = deps.getWorkspaceSnapshot
    this.detectFileChanges = deps.detectFileChanges
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
    goalId?: string,
    goalObjective?: string,
  ): AsyncGenerator<ExecutionEvent> {
    const actualGoalId = goalId ?? `auto_${executionId}`
    const objective = goalObjective ?? input
    const goalState = GoalState.getInstance()
    const budgetMgr = ExecutionBudgetManager.getInstance()
    const verifier = VerificationPipeline.getInstance()
    const browserBridge = BrowserExecutionBridge.getInstance()
    const ff = FeatureFlagManager.getInstance()
    const browserContinuity = ff.isEnabled("browserContinuity")

    const goal = goalState.createGoal(objective, undefined, actualGoalId)
    const budgetId = budgetMgr.createBudget({})

    browserBridge.setExecutionId(executionId)
    if (browserContinuity) {
      const tier = browserBridge.selectTier(objective)
      if (tier !== "in_app") {
        yield { type: "THINKING_STARTED", executionId, label: "Setting up browser", timestamp: Date.now() }
        for await (const _ of browserBridge.launchSession(undefined, tier)) { yield _ }
      }
      for await (const _ of browserBridge.restoreSession(actualGoalId)) { yield _ }
    }

    let iteration = 0
    while (goal.status === "active" && !ctrl.signal.aborted && iteration < 50) {
      iteration++

      yield { type: "THINKING_STARTED", executionId, label: "Planning approach", timestamp: Date.now() }
      const planStep = await this.generateAutonomousStep(actualGoalId, objective, goal, ctrl.signal)
      if (!planStep) {
        if (iteration === 1) {
          yield* this.fullPath(input, activeRole, decision, ctrl, executionId, providers, t0, correlationId)
          break
        }
        break
      }
      yield { type: "PLAN_CREATED", executionId, steps: [planStep], timestamp: Date.now() }

      if (browserContinuity) {
        for await (const _ of browserBridge.restoreSession(actualGoalId)) { yield _ }
        const stepTier = browserBridge.selectTier(planStep)
        if (stepTier !== "in_app" && browserBridge.getActiveTier() !== stepTier) {
          for await (const _ of browserBridge.launchSession(undefined, stepTier)) { yield _ }
        }
      }

      const contextSnapshot = this.getWorkspaceSnapshot()
      const scratchpad = new ExecutionScratchpad(objective.slice(0, 200))
      const stepStartMs = Date.now()

      const executor = new AgentExecutor({
        executionId, mode: "FULL", role: activeRole,
        input: planStep, history: this.getProcessedHistory(activeRole), signal: ctrl.signal,
      })
      executor.setScratchpad(scratchpad)

      for await (const event of executor.execute()) {
        if (event.type === "MESSAGE_COMPLETE") {
          budgetMgr.recordUsage(budgetId, { tokens: (event as any).tokensIn ?? 0 + (event as any).tokensOut ?? 0 })
        }
        yield event
      }

      if (browserContinuity) {
        for await (const _ of browserBridge.saveSession(actualGoalId)) { yield _ }
      }

      const changes = this.detectFileChanges(contextSnapshot)
      goalState.addReflection(actualGoalId, `Iteration ${iteration}: ${changes.length} files changed`)

      if (changes.length > 0) {
        yield { type: "THINKING_STARTED", executionId, label: "Verifying changes", timestamp: Date.now() }
        let vr = await verifier.verifyChanges(changes, ctrl.signal)
        if (!vr.passed) {
          const fix = await verifier.autoFixWithRetry(vr, changes, ctrl.signal)
          vr = fix.finalResult
        }
        goalState.updateStep(actualGoalId, goal.steps[goal.currentStepIndex]?.id ?? "", {
          verificationResult: vr, status: vr.passed ? "verified" : "failed", changedFiles: changes,
        })
        yield vr.passed
          ? { type: "VERIFY_PASSED", executionId, stepId: `${executionId}_v`, details: vr.details, timestamp: Date.now(), recovered: false }
          : { type: "VERIFY_FAILED", executionId, stepId: `${executionId}_v`, lintErrors: vr.lintErrors, typeErrors: vr.typeErrors, buildErrors: vr.buildErrors, testFailures: vr.testFailures, details: vr.details, autoFixApplied: true, timestamp: Date.now() }
      }

      if (ff.isEnabled("autoMemory")) {
        await MemoryArchitecture.getInstance().storeManualMemory({
          content: `Goal: ${objective}\n\nProgress: ${goal.steps.map((s) => `- ${s.description} (${s.status})`).join("\n")}`,
          tags: ["auto-extracted", "goal"], category: "learning", scope: "project",
        })
      }

      const achieved = await this.checkGoalAchieved(goal, ctrl.signal)
      if (achieved) {
        goalState.completeGoal(actualGoalId, "completed")
        yield { type: "GOAL_ACHIEVED", executionId, goalId: actualGoalId, objective, iterations, stepsCompleted: goal.steps.length, reflectionsCount: goal.reflection.length, timestamp: Date.now() }
        break
      }

      if (!this.shouldContinueAutonomous(goal, iteration)) break
      goalState.updateBudgetUsed(actualGoalId, { iterations: 1 })
      budgetMgr.recordUsage(budgetId, { iterations: 1 })
    }

    if (ctrl.signal.aborted && goal.status === "active") {
      goalState.completeGoal(actualGoalId, "cancelled")
    }

    if (browserContinuity) {
      for await (const _ of browserBridge.saveSession(actualGoalId)) { yield _ }
    }

    yield { type: "EXECUTION_COMPLETE", executionId, content: objective, filesEdited: goal.steps.filter((s) => s.status === "verified").length, commandsRun: 0, toolCalls: 0, durationMs: Math.round(performance.now() - t0), timestamp: Date.now() }
  }

  private async generateAutonomousStep(
    goalId: string,
    objective: string,
    goal: GoalSnapshot,
    signal: AbortSignal,
  ): Promise<string | null> {
    const prompt = `Plan the next step for goal: "${objective}"
Progress: ${goal.steps.map((s) => `- ${s.description} (${s.status})`).join("\n")}
Return one sentence describing what to do next.`
    try {
      const wired = useWorkspaceRuntime.getState().wiredAgents.find((a) => a.runtimeRole === "manager")
      if (!wired) return null
      const stream = providerGateway.stream({
        systemPrompt: "You are a planning assistant. Be concise.",
        messages: [{ role: "user", content: prompt }],
        maxTokens: 256, signal,
        providerId: wired.providerId,
        model: wired.model,
      })
      let text = ""
      for await (const chunk of stream) {
        if (chunk.type === "token") text += chunk.text
        else if (chunk.type === "done") text = chunk.fullText
        else if (chunk.type === "error") throw new Error(chunk.message)
      }
      return text.trim() || prompt
    } catch {
      return null
    }
  }

  private async checkGoalAchieved(goal: GoalSnapshot, signal: AbortSignal): Promise<boolean> {
    if (!goal.steps.every((s) => s.status === "verified")) return false
    const files: string[] = []
    for (const step of goal.steps) {
      if (step.changedFiles) files.push(...step.changedFiles)
    }
    const verifier = VerificationPipeline.getInstance()
    const result = await verifier.verifyGoalAchieved([...new Set(files)], signal)
    if (result.goalAchieved) {
      GoalState.getInstance().addReflection(goal.id, "Goal achieved")
      return true
    }
    const cur = goal.steps[goal.currentStepIndex]
    if (cur) GoalState.getInstance().updateStep(goal.id, cur.id, { status: "failed" })
    return false
  }

  private shouldContinueAutonomous(goal: GoalSnapshot, iteration: number): boolean {
    if (goal.status !== "active") return false
    if (iteration >= 50) return false
    return true
  }
}
