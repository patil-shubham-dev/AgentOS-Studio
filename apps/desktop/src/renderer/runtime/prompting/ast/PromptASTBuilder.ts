import type { PromptNode, PromptAST } from './PromptNode'
import type { PromptCategory } from '../categories/PromptCategory'
import { Importance, createNode, estimateASTTokens } from './PromptNode'

export class PromptASTBuilder {
  private nodes: PromptNode[] = []

  add(
    id: string,
    category: PromptCategory,
    importance: Importance,
    priority: number,
    content: string | null | undefined,
    metadata?: Record<string, unknown>,
  ): this {
    if (!content) return this
    this.nodes.push(createNode(id, category, importance, priority, content, metadata))
    return this
  }

  addIf(
    condition: boolean,
    id: string,
    category: PromptCategory,
    importance: Importance,
    priority: number,
    content: string | null | undefined,
    metadata?: Record<string, unknown>,
  ): this {
    if (condition) return this.add(id, category, importance, priority, content, metadata)
    return this
  }

  addMany(nodes: PromptNode[]): this {
    for (const node of nodes) {
      if (node.content) {
        this.nodes.push(node)
      }
    }
    return this
  }

  remove(id: string): this {
    this.nodes = this.nodes.filter(n => n.id !== id)
    return this
  }

  replace(id: string, node: PromptNode): this {
    const idx = this.nodes.findIndex(n => n.id === id)
    if (idx >= 0) {
      this.nodes[idx] = node
    } else {
      this.nodes.push(node)
    }
    return this
  }

  filter(predicate: (node: PromptNode) => boolean): this {
    this.nodes = this.nodes.filter(predicate)
    return this
  }

  merge(builder: PromptASTBuilder): this {
    this.nodes.push(...builder.nodes)
    return this
  }

  build(): PromptAST {
    const categoriesUsed = [...new Set(this.nodes.map(n => n.category))]
    const ast: PromptAST = {
      nodes: [...this.nodes],
      metadata: {
        totalTokens: estimateASTTokens({ nodes: this.nodes, metadata: { totalTokens: 0, nodeCount: 0, categoriesUsed: [], assembledAt: 0 } }),
        nodeCount: this.nodes.length,
        categoriesUsed,
        assembledAt: Date.now(),
      },
    }
    return ast
  }

  reset(): void {
    this.nodes = []
  }

  getNodes(): PromptNode[] {
    return [...this.nodes]
  }

  getNodeCount(): number {
    return this.nodes.length
  }
}
