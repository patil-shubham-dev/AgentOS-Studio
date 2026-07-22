import { useState, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Cpu, KeyRound, Sparkles, Check, ChevronRight, ArrowLeft,
  Loader2, Shield, Brain, Rocket, Star, Server, Globe,
  CheckCircle2, X, Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores/settings/app-store"

const PROVIDER_TEMPLATES = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-4o-mini, o3, o4-mini",
    icon: Sparkles,
    color: "from-emerald-500/20 to-teal-500/10",
    accent: "text-emerald-400",
    models: ["gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
    defaultModel: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude Sonnet, Claude Haiku",
    icon: Brain,
    color: "from-orange-500/20 to-amber-500/10",
    accent: "text-orange-400",
    models: ["claude-sonnet-4-20250514", "claude-haiku-3-5-20250101"],
    defaultModel: "claude-sonnet-4-20250514",
    baseUrl: "https://api.anthropic.com",
  },
  {
    id: "google",
    name: "Google",
    description: "Gemini 2.5 Pro, Gemini 2.5 Flash",
    icon: Globe,
    color: "from-blue-500/20 to-indigo-500/10",
    accent: "text-blue-400",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    defaultModel: "gemini-2.5-pro",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "100+ models, unified API",
    icon: Server,
    color: "from-purple-500/20 to-pink-500/10",
    accent: "text-purple-400",
    models: [],
    defaultModel: "",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  {
    id: "custom",
    name: "Custom Endpoint",
    description: "Any OpenAI-compatible API",
    icon: Cpu,
    color: "from-white/10 to-white/5",
    accent: "text-white/60",
    models: [],
    defaultModel: "",
    baseUrl: "",
  },
]

const ANIM_SPRING = { type: "spring" as const, stiffness: 400, damping: 28 }
const ANIM_STAGGER = 0.05

interface QuickStartWizardProps {
  open: boolean
  onComplete: () => void
  onDismiss: () => void
}

export function QuickStartWizard({ open, onComplete, onDismiss }: QuickStartWizardProps) {
  const addProvider = useAppStore((s) => s.addProvider)
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<typeof PROVIDER_TEMPLATES[0] | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [model, setModel] = useState("")
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setStep(0); setSelected(null); setApiKey(""); setBaseUrl(""); setModel(""); setDone(false)
    }
  }, [open])

  useEffect(() => {
    if (open && step === 1) setTimeout(() => inputRef.current?.focus(), 200)
  }, [open, step])

  const handleSelect = useCallback((p: typeof PROVIDER_TEMPLATES[0]) => {
    setSelected(p)
    setModel(p.defaultModel)
    setBaseUrl(p.baseUrl)
    setStep(1)
  }, [])

  const handleBack = useCallback(() => {
    if (step === 1) { setSelected(null); setStep(0); setApiKey(""); setBaseUrl(""); setModel("") }
    else if (step === 2) setStep(1)
  }, [step])

  const handleNextToModel = useCallback(() => {
    if (!apiKey.trim()) return
    if (selected && selected.models.length > 0 && !model) { setModel(selected.defaultModel) }
    setStep(2)
  }, [apiKey, selected, model])

  const handleFinish = useCallback(async () => {
    if (!selected || !apiKey.trim()) return
    setSaving(true)
    try {
      addProvider({
        id: selected.id,
        name: selected.name,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl || selected.baseUrl,
        models: selected.models.length > 0
          ? selected.models.map((m) => ({ id: m, name: m, active: m === (model || selected.defaultModel) }))
          : [{ id: model || "custom-model", name: model || "Custom Model", active: true }],
        enabled: true,
      })
      setDone(true)
      setTimeout(() => { onComplete(); setSaving(false) }, 800)
    } catch { setSaving(false) }
  }, [selected, apiKey, baseUrl, model, addProvider, onComplete])

  if (!open) return null

  const totalSteps = 3

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93, y: 20 }}
        transition={ANIM_SPRING}
        className="relative w-full max-w-lg mx-4"
      >
        <div className="rounded-2xl border border-white/[0.08] overflow-hidden"
          style={{
            backgroundColor: "var(--surface-panel)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
          }}
        >
          {/* Header */}
          <div className="relative px-6 pt-6 pb-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/[0.06]">
                  <Rocket className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white/90">Quick Start</h2>
                  <p className="text-[10px] text-white/40">Configure your AI provider</p>
                </div>
              </div>
              {!done && (
                <button onClick={onDismiss} className="rounded-lg p-1.5 text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-1.5 mb-2">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div key={i} className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: i <= step ? "var(--color-accent-brand)" : "rgba(255,255,255,0.06)",
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: i <= step ? "100%" : 0 }}
                    transition={{ duration: 0.3, ease: "easeOut", delay: i * 0.05 }}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono text-white/30">
                Step {step + 1} of {totalSteps}
              </span>
              <span className="text-[9px] text-white/20 font-mono">
                {["Choose Provider", "API Key", "Pick Model"][step]}
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-4 min-h-[240px]">
            <AnimatePresence mode="wait">
              {done ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-8 gap-3"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
                  >
                    <div className="flex items-center justify-center h-14 w-14 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="text-center"
                  >
                    <p className="text-sm font-semibold text-white/80">Provider configured!</p>
                    <p className="text-[10px] text-white/40 mt-1">You're all set to start coding.</p>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="mt-2"
                  >
                    <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                  </motion.div>
                </motion.div>
              ) : step === 0 ? (
                <motion.div
                  key="step0"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={ANIM_SPRING}
                  className="space-y-1.5"
                >
                  <p className="text-[10px] text-white/40 mb-3">Choose an AI provider to power your coding sessions</p>
                  {PROVIDER_TEMPLATES.map((p, i) => {
                    const Icon = p.icon
                    return (
                      <motion.button
                        key={p.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * ANIM_STAGGER, ...ANIM_SPRING }}
                        whileHover={{ scale: 1.01, x: 2 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => handleSelect(p)}
                        className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] p-3 text-left transition-all hover:border-white/[0.12] hover:bg-white/[0.02]"
                        style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                      >
                        <div className={cn(
                          "flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-br shrink-0 border border-white/[0.04]",
                          p.color,
                        )}>
                          <Icon className={cn("h-4 w-4", p.accent)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-white/70">{p.name}</p>
                          <p className="text-[9px] text-white/35 truncate">{p.description}</p>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-white/20 shrink-0" />
                      </motion.button>
                    )
                  })}
                </motion.div>
              ) : step === 1 ? (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={ANIM_SPRING}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn("flex items-center justify-center h-6 w-6 rounded-lg bg-gradient-to-br", selected?.color)}>
                      {selected && <selected.icon className={cn("h-3 w-3", selected.accent)} />}
                    </div>
                    <span className="text-[11px] font-medium text-white/60">{selected?.name}</span>
                    {selected?.id === "custom" && (
                      <input
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="https://api.example.com/v1"
                        className="flex-1 bg-transparent text-[10px] text-white/50 placeholder:text-white/20 outline-none border-b border-white/[0.06] focus:border-white/20 px-1 py-0.5"
                      />
                    )}
                  </div>

                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
                    <input
                      ref={inputRef}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleNextToModel() }}
                      type="password"
                      placeholder={selected?.id === "openai" ? "sk-..." : selected?.id === "anthropic" ? "sk-ant-..." : "Enter your API key"}
                      className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl pl-9 pr-3 py-2.5 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-white/15 focus:bg-white/[0.04] transition-all font-mono"
                    />
                  </div>

                  {selected?.id === "custom" && !baseUrl && (
                    <p className="text-[9px] text-amber-400/50">Custom endpoints require a base URL</p>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={ANIM_SPRING}
                  className="space-y-1.5"
                >
                  <p className="text-[10px] text-white/40 mb-3">Select the model for your coding sessions</p>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-3 w-3 text-amber-400/60" />
                    <span className="text-[9px] text-white/30">
                      You can change this anytime in Settings
                    </span>
                  </div>
                  {selected && (selected.models.length > 0 ? (
                    selected.models.map((m, i) => (
                      <motion.button
                        key={m}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * ANIM_STAGGER, ...ANIM_SPRING }}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => setModel(m)}
                        className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all"
                        style={{
                          borderColor: model === m ? "var(--color-accent-brand)" : "rgba(255,255,255,0.06)",
                          backgroundColor: model === m ? "rgba(59,130,246,0.06)" : "rgba(255,255,255,0.02)",
                        }}
                      >
                        <div className={cn(
                          "flex items-center justify-center h-5 w-5 rounded-full border transition-all",
                          model === m
                            ? "bg-blue-500 border-blue-400"
                            : "border-white/[0.08]",
                        )}>
                          {model === m && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <span className="text-[11px] font-mono text-white/60">{m}</span>
                        {i === 0 && (
                          <span className="text-[8px] text-amber-400/50 ml-auto">Best overall</span>
                        )}
                      </motion.button>
                    ))
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] p-3">
                      <input
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="Enter model name (e.g., gpt-4o)"
                        className="flex-1 bg-transparent text-[11px] text-white/60 placeholder:text-white/20 outline-none"
                        autoFocus
                      />
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-white/[0.04] bg-white/[0.01]">
            <button
              onClick={step > 0 && !done ? handleBack : onDismiss}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] transition-all",
                step > 0 && !done
                  ? "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
                  : "text-white/30 hover:text-white/50 hover:bg-white/[0.04]",
              )}
            >
              {step > 0 && !done && <ArrowLeft className="h-3 w-3" />}
              {step === 0 && !done ? "Skip" : done ? "Close" : "Back"}
            </button>

            {!done && (
              step === 0 ? (
                <button
                  onClick={onDismiss}
                  className="rounded-lg px-3 py-1.5 text-[9px] text-white/30 hover:text-white/50 transition-colors"
                >
                  I'll do this later
                </button>
              ) : step === 1 ? (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleNextToModel}
                  disabled={!apiKey.trim()}
                  className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[10px] font-medium transition-all disabled:opacity-30"
                  style={{
                    backgroundColor: apiKey.trim() ? "var(--color-accent-brand)" : "rgba(255,255,255,0.06)",
                    color: apiKey.trim() ? "white" : "rgba(255,255,255,0.3)",
                  }}
                >
                  Continue
                  <ChevronRight className="h-3 w-3" />
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleFinish}
                  disabled={saving || !model}
                  className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[10px] font-medium transition-all disabled:opacity-30"
                  style={{
                    backgroundColor: model ? "var(--color-accent-brand)" : "rgba(255,255,255,0.06)",
                    color: model ? "white" : "rgba(255,255,255,0.3)",
                  }}
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  {saving ? "Configuring..." : "Start Coding"}
                </motion.button>
              )
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
