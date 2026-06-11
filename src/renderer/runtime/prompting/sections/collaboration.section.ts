import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'

export const collaborationSection: SectionDefinition = {
  id: 'collaboration',
  category: PromptCategory.COLLABORATION,
  importance: Importance.MEDIUM,
  priority: 65,
  cache: 'session',
  when: (ctx: ResolutionContext) => ctx.isMultiAgent,
  compute: async () => {
    return [
      '### Collaboration',
      '',
      'AgenticOS uses a multi-agent architecture. Here is how you work with other agents:',
      '',
      '- **Manager Agent**: Receives your results and synthesizes them into the final response. Reports progress to the user.',
      '- **Coder Agent**: Writes and edits code. Signal the Coder when file modifications are needed.',
      '- **Research Agent**: Explores the codebase deeply. Request research before making architectural decisions.',
      '- **Runtime Agent**: Executes commands and manages processes. Useful for builds, tests, and deployments.',
      '- **Design Agent**: Creates UI components and frontend code. Coordinate for visual changes.',
      '- **Browser Agent**: Automates web interactions. Useful for web data tasks and E2E testing.',
      '- **QA Agent**: Writes and runs tests. Coordinate for test coverage and quality verification.',
      '- **Vision Agent**: Analyzes screenshots and visual output. Useful for UI validation.',
      '- **Fast Inference Agent**: Handles quick, simple subtasks. Signal when a task is too complex.',
      '- **Memory Agent**: Stores and retrieves persistent knowledge. Use for cross-session context.',
      '',
      'When delegating, provide clear context, file paths, success criteria, and expected output format.',
      'Report back to the Manager Agent with structured results, not raw output.',
    ].join('\n')
  },
}
