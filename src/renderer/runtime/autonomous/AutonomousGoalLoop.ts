import { ExecutionOrchestrator } from "@/runtime/execution/ExecutionOrchestrator"
import { VerificationPipeline } from "@/runtime/verification/VerificationPipeline"
import { ExecutionBudgetManager } from "@/runtime/execution/ExecutionBudgetManager"
import { GoalState, type GoalSnapshot, type GoalBudget } from "./GoalState"
import { normalizeError } from "@/lib/normalize-error"
import { startTrace, trace, endTrace } from "@/lib/execution-trace"
import { CostTracker } from "@/runtime/cost/CostTracker"
import { useWorkspaceStore } from "@/stores/workspace-store"
import type { RuntimeRole } from "@/types"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import { BrowserExecutionBridge } from "@/runtime/browser/BrowserExecutionBridge"
import { FeatureFlagManager } from "@/runtime/feature-flags/FeatureFlagManager"
import { MemoryArchitecture } from "@/runtime/memory/unified/MemoryArchitecture"

export interface AutonomousGoalConfig {
  goalId: string
  objective: string
  budget?: GoalBudget
  role?: RuntimeRole
  verifyAfterEdit?: boolean
  maxRetriesPerStep?: number
}

export class AutonomousGoalLoop {
  private static instance: AutonomousGoalLoop
  private activeLoops = new Map<string, { config: AutonomousGoalConfig; ctrl: AbortController }>()

  static getInstance(): AutonomousGoalLoop {
    if (!AutonomousGoalLoop.instance) {
      AutonomousGoalLoop.instance = new AutonomousGoalLoop()
    }
    return AutonomousGoalLoop.instance
  }

  isActive(goalId: string): boolean {
    return this.activeLoops.has(goalId)
  }

  async *runGoal(config: AutonomousGoalConfig, externalSignal?: AbortSignal): AsyncGenerator<ExecutionEvent, void, void> {
    if (this.activeLoops.has(config.goalId)) {
      throw new Error(`Goal ${config.goalId} is already running`)
    }

    const ctrl = new AbortController()
    if (externalSignal) {
      externalSignal.addEventListener("abort", () => ctrl.abort())
    }
    this.activeLoops.set(config.goalId, { config, ctrl })

    const goalState = GoalState.getInstance()
    const budgetMgr = ExecutionBudgetManager.getInstance()
    const verifier = VerificationPipeline.getInstance()
    const costTracker = CostTracker.getInstance()
    const orchestrator = ExecutionOrchestrator.getInstance()

    const goal = goalState.createGoal(config.objective, config.budget, config.goalId)
    const executionId = `goal_${config.goalId}`
    const traceId = `autonomous_${config.goalId}`
    const startTime = Date.now()
    startTrace(traceId)

    yield { type: "EXECUTION_CREATED", executionId, input: config.objective, timestamp: Date.now() }
    yield {
      type: "AGENT_ASSIGNED",
      executionId,
      roleId: "manager",
      roleName: "Manager Agent",
      modelName: undefined,
      providerName: undefined,
      stepId: `${executionId}_step_0`,
      timestamp: Date.now(),
    }

    const budgetId = budgetMgr.createBudget(config.budget ?? {})

    // ── BROWSER CONTINUITY SETUP ──
    const browserBridge = BrowserExecutionBridge.getInstance()
    browserBridge.setExecutionId(executionId)
    const browserContinuityEnabled = FeatureFlagManager.getInstance().isEnabled("browserContinuity")

    if (browserContinuityEnabled) {
      const objectiveTier = browserBridge.selectTier(config.objective)
      if (objectiveTier !== "in_app") {
        yield { type: "THINKING_STARTED", executionId, label: objectiveTier === "chrome_extension" ? "Setting up browser (extensions enabled)" : "Setting up browser (plugin mode)", timestamp: Date.now() }
        for await (const _ of browserBridge.launchSession(undefined, objectiveTier)) {
          yield _
        }
      }
      for await (const _ of browserBridge.restoreSession(config.goalId)) {
        yield _
      }
    }

    let iteration = 0
    const maxRetries = config.maxRetriesPerStep ?? 3
    let retryCount = 0

    while (goal.status === "active" && !ctrl.signal.aborted) {
      iteration++
      trace(traceId, `iteration_${iteration}`)

      // ── PLAN ──
      yield { type: "THINKING_STARTED", executionId, label: "Planning approach", timestamp: Date.now() }

      const planResult = await this.generatePlan(orchestrator, config, goal, ctrl.signal)
      if (planResult.error) {
        goalState.addReflection(config.goalId, `Planning failed: ${planResult.error}`)
        retryCount++
        if (retryCount >= maxRetries) {
          goalState.completeGoal(config.goalId, "failed")
          yield { type: "EXECUTION_FAILED", executionId, error: `Planning failed after ${maxRetries} retries: ${planResult.error}`, durationMs: Date.now() - startTime, timestamp: Date.now() }
          break
        }
        continue
      }
      retryCount = 0

      yield { type: "PLAN_CREATED", executionId, steps: [planResult.step], timestamp: Date.now() }

      // ── BROWSER CONTINUITY (pre-EXECUTE) ──
      if (browserContinuityEnabled) {
        for await (const _ of browserBridge.restoreSession(config.goalId)) {
          yield _
        }
        const stepTier = browserBridge.selectTier(planResult.step)
        if (stepTier !== "in_app" && browserBridge.getActiveTier() !== stepTier) {
          yield { type: "THINKING_STARTED", executionId, label: stepTier === "chrome_extension" ? "Switching to browser with extensions" : "Switching to plugin browser", timestamp: Date.now() }
          for await (const _ of browserBridge.launchSession(undefined, stepTier)) {
            yield _
          }
        }
      }

      // ── EXECUTE ──
      yield { type: "THINKING_STARTED", executionId, label: "Executing step", timestamp: Date.now() }

      const contextSnapshot = this.getWorkspaceSnapshot()
      const stepStartTime = Date.now()
      let toolCallCount = 0

      let stepTokensIn = 0
      let stepTokensOut = 0

      const execStream = orchestrator.execute({
        input: planResult.step,
        activeRole: config.role ?? "manager",
        correlationId: `${config.goalId}_step_${stepStartTime}`,
        signal: ctrl.signal,
      })
      for await (const event of execStream) {
        if (event.type === "TOOL_START" || event.type === "TOOL_COMPLETE" || event.type === "TOOL_ERROR") {
          toolCallCount++
        }
        if (event.type === "MESSAGE_COMPLETE") {
          stepTokensIn += event.tokensIn ?? 0
          stepTokensOut += event.tokensOut ?? 0
        }
        yield event
      }

      const stepTotalTokens = stepTokensIn + stepTokensOut

      budgetMgr.recordUsage(budgetId, { toolCalls: toolCallCount, tokens: stepTotalTokens })
      goalState.updateBudgetUsed(config.goalId, {
        tokens: stepTotalTokens,
        timeMs: Date.now() - stepStartTime,
        toolCalls: toolCallCount,
      })
      costTracker.recordUsage(
        config.goalId,
        "unknown",
        "unknown",
        stepTokensIn,
        stepTokensOut,
        `iteration_${iteration}`,
      )

      // ── BROWSER CONTINUITY (post-EXECUTE) ──
      if (browserContinuityEnabled) {
        for await (const _ of browserBridge.saveSession(config.goalId)) {
          yield _
        }
      }

      // ── OBSERVE ──
      const observedChanges = this.detectFileChanges(contextSnapshot)
      goalState.addReflection(config.goalId, `Iteration ${iteration}: ${observedChanges.length} files changed`)

      // ── VERIFY ──
      if (config.verifyAfterEdit !== false && observedChanges.length > 0) {
        yield { type: "THINKING_STARTED", executionId, label: "Verifying changes", timestamp: Date.now() }

        let verifyResult = await verifier.verifyChanges(observedChanges, ctrl.signal)

        if (!verifyResult.passed) {
          goalState.addReflection(config.goalId, verifyResult.llmFormatted ?? `Verification failed: ${verifyResult.lintErrors} lint, ${verifyResult.typeErrors} type, ${verifyResult.buildErrors} build, ${verifyResult.testFailures} test`)

          const fixResult = await verifier.autoFixWithRetry(verifyResult, observedChanges, ctrl.signal)
          verifyResult = fixResult.finalResult

          if (fixResult.fixed) {
            goalState.addReflection(config.goalId, `Auto-fix applied after ${fixResult.retriesUsed} retries`)
          } else if (fixResult.retriesUsed > 0) {
            goalState.addReflection(config.goalId, `Auto-fix exhausted (${fixResult.retriesUsed} retries)`)
          }

          if (!verifyResult.passed) {
            goalState.addReflection(config.goalId, verifyResult.llmFormatted ?? "Verification still failing after auto-fix")
          }
        } else {
          goalState.addReflection(config.goalId, verifyResult.llmFormatted ?? "Verification passed")
        }

        goalState.updateStep(config.goalId, goal.steps[goal.currentStepIndex].id, {
          verificationResult: verifyResult,
          status: verifyResult.passed ? "verified" : "failed",
          changedFiles: observedChanges,
        })

        if (verifyResult.passed) {
          yield { type: "VERIFY_PASSED", executionId, stepId: goal.steps[goal.currentStepIndex].id, details: verifyResult.details, timestamp: Date.now(), recovered: fixResult?.fixed === true }
        } else {
          yield { type: "VERIFY_FAILED", executionId, stepId: goal.steps[goal.currentStepIndex].id, lintErrors: verifyResult.lintErrors, typeErrors: verifyResult.typeErrors, buildErrors: verifyResult.buildErrors, testFailures: verifyResult.testFailures, details: verifyResult.details, autoFixApplied: true, timestamp: Date.now() }
        }
      }

      // ── REFLECT ──
      yield { type: "THINKING_STARTED", executionId, label: "Reflecting on progress", timestamp: Date.now() }

      const reflection = await this.generateReflection(orchestrator, goal, iteration, ctrl.signal)
      if (reflection) {
        goalState.addReflection(config.goalId, reflection)
      }

      // ── AUTO MEMORY EXTRACTION ──
      if (FeatureFlagManager.getInstance().isEnabled("autoMemory")) {
        const arch = MemoryArchitecture.getInstance()
        await arch.storeManualMemory({
          content: `Goal: ${config.objective}\n\nProgress: ${goal.steps.map((s) => `- ${s.description} (${s.status})`).join("\n")}\n\nReflections: ${goal.reflection.join("\n")}`,
          tags: ["auto-extracted", "goal"],
          category: "learning",
          scope: "project",
        })
      }

      // ── REPLAN ──
      const goalAchieved = await this.checkGoalAchieved(orchestrator, goal, ctrl.signal)
      if (goalAchieved) {
        goalState.completeGoal(config.goalId, "completed")
        yield {
          type: "GOAL_ACHIEVED",
          executionId,
          goalId: config.goalId,
          objective: config.objective,
          iterations,
          stepsCompleted: goal.steps.length,
          reflectionsCount: goal.reflection.length,
          timestamp: Date.now(),
        }
        break
      }

      const shouldContinue = await this.shouldContinue(orchestrator, goal, iteration, ctrl.signal)
      if (!shouldContinue) {
        goalState.addReflection(config.goalId, "Agent determined goal is complete")
        goalState.completeGoal(config.goalId, "completed")
        yield {
          type: "GOAL_ACHIEVED",
          executionId,
          goalId: config.goalId,
          objective: config.objective,
          iterations,
          stepsCompleted: goal.steps.length,
          reflectionsCount: goal.reflection.length,
          timestamp: Date.now(),
        }
        break
      }

      yield { type: "THINKING_STARTED", executionId, label: "Planning next steps", timestamp: Date.now() }

      const nextStep = await this.generateNextStep(orchestrator, goal, reflection, ctrl.signal)
      if (nextStep) {
        goalState.addStep(config.goalId, nextStep)
        goalState.advanceStep(config.goalId)
      }

      goalState.updateBudgetUsed(config.goalId, { iterations: 1 })
      budgetMgr.recordUsage(budgetId, { iterations: 1 })
    }

    // ── COMPLETED ──
    if (ctrl.signal.aborted && goal.status === "active") {
      goalState.completeGoal(config.goalId, "cancelled")
    }

    // Final browser session save
    if (browserContinuityEnabled) {
      for await (const _ of browserBridge.saveSession(config.goalId)) {
        yield _
      }
    }

    endTrace(traceId)
    this.activeLoops.delete(config.goalId)

    yield {
      type: "EXECUTION_COMPLETE",
      executionId,
      content: config.objective,
      filesEdited: goal.steps.filter((s) => s.status === "verified").length,
      commandsRun: 0,
      toolCalls: 0,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    }
  }

  cancelGoal(goalId: string): void {
    const loop = this.activeLoops.get(goalId)
    if (loop) {
      loop.ctrl.abort()
      GoalState.getInstance().completeGoal(goalId, "cancelled")
      this.activeLoops.delete(goalId)
    }
  }

  cancelAll(): void {
    for (const [goalId] of this.activeLoops) {
      this.cancelGoal(goalId)
    }
  }

  private async generatePlan(
    orchestrator: ExecutionOrchestrator,
    config: AutonomousGoalConfig,
    goal: GoalSnapshot,
    signal: AbortSignal
  ): Promise<{ step: string; error?: string }> {
    try {
      const planPrompt = `You are planning how to achieve this goal: "${config.objective}"

Current progress: ${goal.steps.map((s) => `- ${s.description} (${s.status})`).join("\n")}
Reflections so far: ${goal.reflection.join("\n") || "None"}

Generate the next concrete step to take. Return ONLY a single sentence describing what to do next.`

      const events: any[] = []
      for await (const event of orchestrator.execute({
        input: planPrompt,
        activeRole: config.role ?? "manager",
        signal,
        mode: "fast",
      })) {
        if (event.type === "MESSAGE_COMPLETE") {
          return { step: (event as any).content ?? (event as any).message ?? planPrompt }
        }
        if (event.type === "TOKEN") {
          events.push(event)
        }
      }
      const combined = events.map((e: any) => e.text ?? e.token ?? "").join("")
      return { step: combined || planPrompt }
    } catch (err) {
      return { step: "", error: normalizeError(err).message }
    }
  }

  private getWorkspaceSnapshot(): Record<string, string> {
    const ws = useWorkspaceStore.getState()
    const snapshot: Record<string, string> = {}
    const tree = ws.fileTree
    if (tree && tree.length > 0) {
      const walk = (entries: import("@/types").FileEntry[]) => {
        for (const e of entries) {
          snapshot[e.path] = "exists"
          if (e.is_dir && e.children.length > 0) walk(e.children)
        }
      }
      walk(tree)
    }
    return snapshot
  }

  private detectFileChanges(before: Record<string, string>): string[] {
    const after = this.getWorkspaceSnapshot()
    const changed: string[] = []
    for (const [path] of Object.entries(after)) {
      if (!before[path]) {
        changed.push(path)
      }
    }
    for (const [path] of Object.entries(before)) {
      if (!after[path]) {
        changed.push(path)
      }
    }
    return changed
  }

  private async generateReflection(
    orchestrator: ExecutionOrchestrator,
    goal: GoalSnapshot,
    iteration: number,
    signal: AbortSignal
  ): Promise<string | null> {
    if (iteration === 0) return null
    try {
      const reflectionPrompt = `Review the progress on this goal: "${goal.objective}"

Steps taken:
${goal.steps.map((s) => `  ${s.status === "verified" ? "✅" : s.status === "failed" ? "❌" : "⏳"} ${s.description} (${s.status})`).join("\n")}

Previous reflections:
${goal.reflection.join("\n") || "None"}

What is working? What is not? Should the approach change? Keep it to 2-3 sentences.`

      const events: any[] = []
      for await (const event of orchestrator.execute({
        input: reflectionPrompt,
        activeRole: "manager",
        signal,
        mode: "fast",
      })) {
        if (event.type === "MESSAGE_COMPLETE") {
          return (event as any).content ?? (event as any).message ?? null
        }
        if (event.type === "TOKEN") {
          events.push(event)
        }
      }
      const combined = events.map((e: any) => e.text ?? e.token ?? "").join("")
      return combined || null
    } catch {
      return null
    }
  }

  private async checkGoalAchieved(
    _orchestrator: ExecutionOrchestrator,
    goal: GoalSnapshot,
    signal: AbortSignal
  ): Promise<boolean> {
    // All steps must be individually verified before final authority check
    if (!goal.steps.every((s) => s.status === "verified")) {
      return false
    }

    // Collect all changed files across all verified steps
    const allChangedFiles: string[] = []
    for (const step of goal.steps) {
      if (step.changedFiles && step.changedFiles.length > 0) {
        allChangedFiles.push(...step.changedFiles)
      }
    }

    // Final comprehensive verification — Verification Pipeline is the sole authority
    const verifier = VerificationPipeline.getInstance()
    const finalResult = await verifier.verifyGoalAchieved([...new Set(allChangedFiles)], signal)
    const goalState = GoalState.getInstance()

    if (finalResult.goalAchieved) {
      goalState.addReflection(goal.id, "Goal achieved — verified by Verification Pipeline")
      return true
    }

    // Final verification failed — flag current step for retry so the agent can fix cross-step issues
    const currentStep = goal.steps[goal.currentStepIndex]
    if (currentStep) {
      goalState.updateStep(goal.id, currentStep.id, { status: "failed" })
    }
    goalState.addReflection(goal.id, `Final verification failed: ${finalResult.details.slice(0, 3).join("; ")}`)
    return false
  }

  private async shouldContinue(
    _orchestrator: ExecutionOrchestrator,
    goal: GoalSnapshot,
    iteration: number,
    _signal: AbortSignal
  ): Promise<boolean> {
    const budgetExhausted = goal.status !== "active"
    if (budgetExhausted) return false
    if (iteration >= 50) return false
    return true
  }

  private async generateNextStep(
    _orchestrator: ExecutionOrchestrator,
    goal: GoalSnapshot,
    _reflection: string | null,
    _signal: AbortSignal
  ): Promise<string | null> {
    const lastStep = goal.steps[goal.currentStepIndex]
    if (lastStep?.status === "verified" && goal.currentStepIndex < goal.steps.length - 1) {
      return goal.steps[goal.currentStepIndex + 1]?.description ?? null
    }
    if (lastStep?.status === "failed") {
      return `Retry: ${lastStep.description}`
    }
    return null
  }
}
