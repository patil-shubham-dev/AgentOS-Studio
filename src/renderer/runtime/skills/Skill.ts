import type { PromptCategory } from '../prompting/categories/PromptCategory'

export type SkillContext = 'inline' | 'fork'

export type SkillDefinition = {
  name: string
  description: string
  aliases?: string[]
  allowedTools?: string[]
  model?: string
  disableModelInvocation?: boolean
  userInvocable?: boolean
  isEnabled?: () => boolean
  context?: SkillContext
  agent?: string
  executionMode?: string
  systemPromptSections?: Array<{ category: PromptCategory; priority: number; content: string }>
  getPromptForCommand: (args: string, ctx: { role: string; executionMode?: string }) => Promise<string>
}

export type Skill = SkillDefinition & {
  isEnabled: () => boolean
  userInvocable: boolean
  disableModelInvocation: boolean
}
