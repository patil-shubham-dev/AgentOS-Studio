export enum PromptCategory {
  CORE = 'core',
  EXECUTION = 'execution',
  CONTEXT = 'context',
  WORKSPACE = 'workspace',
  MEMORY = 'memory',
  TOOLS_REGISTRY = 'tools-registry',
  TOOLS_POLICY = 'tools-policy',
  TOOLS_FORMATTING = 'tools-formatting',
  POLICY = 'policy',
  PROVIDER = 'provider',
  SAFETY = 'safety',
  COLLABORATION = 'collaboration',
  OUTPUT = 'output',
  ENVIRONMENT = 'environment',
  AUTONOMOUS = 'autonomous',
  VERIFICATION = 'verification',
}

export const CATEGORY_PRIORITY: Record<PromptCategory, number> = {
  [PromptCategory.CORE]: 0,
  [PromptCategory.SAFETY]: 1,
  [PromptCategory.EXECUTION]: 2,
  [PromptCategory.POLICY]: 3,
  [PromptCategory.CONTEXT]: 4,
  [PromptCategory.WORKSPACE]: 5,
  [PromptCategory.MEMORY]: 6,
  [PromptCategory.TOOLS_REGISTRY]: 7,
  [PromptCategory.TOOLS_POLICY]: 8,
  [PromptCategory.TOOLS_FORMATTING]: 9,
  [PromptCategory.COLLABORATION]: 10,
  [PromptCategory.VERIFICATION]: 11,
  [PromptCategory.ENVIRONMENT]: 12,
  [PromptCategory.OUTPUT]: 13,
  [PromptCategory.AUTONOMOUS]: 14,
  [PromptCategory.PROVIDER]: 15,
}

export function categoryLabel(cat: PromptCategory): string {
  const map: Record<PromptCategory, string> = {
    [PromptCategory.CORE]: 'Core Identity',
    [PromptCategory.SAFETY]: 'Safety Guidelines',
    [PromptCategory.EXECUTION]: 'Execution Policy',
    [PromptCategory.POLICY]: 'Behavior Policy',
    [PromptCategory.CONTEXT]: 'Context Assembly',
    [PromptCategory.WORKSPACE]: 'Workspace Context',
    [PromptCategory.MEMORY]: 'Session Memory',
    [PromptCategory.TOOLS_REGISTRY]: 'Tool Definitions',
    [PromptCategory.TOOLS_POLICY]: 'Tool Policies',
    [PromptCategory.TOOLS_FORMATTING]: 'Tool Formatting',
    [PromptCategory.COLLABORATION]: 'Collaboration',
    [PromptCategory.VERIFICATION]: 'Verification',
    [PromptCategory.ENVIRONMENT]: 'Environment',
    [PromptCategory.OUTPUT]: 'Output Style',
    [PromptCategory.AUTONOMOUS]: 'Autonomous Behavior',
    [PromptCategory.PROVIDER]: 'Provider Adapter',
  }
  return map[cat] ?? cat
}
