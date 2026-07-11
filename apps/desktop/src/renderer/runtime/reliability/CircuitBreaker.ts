export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerConfig {
  failureThreshold: number
  windowMs: number
  recoveryTimeoutMs: number
  halfOpenMaxRequests: number
  name: string
}

export interface CircuitBreakerEvent {
  name: string
  state: CircuitState
  previousState: CircuitState
  timestamp: number
  failureRate?: number
  reason?: string
}

export type CircuitBreakerListener = (event: CircuitBreakerEvent) => void

interface FailureRecord {
  timestamp: number
  error?: string
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  windowMs: 60_000,
  recoveryTimeoutMs: 30_000,
  halfOpenMaxRequests: 1,
  name: "unnamed",
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig
  private _state: CircuitState = CircuitState.CLOSED
  private failures: FailureRecord[] = []
  private lastStateChangeAt: number = Date.now()
  private halfOpenRequests = 0
  private listeners: CircuitBreakerListener[] = []
  private consecutiveSuccesses = 0

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.lastStateChangeAt = Date.now()
  }

  get state(): CircuitState {
    this.evaluate()
    return this._state
  }

  get name(): string {
    return this.config.name
  }

  get config_(): Readonly<CircuitBreakerConfig> {
    return { ...this.config }
  }

  on(listener: CircuitBreakerListener): () => void {
    this.listeners.push(listener)
    return () => {
      const idx = this.listeners.indexOf(listener)
      if (idx >= 0) this.listeners.splice(idx, 1)
    }
  }

  allowRequest(): boolean {
    this.evaluate()
    if (this._state === CircuitState.CLOSED) return true
    if (this._state === CircuitState.OPEN) return false
    if (this._state === CircuitState.HALF_OPEN) {
      if (this.halfOpenRequests < this.config.halfOpenMaxRequests) {
        this.halfOpenRequests++
        return true
      }
      return false
    }
    return true
  }

  recordSuccess(): void {
    this.evaluate()
    if (this._state === CircuitState.HALF_OPEN) {
      this.consecutiveSuccesses++
      if (this.consecutiveSuccesses >= 2) {
        this.transitionTo(CircuitState.CLOSED, "half-open succeeded, circuit closed")
        this.consecutiveSuccesses = 0
      }
      return
    }
    this.pruneFailures()
    this.consecutiveSuccesses = 0
  }

  recordFailure(error?: string): void {
    this.evaluate()
    this.failures.push({ timestamp: Date.now(), error })
    this.consecutiveSuccesses = 0

    if (this._state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN, "half-open request failed, circuit re-opened")
      this.lastStateChangeAt = Date.now()
      return
    }

    const rate = this.failureRate()
    if (rate >= 1 && this.failures.length >= this.config.failureThreshold) {
      this.transitionTo(CircuitState.OPEN, `failure rate ${(rate * 100).toFixed(0)}% exceeded threshold`)
      this.lastStateChangeAt = Date.now()
    }
  }

  failureRate(): number {
    this.pruneFailures()
    if (this.failures.length === 0) return 0
    return Math.min(1, this.failures.length / this.config.failureThreshold)
  }

  reset(): void {
    this.failures = []
    this.consecutiveSuccesses = 0
    this.halfOpenRequests = 0
    this.transitionTo(CircuitState.CLOSED, "manual reset")
  }

  forceOpen(): void {
    this.transitionTo(CircuitState.OPEN, "forced open")
    this.lastStateChangeAt = Date.now()
  }

  private evaluate(): void {
    this.pruneFailures()

    if (this._state === CircuitState.OPEN) {
      const elapsed = Date.now() - this.lastStateChangeAt
      if (elapsed >= this.config.recoveryTimeoutMs) {
        this.halfOpenRequests = 0
        this.consecutiveSuccesses = 0
        this.transitionTo(CircuitState.HALF_OPEN, "recovery timeout elapsed")
      }
    }
  }

  private pruneFailures(): void {
    const cutoff = Date.now() - this.config.windowMs
    this.failures = this.failures.filter((f) => f.timestamp >= cutoff)
  }

  private transitionTo(newState: CircuitState, reason?: string): void {
    if (this._state === newState) return
    const previousState = this._state
    this._state = newState
    this.lastStateChangeAt = Date.now()
    this.emit({
      name: this.config.name,
      state: newState,
      previousState,
      timestamp: Date.now(),
      failureRate: this.failureRate(),
      reason,
    })
  }

  private emit(event: CircuitBreakerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        void 0
      }
    }
  }
}

export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>()

  getOrCreate(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let cb = this.breakers.get(name)
    if (!cb) {
      cb = new CircuitBreaker({ ...config, name })
      this.breakers.set(name, cb)
    }
    return cb
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name)
  }

  getAll(): CircuitBreaker[] {
    return Array.from(this.breakers.values())
  }

  resetAll(): void {
    for (const cb of this.breakers.values()) {
      cb.reset()
    }
  }

  remove(name: string): void {
    this.breakers.delete(name)
  }
}

export let circuitBreakerRegistry = new CircuitBreakerRegistry()

export function resetCircuitBreakerRegistry(): void {
  circuitBreakerRegistry = new CircuitBreakerRegistry()
}
