import type { TaskId, TaskStatus, AgentId } from "./types"

export type OrchestrationEventType =
  | "TaskCreated"
  | "TaskQueued"
  | "TaskReady"
  | "TaskStarted"
  | "TaskProgress"
  | "TaskCompleted"
  | "TaskFailed"
  | "TaskRetried"
  | "TaskCancelled"
  | "TaskBlocked"
  | "TaskUnblocked"
  | "GraphUpdated"
  | "GraphCompleted"
  | "BranchFailed"
  | "SessionCreated"
  | "SessionCompleted"
  | "SessionFailed"
  | "ExecutionRecovered"
  | "FileLockAcquired"
  | "FileLockReleased"
  | "FileLockConflict"

export interface BaseOrchestrationEvent {
  type: OrchestrationEventType
  timestamp: number
  sessionId: string
}

export interface TaskCreatedEvent extends BaseOrchestrationEvent {
  type: "TaskCreated"
  taskId: TaskId
  taskType: string
  title: string
}

export interface TaskQueuedEvent extends BaseOrchestrationEvent {
  type: "TaskQueued"
  taskId: TaskId
}

export interface TaskReadyEvent extends BaseOrchestrationEvent {
  type: "TaskReady"
  taskId: TaskId
}

export interface TaskStartedEvent extends BaseOrchestrationEvent {
  type: "TaskStarted"
  taskId: TaskId
  agentId?: AgentId
}

export interface TaskProgressEvent extends BaseOrchestrationEvent {
  type: "TaskProgress"
  taskId: TaskId
  progress: number
  message?: string
}

export interface TaskCompletedEvent extends BaseOrchestrationEvent {
  type: "TaskCompleted"
  taskId: TaskId
  duration: number
  outputCount: number
}

export interface TaskFailedEvent extends BaseOrchestrationEvent {
  type: "TaskFailed"
  taskId: TaskId
  error: string
  retryable: boolean
  retriesRemaining: number
}

export interface TaskRetriedEvent extends BaseOrchestrationEvent {
  type: "TaskRetried"
  taskId: TaskId
  retryCount: number
  maxRetries: number
}

export interface TaskCancelledEvent extends BaseOrchestrationEvent {
  type: "TaskCancelled"
  taskId: TaskId
  reason?: string
}

export interface TaskBlockedEvent extends BaseOrchestrationEvent {
  type: "TaskBlocked"
  taskId: TaskId
  blockedBy: TaskId
  reason: string
}

export interface TaskUnblockedEvent extends BaseOrchestrationEvent {
  type: "TaskUnblocked"
  taskId: TaskId
  unblockedBy: TaskId
}

export interface GraphUpdatedEvent extends BaseOrchestrationEvent {
  type: "GraphUpdated"
  taskCount: number
  addedTaskIds: TaskId[]
  mutation: "add" | "remove"
}

export interface GraphCompletedEvent extends BaseOrchestrationEvent {
  type: "GraphCompleted"
  totalTasks: number
  completedTasks: number
  failedTasks: number
  duration: number
  criticalPathLength?: number
}

export interface BranchFailedEvent extends BaseOrchestrationEvent {
  type: "BranchFailed"
  sourceTaskId: TaskId
  blockedCount: number
  remainingTasks: number
}

export interface SessionCreatedEvent extends BaseOrchestrationEvent {
  type: "SessionCreated"
  taskCount: number
}

export interface SessionCompletedEvent extends BaseOrchestrationEvent {
  type: "SessionCompleted"
  totalTasks: number
  completedTasks: number
  failedTasks: number
  duration: number
  criticalPathLength?: number
}

export interface SessionFailedEvent extends BaseOrchestrationEvent {
  type: "SessionFailed"
  error: string
}

export interface ExecutionRecoveredEvent extends BaseOrchestrationEvent {
  type: "ExecutionRecovered"
  interruptedCount: number
  recoveredCount: number
}

export interface FileLockAcquiredEvent extends BaseOrchestrationEvent {
  type: "FileLockAcquired"
  taskId: TaskId
  filePath: string
  lockType: string
  startLine: number
  endLine: number
}

export interface FileLockReleasedEvent extends BaseOrchestrationEvent {
  type: "FileLockReleased"
  taskId: TaskId
  lockCount: number
}

export interface FileLockConflictEvent extends BaseOrchestrationEvent {
  type: "FileLockConflict"
  taskId: TaskId
  filePath: string
  conflictingTaskId: TaskId
  reason: string
}

export type OrchestrationEvent =
  | TaskCreatedEvent
  | TaskQueuedEvent
  | TaskReadyEvent
  | TaskStartedEvent
  | TaskProgressEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | TaskRetriedEvent
  | TaskCancelledEvent
  | TaskBlockedEvent
  | TaskUnblockedEvent
  | GraphUpdatedEvent
  | GraphCompletedEvent
  | BranchFailedEvent
  | SessionCreatedEvent
  | SessionCompletedEvent
  | SessionFailedEvent
  | ExecutionRecoveredEvent
  | FileLockAcquiredEvent
  | FileLockReleasedEvent
  | FileLockConflictEvent

export type EventHandler = (event: OrchestrationEvent) => void
export type Unsubscribe = () => void

export class OrchestrationEventBus {
  private handlers = new Map<OrchestrationEventType, Set<EventHandler>>()
  private wildcardHandlers = new Set<EventHandler>()

  emit(event: OrchestrationEvent): void {
    const typeHandlers = this.handlers.get(event.type)
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(event)
        } catch {
          // swallow handler errors
        }
      }
    }
    for (const handler of this.wildcardHandlers) {
      try {
        handler(event)
      } catch {
        // swallow handler errors
      }
    }
  }

  on(eventType: OrchestrationEventType, handler: EventHandler): Unsubscribe {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }
    this.handlers.get(eventType)!.add(handler)
    return () => {
      this.handlers.get(eventType)?.delete(handler)
    }
  }

  onAny(handler: EventHandler): Unsubscribe {
    this.wildcardHandlers.add(handler)
    return () => {
      this.wildcardHandlers.delete(handler)
    }
  }

  removeAllListeners(): void {
    this.handlers.clear()
    this.wildcardHandlers.clear()
  }

  listenerCount(eventType?: OrchestrationEventType): number {
    if (eventType) {
      return this.handlers.get(eventType)?.size ?? 0
    }
    let count = this.wildcardHandlers.size
    for (const handlers of this.handlers.values()) {
      count += handlers.size
    }
    return count
  }
}
