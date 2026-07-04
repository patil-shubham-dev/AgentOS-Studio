import type { BudgetState, MessageLike } from './context-types'
import { TokenEstimator } from './TokenEstimator'
import { ContextWindowResolver } from './ContextWindowResolver'

/**
 * Per-task budget tracker.
 *
 * NOTE: This shares the same budget formula as TokenBudgetManager (contextWindow alone).
 * The 'remaining' tracking here is per-task (a single execution turn), while
 * TokenBudgetManager tracks globally across all agents and tasks.
 * Both should produce consistent 'percentage used' for the same base contextWindow.
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
  private continuationCount = 0
  private lastDeltaTokens = 0
  private lastGlobalTurnTokens = 0
  private taskBudget = 0
  private remainingBudget = 0
  private outputTokensUsed = 0
  private autoContinueTriggered = false
  private startedAt = 0

  constructor(resolver: ContextWindowResolver) {
    this.resolver = resolver
  }

  initializeTask(model: string, betas?: string[]): void {
    const ctxConfig = this.resolver.getModelConfig(model)
    // Uses contextWindow alone (not contextWindow + maxOutputTokens) to stay
    // consistent with TokenBudgetManager's formula. Output tokens are accounted
    // separately via updateAfterResponse().
    this.taskBudget = ctxConfig.contextWindow
    this.remainingBudget = this.taskBudget
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
      this.remainingBudget = Math.max(0, this.taskBudget - finalWindowTokens)
    }
    const outputTokens = TokenEstimator.messageOutputTokensFromLastResponse(messages)
    if (outputTokens > 0) {
      this.outputTokensUsed += outputTokens
    }
  }

  shouldAutoContinue(): boolean {
    if (this.remainingBudget <= 3_000) {
      this.autoContinueTriggered = true
      this.continuationCount++
      return true
    }
    return false
  }

  checkBudget(globalTurnTokens: number): BudgetDecision {
    const pct = Math.round((globalTurnTokens / this.taskBudget) * 100)
    const deltaSinceLastCheck = globalTurnTokens - this.lastGlobalTurnTokens

    const isDiminishing =
      this.continuationCount >= 3 &&
      deltaSinceLastCheck < DIMINISHING_THRESHOLD &&
      this.lastDeltaTokens < DIMINISHING_THRESHOLD

    if (!isDiminishing && globalTurnTokens < this.taskBudget * COMPLETION_THRESHOLD) {
      this.continuationCount++
      this.lastDeltaTokens = deltaSinceLastCheck
      this.lastGlobalTurnTokens = globalTurnTokens
      return {
        action: 'continue',
        nudgeMessage: `Used ${pct}% of budget (${globalTurnTokens}/${this.taskBudget} tokens). Continue.`,
        continuationCount: this.continuationCount,
        pct,
        turnTokens: globalTurnTokens,
        budget: this.taskBudget,
        diminishingReturns: false,
      }
    }

    return {
      action: 'stop',
      continuationCount: this.continuationCount,
      pct,
      turnTokens: globalTurnTokens,
      budget: this.taskBudget,
      diminishingReturns: isDiminishing,
    }
  }

  hasDiminishingReturns(): boolean {
    return this.continuationCount >= 3 && this.lastDeltaTokens < DIMINISHING_THRESHOLD
  }

  shouldWarning(): boolean {
    if (this.remainingBudget <= 20_000) return true
    return this.getPercentageUsed() >= 75
  }

  getBudgetState(): BudgetState {
    const percentageUsed = this.getPercentageUsed()
    return {
      total: this.taskBudget,
      used: this.taskBudget - this.remainingBudget,
      remaining: this.remainingBudget,
      outputTokens: this.outputTokensUsed,
      percentageUsed,
      autoContinueTriggered: this.autoContinueTriggered,
    }
  }

  getPercentageUsed(): number {
    if (this.taskBudget === 0) return 0
    const used = this.taskBudget - this.remainingBudget
    return Math.round((used / this.taskBudget) * 100)
  }

  getConsecutiveAutoContinues(): number {
    return this.continuationCount
  }

  getRemainingBudget(): number {
    return this.remainingBudget
  }

  shouldCompact(threshold: number): boolean {
    const used = this.taskBudget - this.remainingBudget
    return used >= threshold
  }
}
