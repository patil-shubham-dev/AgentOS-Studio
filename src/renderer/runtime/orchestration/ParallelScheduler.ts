import type { Task, TaskId, TaskStatus, ResourceLimits } from "./types"
import { isTerminalStatus, PRIORITY_ORDER } from "./types"
import type { TaskGraph } from "./TaskGraph"
import { StateMachine, StateTransitionError } from "./StateMachine"
import type { OrchestrationEventBus } from "./events"
import type { TaskExecutor } from "./Scheduler"
import type { ExecutionSession } from "./ExecutionSession"
import { computeSessionMetadata } from "./ExecutionSession"
import { ResourceManager } from "./ResourceManager"
import type { MetricsCollector } from "./MetricsCollector"
import type { TaskStore } from "./persistence/TaskStore"
import type { TaskHistory } from "./persistence/TaskHistory"
import { ConflictManager } from "./ConflictManager"

export interface ParallelSchedulerConfig {
  executor: TaskExecutor
  resourceLimits: ResourceLimits
  providerLimits?: Record<string, number>
  eventBus: OrchestrationEventBus
  metrics: MetricsCollector
  stateMachine: StateMachine
  taskStore: TaskStore
  taskHistory: TaskHistory
  conflictManager?: ConflictManager
}

export interface SessionState {
  session: ExecutionSession
  startedAt: number
  completedCount: number
  failedCount: number
  totalTasks: number
}

export interface ParallelSchedulerStats {
  activeSessions: number
  activeTasks: number
  completedTasks: number
  failedTasks: number
  runningTasks: number
  providerUsage: Record<string, number>
  sessionBreakdown: Array<{
    sessionId: string
    status: string
    completedCount: number
    failedCount: number
    totalTasks: number
    progress: number
  }>
}

function getTaskProvider(task: Task): string {
  return (task.metadata?.["provider"] as string) ?? "default"
}

export class ParallelScheduler {
  private sessionStates = new Map<string, SessionState>()
  private executor: TaskExecutor
  resourceManager: ResourceManager
  private providerLimits: Map<string, number>
  private providerUsage: Map<string, number>
  private eventBus: OrchestrationEventBus
  private metrics: MetricsCollector
  private stateMachine: StateMachine
  private taskStore: TaskStore
  private taskHistory: TaskHistory
  private conflictManager: ConflictManager

  private runningTasks = new Map<TaskId, Promise<void>>()
  private stopped = false
  private completionResolver: (() => void) | null = null
  private wallStartTime = 0
  private totalComputeTime = 0

  constructor(config: ParallelSchedulerConfig) {
    this.executor = config.executor
    this.resourceManager = new ResourceManager(config.resourceLimits)
    this.eventBus = config.eventBus
    this.metrics = config.metrics
    this.stateMachine = config.stateMachine
    this.taskStore = config.taskStore
    this.taskHistory = config.taskHistory
    this.conflictManager = config.conflictManager ?? new ConflictManager()

    this.providerLimits = new Map(Object.entries(config.providerLimits ?? {}))
    this.providerUsage = new Map()
  }

  submitSession(session: ExecutionSession): void {
    if (this.sessionStates.has(session.id)) return

    session.status = "running"
    session.startedAt = Date.now()

    const allTasks = session.graph.getAllTasks()
    this.sessionStates.set(session.id, {
      session,
      startedAt: Date.now(),
      completedCount: 0,
      failedCount: 0,
      totalTasks: allTasks.length,
    })

    this.eventBus.emit({
      type: "SessionCreated",
      sessionId: session.id,
      timestamp: Date.now(),
      taskCount: allTasks.length,
    } as any)
  }

  removeSession(sessionId: string): void {
    this.sessionStates.delete(sessionId)
  }

  setProviderLimit(provider: string, limit: number): void {
    this.providerLimits.set(provider, limit)
  }

  getProviderLimit(provider: string): number {
    return this.providerLimits.get(provider) ?? Infinity
  }

  getProviderUsage(provider: string): number {
    return this.providerUsage.get(provider) ?? 0
  }

  private canAllocateProvider(task: Task): boolean {
    const provider = getTaskProvider(task)
    const limit = this.getProviderLimit(provider)
    if (limit === Infinity) return true
    const usage = this.getProviderUsage(provider)
    return usage < limit
  }

  private allocateProvider(task: Task): void {
    const provider = getTaskProvider(task)
    const current = this.providerUsage.get(provider) ?? 0
    this.providerUsage.set(provider, current + 1)
  }

  private deallocateProvider(task: Task): void {
    const provider = getTaskProvider(task)
    const current = this.providerUsage.get(provider) ?? 1
    this.providerUsage.set(provider, Math.max(0, current - 1))
  }

  async processAll(): Promise<void> {
    this.stopped = false
    this.wallStartTime = Date.now()
    this.totalComputeTime = 0

    while (!this.stopped) {
      const dispatched = this.dispatchReadyTasks()

      if (dispatched === 0 && this.runningTasks.size === 0) {
        break
      }

      if (this.runningTasks.size > 0) {
        await this.waitForAnyCompletion()
      } else if (dispatched === 0) {
        break
      }
    }

    if (!this.stopped) {
      this.finalizeAllSessions()
    }
  }

  processOneCycle(): number {
    return this.dispatchReadyTasks()
  }

  stop(): void {
    this.stopped = true
    this.resolveCompletion()

    for (const [id] of this.runningTasks) {
      this.runningTasks.delete(id)
    }
  }

  private dispatchReadyTasks(): number {
    let count = 0
    const ready = this.collectReadyTasks()

    for (const { task, session } of ready) {
      if (this.stopped) break
      if (this.runningTasks.has(task.id)) continue

      if (!this.resourceManager.canAllocate(task)) break
      if (!this.canAllocateProvider(task)) continue

      if (task.fileLocks && task.fileLocks.length > 0) {
        const result = this.conflictManager.acquireLocks(task.id, task.fileLocks, {
          eventBus: this.eventBus,
          sessionId: session.id,
        })
        if (!result.acquired) {
          this.eventBus.emit({
            type: "FileLockConflict",
            sessionId: session.id,
            taskId: task.id,
            filePath: result.conflicts[0]?.filePath ?? "",
            conflictingTaskId: result.conflicts[0]?.existingLock.taskId ?? "",
            reason: result.conflicts[0]?.reason ?? "file lock conflict",
            timestamp: Date.now(),
          } as any)
          this.metrics.recordConflict()
          continue
        }
      }

      this.resourceManager.allocate(task)
      this.allocateProvider(task)
      this.transitionTask(task, "ready", session)
      this.transitionTask(task, "running", session)
      session.progress = computeSessionMetadata(session.graph)

      const promise = this.executeTask(task, session)
        .finally(() => {
          this.runningTasks.delete(task.id)
          this.resourceManager.deallocate(task)
          this.deallocateProvider(task)
          this.resolveCompletion()
        })

      this.runningTasks.set(task.id, promise)
      count++
    }

    return count
  }

  private collectReadyTasks(): Array<{ task: Task; session: ExecutionSession }> {
    const ready: Array<{ task: Task; session: ExecutionSession }> = []

    for (const [, state] of this.sessionStates) {
      const { session } = state
      if (session.status !== "running") continue

      const readyTasks = session.graph.getReadyTasks()
      for (const task of readyTasks) {
        ready.push({ task, session })
      }
    }

    ready.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.task.priority]
      const pb = PRIORITY_ORDER[b.task.priority]
      if (pa !== pb) return pa - pb
      return a.task.createdAt - b.task.createdAt
    })

    return ready
  }

  private async executeTask(task: Task, session: ExecutionSession): Promise<void> {
    const startTime = Date.now()

    try {
      const result = await this.executor.executeTask(task, session)
      const elapsed = Date.now() - startTime
      this.totalComputeTime += elapsed

      task.outputs.push(...result.outputs)
      task.completedAt = Date.now()

      this.conflictManager.releaseTaskLocks(task.id, {
        eventBus: this.eventBus,
        sessionId: session.id,
      })

      this.transitionTask(task, "completed", session)
      session.progress = computeSessionMetadata(session.graph)
      this.metrics.recordTaskComplete(task.id, "completed")

      const state = this.sessionStates.get(session.id)
      if (state) state.completedCount++
    } catch (err) {
      const elapsed = Date.now() - startTime
      this.totalComputeTime += elapsed

      const errorMessage = err instanceof Error ? err.message : String(err)
      task.error = {
        message: errorMessage,
        code: "EXECUTION_ERROR",
        retryable: task.retries < task.maxRetries,
        timestamp: Date.now(),
      }
      task.completedAt = Date.now()

      this.conflictManager.releaseTaskLocks(task.id, {
        eventBus: this.eventBus,
        sessionId: session.id,
      })

      this.transitionTask(task, "failed", session)
      session.progress = computeSessionMetadata(session.graph)
      this.metrics.recordTaskComplete(task.id, "failed")

      const state = this.sessionStates.get(session.id)
      if (state) state.failedCount++

      if (task.retries < task.maxRetries) {
        this.metrics.recordRetry()
        task.retries++
        task.status = "pending"
        task.error = undefined
        task.startedAt = undefined
        task.completedAt = undefined
        this.taskStore.saveTask(task)

        this.eventBus.emit({
          type: "TaskRetried",
          sessionId: session.id,
          taskId: task.id,
          timestamp: Date.now(),
          retryCount: task.retries,
          maxRetries: task.maxRetries,
        })
      } else {
        this.markDependentsBlocked(task, session)
      }
    }
  }

  private markDependentsBlocked(failedTask: Task, session: ExecutionSession): void {
    const dependents = session.graph.getDependents(failedTask.id)
    let blockedCount = 0

    for (const dep of dependents) {
      if (dep.status === "pending") {
        try {
          this.stateMachine.transition(dep.status, "blocked", dep.id)
        } catch {
          continue
        }
        session.graph.updateStatus(dep.id, "blocked")
        dep.error = {
          message: `Dependency failed: ${failedTask.title} (${failedTask.id})`,
          code: "DEPENDENCY_FAILED",
          retryable: false,
          timestamp: Date.now(),
        }
        blockedCount++

        this.eventBus.emit({
          type: "TaskBlocked",
          sessionId: session.id,
          taskId: dep.id,
          timestamp: Date.now(),
          blockedBy: failedTask.id,
          reason: `hard dependency ${failedTask.id} failed`,
        })
      }
    }

    if (blockedCount > 0) {
      this.eventBus.emit({
        type: "BranchFailed",
        sessionId: session.id,
        timestamp: Date.now(),
        sourceTaskId: failedTask.id,
        blockedCount,
        remainingTasks: session.graph.getAllTasks().filter((t) => !isTerminalStatus(t.status)).length,
      })
    }
  }

  private transitionTask(task: Task, newStatus: TaskStatus, session: ExecutionSession): void {
    const oldStatus = task.status

    try {
      this.stateMachine.transition(oldStatus, newStatus, task.id)
    } catch (e) {
      if (e instanceof StateTransitionError) throw e
      throw new StateTransitionError(oldStatus, newStatus, task.id)
    }

    session.graph.updateStatus(task.id, newStatus)

    this.taskStore.saveTask(task)
    this.taskHistory.record(task.id, oldStatus, newStatus, `transition:${oldStatus}->${newStatus}`)

    this.eventBus.emit({
      type: this.getEventTypeForTransition(newStatus),
      sessionId: session.id,
      taskId: task.id,
      timestamp: Date.now(),
      ...(newStatus === "running" ? { agentId: task.assignedAgent } : {}),
      ...(newStatus === "completed" ? {
        duration: (task.completedAt ?? Date.now()) - (task.startedAt ?? Date.now()),
        outputCount: task.outputs.length,
      } : {}),
      ...(newStatus === "failed" ? {
        error: task.error?.message ?? "unknown error",
        retryable: task.error?.retryable ?? false,
        retriesRemaining: task.maxRetries - task.retries,
      } : {}),
    } as any)
  }

  private finalizeAllSessions(): void {
    for (const [, state] of this.sessionStates) {
      const { session } = state
      this.finalizeSession(session)
    }
  }

  private finalizeSession(session: ExecutionSession): void {
    const allTasks = session.graph.getAllTasks()
    if (allTasks.length === 0) {
      session.status = "completed"
      session.completedAt = Date.now()
      session.progress = computeSessionMetadata(session.graph)

      this.eventBus.emit({
        type: "GraphCompleted",
        sessionId: session.id,
        timestamp: Date.now(),
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        duration: 0,
      })
      return
    }

    const allDone = allTasks.every((t) => isTerminalStatus(t.status) || t.status === "blocked")
    if (!allDone) return

    const hasFailed = allTasks.some((t) => t.status === "failed")
    session.status = hasFailed ? "failed" : "completed"
    session.completedAt = Date.now()
    session.progress = computeSessionMetadata(session.graph)

    this.taskStore.saveGraph(session.graph)
    this.taskStore.checkpoint(session.id)

    const meta = session.progress

    this.eventBus.emit({
      type: "GraphCompleted",
      sessionId: session.id,
      timestamp: Date.now(),
      totalTasks: meta.totalTasks,
      completedTasks: meta.completedTasks,
      failedTasks: meta.failedTasks,
      duration: (session.completedAt ?? Date.now()) - (session.createdAt ?? Date.now()),
    })
  }

  getActiveSessionCount(): number {
    return this.sessionStates.size
  }

  getRunningTaskCount(): number {
    return this.runningTasks.size
  }

  getSession(sessionId: string): ExecutionSession | undefined {
    return this.sessionStates.get(sessionId)?.session
  }

  getStats(): ParallelSchedulerStats {
    const providerUsage: Record<string, number> = {}
    for (const [provider, count] of this.providerUsage) {
      providerUsage[provider] = count
    }

    const sessionBreakdown = Array.from(this.sessionStates.values()).map((s) => ({
      sessionId: s.session.id,
      status: s.session.status,
      completedCount: s.completedCount,
      failedCount: s.failedCount,
      totalTasks: s.totalTasks,
      progress: s.totalTasks > 0 ? (s.completedCount + s.failedCount) / s.totalTasks : 0,
    }))

    let totalCompleted = 0
    let totalFailed = 0
    for (const [, s] of this.sessionStates) {
      totalCompleted += s.completedCount
      totalFailed += s.failedCount
    }

    return {
      activeSessions: this.sessionStates.size,
      activeTasks: this.runningTasks.size,
      completedTasks: totalCompleted,
      failedTasks: totalFailed,
      runningTasks: this.runningTasks.size,
      providerUsage,
      sessionBreakdown,
    }
  }

  private resolveCompletion(): void {
    if (this.completionResolver) {
      this.completionResolver()
      this.completionResolver = null
    }
  }

  private waitForAnyCompletion(): Promise<void> {
    return new Promise((resolve) => {
      this.completionResolver = resolve
    })
  }

  private getEventTypeForTransition(status: TaskStatus): any {
    switch (status) {
      case "ready": return "TaskReady"
      case "running": return "TaskStarted"
      case "completed": return "TaskCompleted"
      case "failed": return "TaskFailed"
      case "cancelled": return "TaskCancelled"
      default: return "TaskQueued"
    }
  }
}
