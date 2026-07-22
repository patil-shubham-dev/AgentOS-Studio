import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores/app-store"
import { setCompletionSettings, getCompletionSettings } from "@/lib/completion/completion-ai"
import { updateCompletionConfig } from "@/runtime/completion/CompletionProvider"
import { Badge, Button, TooltipSimple as Tooltip } from "@agentic-os/ui"
import { Zap, Cpu, Brain, Save, RotateCcw, AlertTriangle } from "lucide-react"

export function CompletionSettings() {
  const providers = useAppStore((s) => s.providers) ?? []

  const initial = useMemo(() => getCompletionSettings(), [])
  const [enabled, setEnabled] = useState(initial.enabled)
  const [useFIM, setUseFIM] = useState(initial.useFIM)
  const [providerId, setProviderId] = useState(initial.providerId ?? "")
  const [model, setModel] = useState(initial.model)
  const [debounceMs, setDebounceMs] = useState(initial.debounceMs)
  const [maxTokens, setMaxTokens] = useState(initial.maxTokens)
  const [saved, setSaved] = useState(false)

  const providerModels = useMemo(() => {
    if (!providerId) return []
    const p = providers.find((pr) => pr.id === providerId)
    return p?.models ?? []
  }, [providerId, providers])

  function handleSave() {
    setCompletionSettings({
      enabled,
      useFIM: useFIM && enabled,
      providerId: providerId || null,
      model,
      debounceMs,
      maxTokens,
      temperature: 0.1,
    })
    // Sync with the FIM completion provider
    updateCompletionConfig({
      enabled: enabled && useFIM,
      providerType: providerId ? "dedicated" : "agent-fallback",
      fimConfig: providerId ? {
        type: "openai-compatible",
        baseUrl: providers.find(p => p.id === providerId)?.baseUrl ?? "",
        apiKey: providers.find(p => p.id === providerId)?.apiKey ?? "",
        model: model || "deepseek-coder-1.3b-instruct",
      } : null,
      debounceMs,
      maxLines: Math.round(maxTokens / 30),
      useCache: true,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleReset() {
    setEnabled(true)
    setUseFIM(true)
    setProviderId("")
    setModel("")
    setDebounceMs(300)
    setMaxTokens(64)
    updateCompletionConfig({
      enabled: true,
      providerType: "agent-fallback",
      fimConfig: null,
      debounceMs: 300,
      maxLines: 5,
      useCache: true,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 p-2 shrink-0">
          <Zap className="h-4 w-4 text-cyan-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">Inline Completions</h3>
          <p className="text-xs text-white/40 mt-0.5">
            Ghost text completions as you type in the editor. Uses a dedicated model for low-latency completions.
          </p>
        </div>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
        <div>
          <span className="text-xs font-medium text-white">Enable inline completions</span>
          <p className="text-[10px] text-white/30 mt-0.5">Show ghost text suggestions while typing</p>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          className={cn(
            "relative h-5 w-9 rounded-full transition-all",
            enabled ? "bg-blue-500" : "bg-white/10",
          )}
        >
          <span className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
            enabled ? "left-4" : "left-0.5",
          )} />
        </button>
      </div>

      {/* Provider selection */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/70">Completion Provider</label>
        <div className="flex items-center gap-2">
          <select
            value={providerId}
            onChange={(e) => { setProviderId(e.target.value); setModel("") }}
            disabled={!enabled}
            className="flex-1 h-9 rounded-lg border border-white/5 bg-white/[0.03] px-3 text-xs text-white outline-none focus:border-white/10 transition-all disabled:opacity-30"
          >
            <option value="">Use agent provider (fallback)</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Model selection */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/70">Model</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="e.g. deepseek-coder-1.3b-instruct"
          disabled={!enabled}
          className="w-full h-9 rounded-lg border border-white/5 bg-white/[0.03] px-3 text-xs text-white outline-none placeholder:text-white/20 focus:border-white/10 transition-all disabled:opacity-30"
        />
        {providerModels.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {providerModels.slice(0, 8).map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[9px] transition-all",
                  model === m.id
                    ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400"
                    : "border-white/5 text-white/30 hover:text-white/50",
                )}
              >
                {m.name ?? m.id}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* FIM toggle */}
      <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white">Fill-in-the-Middle (FIM)</span>
            <Badge variant="info" size="sm">Fast</Badge>
          </div>
          <p className="text-[10px] text-white/30 mt-0.5">
            Use FIM format for models like DeepSeek Coder, CodeLlama, StarCoder
          </p>
        </div>
        <button
          onClick={() => setUseFIM(!useFIM)}
          disabled={!enabled}
          className={cn(
            "relative h-5 w-9 rounded-full transition-all",
            useFIM ? "bg-blue-500" : "bg-white/10",
            !enabled && "opacity-30",
          )}
        >
          <span className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
            useFIM ? "left-4" : "left-0.5",
          )} />
        </button>
      </div>

      {/* Debounce slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-white/70">Debounce (ms)</label>
          <span className="text-[10px] text-white/30">{debounceMs}ms</span>
        </div>
        <input
          type="range"
          min={100}
          max={1000}
          step={50}
          value={debounceMs}
          onChange={(e) => setDebounceMs(Number(e.target.value))}
          disabled={!enabled}
          className="w-full h-1.5 appearance-none bg-white/10 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:cursor-pointer disabled:opacity-30"
        />
        <div className="flex justify-between text-[9px] text-white/20">
          <span>100ms (aggressive)</span>
          <span>1000ms (conservative)</span>
        </div>
      </div>

      {/* Max tokens slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-white/70">Max completion tokens</label>
          <span className="text-[10px] text-white/30">{maxTokens}</span>
        </div>
        <input
          type="range"
          min={16}
          max={256}
          step={16}
          value={maxTokens}
          onChange={(e) => setMaxTokens(Number(e.target.value))}
          disabled={!enabled}
          className="w-full h-1.5 appearance-none bg-white/10 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:cursor-pointer disabled:opacity-30"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button
          size="sm"
          className="h-8 text-xs bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white border-0"
          onClick={handleSave}
          disabled={!enabled && saved}
        >
          {saved ? (
            <><Save className="h-3 w-3 mr-1" /> Saved</>
          ) : (
            <><Save className="h-3 w-3 mr-1" /> Save</>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs border-white/10"
          onClick={handleReset}
        >
          <RotateCcw className="h-3 w-3 mr-1" /> Reset
        </Button>
      </div>

      {/* Info */}
      <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 px-3 py-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-300/70">
            Without a dedicated completion model, inline completions use the agent's provider which may have higher latency (1-5s).
            For sub-300ms completions, configure a fast FIM-compatible model like DeepSeek Coder.
          </p>
        </div>
      </div>
    </div>
  )
}
