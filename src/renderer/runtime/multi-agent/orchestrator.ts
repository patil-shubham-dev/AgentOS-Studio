import type {
  InternalAgentRole,
  AgentTask,
  AgentMessage,
  ManagerOutput,
  PlannerOutput,
  ReviewerOutput,
  DebuggerOutput,
  TesterOutput,
  AgentTaskStatus,
} from "./types"
import { INTERNAL_ROLE_NAMES, ROLE_PERMISSIONS } from "./types"
import { providerGateway } from "@/runtime/providers/ProviderGateway"
import { useAppStore } from "@/stores/app-store"
import { AgentExecutor } from "@/runtime/agents/AgentExecutor"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"
import { normalizeRole } from "@/lib/role-identity"
import type { RuntimeRole } from "@/types"

export interface OrchestrationPlan {
  tasks: AgentTask[]
  currentIndex: number
}

const PLANNER_SYSTEM_PROMPT = `You are the Planner agent inside AgenticOS. Your job is to break down a user request into a structured plan with specific steps assigned to specialized agent roles.

Available roles:
- manager: route and orchestrate
- planner: design approach (you)
- coder: implement file changes
- reviewer: review code quality and correctness
- debugger: analyze and fix failures
- tester: run verification commands

Respond with a JSON object:
{
  "goal": "summary of the goal",
  "approach": "high-level approach",
  "steps": [
    { "order": 1, "role": "coder", "description": "what to do", "estimatedEffort": "low|medium|high", "files": ["optional file paths"] }
  ],
  "risks": ["optional risk notes"]
}

Keep the plan focused and minimal. Do not assign more than 6 steps.`

const MANAGER_SYSTEM_PROMPT = `You are the Manager agent inside AgenticOS. Analyze the user request and decide which internal agents should execute it.

Respond with a JSON object:
{
  "executionStrategy": "single" | "sequential" | "parallel",
  "roles": ["planner", "coder", "reviewer", "tester"],
  "reasoning": "brief explanation",
  "planDescription": "one-line summary of the task"
}

Available roles: manager, planner, coder, reviewer, debugger, tester`

const REPAIR_PROMPT = `You are the Debugger agent inside AgenticOS. Analyze the failure and propose a fix.

Respond with a JSON object:
{
  "rootCause": "what went wrong",
  "failedFile": "path to file",
  "errorMessage": "the error",
  "proposedFix": [{ "file": "path", "original": "code to replace", "replacement": "new code" }],
  "verificationCommand": "optional command to verify the fix"
}`

async function callLLM<T>(systemPrompt: string, userMessage: string, signal?: AbortSignal): Promise<T> {
  const providers = useAppStore.getState().providers ?? []
  if (providers.length === 0) throw new Error("No providers configured for multi-agent orchestration")
  const provider = providers[0]
  const result = await providerGateway.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage.slice(0, 4000) },
    ],
    providerId: provider.id,
    model: provider.model,
    signal,
    temperature: 0.3,
  })
  const text = result.content ?? ""
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`LLM returned non-JSON response: ${text.slice(0, 200)}`)
  return JSON.parse(jsonMatch[0]) as T
}

export class MultiAgentOrchestrator {
  private tasks: AgentTask[] = []
  private messages: AgentMessage[] = []
  private results: Map<string, unknown> = new Map()

  async plan(userRequest: string, signal?: AbortSignal): Promise<OrchestrationPlan> {
    const managerDecision = await callLLM<ManagerOutput>(MANAGER_SYSTEM_PROMPT, userRequest, signal)
    const plannerOut = await callLLM<PlannerOutput>(PLANNER_SYSTEM_PROMPT, userRequest, signal)
    this.tasks = this.buildTaskGraph(plannerOut)
    this.recordMessage("manager", "planner", "plan", managerDecision.reasoning, managerDecision)
    return { tasks: this.tasks, currentIndex: 0 }
  }

  getNextReadyTask(): AgentTask | null {
    for (const task of this.tasks) {
      if (task.status !== "pending") continue
      if (task.dependsOn && task.dependsOn.length > 0) {
        const allDepsMet = task.dependsOn.every((depId) => {
          const dep = this.tasks.find((t) => t.id === depId)
          return dep?.status === "completed"
        })
        if (!allDepsMet) continue
      }
      return task
    }
    return null
  }

  markTaskRunning(taskId: string): void {
    const task = this.tasks.find((t) => t.id === taskId)
    if (task) {
      task.status = "running"
      task.startedAt = Date.now()
    }
  }

  markTaskCompleted(taskId: string, result: string): void {
    const task = this.tasks.find((t) => t.id === taskId)
    if (task) {
      task.status = "completed"
      task.result = result
      task.completedAt = Date.now()
    }
  }

  markTaskFailed(taskId: string, error: string): void {
    const task = this.tasks.find((t) => t.id === taskId)
    if (task) {
      task.status = "failed"
      task.error = error
      task.completedAt = Date.now()
    }
  }

  getFailedTasks(): AgentTask[] {
    return this.tasks.filter((t) => t.status === "failed")
  }

  isComplete(): boolean {
    return this.tasks.length > 0 && this.tasks.every((t) => t.status === "completed" || t.status === "skipped")
  }

  hasFailures(): boolean {
    return this.tasks.some((t) => t.status === "failed")
  }

  getTaskCount(): number {
    return this.tasks.length
  }

  getCompletedCount(): number {
    return this.tasks.filter((t) => t.status === "completed").length
  }

  getContextForTask(taskId: string): string {
    const task = this.tasks.find((t) => t.id === taskId)
    if (!task) return ""
    const depResults = (task.dependsOn ?? [])
      .map((depId) => {
        const dep = this.tasks.find((t) => t.id === depId)
        return dep ? `[${INTERNAL_ROLE_NAMES[dep.role]}] ${dep.result ?? dep.error ?? "no result"}` : ""
      })
      .filter(Boolean)
      .join("\n")
    return depResults ? `Previous results:\n${depResults}\n\nTask: ${task.instruction}` : task.instruction
  }

  async *execute(
    executionId: string,
    input: string,
    correlationId?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<ExecutionEvent> {
    const plan = await this.plan(input, signal)
    yield { type: "THINKING_STARTED", executionId, label: `Plan: ${plan.tasks.length} steps`, timestamp: Date.now() }

    const runtimeRole = normalizeRole("coder") ?? "coder"
    const agentsResults: { role: string; content: string }[] = []
    let maxRepairLoops = 2

    for (let repairLoop = 0; repairLoop <= maxRepairLoops; repairLoop++) {
      let task: AgentTask | null
      while ((task = this.getNextReadyTask()) !== null) {
        if (signal?.aborted) break
        const roleName = INTERNAL_ROLE_NAMES[task.role]
        const stepId = `${executionId}_${task.role}_${task.id}`

        this.markTaskRunning(task.id)
        yield {
          type: "AGENT_ASSIGNED",
          executionId,
          correlationId,
          roleId: task.role,
          roleName,
          stepId,
          executionStrategy: "multi-agent",
          timestamp: Date.now(),
        }

        const agentInput = this.getContextForTask(task.id)
        const executor = new AgentExecutor({
          executionId: `${executionId}_${task.id}`,
          mode: "FULL",
          role: runtimeRole as RuntimeRole,
          input: agentInput,
          history: [],
          signal,
        })

        let content = ""
        for await (const event of executor.execute()) {
          if (signal?.aborted) break
          if (event.type === "MESSAGE_COMPLETE") { content = event.content; continue }
          yield event
        }

        if (signal?.aborted) {
          this.markTaskFailed(task.id, "Cancelled")
          break
        }

        this.markTaskCompleted(task.id, content)
        agentsResults.push({ role: task.role, content })

        yield {
          type: "ACTION",
          executionId,
          agentRole: task.role,
          action: `${INTERNAL_ROLE_NAMES[task.role]} completed task ${task.id}`,
          status: "success",
          summary: content.slice(0, 200),
          timestamp: Date.now(),
        }
      }

      if (signal?.aborted) break

      // Reviewer pass
      const reviewerTask = this.tasks.find((t) => t.role === "reviewer" && t.status === "completed")
      if (reviewerTask?.result) {
        yield { type: "THINKING_STARTED", executionId, label: "Reviewing changes", timestamp: Date.now() }
        const review = await this.runReviewer(reviewerTask.result, signal)
        if (review.overall === "blocked") {
          yield { type: "VERIFY_FAILED", executionId, stepId: `${executionId}_review`, lintErrors: review.findings.length, typeErrors: 0, buildErrors: 0, testFailures: 0, details: [review.summary], autoFixApplied: false, timestamp: Date.now() }
          break
        }
        if (review.overall === "changes_requested" && repairLoop < maxRepairLoops) {
          yield { type: "THINKING_STARTED", executionId, label: `Repair attempt ${repairLoop + 1}`, timestamp: Date.now() }
          const coderTask = this.tasks.find((t) => t.role === "coder")
          if (coderTask) {
            coderTask.status = "pending"
            coderTask.instruction = `Fix the following issues:\n${review.summary}\n\nContext: ${coderTask.instruction}`
          }
          continue
        }
      }

      // Tester pass
      const testerTask = this.tasks.find((t) => t.role === "tester" && t.status === "completed")
      if (testerTask?.result) {
        yield { type: "THINKING_STARTED", executionId, label: "Verifying with tester", timestamp: Date.now() }
        const testResult = await this.runTester(testerTask.result, signal)
        if (!testResult.passed && repairLoop < maxRepairLoops) {
          yield { type: "VERIFY_FAILED", executionId, stepId: `${executionId}_test_fail`, lintErrors: 0, typeErrors: 0, buildErrors: 0, testFailures: testResult.testResults.filter((t) => !t.passed).length, details: [testResult.summary], autoFixApplied: false, timestamp: Date.now() }
          const coderTask = this.tasks.find((t) => t.role === "coder")
          if (coderTask) {
            coderTask.status = "pending"
            coderTask.instruction = `Fix the following test failures:\n${testResult.summary}\n\nContext: ${coderTask.instruction}`
          }
          continue
        }
        yield { type: "VERIFY_PASSED", executionId, stepId: `${executionId}_test_pass`, details: [testResult.summary], recovered: repairLoop > 0, timestamp: Date.now() }
      }

      break // No repairs needed
    }

    yield { type: "GOAL_ACHIEVED", executionId, goalId: executionId, objective: input.slice(0, 200), iterations: agentsResults.length, stepsCompleted: this.getCompletedCount(), reflectionsCount: 0, timestamp: Date.now() }
  }

  private async runReviewer(content: string, signal?: AbortSignal): Promise<ReviewerOutput> {
    return callLLM<ReviewerOutput>(
      `You are the Reviewer agent. Review this output and respond in JSON:
{ "overall": "approve"|"changes_requested"|"blocked", "summary": "review summary", "findings": [{ "filePath": "path", "severity": "error"|"warning"|"suggestion", "message": "description", "category": "correctness"|"security"|"performance"|"style"|"maintainability" }] }`,
      content,
      signal,
    )
  }

  private async runTester(content: string, signal?: AbortSignal): Promise<TesterOutput> {
    return callLLM<TesterOutput>(
      `You are the Tester agent. Analyze the output and determine if testing passed. Respond in JSON:
{ "passed": true|false, "summary": "test summary", "testResults": [{ "testName": "name", "passed": true|false, "output": "details" }] }`,
      content,
      signal,
    )
  }

  private buildTaskGraph(plan: PlannerOutput): AgentTask[] {
    const tasks: AgentTask[] = []
    let prevId: string | undefined
    for (const step of plan.steps) {
      const id = `task-${step.order}`
      tasks.push({
        id,
        role: step.role,
        instruction: step.description,
        contextFiles: step.files,
        dependsOn: prevId ? [prevId] : undefined,
        status: "pending",
      })
      prevId = id
    }
    return tasks
  }

  private recordMessage(
    from: InternalAgentRole,
    to: InternalAgentRole | "manager",
    type: AgentMessage["type"],
    summary: string,
    payload: unknown,
  ): void {
    this.messages.push({
      id: `msg_${this.messages.length}_${Date.now()}`,
      sessionId: "",
      fromRole: from,
      toRole: to,
      type,
      summary,
      payload,
      confidence: 1.0,
      createdAt: Date.now(),
    })
  }

  getMessages(): AgentMessage[] {
    return this.messages
  }

  reset(): void {
    this.tasks = []
    this.messages = []
    this.results.clear()
  }
}
