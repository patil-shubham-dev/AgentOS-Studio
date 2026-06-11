import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { Label, Badge } from "@agentic-os/ui"
import { Zap, Scale, Sparkles, Settings2, ChevronDown, Thermometer, Maximize2 } from "lucide-react"
import { PRESETS, detectPreset, presetToConfig, type PresetId } from "./presets"

const PRESET_ICONS: Record<string, typeof Zap> = {
  Zap, Scale, Sparkles, Settings2,
}

interface AgentConfiguratorProps {
  temperature: number
  maxTokens: number
  providerId?: string
  model?: string
  fallbackModel?: string
  providers: { id: string; name: string }[]
  models: { id: string; name: string; provider: string }[]
  onApply: (updates: { temperature: number; maxTokens: number; providerId?: string; model?: string; fallbackModel?: string }) => void
  onCancel: () => void
}

export function AgentConfigurator({
  temperature,
  maxTokens,
  providerId,
  model,
  fallbackModel,
  providers,
  models,
  onApply,
  onCancel,
}: AgentConfiguratorProps) {
  const initialPreset = useMemo(() => detectPreset({ temperature, maxTokens }), [temperature, maxTokens])
  const [selectedPreset, setSelectedPreset] = useState<PresetId>(initialPreset)
  const [showSelector, setShowSelector] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Local draft values for custom/advanced mode
  const [draftTemp, setDraftTemp] = useState(temperature)
  const [draftTokens, setDraftTokens] = useState(maxTokens)
  const [draftProvider, setDraftProvider] = useState(providerId ?? "")
  const [draftModel, setDraftModel] = useState(model ?? "")
  const [draftFallback, setDraftFallback] = useState(fallbackModel ?? "")

  const preset = PRESETS.find((p) => p.id === selectedPreset) ?? PRESETS[1]
  const PresetIcon = PRESET_ICONS[preset.icon as keyof typeof PRESET_ICONS] ?? Settings2

  function handlePresetSelect(id: PresetId) {
    setSelectedPreset(id)
    if (id !== "custom") {
      const cfg = presetToConfig(id)
      setDraftTemp(cfg.temperature)
      setDraftTokens(cfg.maxTokens)
    }
  }

  function handleApply() {
    if (selectedPreset === "custom") {
      onApply({
        temperature: draftTemp,
        maxTokens: draftTokens,
        providerId: draftProvider || undefined,
        model: draftModel || undefined,
        fallbackModel: draftFallback || undefined,
      })
    } else {
      const cfg = presetToConfig(selectedPreset)
      onApply({
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
        providerId: providerId,
        model: model,
        fallbackModel: fallbackModel,
      })
    }
  }

  const modelOptions = models.filter((m) => !draftProvider || m.provider === providers.find((p) => p.id === draftProvider)?.name)

  return (
    <div className="space-y-4">
      {/* Current preset badge + Change button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PresetIcon className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium text-white">{preset.name}</span>
          <Badge variant="info" size="sm">{preset.description}</Badge>
        </div>
        <button
          onClick={() => setShowSelector(!showSelector)}
          className="text-[11px] text-blue-400/60 hover:text-blue-400 transition-colors"
        >
          {showSelector ? "Cancel" : "Change Preset"}
        </button>
      </div>

      {/* Preset selector */}
      <AnimatePresence>
        {showSelector && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="overflow-hidden"
          >
            <div className="space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
              {PRESETS.map((p) => {
                const Icon = PRESET_ICONS[p.icon as keyof typeof PRESET_ICONS] ?? Settings2
                const isSelected = selectedPreset === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => handlePresetSelect(p.id)}
                    className={cn(
                      "flex items-start gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-all",
                      isSelected
                        ? "bg-blue-500/10 border border-blue-500/20"
                        : "hover:bg-white/[0.03] border border-transparent",
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-center h-8 w-8 rounded-lg shrink-0",
                      isSelected ? "bg-blue-500/20 text-blue-400" : "bg-white/[0.04] text-white/40",
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-xs font-medium", isSelected ? "text-blue-300" : "text-white/70")}>{p.name}</span>
                        {p.id === "balanced" && <Badge variant="info" size="sm">Recommended</Badge>}
                      </div>
                      <p className="text-[10px] text-white/40 mt-0.5">{p.description}</p>
                      <p className="text-[9px] text-white/20 mt-0.5">{p.useCase}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom settings (only shown for custom preset) */}
      <AnimatePresence>
        {selectedPreset === "custom" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="overflow-hidden space-y-4"
          >
            {/* Response style: Concise ↔ Creative (temperature) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Response style</Label>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-white/30 w-14 text-right">Concise</span>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={draftTemp}
                  onChange={(e) => setDraftTemp(parseFloat(e.target.value))}
                  className="flex-1 accent-blue-500 h-1"
                />
                <span className="text-[10px] text-white/30 w-14">Creative</span>
              </div>
              <p className="text-[9px] text-white/20 text-center">{draftTemp < 0.3 ? "More deterministic and focused" : draftTemp < 0.6 ? "Balanced responses" : "More varied and creative"}</p>
            </div>

            {/* Response length: Short ↔ Long (max tokens) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Response length</Label>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-white/30 w-14 text-right">Short</span>
                <input
                  type="range" min="1024" max="16384" step="1024"
                  value={draftTokens}
                  onChange={(e) => setDraftTokens(parseInt(e.target.value))}
                  className="flex-1 accent-blue-500 h-1"
                />
                <span className="text-[10px] text-white/30 w-14">Long</span>
              </div>
              <p className="text-[9px] text-white/20 text-center">Max {(draftTokens / 1024).toFixed(0)}K tokens per response</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Advanced toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/60 transition-colors"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", showAdvanced && "rotate-180")} />
        {showAdvanced ? "Hide Advanced Settings" : "Show Advanced Settings"}
      </button>

      {/* Advanced settings */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="overflow-hidden space-y-3"
          >
            {/* Provider */}
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Provider</Label>
              <select
                value={draftProvider}
                onChange={(e) => setDraftProvider(e.target.value)}
                className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-xs text-white outline-none focus:border-white/20"
              >
                <option value="" className="bg-black">Auto (default)</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id} className="bg-black">{p.name}</option>
                ))}
              </select>
            </div>

            {/* Model */}
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Model</Label>
              <select
                value={draftModel}
                onChange={(e) => setDraftModel(e.target.value)}
                className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-xs text-white outline-none focus:border-white/20"
              >
                <option value="" className="bg-black">Auto (default)</option>
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id} className="bg-black">{m.name}</option>
                ))}
              </select>
            </div>

            {/* Fallback Model */}
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Fallback Model (optional)</Label>
              <select
                value={draftFallback}
                onChange={(e) => setDraftFallback(e.target.value)}
                className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-xs text-white outline-none focus:border-white/20"
              >
                <option value="" className="bg-black">None</option>
                {modelOptions.filter((m) => m.id !== draftModel).map((m) => (
                  <option key={m.id} value={m.id} className="bg-black">{m.name}</option>
                ))}
              </select>
            </div>

            {/* Raw temperature (numeric) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Temperature</Label>
              <div className="flex items-center gap-2">
                <Thermometer className="h-3.5 w-3.5 text-white/30" />
                <input
                  type="range" min="0" max="2" step="0.1"
                  value={draftTemp}
                  onChange={(e) => setDraftTemp(parseFloat(e.target.value))}
                  className="flex-1 accent-blue-500 h-1"
                />
                <span className="text-xs font-mono text-white/60 w-8 text-right">{draftTemp.toFixed(1)}</span>
              </div>
            </div>

            {/* Raw max tokens (numeric) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-white/60">Max Tokens</Label>
              <div className="flex items-center gap-2">
                <Maximize2 className="h-3.5 w-3.5 text-white/30" />
                <input
                  type="range" min="1024" max="65536" step="1024"
                  value={draftTokens}
                  onChange={(e) => setDraftTokens(parseInt(e.target.value))}
                  className="flex-1 accent-blue-500 h-1"
                />
                <span className="text-xs font-mono text-white/60 w-16 text-right">{(draftTokens / 1024).toFixed(0)}K</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Apply/Cancel */}
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={handleApply}
          className="rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors"
        >
          Apply
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-white/10 hover:bg-white/[0.04] px-3 py-1.5 text-xs text-white/50 hover:text-white/70 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
