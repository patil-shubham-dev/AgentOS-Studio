import type { PromptNode } from '../ast/PromptNode'
import { Importance } from '../ast/PromptNode'
import { estimateNodeTokens } from '../ast/PromptNode'

type MatchResult = {
  shouldMerge: boolean
  similarity: number
  mergedContent?: string
}

export class SemanticDeduplicator {
  private readonly minSimilarity: number

  constructor(minSimilarity: number = 0.7) {
    this.minSimilarity = minSimilarity
  }

  deduplicate(nodes: PromptNode[]): { nodes: PromptNode[]; removed: string[]; summarized: string[] } {
    const removed: string[] = []
    const summarized: string[] = []
    const result: PromptNode[] = []

    for (const node of nodes) {
      let merged = false
      for (let i = 0; i < result.length; i++) {
        const existing = result[i]
        const match = this.compare(existing, node)
        if (match.shouldMerge) {
          if (match.mergedContent) {
            result[i] = { ...existing, content: match.mergedContent }
          }
          removed.push(node.id)
          merged = true
          break
        }
      }
      if (!merged) {
        result.push(node)
      }
    }

    return { nodes: result, removed, summarized }
  }

  private compare(a: PromptNode, b: PromptNode): MatchResult {
    if (a.category !== b.category) return { shouldMerge: false, similarity: 0 }

    const similarity = this.calculateSimilarity(a.content, b.content)
    if (similarity < this.minSimilarity) return { shouldMerge: false, similarity }

    if (similarity > 0.9) {
      const merged = a.content.length >= b.content.length ? a.content : b.content
      return { shouldMerge: true, similarity, mergedContent: merged }
    }

    if (a.importance <= b.importance) {
      return { shouldMerge: true, similarity, mergedContent: a.content }
    }
    return { shouldMerge: true, similarity, mergedContent: b.content }
  }

  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1.0
    const wordSetA = new Set(this.tokenize(a))
    const wordSetB = new Set(this.tokenize(b))
    const intersection = new Set([...wordSetA].filter(w => wordSetB.has(w)))
    const union = new Set([...wordSetA, ...wordSetB])
    if (union.size === 0) return 0
    return intersection.size / union.size
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  }
}
