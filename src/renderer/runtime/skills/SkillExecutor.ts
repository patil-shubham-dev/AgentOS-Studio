import { SkillRegistry, type SkillDefinition } from './SkillRegistry'

export interface SkillExecutionResult {
  skillName: string
  expandedPrompt: string
  requiresConfirmation: boolean
}

export class SkillExecutor {
  private registry: SkillRegistry

  constructor(registry: SkillRegistry) {
    this.registry = registry
  }

  resolve(name: string): SkillDefinition | undefined {
    return this.registry.resolve(name)
  }

  prepare(skillName: string, userArgs?: string): SkillExecutionResult | null {
    const skill = this.registry.resolve(skillName)
    if (!skill) return null

    let expandedPrompt = skill.prompt
    if (userArgs) {
      expandedPrompt = `${skill.prompt}\n\nUser request: ${userArgs}`
    }

    return {
      skillName: skill.name,
      expandedPrompt,
      requiresConfirmation: skill.requiresConfirmation,
    }
  }

  searchSkills(query: string): SkillDefinition[] {
    return this.registry.search(query)
  }

  listAll(): SkillDefinition[] {
    return this.registry.getAll()
  }

  getSkillInfo(name: string): string | null {
    const skill = this.registry.resolve(name)
    if (!skill) return null
    return `/${skill.name} — ${skill.description}${skill.aliases.length > 0 ? `\n  Aliases: ${skill.aliases.map(a => `/${a}`).join(', ')}` : ''}${skill.tags.length > 0 ? `\n  Tags: ${skill.tags.join(', ')}` : ''}${skill.source !== 'bundled' ? `\n  Source: ${skill.source}` : ''}`
  }

  getStats(): { total: number; bySource: Record<string, number> } {
    const all = this.registry.getAll()
    const bySource: Record<string, number> = {}
    for (const skill of all) {
      bySource[skill.source] = (bySource[skill.source] || 0) + 1
    }
    return { total: all.length, bySource }
  }
}
