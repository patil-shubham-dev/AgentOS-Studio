import { CircuitBreakerRegistry } from "./CircuitBreaker"
import { Watchdog } from "./Watchdog"

export interface ReliabilityManagerConfig {
  circuitBreakerThreshold: number
  circuitBreakerWindowMs: number
  circuitBreakerRecoveryMs: number
  watchdogCheckIntervalMs: number
  defaultAgentTimeoutMs: number
  defaultToolTimeoutMs: number
}

const DEFAULT_CONFIG: ReliabilityManagerConfig = {
  circuitBreakerThreshold: 5,
  circuitBreakerWindowMs: 60_000,
  circuitBreakerRecoveryMs: 30_000,
  watchdogCheckIntervalMs: 1000,
  defaultAgentTimeoutMs: 120_000,
  defaultToolTimeoutMs: 60_000,
}

export class ReliabilityManager {
  private static instance: ReliabilityManager
  private config: ReliabilityManagerConfig

  readonly circuitBreakers: CircuitBreakerRegistry
  readonly watchdog: Watchdog

  private constructor(config?: Partial<ReliabilityManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.circuitBreakers = new CircuitBreakerRegistry()
    this.watchdog = new Watchdog({
      checkIntervalMs: this.config.watchdogCheckIntervalMs,
      defaultAgentTimeoutMs: this.config.defaultAgentTimeoutMs,
      defaultToolTimeoutMs: this.config.defaultToolTimeoutMs,
    })
  }

  static getInstance(config?: Partial<ReliabilityManagerConfig>): ReliabilityManager {
    if (!ReliabilityManager.instance) {
      ReliabilityManager.instance = new ReliabilityManager(config)
    }
    return ReliabilityManager.instance
  }

  static resetInstance(): void {
    const instance = ReliabilityManager.instance
    if (instance) {
      instance.watchdog.reset()
      instance.circuitBreakers.resetAll()
    }
    ReliabilityManager.instance = undefined as unknown as ReliabilityManager
  }

  start(): void {
    this.watchdog.start()
  }

  stop(): void {
    this.watchdog.stop()
  }

  getConfig(): Readonly<ReliabilityManagerConfig> {
    return { ...this.config }
  }
}
