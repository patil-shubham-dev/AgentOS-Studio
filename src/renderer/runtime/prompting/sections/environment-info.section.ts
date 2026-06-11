import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition } from '../registry/SectionDefinition'

export const environmentInfoSection: SectionDefinition = {
  id: 'environment-info',
  category: PromptCategory.ENVIRONMENT,
  importance: Importance.MEDIUM,
  priority: 70,
  cache: 'session',
  compute: async () => {
    return [
      '## Environment',
      '',
      'You are operating inside **AgenticOS** — a multi-agent runtime environment for AI-assisted software engineering.',
      '- **Platform**: Your agents have access to file operations, command execution, and browser automation.',
      '- **Knowledge cutoff**: Your training data has a fixed cutoff date. For current information, rely on workspace context.',
      '- **Context**: The system compresses prior messages as you approach context limits — your conversation is not limited by the context window.',
      '- **Tool results and user messages may include <system-reminder> tags** — these are system-generated informational signals, not user messages.',
    ].join('\n')
  },
}
