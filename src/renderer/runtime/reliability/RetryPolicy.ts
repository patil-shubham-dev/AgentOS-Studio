export interface RetryPolicyConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  jitterFactor: number
  retryableErrors: Array<string | RegExp>
  budget: {
    maxTotalTimeMs: number
    maxCumulativeDelayMs: number
  }
}

export interface RetryContext {
  attempt: number
  lastError: Error
  totalElapsedMs: number
  target: string
}

export interface RetryPolicy {
  shouldRetry(context: RetryContext): boolean
  getDelayMs(attempt: number): number
}

const DEFAULT_CONFIG: RetryPolicyConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  jitterFactor: 0.25,
  retryableErrors: [],
  budget: {
    maxTotalTimeMs: 60_000,
    maxCumulativeDelayMs: 30_000,
  },
}

export function isRetryableError(error: Error, patterns: Array<string | RegExp>): boolean {
  if (patterns.length === 0) return true
  const msg = error.message ?? String(error)
  return patterns.some((p) => {
    if (typeof p === "string") return msg.includes(p)
    return p.test(msg)
  })
}

export function createRetryPolicy(config?: Partial<RetryPolicyConfig>): RetryPolicy {
  const cfg: RetryPolicyConfig = { ...DEFAULT_CONFIG, ...config }

  return {
    shouldRetry(context: RetryContext): boolean {
      if (context.attempt >= cfg.maxRetries) return false
      if (context.totalElapsedMs >= cfg.budget.maxTotalTimeMs) return false
      if (!isRetryableError(context.lastError, cfg.retryableErrors)) return false
      return true
    },

    getDelayMs(attempt: number): number {
      const exponential = cfg.baseDelayMs * Math.pow(2, attempt)
      const clamped = Math.min(exponential, cfg.maxDelayMs)
      const jitterRange = clamped * cfg.jitterFactor
      const jitter = Math.random() * jitterRange - jitterRange / 2
      return Math.max(0, Math.round(clamped + jitter))
    },
  }
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  policy: RetryPolicy,
  target: string,
  signal?: AbortSignal,
): Promise<{ data: T; attempts: number; totalTimeMs: number }> {
  const startTime = Date.now()
  let lastError: Error | undefined
  let attempt = 0

  while (true) {
    if (signal?.aborted) throw new DOMException("cancelled", "AbortError")

    try {
      const data = await fn(attempt)
      return { data, attempts: attempt + 1, totalTimeMs: Date.now() - startTime }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      const context: RetryContext = {
        attempt,
        lastError,
        totalElapsedMs: Date.now() - startTime,
        target,
      }

      if (!policy.shouldRetry(context)) {
        throw lastError
      }

      const delay = policy.getDelayMs(attempt)
      attempt++

      const cumulativeAfterWait = context.totalElapsedMs + delay
      if (cumulativeAfterWait >= DEFAULT_CONFIG.budget.maxCumulativeDelayMs) {
        throw lastError
      }

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay)
        const onAbort = () => {
          clearTimeout(timer)
          resolve()
        }
        signal?.addEventListener("abort", onAbort, { once: true })
      })
    }
  }
}

export function applyJitter(delayMs: number, jitterFactor: number): number {
  if (jitterFactor <= 0) return delayMs
  const range = delayMs * jitterFactor
  const jitter = Math.random() * range - range / 2
  return Math.max(0, Math.round(delayMs + jitter))
}
