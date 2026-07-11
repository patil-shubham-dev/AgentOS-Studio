/**
 * Skill system — markdown-based commands with frontmatter.
 * Inspired by Claude Code's skills/ directory.
 *
 * Skills are markdown files with YAML frontmatter that define
 * reusable commands. They can be stored in:
 *   - .agentic/skills/ (project-level)
 *   - ~/.agentic/skills/ (user-level)
 *   - Bundled with the app
 */

export interface SkillDefinition {
  name: string
  description: string
  prompt: string
  source: 'bundled' | 'project' | 'user' | 'plugin'
  tags: string[]
  aliases: string[]
  requiresConfirmation: boolean
  filePath?: string
  /**
   * Optional lazy loader for the prompt text.
   * When set, the `prompt` field may be empty or a placeholder;
   * call `resolvePrompt(skill)` to get the actual prompt.
   */
  loadPrompt?: () => Promise<string>
}

export interface SkillRegistryState {
  total: number
  bundled: number
  user: number
  project: number
  plugin: number
}

export class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map()
  private sourceCounts = { bundled: 0, user: 0, project: 0, plugin: 0 }

  register(skill: SkillDefinition): void {
    if (this.skills.has(skill.name)) {
      const existing = this.skills.get(skill.name)!
      console.warn(`[SkillRegistry] overwriting skill "${skill.name}": "${existing.source}/${existing.description}" ← "${skill.source}/${skill.description}"`)
    }
    this.skills.set(skill.name, skill)
    for (const alias of skill.aliases) {
      if (this.skills.has(alias)) {
        const existing = this.skills.get(alias)!
        console.warn(`[SkillRegistry] alias "${alias}" collision: "${existing.source}/${existing.name}" ← "${skill.source}/${skill.name}"`)
      }
      this.skills.set(alias, skill)
    }
    this.sourceCounts[skill.source]++
  }

  registerMany(skills: SkillDefinition[]): void {
    for (const skill of skills) {
      this.register(skill)
    }
  }

  unregister(name: string): boolean {
    const skill = this.skills.get(name)
    if (!skill) return false
    this.skills.delete(name)
    for (const alias of skill.aliases) {
      this.skills.delete(alias)
    }
    return true
  }

  resolve(name: string): SkillDefinition | undefined {
    return this.skills.get(name)
  }

  getAll(): SkillDefinition[] {
    return Array.from(
      new Map(Array.from(this.skills.entries()).filter(([, v]) => v.name === v.name || !v.aliases.includes(v.name))).values(),
    )
  }

  getByTag(tag: string): SkillDefinition[] {
    return this.getAll().filter(s => s.tags.includes(tag))
  }

  getBySource(source: SkillDefinition['source']): SkillDefinition[] {
    return this.getAll().filter(s => s.source === source)
  }

  search(query: string): SkillDefinition[] {
    const q = query.toLowerCase()
    return this.getAll().filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some(t => t.toLowerCase().includes(q)),
    )
  }

  async resolvePrompt(skill: SkillDefinition): Promise<string> {
    if (skill.loadPrompt) {
      const loaded = await skill.loadPrompt()
      skill.prompt = loaded
      skill.loadPrompt = undefined
    }
    return skill.prompt
  }

  size(): SkillRegistryState {
    return {
      total: this.skills.size,
      ...this.sourceCounts,
    }
  }

  clear(): void {
    this.skills.clear()
    this.sourceCounts = { bundled: 0, user: 0, project: 0, plugin: 0 }
  }
}
