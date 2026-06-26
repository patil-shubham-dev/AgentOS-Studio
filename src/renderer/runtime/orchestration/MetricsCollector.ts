import type { TaskId, TaskStatus, CriticalPathInfo, ExecutionMetricsSnapshot } from "./types"

export interface MetricSnapshot {
  totalSessions: number
  totalTasks: number
  completedTasks: number
  failedTasks: number
  runningTasks: number
  pendingTasks: number
  averageQueueWait: number
  averageExecutionLatency: number
  retries: number
  timeouts: number
  cancellations: number
  recoveries: number
  conflicts: number
  successRate: number
  maxConcurrency: number
  averageConcurrency: number
  criticalPathLength: number
  parallelEfficiency: number
  totalWallTime: number
  totalComputeTime: number
}

export class MetricsCollector {
  private queueWaitTimes: number[] = []
  private executionLatencies: number[] = []
  private retryCount = 0
  private timeoutCount = 0
  private cancellationCount = 0
  private recoveryCount = 0
  private conflictCount = 0
  private totalCompleted = 0
  private totalFailed = 0
  private totalSubmitted = 0

  private taskStartTimes = new Map<TaskId, number>()

  private sessionStartTimes = new Map<string, number>()
  private sessionComputeTimes = new Map<string, number>()
  private sessionConcurrencySamples = new Map<string, number[]>()
  private maxConcurrencyObserved = 0
  private concurrencySamples: number[] = []

  recordSubmission(): void {
    this.totalSubmitted++
  }

  recordTaskStart(taskId: TaskId): void {
    this.taskStartTimes.set(taskId, Date.now())
  }

  recordQueueWait(taskId: TaskId): void {
    const now = Date.now()
    const startTime = this.taskStartTimes.get(taskId) ?? now
    this.queueWaitTimes.push(now - startTime)
  }

  recordTaskComplete(taskId: TaskId, status: TaskStatus): void {
    const startTime = this.taskStartTimes.get(taskId)
    if (startTime) {
      this.executionLatencies.push(Date.now() - startTime)
    }
    if (status === "completed") {
      this.totalCompleted++
    } else if (status === "failed") {
      this.totalFailed++
    }
    this.taskStartTimes.delete(taskId)
  }

  recordRetry(): void {
    this.retryCount++
  }

  recordTimeout(): void {
    this.timeoutCount++
  }

  recordCancellation(): void {
    this.cancellationCount++
  }

  recordRecovery(): void {
    this.recoveryCount++
  }

  recordConflict(): void {
    this.conflictCount++
  }

  recordConcurrencySample(concurrency: number): void {
    this.concurrencySamples.push(concurrency)
    if (concurrency > this.maxConcurrencyObserved) {
      this.maxConcurrencyObserved = concurrency
    }
  }

  getMaxConcurrency(): number {
    return this.maxConcurrencyObserved
  }

  getAverageConcurrency(): number {
    if (this.concurrencySamples.length === 0) return 0
    return this.concurrencySamples.reduce((a, b) => a + b, 0) / this.concurrencySamples.length
  }

  getSnapshot(): MetricSnapshot {
    const totalFinished = this.totalCompleted + this.totalFailed
    return {
      totalSessions: this.totalSubmitted,
      totalTasks: this.totalSubmitted,
      completedTasks: this.totalCompleted,
      failedTasks: this.totalFailed,
      runningTasks: this.taskStartTimes.size,
      pendingTasks: Math.max(0, this.totalSubmitted - totalFinished - this.taskStartTimes.size),
      averageQueueWait: this.average(this.queueWaitTimes),
      averageExecutionLatency: this.average(this.executionLatencies),
      retries: this.retryCount,
      timeouts: this.timeoutCount,
      cancellations: this.cancellationCount,
      recoveries: this.recoveryCount,
      conflicts: this.conflictCount,
      successRate: totalFinished > 0 ? this.totalCompleted / totalFinished : 1,
      maxConcurrency: this.getMaxConcurrency(),
      averageConcurrency: this.getAverageConcurrency(),
      criticalPathLength: 0,
      parallelEfficiency: 0,
      totalWallTime: 0,
      totalComputeTime: 0,
    }
  }

  reset(): void {
    this.queueWaitTimes = []
    this.executionLatencies = []
    this.retryCount = 0
    this.timeoutCount = 0
    this.cancellationCount = 0
    this.recoveryCount = 0
    this.conflictCount = 0
    this.totalCompleted = 0
    this.totalFailed = 0
    this.totalSubmitted = 0
    this.taskStartTimes.clear()
    this.sessionStartTimes.clear()
    this.sessionComputeTimes.clear()
    this.sessionConcurrencySamples.clear()
    this.maxConcurrencyObserved = 0
    this.concurrencySamples = []
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0
    return values.reduce((a, b) => a + b, 0) / values.length
  }
}
