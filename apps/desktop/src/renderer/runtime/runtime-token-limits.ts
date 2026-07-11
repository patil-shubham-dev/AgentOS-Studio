export interface RoleTokenLimits {
  maxInput: number
  maxOutput: number
}

export const TOKEN_CONFIG: Record<string, RoleTokenLimits> = {
  manager: { maxInput: 64000, maxOutput: 4096 },
  coder: { maxInput: 128000, maxOutput: 16000 },
  design: { maxInput: 64000, maxOutput: 12000 },
  research: { maxInput: 64000, maxOutput: 8000 },
  vision: { maxInput: 32000, maxOutput: 8000 },
  runtime: { maxInput: 32000, maxOutput: 8000 },
  qa: { maxInput: 64000, maxOutput: 8000 },
  browser: { maxInput: 32000, maxOutput: 8000 },
  "fast-inference": { maxInput: 16000, maxOutput: 2048 },
  memory: { maxInput: 64000, maxOutput: 8000 },
}
