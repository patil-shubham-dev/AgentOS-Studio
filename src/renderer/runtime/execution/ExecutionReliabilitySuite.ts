import { ReliabilityManager } from "@/runtime/reliability/ReliabilityManager"
import { CircuitState } from "@/runtime/reliability/CircuitBreaker"
import { RepositoryKnowledgeGraph } from "@/runtime/intelligence/RepositoryKnowledgeGraph"
import { VerificationPipeline } from "@/runtime/verification/VerificationPipeline"
import { WorkspaceSnapshotManager } from "@/runtime/execution/WorkspaceSnapshotManager"
import { ExecutionBudgetManager } from "@/runtime/execution/ExecutionBudgetManager"

export interface HealthCheck {
  name: string
  passed: boolean
  detail: string
  latencyMs: number
}

export interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  jitter: boolean
}

export interface CircuitBreakerState {
  name: string
  state: "closed" | "open" | "half-open"
  failureCount: number
  lastFailure: number | null
  threshold: number
}

export class ExecutionReliabilitySuite {
  private static instance: ExecutionReliabilitySuite
  private reliabilityMgr = ReliabilityManager.getInstance()
  private healthHistory = new Map<string, HealthCheck[]>()

  static getInstance(): ExecutionReliabilitySuite {
    if (!ExecutionReliabilitySuite.instance) {
      ExecutionReliabilitySuite.instance = new ExecutionReliabilitySuite()
    }
    return ExecutionReliabilitySuite.instance
  }

  /** Delegates to ReliabilityManager.circuitBreakers as single source of truth */
  createCircuitBreaker(name: string, threshold = 5): void {
    this.reliabilityMgr.circuitBreakers.getOrCreate(name, { failureThreshold: threshold })
  }

  /** Delegates to ReliabilityManager.circuitBreakers */
  recordFailure(circuitName: string): void {
    this.reliabilityMgr.circuitBreakers.get(circuitName)?.recordFailure(circuitName)
  }

  /** Delegates to ReliabilityManager.circuitBreakers */
  recordSuccess(circuitName: string): void {
    this.reliabilityMgr.circuitBreakers.get(circuitName)?.recordSuccess()
  }

  /** Delegates to ReliabilityManager.circuitBreakers — single authority */
  isAllowed(circuitName: string): boolean {
    return this.reliabilityMgr.circuitBreakers.get(circuitName)?.allowRequest() ?? true
  }

  getCircuitState(circuitName: string): CircuitBreakerState | undefined {
    const cb = this.reliabilityMgr.circuitBreakers.get(circuitName)
    if (!cb) return undefined
    const mappedState = cb.state === CircuitState.OPEN ? "open"
      : cb.state === CircuitState.HALF_OPEN ? "half-open"
      : "closed"
    return {
      name: cb.name,
      state: mappedState,
      failureCount: cb.failureRate() > 0 ? Math.round(cb.failureRate() * (cb.config_?.failureThreshold ?? 5)) : 0,
      lastFailure: null,
      threshold: cb.config_?.failureThreshold ?? 5,
    }
  }

  async withRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig = { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 10_000, jitter: true },
    context = "unknown",
  ): Promise<{ result: T; retries: number; totalMs: number }> {
    const startTime = Date.now()
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await fn()
        const totalMs = Date.now() - startTime
        this.recordSuccess(context)
        return { result, retries: attempt, totalMs }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        this.recordFailure(context)

        if (attempt < config.maxRetries) {
          const delay = this.computeBackoff(attempt, config)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError ?? new Error(`Retry failed after ${config.maxRetries + 1} attempts`)
  }

  async runHealthChecks(): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = []

    checks.push(await this.measureLatency("graph-query", async () => {
      RepositoryKnowledgeGraph.getInstance().query({})
    }))

    checks.push(await this.measureLatency("verification", async () => {
      await VerificationPipeline.getInstance().fastVerify([])
    }))

    checks.push(await this.measureLatency("snapshot", async () => {
      WorkspaceSnapshotManager.getInstance()
    }))

    checks.push(await this.measureLatency("budget-manager", async () => {
      ExecutionBudgetManager.getInstance().getAllBudgets()
    }))

    checks.push(this.checkCircuitBreakers())

    const key = `health_${Date.now()}`
    this.healthHistory.set(key, checks)
    if (this.healthHistory.size > 100) {
      const oldest = [...this.healthHistory.keys()].sort()[0]
      this.healthHistory.delete(oldest)
    }

    return checks
  }

  getHealthHistory(): Map<string, HealthCheck[]> {
    return this.healthHistory
  }

  formatHealthReport(checks: HealthCheck[]): string {
    const passed = checks.filter(c => c.passed).length
    const lines: string[] = [
      "━━━ Health Report ━━━",
      `${passed}/${checks.length} checks passed`,
      "",
    ]

    for (const check of checks) {
      const icon = check.passed ? "✓" : "✗"
      lines.push(`  ${icon} ${check.name}: ${check.detail} (${check.latencyMs}ms)`)
    }

    lines.push("", "━━━━━━━━━━━━━━━━━━━━━━")
    return lines.join("\n")
  }

  private async measureLatency(name: string, fn: () => Promise<void>): Promise<HealthCheck> {
    const start = Date.now()
    try {
      await fn()
      return { name, passed: true, detail: "OK", latencyMs: Date.now() - start }
    } catch (err) {
      return { name, passed: false, detail: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start }
    }
  }

  private checkCircuitBreakers(): HealthCheck {
    const allBreakers = this.reliabilityMgr.circuitBreakers.getAll()
    const openBreakers = allBreakers.filter(c => c.state === CircuitState.OPEN)
    return {
      name: "circuit-breakers",
      passed: openBreakers.length === 0,
      detail: openBreakers.length === 0
        ? "All circuits closed"
        : `${openBreakers.length} circuit(s) open: ${openBreakers.map(c => c.name).join(", ")}`,
      latencyMs: 0,
    }
  }

  private computeBackoff(attempt: number, config: RetryConfig): number {
    const delay = Math.min(config.baseDelayMs * Math.pow(2, attempt), config.maxDelayMs)
    if (config.jitter) {
      return Math.round(delay * (0.5 + Math.random() * 0.5))
    }
    return delay
  }
}
