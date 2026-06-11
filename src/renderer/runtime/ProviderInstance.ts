export type ProviderType = "openai" | "anthropic" | "openrouter" | "nvidia" | "ollama"

export interface ProviderInstance {
  instanceId: string
  providerType: ProviderType
  displayName: string
  model: string
  capabilities: ModelCapabilities
  isConnected: boolean
  lastHealthCheck: number
  latencyMs: number
}

export interface ModelCapabilities {
  supportsTools: boolean
  supportsVision: boolean
  supportsStreaming: boolean
  supportsReasoning: boolean
  maxContext: number
  maxOutput: number
}

export type RuntimeRole =
  | "manager"
  | "coder"
  | "vision"
  | "research"
  | "runtime"
  | "design"
  | "qa"
  | "browser"
  | "memory"
  | "fast-inference"

export const ROLE_CAPABILITY_REQUIREMENTS: Partial<Record<RuntimeRole, Partial<ModelCapabilities>>> = {
  manager: { supportsTools: true, supportsStreaming: true, maxContext: 32000 },
  coder: { supportsTools: true, supportsStreaming: true, maxContext: 32000 },
  vision: { supportsVision: true, supportsStreaming: true },
  research: { supportsStreaming: true, maxContext: 64000 },
  runtime: { supportsTools: true, supportsStreaming: true, maxContext: 16000 },
  design: { supportsStreaming: true, maxContext: 32000 },
  qa: { maxContext: 64000 },
  browser: { supportsTools: true, supportsStreaming: true },
  memory: { supportsStreaming: true, maxContext: 16000 },
  "fast-inference": { supportsStreaming: true, maxContext: 8192 },
}

export const ROLE_DISPLAY_NAMES: Record<RuntimeRole, string> = {
  manager: "Manager",
  coder: "Coder",
  vision: "Vision",
  research: "Research",
  runtime: "Runtime",
  design: "Design",
  qa: "QA / Testing",
  browser: "Browser",
  memory: "Memory",
  "fast-inference": "Fast Inference",
}

export interface RoleAssignment {
  role: RuntimeRole
  providerInstanceId: string
  providerType: ProviderType
  model: string
  displayName: string
  capabilities: ModelCapabilities
  isValid: boolean
  validationErrors: string[]
}

export function generateInstanceId(): string {
  return `prov_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function createProviderInstance(
  providerType: ProviderType,
  displayName: string,
  model: string,
  capabilities?: Partial<ModelCapabilities>,
): ProviderInstance {
  return {
    instanceId: generateInstanceId(),
    providerType,
    displayName,
    model,
    capabilities: {
      supportsTools: capabilities?.supportsTools ?? true,
      supportsVision: capabilities?.supportsVision ?? false,
      supportsStreaming: capabilities?.supportsStreaming ?? true,
      supportsReasoning: capabilities?.supportsReasoning ?? false,
      maxContext: capabilities?.maxContext ?? 8192,
      maxOutput: capabilities?.maxOutput ?? 4096,
    },
    isConnected: true,
    lastHealthCheck: Date.now(),
    latencyMs: 0,
  }
}

export function validateRoleCapabilities(
  role: RuntimeRole,
  capabilities: ModelCapabilities,
): { valid: boolean; errors: string[] } {
  const required = ROLE_CAPABILITY_REQUIREMENTS[role]
  const errors: string[] = []

  if (!required) {
    errors.push(`Role "${role}" has no capability requirements defined`)
    return { valid: false, errors }
  }

  if (required.supportsTools && !capabilities.supportsTools) {
    errors.push(`Role "${ROLE_DISPLAY_NAMES[role]}" requires tool support`)
  }
  if (required.supportsVision && !capabilities.supportsVision) {
    errors.push(`Role "${ROLE_DISPLAY_NAMES[role]}" requires vision support`)
  }
  if (required.supportsStreaming && !capabilities.supportsStreaming) {
    errors.push(`Role "${ROLE_DISPLAY_NAMES[role]}" requires streaming support`)
  }
  if ((required.maxContext ?? 0) > capabilities.maxContext) {
    errors.push(`Role "${ROLE_DISPLAY_NAMES[role]}" requires ${required.maxContext} context (got ${capabilities.maxContext})`)
  }

  return { valid: errors.length === 0, errors }
}

export function createRoleAssignment(
  role: RuntimeRole,
  instance: ProviderInstance,
): RoleAssignment {
  const validation = validateRoleCapabilities(role, instance.capabilities)
  return {
    role,
    providerInstanceId: instance.instanceId,
    providerType: instance.providerType,
    model: instance.model,
    displayName: instance.displayName,
    capabilities: instance.capabilities,
    isValid: validation.valid,
    validationErrors: validation.errors,
  }
}
