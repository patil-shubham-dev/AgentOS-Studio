import { Importance } from '../ast/PromptNode'
import type { PromptNode, PromptAST } from '../ast/PromptNode'
import { estimateNodeTokens, estimateASTTokens } from '../ast/PromptNode'
import { PromptASTBuilder } from '../ast/PromptASTBuilder'
import type { PromptCategory } from '../categories/PromptCategory'

export type TokenBudgetPolicyConfig = {
  maxTotalTokens: number
  maxOutputTokens: number
  reserveForOutput: boolean
  perCategoryLimits: Partial<Record<PromptCategory, number>>
  emergencyThreshold: number
}

const DEFAULT_BUDGET_CONFIG: TokenBudgetPolicyConfig = {
  maxTotalTokens: 200_000,
  maxOutputTokens: 32_000,
  reserveForOutput: true,
  perCategoryLimits: {},
  emergencyThreshold: 0.9,
}

export class TokenBudgetPolicy {
  private config: TokenBudgetPolicyConfig

  constructor(config?: Partial<TokenBudgetPolicyConfig>) {
    this.config = { ...DEFAULT_BUDGET_CONFIG, ...config }
  }

  setConfig(config: Partial<TokenBudgetPolicyConfig>): void {
    this.config = { ...this.config, ...config }
  }

  applyBudget(ast: PromptAST): { ast: PromptAST; truncated: string[]; budgetUsed: number; budgetTotal: number } {
    const truncated: string[] = []
    const effectiveBudget = this.config.reserveForOutput
      ? this.config.maxTotalTokens - this.config.maxOutputTokens
      : this.config.maxTotalTokens

    const currentTokens = estimateASTTokens(ast)

    if (currentTokens <= effectiveBudget) {
      return { ast, truncated: [], budgetUsed: currentTokens, budgetTotal: effectiveBudget }
    }

    const sorted = [...ast.nodes].sort((a, b) => a.importance - b.importance || a.priority - b.priority)
    const budgeted: PromptNode[] = []
    let remaining = effectiveBudget

    for (const node of sorted) {
      const tokens = estimateNodeTokens(node)
      if (tokens <= remaining) {
        budgeted.push(node)
        remaining -= tokens
      } else if (node.importance <= Importance.HIGH) {
        const truncatedContent = node.content.slice(0, Math.max(200, remaining * 4))
        if (truncatedContent.length > 0) {
          budgeted.push({ ...node, content: truncatedContent })
          truncated.push(node.id)
        }
        remaining = 0
      } else {
        truncated.push(node.id)
      }
    }

    const builder = new PromptASTBuilder()
    builder.addMany(budgeted)
    const resultAST = builder.build()

    return {
      ast: resultAST,
      truncated,
      budgetUsed: effectiveBudget - remaining,
      budgetTotal: effectiveBudget,
    }
  }

  isOverThreshold(ast: PromptAST): boolean {
    const current = estimateASTTokens(ast)
    const effectiveBudget = this.config.reserveForOutput
      ? this.config.maxTotalTokens - this.config.maxOutputTokens
      : this.config.maxTotalTokens
    return current / effectiveBudget >= this.config.emergencyThreshold
  }

  getConfig(): TokenBudgetPolicyConfig {
    return { ...this.config }
  }
}
