import type { BudgetState, MessageLike } from './context-types'
import { TokenEstimator } from './TokenEstimator'
import { ContextWindowResolver } from './ContextWindowResolver'
import { TokenBudget } from './TokenBudget'

/**
 * Per-task budget tracker.
 *
 * Uses TokenBudget (shared with TokenBudgetManager) for the base arithmetic.
 * This tracker adds per-task concerns: auto-continuation decisions,
 * diminishing returns detection, and output token accounting.
 */

const COMPLETION_THRESHOLD = 0.9
const DIMINISHING_THRESHOLD = 500

export type BudgetDecision = {
  action: 'continue' | 'stop'
  nudgeMessage?: string
  continuationCount: number
  pct: number
  turnTokens: number
  budget: number
  diminishingReturns: boolean
}

export class TokenBudgetTracker {
  private resolver: ContextWindowResolver
  private budget: TokenBudget
  private continuationCount = 0
  private lastDeltaTokens = 0
  private lastGlobalTurnTokens = 0
  private outputTokensUsed = 0
  private autoContinueTriggered = false
  private startedAt = 0

  constructor(resolver: ContextWindowResolver) {
    this.resolver = resolver
    this.budget = new TokenBudget()
  }

  initializeTask(model: string, betas?: string[]): void {
    const ctxConfig = this.resolver.getModelConfig(model)
    this.budget.reset(ctxConfig.contextWindow)
    this.outputTokensUsed = 0
    this.autoContinueTriggered = false
    this.continuationCount = 0
    this.lastDeltaTokens = 0
    this.lastGlobalTurnTokens = 0
    this.startedAt = Date.now()
  }

  updateAfterResponse(messages: MessageLike[]): void {
    const finalWindowTokens = TokenEstimator.finalContextTokensFromLastResponse(messages)
    if (finalWindowTokens > 0) {
      this.lastGlobalTurnTokens = finalWindowTokens
      this.budget.setUsage(finalWindowTokens)
    }
    const outputTokens = TokenEstimator.messageOutputTokensFromLastResponse(messages)
    if (outputTokens > 0) {
      this.outputTokensUsed += outputTokens
    }
  }

  shouldAutoContinue(): boolean {
    if (this.budget.remaining <= 3_000) {
      this.autoContinueTriggered = true
      this.continuationCount++
      return true
    }
    return false
  }

  checkBudget(globalTurnTokens: number): BudgetDecision {
    const pct = Math.round((globalTurnTokens / this.budget.total) * 100)
    const deltaSinceLastCheck = globalTurnTokens - this.lastGlobalTurnTokens

    const isDiminishing =
      this.continuationCount >= 3 &&
      deltaSinceLastCheck < DIMINISHING_THRESHOLD &&
      this.lastDeltaTokens < DIMINISHING_THRESHOLD

    if (!isDiminishing && globalTurnTokens < this.budget.total * COMPLETION_THRESHOLD) {
      this.continuationCount++
      this.lastDeltaTokens = deltaSinceLastCheck
      this.lastGlobalTurnTokens = globalTurnTokens
      return {
        action: 'continue',
        nudgeMessage: `Used ${pct}% of budget (${globalTurnTokens}/${this.budget.total} tokens). Continue.`,
        continuationCount: this.continuationCount,
        pct,
        turnTokens: globalTurnTokens,
        budget: this.budget.total,
        diminishingReturns: false,
      }
    }

    return {
      action: 'stop',
      continuationCount: this.continuationCount,
      pct,
      turnTokens: globalTurnTokens,
      budget: this.budget.total,
      diminishingReturns: isDiminishing,
    }
  }

  hasDiminishingReturns(): boolean {
    return this.continuationCount >= 3 && this.lastDeltaTokens < DIMINISHING_THRESHOLD
  }

  shouldWarning(): boolean {
    if (this.budget.remaining <= 20_000) return true
    return this.budget.percentageUsed >= 75
  }

  getBudgetState(): BudgetState {
    return {
      total: this.budget.total,
      used: this.budget.used,
      remaining: this.budget.remaining,
      outputTokens: this.outputTokensUsed,
      percentageUsed: this.budget.percentageUsed,
      autoContinueTriggered: this.autoContinueTriggered,
    }
  }

  getPercentageUsed(): number {
    return this.budget.percentageUsed
  }

  getConsecutiveAutoContinues(): number {
    return this.continuationCount
  }

  getRemainingBudget(): number {
    return this.budget.remaining
  }

  shouldCompact(threshold: number): boolean {
    return this.budget.used >= threshold
  }
}
