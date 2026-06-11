import type { PromptAST } from '../ast/PromptNode'
import { estimateASTTokens } from '../ast/PromptNode'

export type ParityTestResult = {
  oldTokens: number
  newTokens: number
  tokenDelta: number
  tokenDeltaPercent: number
  oldSectionCount: number
  newSectionCount: number
  categoriesPresent: string[]
  warnings: string[]
  passed: boolean
}

export class PromptParityTester {
  testParity(oldPrompt: string, newAST: PromptAST, role: string): ParityTestResult {
    const oldTokens = Math.round(oldPrompt.length / 4)
    const newTokens = estimateASTTokens(newAST)
    const tokenDelta = newTokens - oldTokens
    const tokenDeltaPercent = oldTokens > 0 ? (tokenDelta / oldTokens) * 100 : 0

    const warnings: string[] = []

    if (Math.abs(tokenDeltaPercent) > 50) {
      warnings.push(`Token count changed by ${tokenDeltaPercent.toFixed(1)}% (was ${oldTokens}, now ${newTokens})`)
    }

    const oldSections = oldPrompt.split(/(?=### )/).filter(s => s.trim().length > 0).length
    const categoriesPresent = [...new Set(newAST.nodes.map(n => n.category))]

    const hasCore = categoriesPresent.some(c => c === 'core')
    if (!hasCore) {
      warnings.push('No core/identity section found in new AST')
    }

    const hasTools = categoriesPresent.some(c => c.startsWith('tools'))
    if (!hasTools) {
      warnings.push('No tools section found in new AST')
    }

    return {
      oldTokens,
      newTokens,
      tokenDelta,
      tokenDeltaPercent,
      oldSectionCount: oldSections,
      newSectionCount: newAST.nodes.length,
      categoriesPresent,
      warnings,
      passed: warnings.length === 0,
    }
  }

  validateRuntimeCompatibility(newAST: PromptAST): string[] {
    const issues: string[] = []

    if (newAST.nodes.length === 0) {
      issues.push('AST has zero nodes — empty prompt will be produced')
    }

    const criticalSections = newAST.nodes.filter(n => n.importance === 0)
    if (criticalSections.length === 0) {
      issues.push('No CRITICAL importance sections found — core behavior may be missing')
    }

    const categoriesWithContent = new Set(newAST.nodes.filter(n => n.content).map(n => n.category))
    if (!categoriesWithContent.has('core' as any)) {
      issues.push('No CORE category sections with content')
    }

    return issues
  }
}
