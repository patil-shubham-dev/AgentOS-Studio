import type { TaskStatus } from "./types"
import { canTransition } from "./types"

export class StateTransitionError extends Error {
  constructor(
    public from: TaskStatus,
    public to: TaskStatus,
    public taskId?: string,
  ) {
    super(`Invalid state transition: ${from} -> ${to}${taskId ? ` for task ${taskId}` : ""}`)
    this.name = "StateTransitionError"
  }
}

export class StateMachine {
  validateTransition(from: TaskStatus, to: TaskStatus, taskId?: string): void {
    if (!canTransition(from, to)) {
      throw new StateTransitionError(from, to, taskId)
    }
  }

  transition(from: TaskStatus, to: TaskStatus, taskId?: string): TaskStatus {
    if (from === to) return to
    this.validateTransition(from, to, taskId)
    return to
  }

  isLegalTransition(from: TaskStatus, to: TaskStatus): boolean {
    return canTransition(from, to)
  }

  getLegalTransitions(from: TaskStatus): TaskStatus[] {
    const transitions: Record<TaskStatus, TaskStatus[]> = {
      pending: ["ready", "cancelled", "blocked"],
      ready: ["running", "blocked", "cancelled"],
      running: ["completed", "failed", "cancelled", "blocked"],
      blocked: ["ready", "cancelled"],
      completed: [],
      failed: ["pending"],
      cancelled: [],
    }
    return transitions[from] ?? []
  }

  isTerminal(status: TaskStatus): boolean {
    return status === "completed" || status === "failed" || status === "cancelled"
  }

  isActive(status: TaskStatus): boolean {
    return status === "pending" || status === "ready" || status === "running" || status === "blocked"
  }

  canExecute(status: TaskStatus): boolean {
    return status === "ready"
  }
}
