export class TokenBucketRateLimiter {
  private tokens: number
  private lastRefill: number
  private readonly maxTokens: number
  private readonly refillRate: number
  private readonly refillInterval: number

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens
    this.refillRate = refillRate
    this.tokens = maxTokens
    this.lastRefill = Date.now()
    this.refillInterval = 1000 / refillRate
  }

  async acquire(count = 1): Promise<void> {
    this.refill()
    while (this.tokens < count) {
      await this.sleep(this.refillInterval * (count - this.tokens))
      this.refill()
    }
    this.tokens -= count
  }

  tryAcquire(count = 1): boolean {
    this.refill()
    if (this.tokens >= count) {
      this.tokens -= count
      return true
    }
    return false
  }

  get currentTokens(): number {
    this.refill()
    return this.tokens
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate / 1000)
    this.lastRefill = now
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export type RateLimitConfig = {
  requestsPerSecond: number
  burstSize: number
}

export function createRateLimiter(config: RateLimitConfig): TokenBucketRateLimiter {
  return new TokenBucketRateLimiter(config.burstSize, config.requestsPerSecond)
}

export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  openai: { requestsPerSecond: 10, burstSize: 20 },
  anthropic: { requestsPerSecond: 5, burstSize: 10 },
  gemini: { requestsPerSecond: 10, burstSize: 20 },
  deepseek: { requestsPerSecond: 10, burstSize: 20 },
  groq: { requestsPerSecond: 30, burstSize: 60 },
  openrouter: { requestsPerSecond: 10, burstSize: 20 },
  together: { requestsPerSecond: 10, burstSize: 20 },
  ollama: { requestsPerSecond: 50, burstSize: 100 },
  local: { requestsPerSecond: 100, burstSize: 200 },
}

export function getRateLimitForProvider(providerName: string): RateLimitConfig {
  const lower = providerName.toLowerCase()
  for (const [key, config] of Object.entries(DEFAULT_RATE_LIMITS)) {
    if (lower.includes(key)) return config
  }
  return { requestsPerSecond: 10, burstSize: 20 }
}
