import { buildTool, type AgentTool } from '../core/AgentTool'
import type { ToolContext } from '../core/ToolContext'
import type { ToolResult } from '../core/ToolResult'
import { ToolCapabilities } from '../core/ToolCapabilities'

export interface QuestionInput {
  question: string
  options?: string[]
  description?: string
}

export const QuestionTool: AgentTool = buildTool({
  name: 'question',
  aliases: ['ask_user', 'clarify'],
  description: 'Ask the user a question to get clarification or input. Use this when the task is ambiguous, you need to choose between approaches, or need user approval for a decision.',
  inputSchema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The question to ask the user (required)',
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional predefined answer choices for the user to pick from',
      },
      description: {
        type: 'string',
        description: 'Optional context explaining why you are asking this question',
      },
    },
    required: ['question'],
  },
  promptCategory: 'core',
  promptPriority: 90,
  isReadOnly: () => true,
  isConcurrencySafe: () => false,
  requiredCapabilities: () => [ToolCapabilities.TASK_MANAGEMENT],
  getActivityDescription: (input) => {
    const q = (input as any)?.question
    return q ? `Asking: ${String(q).slice(0, 80)}` : 'Asking user a question'
  },
  execute: async (ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult> => {
    const question = String(input.question ?? '')
    if (!question) return { data: null, error: 'question is required', isError: true }

    const options = input.options as string[] | undefined
    const description = input.description as string | undefined

    if (ctx.appendSystemMessage) {
      ctx.appendSystemMessage(`[SYSTEM] Agent is asking: ${question}`)
    }

    const data: QuestionInput = { question, options, description }

    return {
      data,
      newMessages: [{
        role: 'user',
        content: `[Question for user]\n${description ? `Context: ${description}\n` : ''}Question: ${question}${options ? `\nOptions: ${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}` : ''}`,
      }],
      meta: {
        type: 'question',
        question,
        options,
        description,
      },
    }
  },
})
