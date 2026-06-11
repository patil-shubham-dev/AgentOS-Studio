import type { PromptCategory } from '../categories/PromptCategory'

export enum Importance {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
  OPTIONAL = 4,
}

export type PromptNodeMetadata = {
  provider?: string
  role?: string
  executionMode?: string
  source?: string
  [key: string]: unknown
}

export type PromptNode = {
  id: string
  category: PromptCategory
  importance: Importance
  priority: number
  content: string
  metadata?: PromptNodeMetadata
}

export type PromptAST = {
  nodes: PromptNode[]
  metadata: {
    totalTokens: number
    nodeCount: number
    categoriesUsed: PromptCategory[]
    assembledAt: number
  }
}

export function createNode(
  id: string,
  category: PromptCategory,
  importance: Importance,
  priority: number,
  content: string,
  metadata?: PromptNodeMetadata,
): PromptNode {
  return { id, category, importance, priority, content, metadata }
}

export function estimateNodeTokens(node: PromptNode, bytesPerToken: number = 4): number {
  return Math.round(node.content.length / bytesPerToken)
}

export function estimateASTTokens(ast: PromptAST, bytesPerToken: number = 4): number {
  return ast.nodes.reduce((sum, n) => sum + estimateNodeTokens(n, bytesPerToken), 0)
}

export function categorizeAST(ast: PromptAST): Map<PromptCategory, PromptNode[]> {
  const map = new Map<PromptCategory, PromptNode[]>()
  for (const node of ast.nodes) {
    const existing = map.get(node.category)
    if (existing) {
      existing.push(node)
    } else {
      map.set(node.category, [node])
    }
  }
  return map
}
