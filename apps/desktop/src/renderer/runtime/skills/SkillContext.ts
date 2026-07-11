import type { Skill } from './Skill'
import type { ToolRegistry } from '../tools/registry/ToolRegistry'
import { PromptASTBuilder } from '../prompting/ast/PromptASTBuilder'
import { Importance } from '../prompting/ast/PromptNode'
import { PromptCategory } from '../prompting/categories/PromptCategory'
import type { PromptAST } from '../prompting/ast/PromptNode'

export class SkillContextBuilder {
  buildSkillAST(skill: Skill, args: string, ctx: { role: string; executionMode?: string }): PromptAST {
    const builder = new PromptASTBuilder()

    builder.add(
      `skill:${skill.name}`,
      PromptCategory.CONTEXT,
      Importance.HIGH,
      80,
      `### Skill: ${skill.name}\n${skill.description}`,
      { role: ctx.role, source: 'skill' },
    )

    if (skill.allowedTools && skill.allowedTools.length > 0) {
      builder.add(
        `skill:${skill.name}:tools`,
        PromptCategory.TOOLS_POLICY,
        Importance.MEDIUM,
      81,
        `Allowed tools for this skill: ${skill.allowedTools.join(', ')}`,
        { role: ctx.role, source: 'skill' },
      )
    }

    if (skill.executionMode) {
      builder.add(
        `skill:${skill.name}:mode`,
        PromptCategory.EXECUTION,
        Importance.MEDIUM,
        82,
        `Execution mode: ${skill.executionMode}`,
        { role: ctx.role, source: 'skill' },
      )
    }

    return builder.build()
  }

  buildSkillSystemPromptSections(skill: Skill): Array<{ category: PromptCategory; priority: number; content: string }> {
    if (skill.systemPromptSections) return skill.systemPromptSections
    return [
      {
        category: PromptCategory.CONTEXT,
        priority: 80,
        content: `### Skill Context: ${skill.name}\n${skill.description}`,
      },
    ]
  }
}
