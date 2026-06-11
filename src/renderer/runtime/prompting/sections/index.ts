import type { SectionDefinition } from '../registry/SectionDefinition'
import { PromptRegistry } from '../registry/PromptRegistry'

import { agentIdentitySection } from './agent-identity.section'
import { executionMissionSection } from './execution-mission.section'
import { executionProcessSection } from './execution-process.section'
import { executionPolicySection } from './execution-policy.section'
import { executionModeSection } from './execution-mode.section'
import { behaviorConstraintsSection } from './behavior-constraints.section'
import { toolsRegistrySection } from './tools-registry.section'
import { toolsExecutionPolicySection } from './tools-execution-policy.section'
import { workspaceContextSection } from './workspace-context.section'
import { projectRulesSection } from './project-rules.section'
import { sessionMemorySection } from './session-memory.section'
import { safetyPolicySection } from './safety-policy.section'
import { outputStyleSection } from './output-style.section'
import { environmentInfoSection } from './environment-info.section'
import { verificationSection } from './verification.section'
import { collaborationSection } from './collaboration.section'
import { autonomousBehaviorSection } from './autonomous-behavior.section'
import { contextManagementSection } from './context-management.section'
import { memoryPolicySection } from './memory-policy.section'
import { routingInstructionsSection } from './routing-instructions.section'
import { streamingBehaviorSection } from './streaming-behavior.section'

export const DEFAULT_SECTIONS: SectionDefinition[] = [
  agentIdentitySection,
  safetyPolicySection,
  executionMissionSection,
  executionProcessSection,
  executionModeSection,
  executionPolicySection,
  behaviorConstraintsSection,
  projectRulesSection,
  workspaceContextSection,
  verificationSection,
  toolsRegistrySection,
  toolsExecutionPolicySection,
  collaborationSection,
  environmentInfoSection,
  outputStyleSection,
  sessionMemorySection,
  memoryPolicySection,
  routingInstructionsSection,
  streamingBehaviorSection,
  autonomousBehaviorSection,
  contextManagementSection,
]

export function registerDefaultSections(registry: PromptRegistry): void {
  registry.registerMany(DEFAULT_SECTIONS)
}

export {
  agentIdentitySection,
  executionMissionSection,
  executionProcessSection,
  executionPolicySection,
  executionModeSection,
  behaviorConstraintsSection,
  toolsRegistrySection,
  toolsExecutionPolicySection,
  workspaceContextSection,
  projectRulesSection,
  sessionMemorySection,
  safetyPolicySection,
  outputStyleSection,
  environmentInfoSection,
  verificationSection,
  collaborationSection,
  autonomousBehaviorSection,
  contextManagementSection,
  memoryPolicySection,
  routingInstructionsSection,
  streamingBehaviorSection,
}
