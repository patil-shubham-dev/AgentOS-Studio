export interface ModelPricing {
  inputPer1K: number
  outputPer1K: number
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4": { inputPer1K: 0.03, outputPer1K: 0.06 },
  "gpt-4-turbo": { inputPer1K: 0.01, outputPer1K: 0.03 },
  "gpt-4o": { inputPer1K: 0.0025, outputPer1K: 0.01 },
  "gpt-4o-mini": { inputPer1K: 0.00015, outputPer1K: 0.0006 },
  "gpt-3.5-turbo": { inputPer1K: 0.001, outputPer1K: 0.002 },
  "claude-3-5-sonnet-20241022": { inputPer1K: 0.003, outputPer1K: 0.015 },
  "claude-3-5-haiku-20241022": { inputPer1K: 0.0008, outputPer1K: 0.004 },
  "claude-3-opus-20240229": { inputPer1K: 0.015, outputPer1K: 0.075 },
  "claude-3-sonnet-20240229": { inputPer1K: 0.003, outputPer1K: 0.015 },
  "claude-3-haiku-20240307": { inputPer1K: 0.00025, outputPer1K: 0.00125 },
  "gemini-1.5-pro": { inputPer1K: 0.00125, outputPer1K: 0.005 },
  "gemini-1.5-flash": { inputPer1K: 0.000075, outputPer1K: 0.0003 },
  "gemini-2.0-flash": { inputPer1K: 0.0001, outputPer1K: 0.0004 },
  "deepseek-chat": { inputPer1K: 0.00014, outputPer1K: 0.00028 },
  "deepseek-coder": { inputPer1K: 0.00014, outputPer1K: 0.00028 },
  "o1-mini": { inputPer1K: 0.0011, outputPer1K: 0.0044 },
  "o1-preview": { inputPer1K: 0.015, outputPer1K: 0.06 },
}

export function getModelPricing(model: string): ModelPricing | null {
  const exact = MODEL_PRICING[model]
  if (exact) return exact
  const lower = model.toLowerCase()
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (lower.startsWith(key)) return pricing
  }
  return null
}

export interface CostEstimate {
  inputTokens: number
  outputTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
  model: string
}

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): CostEstimate {
  const pricing = getModelPricing(model)
  if (!pricing) {
    return {
      inputTokens,
      outputTokens,
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      model,
    }
  }
  const inputCost = (inputTokens / 1000) * pricing.inputPer1K
  const outputCost = (outputTokens / 1000) * pricing.outputPer1K
  return {
    inputTokens,
    outputTokens,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    model,
  }
}

export function formatCost(cost: number): string {
  if (cost < 0.0001) return "$0.0000"
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  if (cost < 1) return `$${cost.toFixed(3)}`
  return `$${cost.toFixed(2)}`
}

export class CostTracker {
  private runs: CostEstimate[] = []

  track(estimate: CostEstimate): void {
    this.runs.push(estimate)
  }

  get totalCost(): number {
    return this.runs.reduce((sum, r) => sum + r.totalCost, 0)
  }

  get totalInputTokens(): number {
    return this.runs.reduce((sum, r) => sum + r.inputTokens, 0)
  }

  get totalOutputTokens(): number {
    return this.runs.reduce((sum, r) => sum + r.outputTokens, 0)
  }

  get totalTokens(): number {
    return this.totalInputTokens + this.totalOutputTokens
  }

  get summary(): string {
    if (this.runs.length === 0) return "No API calls tracked"
    return `${this.runs.length} call(s) | ${this.totalTokens.toLocaleString()} tokens (${this.totalInputTokens.toLocaleString()} in / ${this.totalOutputTokens.toLocaleString()} out) | ${formatCost(this.totalCost)}`
  }

  get allRuns(): readonly CostEstimate[] {
    return this.runs
  }

  clear(): void {
    this.runs = []
  }
}

export const globalCostTracker = new CostTracker()
