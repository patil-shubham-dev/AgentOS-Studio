import type { ResolvedSection, ResolutionContext } from '../registry/SectionDefinition'
import type { PromptAST, PromptNode } from '../ast/PromptNode'
import { PromptASTBuilder } from '../ast/PromptASTBuilder'
import { estimateASTTokens } from '../ast/PromptNode'
import { astToString } from '../ast/PromptTree'
import { PromptRegistry } from '../registry/PromptRegistry'
import type { PromptExecutionPlan } from '../planner/PromptExecutionPlan'
import { TokenBudgetPolicy } from './TokenBudgetPolicy'
import { SectionDeduplicator } from './SectionDeduplicator'
import { PromptCompressionEngine } from '../compression/PromptCompressionEngine'
import type { CompressionLevel } from '../compression/CompressionPolicy'
import { PromptDiagnosticsEngine } from '../diagnostics/PromptDiagnosticsEngine'
import type { PromptTrace, SectionTraceEntry, CompressionTraceEntry } from '../tracing/PromptTrace'
import { createPromptTrace, formatTraceSummary } from '../tracing/PromptTrace'

export type CompositionResult = {
  ast: PromptAST
  promptText: string
  trace: PromptTrace
  truncatedSections: string[]
  compressionRatio: number
}

export class PromptCompositionEngine {
  private registry: PromptRegistry
  private budgetPolicy: TokenBudgetPolicy
  private deduplicator: SectionDeduplicator
  private compression: PromptCompressionEngine
  private diagnostics: PromptDiagnosticsEngine

  constructor(registry: PromptRegistry) {
    this.registry = registry
    this.budgetPolicy = new TokenBudgetPolicy()
    this.deduplicator = new SectionDeduplicator()
    this.compression = new PromptCompressionEngine('light')
    this.diagnostics = new PromptDiagnosticsEngine()
  }

  setCompressionLevel(level: CompressionLevel): void {
    this.compression.setLevel(level)
  }

  setBudgetPolicy(config: Parameters<TokenBudgetPolicy['setConfig']>[0]): void {
    this.budgetPolicy.setConfig(config)
  }

  async compose(plan: PromptExecutionPlan, ctx: ResolutionContext): Promise<CompositionResult> {
    const trace = createPromptTrace(`plan_${Date.now()}`, ctx.role)
    trace.executionMode = ctx.executionMode
    trace.provider = ctx.provider
    this.diagnostics.reset()

    // Phase 1: Execute sections via registry
    const sectionDiags = new Map<string, import('../diagnostics/SectionDiagnostics').SectionDiagnostics>()
    const resolved = await this.registry.executeSections(plan, ctx, sectionDiags)

    // Phase 2: Deduplicate
    const { sections: deduped, matches } = this.deduplicator.deduplicate(resolved)

    // Phase 3: Build AST
    const builder = new PromptASTBuilder()
    for (const section of deduped) {
      if (section.content && !section.diagnostics.skipped) {
        builder.add(
          section.definition.id,
          section.definition.category,
          section.definition.importance,
          section.definition.priority,
          section.content,
          { role: ctx.role, executionMode: ctx.executionMode },
        )
      } else {
        trace.warnings.push(`Section "${section.definition.id}" produced no content`)
      }
    }
    let ast = builder.build()

    // Phase 4: Compression
    const compressionResult = this.compression.compress(ast)
    ast = compressionResult.ast
    trace.compression.push({
      phase: 'post',
      originalTokens: compressionResult.originalTokens,
      compressedTokens: compressionResult.compressedTokens,
      removedNodes: compressionResult.removedNodes,
      summarizedNodes: compressionResult.summarizedNodes,
    })
    trace.compressionRatio = compressionResult.originalTokens > 0
      ? (compressionResult.originalTokens - compressionResult.compressedTokens) / compressionResult.originalTokens
      : 0

    // Phase 5: Budget enforcement
    const budgetResult = this.budgetPolicy.applyBudget(ast)
    ast = budgetResult.ast

    // Phase 6: Build trace
    for (const [, diag] of sectionDiags) {
      trace.sections.push({
        id: diag.sectionId,
        category: resolved.find(r => r.definition.id === diag.sectionId)?.definition.category ?? 'core' as import('../categories/PromptCategory').PromptCategory,
        priority: resolved.find(r => r.definition.id === diag.sectionId)?.definition.priority ?? 0,
        executionMs: diag.executionMs,
        tokens: diag.tokens,
        cacheHit: diag.cacheHit,
        compressed: diag.compressed,
        skipped: diag.skipped,
        error: diag.error,
      })
    }

    trace.totalTokens = estimateASTTokens(ast)
    trace.totalExecutionMs = trace.sections.reduce((s, sec) => s + sec.executionMs, 0)
    trace.cacheHitRate = trace.sections.length > 0
      ? trace.sections.filter(s => s.cacheHit).length / trace.sections.length
      : 0

    // Phase 7: Build final text
    const promptText = astToString(ast)

    trace.assembledAt = Date.now()

    return {
      ast,
      promptText,
      trace,
      truncatedSections: budgetResult.truncated,
      compressionRatio: trace.compressionRatio,
    }
  }

  composeMinimal(role: string, customInstructions?: string): string {
    const lines: string[] = [
      `You are the ${role} agent in AgenticOS.`,
      'Be concise. Answer directly. Do not use tools unless necessary. Keep responses brief.',
    ]
    if (customInstructions) {
      lines.push('', customInstructions)
    }
    return lines.join('\n\n')
  }

  getDiagnostics(): PromptDiagnosticsEngine {
    return this.diagnostics
  }

  getBudgetPolicy(): TokenBudgetPolicy {
    return this.budgetPolicy
  }

  formatTraceSummary(trace: PromptTrace): string {
    return formatTraceSummary(trace)
  }
}
