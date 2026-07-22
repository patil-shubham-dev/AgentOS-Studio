import { describe, expect, it } from 'vitest'
import { SkillRegistry, type SkillDefinition } from '@/runtime/skills/SkillRegistry'

const sampleSkill: SkillDefinition = {
  name: 'sample',
  description: 'A sample skill',
  prompt: 'Do the sample task.',
  source: 'project',
  tags: ['sample'],
  aliases: ['example', 'demo'],
  requiresConfirmation: false,
}

describe('SkillRegistry', () => {
  it('lists each skill once even when it has aliases', () => {
    const registry = new SkillRegistry()
    registry.register(sampleSkill)

    expect(registry.getAll()).toEqual([sampleSkill])
    expect(registry.resolve('example')).toBe(sampleSkill)
  })

  it('reports canonical skills rather than alias entries', () => {
    const registry = new SkillRegistry()
    registry.register(sampleSkill)

    expect(registry.size()).toEqual({ total: 1, bundled: 0, user: 0, project: 1, plugin: 0 })
  })
})
