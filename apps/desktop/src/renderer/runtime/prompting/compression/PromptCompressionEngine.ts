import type { PromptNode, PromptAST } from '../ast/PromptNode'
import { PromptASTBuilder } from '../ast/PromptASTBuilder'
import { estimateNodeTokens, estimateASTTokens, Importance } from '../ast/PromptNode'
import type { CompressionConfig, CompressionLevel } from './CompressionPolicy'
import { getCompressionConfig } from './CompressionPolicy'
import { SemanticDeduplicator } from './SemanticDeduplicator'
import type { PromptCategory } from '../categories/PromptCategory'

export type CompressionResult = {
  ast: PromptAST
  originalTokens: number
  compressedTokens: number
  removedNodes: string[]
  summarizedNodes: string[]
}

export class PromptCompressionEngine {
  private config: CompressionConfig
  private deduplicator: SemanticDeduplicator

  constructor(level: CompressionLevel = 'light') {
    this.config = getCompressionConfig(level)
    this.deduplicator = new SemanticDeduplicator()
  }

  setLevel(level: CompressionLevel): void {
    this.config = getCompressionConfig(level)
  }

  setConfig(config: Partial<CompressionConfig>): void {
    this.config = { ...this.config, ...config }
  }

  compress(ast: PromptAST): CompressionResult {
    if (!this.config.enabled) {
      return {
        ast,
        originalTokens: estimateASTTokens(ast),
        compressedTokens: estimateASTTokens(ast),
        removedNodes: [],
        summarizedNodes: [],
      }
    }

    let nodes = [...ast.nodes]
    const removedNodes: string[] = []
    const summarizedNodes: string[] = []

    // Phase 1: Deduplication
    if (this.config.deduplicate) {
      const deduped = this.deduplicator.deduplicate(nodes)
      nodes = deduped.nodes
      removedNodes.push(...deduped.removed)
      summarizedNodes.push(...deduped.summarized)
    }

    // Phase 2: Whitespace normalization
    if (this.config.whitespaceNormalize) {
      nodes = nodes.map(n => ({
        ...n,
        content: n.content.replace(/\n{3,}/g, '\n\n').trim(),
      }))
    }

    // Phase 3: Category budget enforcement
    if (Object.keys(this.config.maxTokensPerCategory).length > 0) {
      nodes = this.applyCategoryBudget(nodes, removedNodes)
    }

    // Phase 4: Importance-based removal
    if (!this.config.emergencyMode) {
      nodes = nodes.filter(n => n.importance <= this.config.importanceThreshold)
    } else {
      nodes = nodes.filter(n => n.importance < Importance.CRITICAL)
    }

    // Phase 5: Emergency summarization
    if (this.config.emergencyMode) {
      nodes = nodes.map(n => ({
        ...n,
        content: this.emergencySummarize(n.content, 500),
      }))
    }

    const originalTokens = estimateASTTokens(ast)
    const resultBuilder = new PromptASTBuilder()
    resultBuilder.addMany(nodes)
    const resultAST = resultBuilder.build()
    const compressedTokens = estimateASTTokens(resultAST)

    return {
      ast: resultAST,
      originalTokens,
      compressedTokens,
      removedNodes,
      summarizedNodes,
    }
  }

  private applyCategoryBudget(nodes: PromptNode[], removedNodes: string[]): PromptNode[] {
    const byCategory = new Map<PromptCategory, PromptNode[]>()
    for (const node of nodes) {
      const existing = byCategory.get(node.category)
      if (existing) existing.push(node)
      else byCategory.set(node.category, [node])
    }

    const result: PromptNode[] = []
    for (const [category, catNodes] of byCategory) {
      const limit = this.config.maxTokensPerCategory[category]
      if (limit === undefined) {
        result.push(...catNodes)
        continue
      }
      const sorted = [...catNodes].sort((a, b) => a.importance - b.importance || a.priority - b.priority)
      let budget = limit
      for (const node of sorted) {
        const tokens = estimateNodeTokens(node)
        if (tokens <= budget) {
          result.push(node)
          budget -= tokens
        } else if (budget > 0 && node.importance <= Importance.HIGH) {
          const truncated = { ...node, content: node.content.slice(0, Math.max(100, budget * 4)) }
          result.push(truncated)
          budget = 0
        } else {
          removedNodes.push(node.id)
        }
      }
    }
    return result
  }

  private emergencySummarize(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content
    const lines = content.split('\n')
    const headerLines: string[] = []
    let charCount = 0
    for (const line of lines) {
      if (line.startsWith('#') || line.startsWith('-') || line.match(/^\d+\./)) {
        const next = headerLines.length > 0 ? '\n' + line : line
        if (charCount + next.length > maxChars) break
        headerLines.push(line)
        charCount += next.length
      }
    }
    return headerLines.join('\n') || content.slice(0, maxChars)
  }

  getConfig(): CompressionConfig {
    return { ...this.config }
  }
}
