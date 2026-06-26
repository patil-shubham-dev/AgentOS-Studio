import type { Task, ResourceLimits } from "./types"

export class ResourceState {
  runningTasks = 0
  runningAgents = new Map<string, number>()
  runningLLMCalls = 0
  runningToolExecutions = 0
  runningCPUTasks = 0

  snapshot(): ResourceStateSnapshot {
    return {
      runningTasks: this.runningTasks,
      runningAgents: new Map(this.runningAgents),
      runningLLMCalls: this.runningLLMCalls,
      runningToolExecutions: this.runningToolExecutions,
      runningCPUTasks: this.runningCPUTasks,
    }
  }
}

export interface ResourceStateSnapshot {
  runningTasks: number
  runningAgents: Map<string, number>
  runningLLMCalls: number
  runningToolExecutions: number
  runningCPUTasks: number
}

export class ResourceManager {
  private state: ResourceState
  private limits: Required<ResourceLimits>
  private maxConcurrencyObserved = 0

  constructor(limits: ResourceLimits) {
    this.limits = {
      maxConcurrentTasks: limits.maxConcurrentTasks,
      maxConcurrentAgents: limits.maxConcurrentAgents ?? {},
      maxConcurrentLLMCalls: limits.maxConcurrentLLMCalls ?? Infinity,
      maxConcurrentToolExecutions: limits.maxConcurrentToolExecutions ?? Infinity,
      maxConcurrentCPUTasks: limits.maxConcurrentCPUTasks ?? Infinity,
    }
    this.state = new ResourceState()
  }

  canAllocate(task: Task): boolean {
    if (this.state.runningTasks >= this.limits.maxConcurrentTasks) return false
    if (task.assignedAgent) {
      const agentLimit = this.limits.maxConcurrentAgents[task.assignedAgent] ?? Infinity
      const agentCount = this.state.runningAgents.get(task.assignedAgent) ?? 0
      if (agentCount >= agentLimit) return false
    }
    if (task.type === "tool") {
      if (this.state.runningToolExecutions >= this.limits.maxConcurrentToolExecutions) return false
    }
    if (task.type === "plan" || task.type === "research" || task.type === "code" || task.type === "verify" || task.type === "design" || task.type === "manager") {
      if (this.state.runningLLMCalls >= this.limits.maxConcurrentLLMCalls) return false
    }
    const isCPUDenom = task.metadata?.workload === "cpu-intensive"
    if (isCPUDenom && this.state.runningCPUTasks >= this.limits.maxConcurrentCPUTasks) return false

    return true
  }

  allocate(task: Task): void {
    this.state.runningTasks++
    if (task.assignedAgent) {
      const count = this.state.runningAgents.get(task.assignedAgent) ?? 0
      this.state.runningAgents.set(task.assignedAgent, count + 1)
    }
    if (task.type === "tool") {
      this.state.runningToolExecutions++
    }
    if (task.type === "plan" || task.type === "research" || task.type === "code" || task.type === "verify" || task.type === "design" || task.type === "manager") {
      this.state.runningLLMCalls++
    }
    const isCPUDenom = task.metadata?.workload === "cpu-intensive"
    if (isCPUDenom) {
      this.state.runningCPUTasks++
    }
    if (this.state.runningTasks > this.maxConcurrencyObserved) {
      this.maxConcurrencyObserved = this.state.runningTasks
    }
  }

  deallocate(task: Task): void {
    this.state.runningTasks = Math.max(0, this.state.runningTasks - 1)
    if (task.assignedAgent) {
      const count = this.state.runningAgents.get(task.assignedAgent) ?? 1
      this.state.runningAgents.set(task.assignedAgent, Math.max(0, count - 1))
    }
    if (task.type === "tool") {
      this.state.runningToolExecutions = Math.max(0, this.state.runningToolExecutions - 1)
    }
    if (task.type === "plan" || task.type === "research" || task.type === "code" || task.type === "verify" || task.type === "design" || task.type === "manager") {
      this.state.runningLLMCalls = Math.max(0, this.state.runningLLMCalls - 1)
    }
    const isCPUDenom = task.metadata?.workload === "cpu-intensive"
    if (isCPUDenom) {
      this.state.runningCPUTasks = Math.max(0, this.state.runningCPUTasks - 1)
    }
  }

  getSnapshot(): ResourceStateSnapshot {
    return this.state.snapshot()
  }

  getMaxConcurrencyObserved(): number {
    return this.maxConcurrencyObserved
  }

  getRunningCount(): number {
    return this.state.runningTasks
  }

  reset(): void {
    this.state = new ResourceState()
    this.maxConcurrencyObserved = 0
  }
}
