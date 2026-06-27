import type { Task, TaskId, TaskStatus } from "./types"
import type { CriticalPathInfo, ExecutionMetricsSnapshot, SchedulerVisualization, ResourceLimits } from "./types"
import { isTerminalStatus } from "./types"
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
import { SharedPipelineContext } from "./SharedPipelineContext"
import type { ContextSlot, ContextSlotType } from "./SharedPipelineContext"
import { ConflictManager } from "./ConflictManager"
import type { FileLock } from "./types"

export interface DagEngineConfig {
  executor: TaskExecutor
  resourceLimits: ResourceLimits
  eventBus: OrchestrationEventBus
  metrics: MetricsCollector
  stateMachine: StateMachine
  taskStore: TaskStore
  taskHistory: TaskHistory
  conflictManager?: ConflictManager
}

export class DagExecutionEngine {
  private executor: TaskExecutor
  resourceManager: ResourceManager
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
  private concurrencySamples: number[] = []
  private idleStartTime = 0
  private totalIdleTime = 0
  private wasIdle = true

  constructor(config: DagEngineConfig) {
    this.executor = config.executor
    this.resourceManager = new ResourceManager(config.resourceLimits)
    this.eventBus = config.eventBus
    this.metrics = config.metrics
    this.stateMachine = config.stateMachine
    this.taskStore = config.taskStore
    this.taskHistory = config.taskHistory
    this.conflictManager = config.conflictManager ?? new ConflictManager()
  }

  async executeGraph(session: ExecutionSession): Promise<void> {
    this.stopped = false
    this.wallStartTime = Date.now()
    this.totalComputeTime = 0
    this.concurrencySamples = []
    this.totalIdleTime = 0
    this.wasIdle = true
    this.idleStartTime = this.wallStartTime

    this.initializeSharedContext(session)

    try {
      while (!this.stopped && session.status === "running") {
        const dispatched = this.dispatchReadyTasks(session)

        if (dispatched === 0 && this.runningTasks.size === 0) break

        this.recordConcurrencySample()

        if (this.runningTasks.size > 0) {
          this.wasIdle = false
          await this.waitForAnyCompletion()
        } else if (dispatched === 0) {
          break
        }
      }

      if (session.status === "running") {
        this.markDependencyBlocked(session)
        this.finalizeSession(session)
      }
    } finally {
      this.cancelRunningTasks()
    }
  }

  stop(): void {
    this.stopped = true
    this.resolveCompletion()
  }

  addTasksToSession(session: ExecutionSession, tasks: Task[]): void {
    const addedIds: TaskId[] = []
    const ctx = session.sharedContext

    for (const task of tasks) {
      try {
        session.graph.addTask(task)
        addedIds.push(task.id)
        if (ctx) {
          if (task.contextRequirements && task.contextRequirements.length > 0) {
            ctx.registerConsumer(task.id, task.contextRequirements)
          }
          if (task.contextProductions && task.contextProductions.length > 0) {
            ctx.registerProducer(task.id, task.contextProductions)
          }
        }
      } catch {
        // task already exists, skip
      }
    }

    if (addedIds.length > 0) {
      session.progress = computeSessionMetadata(session.graph)

      this.eventBus.emit({
        type: "GraphUpdated",
        sessionId: session.id,
        timestamp: Date.now(),
        taskCount: session.graph.size,
        addedTaskIds: addedIds,
        mutation: "add",
      })
    }
  }

  getVisualization(session: ExecutionSession): SchedulerVisualization {
    return session.graph.getVisualization()
  }

  getCriticalPath(session: ExecutionSession): CriticalPathInfo {
    const path = session.graph.getCriticalPath()
    return {
      path: path.map((t) => t.id),
      length: path.length,
    }
  }

  getExecutionMetrics(session: ExecutionSession): ExecutionMetricsSnapshot {
    const wallTime = Date.now() - this.wallStartTime
    const avgConcurrency = this.concurrencySamples.length > 0
      ? this.concurrencySamples.reduce((a, b) => a + b, 0) / this.concurrencySamples.length
      : 0
    const maxConcurrency = Math.max(...this.concurrencySamples, 0)
    const efficiency = wallTime > 0 && avgConcurrency > 0
      ? this.totalComputeTime / (wallTime * avgConcurrency)
      : 0

    const cp = this.getCriticalPath(session)
    const allTasks = session.graph.getAllTasks()
    const bottlenecks = allTasks
      .filter((t) => t.status === "blocked")
      .map((t) => t.id)

    return {
      criticalPath: cp,
      parallelEfficiency: Math.min(efficiency, 1),
      totalWallTime: wallTime,
      totalComputeTime: this.totalComputeTime,
      maxConcurrency,
      averageConcurrency: avgConcurrency,
      idleTime: this.totalIdleTime,
      waitingTime: 0,
      dependencyBottlenecks: bottlenecks,
    }
  }

  private dispatchReadyTasks(session: ExecutionSession): number {
    let count = 0
    const readyTasks = session.graph.getReadyTasks()

    for (const task of readyTasks) {
      if (this.stopped || session.status !== "running") break
      if (this.runningTasks.has(task.id)) continue
      if (!this.resourceManager.canAllocate(task)) {
        if (count === 0) {
          // First task can't execute due to resource limits
          // This is fine — wait for running tasks to complete
        }
        break
      }

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

      if (this.wasIdle) {
        this.totalIdleTime += Date.now() - this.idleStartTime
        this.wasIdle = false
      }

      this.resourceManager.allocate(task)
      this.transitionTask(task, "ready", session)
      this.transitionTask(task, "running", session)
      session.progress = computeSessionMetadata(session.graph)

      const promise = this.executeTask(task, session)
        .finally(() => {
          this.runningTasks.delete(task.id)
          this.resourceManager.deallocate(task)
          this.recordConcurrencySample()
          this.resolveCompletion()

          if (this.runningTasks.size === 0) {
            this.wasIdle = true
            this.idleStartTime = Date.now()
          }
        })

      this.runningTasks.set(task.id, promise)
      count++
    }

    return count
  }

  private async executeTask(task: Task, session: ExecutionSession): Promise<void> {
    const startTime = Date.now()

    this.collectContextForTask(task, session)

    try {
      const result = await this.executor.executeTask(task, session)
      const elapsed = Date.now() - startTime
      this.totalComputeTime += elapsed

      task.outputs.push(...result.outputs)
      task.completedAt = Date.now()

      this.publishTaskOutputs(task, session)
      this.conflictManager.releaseTaskLocks(task.id, {
        eventBus: this.eventBus,
        sessionId: session.id,
      })
      this.transitionTask(task, "completed", session)
      session.progress = computeSessionMetadata(session.graph)
      this.metrics.recordTaskComplete(task.id, "completed")
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
        this.invalidateTaskContext(task, session)
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

  private markDependencyBlocked(session: ExecutionSession): void {
    const blockedTasks = session.graph.getBlockedTasks()
    for (const task of blockedTasks) {
      if (task.status === "pending") {
        try {
          this.stateMachine.transition(task.status, "blocked", task.id)
        } catch {
          continue
        }
        session.graph.updateStatus(task.id, "blocked")
      }
    }
  }

  private initializeSharedContext(session: ExecutionSession): void {
    if (session.sharedContext) return

    const ctx = new SharedPipelineContext()
    session.sharedContext = ctx

    const allTasks = session.graph.getAllTasks()
    for (const task of allTasks) {
      if (task.contextRequirements && task.contextRequirements.length > 0) {
        ctx.registerConsumer(task.id, task.contextRequirements)
      }
      if (task.contextProductions && task.contextProductions.length > 0) {
        ctx.registerProducer(task.id, task.contextProductions)
      }
    }
  }

  private collectContextForTask(task: Task, session: ExecutionSession): void {
    const ctx = session.sharedContext
    if (!ctx) return

    const requirements = ctx.getRequirements(task.id)
    if (requirements.length === 0) return

    const slice = ctx.collectContext(task.id)
    task.metadata["__sharedContextSlice__"] = {
      slots: slice.slots.map((s) => ({
        type: s.type,
        key: s.key,
        checksum: s.checksum,
        content: s.content,
        size: s.size,
      })),
      totalTokens: slice.totalTokens,
      missingOptionalSlots: slice.missingOptionalSlots,
      deduplicatedSlots: slice.deduplicatedSlots,
      totalTokensSaved: slice.totalTokensSaved,
    }
  }

  private publishTaskOutputs(task: Task, session: ExecutionSession): void {
    const ctx = session.sharedContext
    if (!ctx) return

    const productions = ctx.getProductions(task.id)
    if (productions.length === 0) return

    for (const prod of productions) {
      const output = task.outputs.find((o) => o.name === prod.key)
      if (output) {
        ctx.setSlot({
          type: "task_output",
          key: prod.key,
          content: output.value,
          version: 1,
          size: output.value.length,
          ttl: prod.ttl,
          producerTaskId: task.id,
          tags: [...task.tags, `task_output:${output.name}`],
        })
      }
    }
  }

  private invalidateTaskContext(task: Task, session: ExecutionSession): void {
    const ctx = session.sharedContext
    if (!ctx) return

    const productions = ctx.getProductions(task.id)
    if (productions.length === 0) return

    ctx.invalidateTaskSlots(task.id)

    this.eventBus.emit({
      type: "TaskBlocked",
      sessionId: session.id,
      taskId: task.id,
      timestamp: Date.now(),
      blockedBy: task.id,
      reason: `task failed — invalidated ${productions.length} context slot(s)`,
    } as any)
  }

  transitionTask(task: Task, newStatus: TaskStatus, session: ExecutionSession): void {
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
    const cp = this.getCriticalPath(session)

    this.eventBus.emit({
      type: "GraphCompleted",
      sessionId: session.id,
      timestamp: Date.now(),
      totalTasks: meta.totalTasks,
      completedTasks: meta.completedTasks,
      failedTasks: meta.failedTasks,
      duration: (session.completedAt ?? Date.now()) - (session.createdAt ?? Date.now()),
      criticalPathLength: cp.length,
    })
  }

  private cancelRunningTasks(): void {
    for (const [id] of this.runningTasks) {
      this.runningTasks.delete(id)
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

  private recordConcurrencySample(): void {
    const count = this.resourceManager.getRunningCount()
    this.concurrencySamples.push(count)
    this.metrics.recordConcurrencySample(count)
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
