import type { PromptCategory } from '../categories/PromptCategory'
import { Importance } from '../ast/PromptNode'

export type CompressionLevel = 'none' | 'light' | 'medium' | 'aggressive' | 'emergency'

export type CompressionConfig = {
  level: CompressionLevel
  enabled: boolean
  maxTokensPerCategory: Partial<Record<PromptCategory, number>>
  importanceThreshold: number
  deduplicate: boolean
  mergeRepeatedPolicies: boolean
  summarizeLowPriority: boolean
  whitespaceNormalize: boolean
  emergencyMode: boolean
}

const DEFAULT_CATEGORY_LIMITS: Partial<Record<PromptCategory, number>> = {
  'core': 5000,
  'safety': 2000,
  'execution': 3000,
  'policy': 3000,
  'context': 4000,
  'workspace': 2000,
  'memory': 2000,
  'tools-registry': 4000,
  'tools-policy': 2000,
  'tools-formatting': 1000,
  'collaboration': 2000,
  'verification': 1500,
  'environment': 1000,
  'output': 1000,
  'autonomous': 1500,
  'provider': 500,
}

export function getCompressionConfig(level: CompressionLevel): CompressionConfig {
  switch (level) {
    case 'none':
      return {
        level, enabled: false, maxTokensPerCategory: {},
        importanceThreshold: 99, deduplicate: false,
        mergeRepeatedPolicies: false, summarizeLowPriority: false,
        whitespaceNormalize: false, emergencyMode: false,
      }
    case 'light':
      return {
        level, enabled: true, maxTokensPerCategory: DEFAULT_CATEGORY_LIMITS,
        importanceThreshold: Importance.OPTIONAL, deduplicate: true,
        mergeRepeatedPolicies: false, summarizeLowPriority: false,
        whitespaceNormalize: true, emergencyMode: false,
      }
    case 'medium':
      return {
        level, enabled: true, maxTokensPerCategory: DEFAULT_CATEGORY_LIMITS,
        importanceThreshold: Importance.LOW, deduplicate: true,
        mergeRepeatedPolicies: true, summarizeLowPriority: true,
        whitespaceNormalize: true, emergencyMode: false,
      }
    case 'aggressive':
      return {
        level, enabled: true, maxTokensPerCategory: DEFAULT_CATEGORY_LIMITS,
        importanceThreshold: Importance.MEDIUM, deduplicate: true,
        mergeRepeatedPolicies: true, summarizeLowPriority: true,
        whitespaceNormalize: true, emergencyMode: false,
      }
    case 'emergency':
      return {
        level, enabled: true, maxTokensPerCategory: {},
        importanceThreshold: Importance.HIGH, deduplicate: true,
        mergeRepeatedPolicies: true, summarizeLowPriority: true,
        whitespaceNormalize: true, emergencyMode: true,
      }
  }
}
