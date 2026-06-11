import { PromptASTBuilder } from '../ast/PromptASTBuilder'
import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { PromptAST } from '../ast/PromptNode'
import type { ResolutionContext } from '../registry/SectionDefinition'

export class LegacyPromptAdapter {
  static adaptFromFactory(promptText: string, role: string, ctx?: ResolutionContext): PromptAST {
    const builder = new PromptASTBuilder()
    const sections = promptText.split(/(?=### )/)

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim()
      if (!section) continue

      const titleMatch = section.match(/^### (.+)/)
      const title = titleMatch?.[1] ?? `section-${i}`
      const content = section.replace(/^### .+\n?/, '').trim()

      const category = LegacyPromptAdapter.inferCategory(title)
      const importance = title.toLowerCase().includes('safety') || title.toLowerCase().includes('identity')
        ? Importance.CRITICAL
        : Importance.HIGH

      builder.add(
        `legacy-${title.toLowerCase().replace(/\s+/g, '-')}`,
        category,
        importance,
        (i + 1) * 10,
        content,
        { source: 'legacy-factory', role },
      )
    }

    return builder.build()
  }

  static adaptFromRolePrompt(promptText: string, role: string): PromptAST {
    const builder = new PromptASTBuilder()
    builder.add(
      `legacy-identity-${role}`,
      PromptCategory.CORE,
      Importance.CRITICAL,
      10,
      promptText,
      { source: 'legacy-role-registry', role },
    )
    return builder.build()
  }

  private static inferCategory(title: string): PromptCategory {
    const lower = title.toLowerCase()
    if (lower.includes('identity') || lower.includes('mission')) return PromptCategory.CORE
    if (lower.includes('safety')) return PromptCategory.SAFETY
    if (lower.includes('execution') || lower.includes('mode')) return PromptCategory.EXECUTION
    if (lower.includes('constraint') || lower.includes('policy') || lower.includes('rule')) return PromptCategory.POLICY
    if (lower.includes('tool')) return PromptCategory.TOOLS_REGISTRY
    if (lower.includes('workspace') || lower.includes('file') || lower.includes('context')) return PromptCategory.WORKSPACE
    if (lower.includes('memory') || lower.includes('session')) return PromptCategory.MEMORY
    if (lower.includes('collaboration')) return PromptCategory.COLLABORATION
    if (lower.includes('verification') || lower.includes('quality')) return PromptCategory.VERIFICATION
    if (lower.includes('environment')) return PromptCategory.ENVIRONMENT
    if (lower.includes('output') || lower.includes('style') || lower.includes('tone')) return PromptCategory.OUTPUT
    if (lower.includes('autonomous')) return PromptCategory.AUTONOMOUS
    return PromptCategory.CONTEXT
  }
}
