import { ContextWindowResolver } from './ContextWindowResolver'
import { TokenBudgetTracker } from './TokenBudgetTracker'
import { Compactor } from './Compactor'
import { ContextFileScorer } from './ContextFileScorer'
import { ContextFileCache } from './ContextFileCache'
import type { MessageLike, CompactResult, BudgetState, ScoredFile } from './context-types'
import type { LifecycleHookRegistry } from '@/runtime/lifecycle'

/**
 * Per-session mutable context state.
 * Each agent or session gets its own ContextSession with isolated
 * budget tracker, compactor, file cache, and file scorer.
 * Shared infrastructure (promptRegistry, compositionEngine, config)
 * lives on the parent ContextManager singleton.
 */
export class ContextSession {
  readonly budgetTracker: TokenBudgetTracker
  readonly compactor: Compactor
  readonly fileCache: ContextFileCache
  readonly fileScorer: ContextFileScorer
  readonly sessionFileEditCache = new Set<string>()
  readonly model: string
  readonly betas: string[]
  readonly role: string

  constructor(
    resolver: ContextWindowResolver,
    role: string,
    model?: string,
    betas?: string[],
    lifecycleHooks?: LifecycleHookRegistry,
  ) {
    this.role = role
    this.model = model ?? 'gpt-4o'
    this.betas = betas ?? []

    this.budgetTracker = new TokenBudgetTracker(resolver)
    this.budgetTracker.initializeTask(this.model, this.betas)

    this.compactor = new Compactor(resolver, this.budgetTracker)
    this.compactor.onPostCompact = () => {}
    if (lifecycleHooks) {
      this.compactor.connectLifecycleRegistry(lifecycleHooks)
    }

    this.fileCache = new ContextFileCache()
    this.fileScorer = new ContextFileScorer({
      enableActiveFileBoost: true,
      enableRelevanceScoring: true,
    })
  }

  initializeTask(model?: string, betas?: string[]): void {
    this.budgetTracker.initializeTask(model ?? this.model, betas ?? this.betas)
    this.compactor.resetCompactionCount()
  }

  updateBudget(messages: MessageLike[]): void {
    this.budgetTracker.updateAfterResponse(messages)
  }

  compact(messages: MessageLike[], model?: string, betas?: string[]): CompactResult | null {
    return this.compactor.compact(model ?? this.model, messages, betas ?? this.betas)
  }

  getBudgetState(): BudgetState {
    return this.budgetTracker.getBudgetState()
  }

  getCompactStats(): ReturnType<Compactor['getCompactStats']> {
    return this.compactor.getCompactStats()
  }
}
