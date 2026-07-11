import { useState } from "react"
import { Switch, Label, Badge } from "@agentic-os/ui"
import { useAppStore, type ThinkingConfig, type OutputStyle } from "@/stores/app-store"
import {
  Brain, Sparkles, Eye, EyeOff,
  Clock, Hash, ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"

type VisualMode = "rainbow" | "classic"
type CollapseMode = "auto" | "always_expanded" | "always_collapsed"

const VISUAL_OPTIONS: { value: VisualMode; label: string; desc: string }[] = [
  { value: "rainbow", label: "Rainbow", desc: "Animated gradient border and glow while thinking" },
  { value: "classic", label: "Classic", desc: "Minimal flat styling without animations" },
]

const COLLAPSE_OPTIONS: { value: CollapseMode; label: string; desc: string }[] = [
  { value: "auto", label: "Auto", desc: "Collapse when streaming completes" },
  { value: "always_expanded", label: "Always Expanded", desc: "Always show full reasoning content" },
  { value: "always_collapsed", label: "Always Collapsed", desc: "Collapse by default, expand on click" },
]

const OUTPUT_STYLE_OPTIONS: { value: OutputStyle; label: string; desc: string }[] = [
  { value: "default", label: "Default", desc: "Concise, direct responses with minimal explanation" },
  { value: "explanatory", label: "Explanatory", desc: "Clear explanations with step-by-step reasoning" },
  { value: "learning", label: "Learning", desc: "Teaching-oriented, with principles and alternatives" },
]

export function ThinkingTab() {
  const storeConfig = useAppStore((s) => s.thinkingConfig)
  const setThinkingConfig = useAppStore((s) => s.setThinkingConfig)
  const outputStyle = useAppStore((s) => s.outputStyle)
  const setOutputStyle = useAppStore((s) => s.setOutputStyle)
  const [localConfig, setLocalConfig] = useState<ThinkingConfig>({ ...storeConfig })

  function update(partial: Partial<ThinkingConfig>) {
    const next = { ...localConfig, ...partial }
    setLocalConfig(next)
    setThinkingConfig(next)
  }

  function presetBudget(budget: number) {
    return () => update({ budget })
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-white tracking-tight">Thinking Visualization</h2>
        <p className="text-sm text-white/40">Configure how agent thinking/reasoning is displayed</p>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Visualization",
            value: localConfig.visualizationMode === "rainbow" ? "Rainbow" : "Classic",
            icon: localConfig.visualizationMode === "rainbow" ? Sparkles : Eye,
            color: localConfig.visualizationMode === "rainbow" ? "text-purple-400" : "text-white/30",
          },
          {
            label: "Collapse",
            value: COLLAPSE_OPTIONS.find((o) => o.value === localConfig.collapseBehavior)?.label ?? "Auto",
            icon: EyeOff,
            color: "text-blue-400",
          },
          {
            label: "Token Count",
            value: localConfig.showTokenCount ? "Visible" : "Hidden",
            icon: Hash,
            color: localConfig.showTokenCount ? "text-emerald-400" : "text-white/30",
          },
          {
            label: "Thinking Budget",
            value: localConfig.budget === 0 ? "Default" : `${localConfig.budget}`,
            icon: Clock,
            color: "text-amber-400",
          },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-white">{stat.value}</span>
                <Icon className={cn("h-5 w-5 opacity-60", stat.color)} />
              </div>
              <p className="text-xs text-white/40 mt-1">{stat.label}</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Visualization style */}
          <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl">
            <h3 className="text-sm font-medium text-white/80 mb-1 flex items-center gap-2">
              <Eye className="h-4 w-4 text-purple-400" />
              Visualization Style
            </h3>
            <p className="text-[10px] text-white/30 mb-4">How reasoning blocks are animated and styled</p>
            <div className="space-y-2">
              {VISUAL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update({ visualizationMode: opt.value })}
                  className={cn(
                    "flex items-center gap-3 w-full rounded-xl border px-4 py-3 text-left transition-all",
                    localConfig.visualizationMode === opt.value
                      ? "border-purple-500/30 bg-purple-500/10"
                      : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]",
                  )}
                >
                  <div className={cn(
                    "h-4 w-4 rounded-full border-2 flex items-center justify-center",
                    localConfig.visualizationMode === opt.value
                      ? "border-purple-400"
                      : "border-white/20",
                  )}>
                    {localConfig.visualizationMode === opt.value && (
                      <div className="h-2 w-2 rounded-full bg-purple-400" />
                    )}
                  </div>
                  <div>
                    <span className={cn(
                      "text-xs font-medium",
                      localConfig.visualizationMode === opt.value ? "text-white" : "text-white/60",
                    )}>
                      {opt.label}
                    </span>
                    <p className="text-[10px] text-white/30 mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Collapse behavior */}
          <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl">
            <h3 className="text-sm font-medium text-white/80 mb-1 flex items-center gap-2">
              <ChevronDown className="h-4 w-4 text-blue-400" />
              Collapse Behavior
            </h3>
            <p className="text-[10px] text-white/30 mb-4">When reasoning blocks should be collapsed</p>
            <div className="space-y-2">
              {COLLAPSE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update({ collapseBehavior: opt.value })}
                  className={cn(
                    "flex items-center gap-3 w-full rounded-xl border px-4 py-3 text-left transition-all",
                    localConfig.collapseBehavior === opt.value
                      ? "border-blue-500/30 bg-blue-500/10"
                      : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]",
                  )}
                >
                  <div className={cn(
                    "h-4 w-4 rounded-full border-2 flex items-center justify-center",
                    localConfig.collapseBehavior === opt.value
                      ? "border-blue-400"
                      : "border-white/20",
                  )}>
                    {localConfig.collapseBehavior === opt.value && (
                      <div className="h-2 w-2 rounded-full bg-blue-400" />
                    )}
                  </div>
                  <div>
                    <span className={cn(
                      "text-xs font-medium",
                      localConfig.collapseBehavior === opt.value ? "text-white" : "text-white/60",
                    )}>
                      {opt.label}
                    </span>
                    <p className="text-[10px] text-white/30 mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Display options */}
          <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl">
            <h3 className="text-sm font-medium text-white/80 mb-4 flex items-center gap-2">
              <Eye className="h-4 w-4 text-emerald-400" />
              Display Options
            </h3>
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className={cn("h-4 w-4", localConfig.showTokenCount ? "text-emerald-400" : "text-white/30")} />
                  <div>
                    <span className="text-xs text-white/60">Show Token Count</span>
                    <p className="text-[10px] text-white/30">Display reasoning token count in header</p>
                  </div>
                </div>
                <Switch checked={localConfig.showTokenCount} onCheckedChange={(v) => update({ showTokenCount: v })} size="default" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className={cn("h-4 w-4", localConfig.showElapsedTime ? "text-emerald-400" : "text-white/30")} />
                  <div>
                    <span className="text-xs text-white/60">Show Elapsed Time</span>
                    <p className="text-[10px] text-white/30">Display elapsed time while thinking</p>
                  </div>
                </div>
                <Switch checked={localConfig.showElapsedTime} onCheckedChange={(v) => update({ showElapsedTime: v })} size="default" />
              </div>
            </div>
          </div>

          {/* Output style */}
          <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl">
            <h3 className="text-sm font-medium text-white/80 mb-1 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              Output Style
            </h3>
            <p className="text-[10px] text-white/30 mb-4">Controls how the agent phrases its responses</p>
            <div className="space-y-2">
              {OUTPUT_STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setOutputStyle(opt.value)}
                  className={cn(
                    "flex items-center gap-3 w-full rounded-xl border px-4 py-3 text-left transition-all",
                    outputStyle === opt.value
                      ? "border-amber-500/30 bg-amber-500/10"
                      : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]",
                  )}
                >
                  <div className={cn(
                    "h-4 w-4 rounded-full border-2 flex items-center justify-center",
                    outputStyle === opt.value
                      ? "border-amber-400"
                      : "border-white/20",
                  )}>
                    {outputStyle === opt.value && (
                      <div className="h-2 w-2 rounded-full bg-amber-400" />
                    )}
                  </div>
                  <div>
                    <span className={cn(
                      "text-xs font-medium",
                      outputStyle === opt.value ? "text-white" : "text-white/60",
                    )}>
                      {opt.label}
                    </span>
                    <p className="text-[10px] text-white/30 mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Thinking budget */}
          <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl">
            <h3 className="text-sm font-medium text-white/80 mb-1 flex items-center gap-2">
              <Brain className="h-4 w-4 text-amber-400" />
              Thinking Budget
            </h3>
            <p className="text-[10px] text-white/30 mb-4">Maximum reasoning tokens (0 = provider default)</p>
            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max="32768"
                step="1024"
                value={localConfig.budget}
                onChange={(e) => update({ budget: parseInt(e.target.value) })}
                className="w-full accent-amber-500 h-1"
              />
              <div className="flex justify-between text-[10px] text-white/20">
                <span>Default</span>
                <span className="font-mono text-white/40">
                  {localConfig.budget === 0 ? "Default" : `${localConfig.budget.toLocaleString()}`}
                </span>
                <span>32K</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/5">
              {[
                { label: "Default", value: 0 },
                { label: "2K", value: 2048 },
                { label: "4K", value: 4096 },
                { label: "8K", value: 8192 },
                { label: "16K", value: 16384 },
                { label: "32K", value: 32768 },
              ].map((preset) => (
                <button
                  key={preset.value}
                  onClick={presetBudget(preset.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-full border text-[10px] font-mono transition-all",
                    localConfig.budget === preset.value
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-400"
                      : "border-white/5 text-white/30 hover:border-white/10 hover:text-white/50",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
