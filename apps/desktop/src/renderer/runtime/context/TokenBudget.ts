export type TokenBudgetState = {
  total: number
  used: number
  remaining: number
  percentageUsed: number
}

export class TokenBudget {
  constructor(
    public total: number = 0,
    public used: number = 0,
  ) {}

  get remaining(): number {
    return Math.max(0, this.total - this.used)
  }

  get percentageUsed(): number {
    if (this.total === 0) return 0
    return Math.round((this.used / this.total) * 100)
  }

  get state(): TokenBudgetState {
    return {
      total: this.total,
      used: this.used,
      remaining: this.remaining,
      percentageUsed: this.percentageUsed,
    }
  }

  reset(total: number): void {
    this.total = total
    this.used = 0
  }

  recordUsage(amount: number): void {
    this.used = Math.min(this.total, this.used + amount)
  }

  setUsage(amount: number): void {
    this.used = Math.min(this.total, Math.max(0, amount))
  }

  allocate(requested: number): number {
    const available = this.total - this.used
    const allocated = Math.min(requested, available)
    this.used += allocated
    return allocated
  }

  release(amount: number): void {
    this.used = Math.max(0, this.used - amount)
  }

  clone(): TokenBudget {
    const b = new TokenBudget(this.total, this.used)
    return b
  }
}