import type { Task, TaskId, TaskStatus } from "./types"
import type { ResourceLimits, SchedulerVisualization, ExecutionMetricsSnapshot, CriticalPathInfo } from "./types"
import { createTaskId, isTerminalStatus } from "./types"
import { TaskGraph } from "./TaskGraph"
import { StateMachine } from "./StateMachine"
import { OrchestrationEventBus } from "./events"
import type { TaskExecutor } from "./Scheduler"
import { Scheduler } from "./Scheduler"
import type { ExecutionSession, SessionStatus } from "./ExecutionSession"
import { createSession, computeSessionMetadata } from "./ExecutionSession"
import { MetricsCollector } from "./MetricsCollector"
import { DagExecutionEngine } from "./DagExecutionEngine"
import type { TaskStore } from "./persistence/TaskStore"
import type { WriteAheadLog } from "./persistence/WriteAheadLog"
import type { TaskHistory } from "./persistence/TaskHistory"
import type { RecoveryManager } from "./persistence/RecoveryManager"

export interface SubmitOptions {
  sessionId?: string
  tags?: string[]
  rootTaskId?: TaskId
}

export interface CoordinatorConfig {
  taskStore: TaskStore
  writeAheadLog: WriteAheadLog
  taskHistory: TaskHistory
  recoveryManager: RecoveryManager
  eventBus: OrchestrationEventBus
  metricsCollector: MetricsCollector
  taskExecutor: TaskExecutor
  maxConcurrentTasks?: number
  resourceLimits?: ResourceLimits
}

export class ExecutionCoordinator {
  private sessions = new Map<string, ExecutionSession>()
  private stateMachine = new StateMachine()
  private eventBus: OrchestrationEventBus
  private metrics: MetricsCollector
  private scheduler: Scheduler
  private taskStore: TaskStore
  private wal: WriteAheadLog
  private taskHistory: TaskHistory
  private recoveryManager: RecoveryManager
  private executor: TaskExecutor
  private engine: DagExecutionEngine
  private started = false

  constructor(config: CoordinatorConfig) {
    this.taskStore = config.taskStore
    this.wal = config.writeAheadLog
    this.taskHistory = config.taskHistory
    this.recoveryManager = config.recoveryManager
    this.eventBus = config.eventBus
    this.metrics = config.metricsCollector
    this.executor = config.taskExecutor
    this.scheduler = new Scheduler(config.taskExecutor, config.maxConcurrentTasks ?? 5)

    const limits = config.resourceLimits ?? {
      maxConcurrentTasks: config.maxConcurrentTasks ?? 5,
    }

    this.engine = new DagExecutionEngine({
      executor: config.taskExecutor,
      resourceLimits: limits,
      eventBus: config.eventBus,
      metrics: config.metricsCollector,
      stateMachine: this.stateMachine,
      taskStore: config.taskStore,
      taskHistory: config.taskHistory,
    })
  }

  get eventBusInstance(): OrchestrationEventBus {
    return this.eventBus
  }

  get metricsInstance(): MetricsCollector {
    return this.metrics
  }

  get stateMachineInstance(): StateMachine {
    return this.stateMachine
  }

  get engineInstance(): DagExecutionEngine {
    return this.engine
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    await this.recoverSessions()
  }

  async stop(): Promise<void> {
    this.started = false
    this.engine.stop()
    this.scheduler.stop()
  }

  async submit(tasks: Task[], options?: SubmitOptions): Promise<ExecutionSession> {
    const graph = new TaskGraph()
    for (const task of tasks) {
      graph.addTask(task)
    }

    if (graph.hasCycles()) {
      throw new Error("Task graph contains cycles — cannot submit")
    }

    const session = createSession(graph, {
      id: options?.sessionId,
      tags: options?.tags,
      rootTaskId: options?.rootTaskId,
    })

    this.sessions.set(session.id, session)
    this.scheduler.registerSession(session.id)
    this.metrics.recordSubmission()

    await this.taskStore.saveGraph(graph)
    for (const task of tasks) {
      await this.taskStore.saveTask(task)
    }
    await this.taskStore.checkpoint(session.id)

    this.eventBus.emit({
      type: "SessionCreated",
      sessionId: session.id,
      timestamp: Date.now(),
      taskCount: tasks.length,
    })

    this.eventBus.emit({
      type: "TaskCreated",
      sessionId: session.id,
      taskId: tasks[0]?.id ?? "",
      taskType: tasks[0]?.type ?? "custom",
      title: tasks[0]?.title ?? "",
      timestamp: Date.now(),
    })

    await this.transitionSession(session.id, "running")
    await this.engine.executeGraph(session)

    return session
  }

  async addTasksToSession(sessionId: string, tasks: Task[]): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    this.engine.addTasksToSession(session, tasks)
  }

  async cancel(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    if (session.status === "completed" || session.status === "cancelled") {
      return
    }

    this.engine.stop()

    const runningTasks = session.graph.getTasksByStatus("running")
    for (const task of runningTasks) {
      await this.transitionTask(task.id, "cancelled", session)
    }

    const pendingTasks = session.graph.getAllTasks().filter((t) =>
      !isTerminalStatus(t.status)
    )
    for (const task of pendingTasks) {
      await this.transitionTask(task.id, "cancelled", session)
    }

    session.status = "cancelled"
    session.completedAt = Date.now()
    this.scheduler.unregisterSession(sessionId)

    await this.taskStore.saveGraph(session.graph)
    await this.taskStore.checkpoint(sessionId)
    this.metrics.recordCancellation()

    this.eventBus.emit({
      type: "TaskCancelled",
      sessionId,
      taskId: session.rootTaskId ?? "",
      timestamp: Date.now(),
      reason: "session cancelled",
    })
  }

  async retry(taskId: TaskId, sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    const task = session.graph.getTask(taskId)
    if (!task) throw new Error(`Task ${taskId} not found in session ${sessionId}`)

    if (task.status !== "failed") {
      throw new Error(`Cannot retry task ${taskId} — status is ${task.status}, expected failed`)
    }

    if (task.retries >= task.maxRetries) {
      throw new Error(`Task ${taskId} has exhausted retries (${task.retries}/${task.maxRetries})`)
    }

    task.retries++
    await this.transitionTask(taskId, "pending", session)
    this.metrics.recordRetry()

    this.eventBus.emit({
      type: "TaskRetried",
      sessionId,
      taskId,
      timestamp: Date.now(),
      retryCount: task.retries,
      maxRetries: task.maxRetries,
    })

    await this.engine.executeGraph(session)
  }

  async resume(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    if (session.status !== "pending" && session.status !== "failed") {
      throw new Error(`Cannot resume session ${sessionId} — status is ${session.status}`)
    }

    await this.transitionSession(sessionId, "running")
    await this.engine.executeGraph(session)
  }

  getStatus(sessionId: string): SessionStatus | null {
    return this.sessions.get(sessionId)?.status ?? null
  }

  getExecution(sessionId: string): ExecutionSession | null {
    return this.sessions.get(sessionId) ?? null
  }

  listExecutions(): ExecutionSession[] {
    return Array.from(this.sessions.values())
  }

  getGraph(sessionId: string): TaskGraph | null {
    return this.sessions.get(sessionId)?.graph ?? null
  }

  getVisualization(sessionId: string): SchedulerVisualization | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    return this.engine.getVisualization(session)
  }

  getCriticalPath(sessionId: string): CriticalPathInfo | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    return this.engine.getCriticalPath(session)
  }

  getExecutionMetrics(sessionId: string): ExecutionMetricsSnapshot | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    return this.engine.getExecutionMetrics(session)
  }

  private async transitionTask(
    taskId: TaskId,
    newStatus: TaskStatus,
    session: ExecutionSession,
  ): Promise<void> {
    const task = session.graph.getTask(taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)

    const oldStatus = task.status

    this.stateMachine.transition(oldStatus, newStatus, taskId)
    session.graph.updateStatus(taskId, newStatus)

    if (newStatus === "running") {
      this.metrics.recordTaskStart(taskId)
    } else if (isTerminalStatus(newStatus)) {
      this.metrics.recordTaskComplete(taskId, newStatus)
    }

    await this.taskStore.saveTask(task)
    await this.taskHistory.record(taskId, oldStatus, newStatus, `transition:${oldStatus}->${newStatus}`)

    this.eventBus.emit({
      type: this.getEventTypeForTransition(newStatus),
      sessionId: session.id,
      taskId,
      timestamp: Date.now(),
      ...(newStatus === "started" ? { agentId: task.assignedAgent } : {}),
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

  private async transitionSession(sessionId: string, newStatus: SessionStatus): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    const oldStatus = session.status
    session.status = newStatus

    if (newStatus === "running") {
      session.startedAt = Date.now()
    } else if (newStatus === "completed" || newStatus === "failed" || newStatus === "cancelled") {
      session.completedAt = Date.now()
    }

    this.eventBus.emit({
      type: newStatus === "completed" ? "SessionCompleted" :
            newStatus === "failed" ? "SessionFailed" :
            newStatus === "running" ? "SessionCreated" : "SessionCreated",
      sessionId,
      timestamp: Date.now(),
      totalTasks: session.progress.totalTasks,
      completedTasks: session.progress.completedTasks,
      failedTasks: session.progress.failedTasks,
      duration: (session.completedAt ?? Date.now()) - (session.startedAt ?? Date.now()),
      ...(newStatus === "failed" ? { error: session.error ?? "unknown" } : {}),
    } as any)

    await this.taskStore.checkpoint(sessionId)
  }

  private async recoverSessions(): Promise<void> {
    const report = await this.recoveryManager.detectInterruptedTasks()

    if (report.interruptedTasks > 0) {
      await this.recoveryManager.recover()
      this.metrics.recordRecovery()

      this.eventBus.emit({
        type: "ExecutionRecovered",
        sessionId: "recovery",
        timestamp: Date.now(),
        interruptedCount: report.interruptedTasks,
        recoveredCount: report.decisions.length,
      })
    }

    const storedGraph = await this.taskStore.loadGraph()
    if (storedGraph) {
      const tasks = storedGraph.getAllTasks()
      const nonTerminal = tasks.filter((t) => !isTerminalStatus(t.status))
      if (nonTerminal.length > 0) {
        const session = createSession(storedGraph, {
          tags: ["recovered"],
        })
        session.status = "recovering"
        this.sessions.set(session.id, session)
        this.scheduler.registerSession(session.id)
      }
    }

    const storedTasks = await this.taskStore.listTasks()
    if (storedTasks.length > 0 && !storedGraph) {
      const graph = new TaskGraph()
      for (const task of storedTasks) {
        graph.addTask(task)
      }
      const session = createSession(graph, { tags: ["recovered"] })
      session.status = "recovering"
      this.sessions.set(session.id, session)
      this.scheduler.registerSession(session.id)
    }
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
