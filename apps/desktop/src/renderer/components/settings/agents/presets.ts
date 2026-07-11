export type PresetId = "fast" | "balanced" | "thorough" | "custom"

export interface PresetConfig {
  id: PresetId
  name: string
  description: string
  temperature: number
  maxTokens: number
  useCase: string
  icon: string
}

export const PRESETS: PresetConfig[] = [
  {
    id: "fast",
    name: "Fast & Concise",
    description: "Quick responses for simple questions and code snippets",
    temperature: 0.1,
    maxTokens: 2048,
    useCase: "Quick answers, code completions",
    icon: "Zap",
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Default setting — works well for most tasks",
    temperature: 0.3,
    maxTokens: 4096,
    useCase: "General use (default)",
    icon: "Scale",
  },
  {
    id: "thorough",
    name: "Thorough & Creative",
    description: "Takes more time but produces detailed, creative results",
    temperature: 0.7,
    maxTokens: 8192,
    useCase: "Complex reasoning, creative writing",
    icon: "Sparkles",
  },
  {
    id: "custom",
    name: "Custom",
    description: "Configure your own settings",
    temperature: 0.3,
    maxTokens: 4096,
    useCase: "Power users",
    icon: "Settings2",
  },
]

export function detectPreset(config: { temperature: number; maxTokens: number }): PresetId {
  const match = PRESETS.find(
    (p) => p.id !== "custom" && p.temperature === config.temperature && p.maxTokens === config.maxTokens,
  )
  return match?.id ?? "custom"
}

export function presetToConfig(preset: PresetId): { temperature: number; maxTokens: number } {
  const p = PRESETS.find((x) => x.id === preset)
  if (!p || preset === "custom") return { temperature: 0.3, maxTokens: 4096 }
  return { temperature: p.temperature, maxTokens: p.maxTokens }
}
