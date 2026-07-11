import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

interface Preset {
  id: string
  name: string
  baseUrl: string
  isCustom?: boolean
}

const PRESETS: Preset[] = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com" },
  { id: "gemini", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "nvidia", name: "Nvidia NIM", baseUrl: "https://integrate.api.nvidia.com/v1" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  { id: "together", name: "Together AI", baseUrl: "https://api.together.xyz/v1" },
  { id: "azure", name: "Azure OpenAI", baseUrl: "https://YOUR_RESOURCE.openai.azure.com" },
  { id: "ollama", name: "Ollama", baseUrl: "http://localhost:11434/v1" },
  { id: "custom", name: "Custom Provider", baseUrl: "", isCustom: true },
]

const CUSTOM_OPTIONS: Preset[] = [
  { id: "custom-openai", name: "OpenAI-Compatible", baseUrl: "", isCustom: true },
  { id: "custom-vllm", name: "vLLM", baseUrl: "http://localhost:8000/v1", isCustom: true },
  { id: "custom-lmstudio", name: "LM Studio", baseUrl: "http://localhost:1234/v1", isCustom: true },
  { id: "custom-localai", name: "LocalAI", baseUrl: "http://localhost:8080/v1", isCustom: true },
  { id: "custom-litellm", name: "LiteLLM (self-hosted)", baseUrl: "http://localhost:4000", isCustom: true },
  { id: "custom-endpoint", name: "Custom Endpoint", baseUrl: "", isCustom: true },
]

interface PresetGridProps {
  onSelect: (preset: Preset) => void
  selectedId: string | null
}

export function PresetGrid({ onSelect, selectedId }: PresetGridProps) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    if (!query) return { presets: PRESETS, custom: CUSTOM_OPTIONS }
    const q = query.toLowerCase()
    const all = [...PRESETS, ...CUSTOM_OPTIONS]
    const matches = all.filter((p) => p.name.toLowerCase().includes(q) || p.baseUrl.toLowerCase().includes(q))
    return {
      presets: matches.filter((p) => !p.isCustom),
      custom: matches.filter((p) => p.isCustom),
    }
  }, [query])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search providers..."
          className="w-full h-9 rounded-lg border border-white/10 bg-white/[0.03] pl-9 pr-3 text-xs text-white outline-none placeholder:text-white/20 focus:border-white/20 transition-all"
          autoFocus
        />
      </div>

      <div className="space-y-1">
        <p className="text-[9px] text-white/30 font-medium uppercase tracking-wider px-1">Popular</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {filtered.presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onSelect(preset)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-all min-h-[60px]",
                selectedId === preset.id
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
                  : "border-white/5 bg-white/[0.02] text-white/60 hover:border-white/10 hover:bg-white/[0.04] hover:text-white/80",
              )}
            >
              <span className="text-[10px] font-semibold leading-tight">{preset.name}</span>
              {preset.baseUrl && (
                <span className="text-[7px] text-white/20 font-mono truncate w-full max-w-full">{preset.baseUrl}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-[9px] text-white/30 font-medium uppercase tracking-wider px-1">Custom / Self-Hosted</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {filtered.custom.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onSelect(preset)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all min-h-[48px]",
                selectedId === preset.id
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
                  : "border-white/5 bg-white/[0.02] text-white/60 hover:border-white/10 hover:bg-white/[0.04] hover:text-white/80",
              )}
            >
              <div className="flex items-center justify-center h-6 w-6 rounded-lg border border-white/5 bg-white/[0.03] shrink-0">
                <span className="text-[9px] font-bold text-white/40">C</span>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium truncate">{preset.name}</p>
                {preset.baseUrl && <p className="text-[8px] text-white/20 font-mono truncate">{preset.baseUrl}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export type { Preset }
