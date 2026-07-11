import type { PromptNode, PromptAST } from './PromptNode'
import type { PromptCategory } from '../categories/PromptCategory'
import { PromptExecutionPlan } from '../planner/PromptExecutionPlan'

export function sortAST(ast: PromptAST): PromptNode[] {
  return [...ast.nodes].sort((a, b) => {
    const catOrder = categoryOrder(a.category) - categoryOrder(b.category)
    if (catOrder !== 0) return catOrder
    return a.priority - b.priority
  })
}

function categoryOrder(cat: PromptCategory): number {
  const order: Record<string, number> = {
    'core': 0,
    'safety': 1,
    'execution': 2,
    'policy': 3,
    'context': 4,
    'workspace': 5,
    'memory': 6,
    'tools-registry': 7,
    'tools-policy': 8,
    'tools-formatting': 9,
    'collaboration': 10,
    'verification': 11,
    'environment': 12,
    'output': 13,
    'autonomous': 14,
    'provider': 15,
  }
  return order[cat] ?? 99
}

export function astToString(ast: PromptAST): string {
  const sorted = sortAST(ast)
  return sorted.map(n => n.content).filter(Boolean).join('\n\n')
}

export function astToPlan(ast: PromptAST): PromptExecutionPlan {
  return PromptExecutionPlan.fromAST(ast)
}

export function filterASTByCategory(ast: PromptAST, categories: PromptCategory[]): PromptAST {
  const set = new Set(categories)
  return {
    nodes: ast.nodes.filter(n => set.has(n.category)),
    metadata: { ...ast.metadata, nodeCount: ast.nodes.filter(n => set.has(n.category)).length },
  }
}

export function filterASTByImportance(ast: PromptAST, maxImportance: number): PromptAST {
  return {
    nodes: ast.nodes.filter(n => n.importance <= maxImportance),
    metadata: { ...ast.metadata, nodeCount: ast.nodes.filter(n => n.importance <= maxImportance).length },
  }
}

export function mergeASTs(asts: PromptAST[]): PromptAST {
  const allNodes: PromptNode[] = []
  const seen = new Set<string>()
  for (const ast of asts) {
    for (const node of ast.nodes) {
      if (!seen.has(node.id)) {
        allNodes.push(node)
        seen.add(node.id)
      }
    }
  }
  return {
    nodes: allNodes,
    metadata: {
      totalTokens: allNodes.reduce((s, n) => s + Math.round(n.content.length / 4), 0),
      nodeCount: allNodes.length,
      categoriesUsed: [...new Set(allNodes.map(n => n.category))],
      assembledAt: Date.now(),
    },
  }
}
