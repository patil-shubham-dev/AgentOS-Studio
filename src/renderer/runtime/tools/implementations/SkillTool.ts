import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'
import { RuntimeOS } from '@/runtime/RuntimeOS'

export const RunSkillTool: AgentTool = buildTool({
  name: 'run_skill',
  description: 'Execute a registered skill by name and get the expanded prompt back. Skills are reusable prompt templates. Also supports searching and listing available skills.',
  phase: 'advanced',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the skill to execute (e.g. "plan", "review", "explain")' },
      args: { type: 'string', description: 'Optional arguments to pass to the skill\'s prompt generator' },
      action: { type: 'string', enum: ['execute', 'list', 'search', 'info'], description: 'Action: execute the skill, list all skills, search, or get info (default: execute)' },
      query: { type: 'string', description: 'Search query when action is "search"' },
    },
    required: [],
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  requiredCapabilities: () => [ToolCapabilities.SKILL_EXECUTION],
  getActivityDescription: (input) => {
    const n = (input as any)?.name
    const action = (input as any)?.action
    if (action === 'list') return 'Listing available skills'
    if (action === 'search') return 'Searching skills'
    return n ? `Running skill "${n}"` : 'Running a skill'
  },
  execute: async (_ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const name = String(input.name ?? '')
    const skillArgs = String(input.args ?? '')
    const action = String(input.action ?? 'execute')
    const query = String(input.query ?? '')

    const runtime = RuntimeOS.getInstance()
    const skillExecutor = runtime.skillExecutor

    switch (action) {
      case 'list': {
        const skills = skillExecutor.listAll()
        const list = skills.map(s => `- /${s.name}: ${s.description}`).join('\n')
        return { data: `Available skills (${skills.length}):\n${list}` }
      }
      case 'search': {
        if (!query) return { data: null, error: 'query is required for search', isError: true }
        const results = skillExecutor.searchSkills(query)
        if (results.length === 0) return { data: `No skills found matching "${query}"` }
        return { data: results.map(s => `- /${s.name}: ${s.description}`).join('\n') }
      }
      case 'info': {
        if (!name) return { data: null, error: 'name is required for info', isError: true }
        const info = skillExecutor.getSkillInfo(name)
        if (!info) return { data: null, error: `Skill "${name}" not found`, isError: true }
        return { data: info }
      }
      default: {
        if (!name) return { data: null, error: 'name is required for execute', isError: true }
        const prepared = skillExecutor.prepare(name, skillArgs)
        if (!prepared) return { data: null, error: `Skill "${name}" not found. Use action="list" to see available skills.`, isError: true }
        return {
          data: prepared.expandedPrompt,
          meta: { skillName: prepared.skillName, requiresConfirmation: prepared.requiresConfirmation },
        }
      }
    }
  },
})
