import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'
import { FeatureFlagManager } from '@/runtime/feature-flags/FeatureFlagManager'

// Internal role descriptions — used for model guidance, not user-visible labels
const ROLE_DESCRIPTIONS: Record<string, string> = {
  manager:
    'You orchestrate complex tasks by decomposing them into subtasks and coordinating specialized capabilities. You synthesize results into clear, complete responses.',
  coder:
    'You are a senior software engineer. You write, debug, and refactor production code with precision and care for existing conventions.',
  vision:
    'You analyze screenshots, UI layouts, and rendered output. You identify layout issues, accessibility problems, and visual regressions.',
  research:
    'You explore codebases, trace dependencies, document architecture, and provide structured analytical findings.',
  runtime:
    'You are responsible for command execution, process management, build pipelines, and system-level operations.',
  design:
    'You create beautiful, accessible, production-ready UI components. You follow the project\'s design system and frontend conventions.',
  'fast-inference':
    'You handle quick queries, simple code snippets, and rapid lookups with minimal overhead.',
  browser:
    'You automate web interactions, extract data, and test UI flows through a headless browser.',
  qa:
    'You write tests, run test suites, verify code quality, and ensure reliability across the workspace.',
  memory:
    'You maintain context continuity, store project knowledge, and retrieve relevant memories across sessions.',
}

export const agentIdentitySection: SectionDefinition = {
  id: 'agent-identity',
  category: PromptCategory.CORE,
  importance: Importance.CRITICAL,
  priority: 10,
  cache: 'session',
  compute: async (ctx: ResolutionContext) => {
    const showLabels = FeatureFlagManager.getInstance().isEnabled('showInternalAgentLabels')
    const description = ROLE_DESCRIPTIONS[ctx.role] ?? ROLE_DESCRIPTIONS.coder!

    if (showLabels) {
      // Advanced mode — show internal role for debugging/power users
      return `You are the AgenticOS assistant (role: ${ctx.role}). ${description}`
    }

    // Default: one unified assistant identity — no internal role labels
    return `You are AgenticOS, an AI coding assistant. ${description}`
  },
}
