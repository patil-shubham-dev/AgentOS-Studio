import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Bot, Server, Globe, FolderOpen, ArrowRight, ArrowLeft, Check, Loader2,
  Sparkles, Cpu, Wifi, WifiOff,
} from "lucide-react"
import { useAppStore } from "@/stores/app-store"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { cn } from "@/lib/utils"
import { detectLocalProviders, buildProviderPayload, type DetectedProvider } from "@/runtime/project-config/ProviderDetector"

interface WelcomeWizardProps {
  open: boolean
  onClose: () => void
}

type WizardStep = "welcome" | "providers" | "models" | "project"

export function WelcomeWizard({ open, onClose }: WelcomeWizardProps) {
  const [step, setStep] = useState<WizardStep>("welcome")
  const [detected, setDetected] = useState<DetectedProvider[]>([])
  const [scanning, setScanning] = useState(false)
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set())
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [completed, setCompleted] = useState(false)

  const addProvider = useAppStore((s) => s.addProvider)
  const setRootPath = useWorkspaceStore((s) => s.setRootPath)

  const scanProviders = useCallback(async () => {
    setScanning(true)
    try {
      const result = await detectLocalProviders()
      setDetected(result.detected)
      if (result.detected.length > 0) {
        setSelectedProviders(new Set(result.detected.map((p) => p.id)))
      }
    } catch {
      setDetected([])
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    if (open && step === "providers") {
      scanProviders()
    }
  }, [open, step, scanProviders])

  const toggleProvider = (id: string) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setApiKey = (id: string, key: string) => {
    setApiKeys((prev) => ({ ...prev, [id]: key }))
  }

  const applyProviders = () => {
    for (const provider of detected) {
      if (!selectedProviders.has(provider.id)) continue
      const payload = buildProviderPayload(provider, apiKeys[provider.id] ?? "")
      addProvider({
        id: provider.id,
        ...payload,
        createdAt: new Date().toISOString(),
      })
    }
    setCompleted(true)
    sessionStorage.setItem("first-launch", "false")
    onClose()
  }

  const openWorkspace = async () => {
    try {
      const { dialogOpen } = await import("@/lib/electron-api")
      const result = await dialogOpen({ directory: true, title: "Open a project folder" })
      if (!result.canceled && result.filePaths?.[0]) {
        setRootPath(result.filePaths[0])
      }
    } catch {
      // not in electron
    }
  }

  const steps: WizardStep[] = ["welcome", "providers", "models", "project"]
  const currentIndex = steps.indexOf(step)

  const nextStep = () => {
    const next = steps[currentIndex + 1]
    if (next) setStep(next)
  }

  const prevStep = () => {
    const prev = steps[currentIndex - 1]
    if (prev) setStep(prev)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-lg mx-4 rounded-2xl border border-white/10 bg-[#0d0d10] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20">
              <Sparkles className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white/90">Welcome to AgenticOS</h2>
              <p className="text-xs text-white/40">Let's get you set up in a few steps</p>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex gap-1.5 mt-4">
            {steps.map((s, i) => (
              <div
                key={s}
                className={cn(
                  "h-1 flex-1 rounded-full transition-all duration-300",
                  i <= currentIndex ? "bg-blue-500" : "bg-white/10",
                )}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 min-h-[300px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {step === "welcome" && <WelcomeStep onNext={nextStep} />}
              {step === "providers" && (
                <ProvidersStep
                  detected={detected}
                  scanning={scanning}
                  selectedProviders={selectedProviders}
                  onToggle={toggleProvider}
                  onScan={scanProviders}
                />
              )}
              {step === "models" && (
                <ModelsStep
                  detected={detected}
                  selectedProviders={selectedProviders}
                  apiKeys={apiKeys}
                  onSetApiKey={setApiKey}
                />
              )}
              {step === "project" && (
                <ProjectStep
                  onOpenWorkspace={openWorkspace}
                  onSkip={applyProviders}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/5 px-6 py-4">
          <button
            onClick={currentIndex > 0 ? prevStep : onClose}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {currentIndex > 0 ? "Back" : "Skip"}
          </button>

          {step === "project" ? (
            <button
              onClick={applyProviders}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:from-blue-500 hover:to-purple-500 transition-all"
            >
              <Check className="h-3.5 w-3.5" />
              Get Started
            </button>
          ) : (
            <button
              onClick={nextStep}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/15 transition-colors"
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-5 py-4">
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20">
          <Bot className="h-7 w-7 text-blue-400" />
        </div>
        <h3 className="text-base font-semibold text-white/80 mb-1">Your Autonomous AI Workspace</h3>
        <p className="text-xs text-white/40 leading-relaxed">
          AgenticOS is a multi-agent environment where AI agents collaborate
          to code, research, design, and automate tasks.
        </p>
      </div>

      <div className="space-y-2">
        {[
          { icon: Cpu, text: "Multi-agent orchestration with role-based AI teams" },
          { icon: Globe, text: "Built-in browser automation and web research" },
          { icon: Server, text: "Works with local (Ollama, LM Studio) and cloud providers" },
          { icon: FolderOpen, text: "Visual canvas, code editor, and Git integration" },
        ].map((item) => (
          <div key={item.text} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2">
            <item.icon className="h-4 w-4 shrink-0 text-blue-400/60" />
            <span className="text-xs text-white/60">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProvidersStep({
  detected,
  scanning,
  selectedProviders,
  onToggle,
  onScan,
}: {
  detected: DetectedProvider[]
  scanning: boolean
  selectedProviders: Set<string>
  onToggle: (id: string) => void
  onScan: () => void
}) {
  return (
    <div className="space-y-4 py-4">
      <div>
        <h3 className="text-sm font-semibold text-white/80 mb-1">AI Providers</h3>
        <p className="text-xs text-white/40">
          Connect to an AI provider to power your agents.
        </p>
      </div>

      {scanning ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] py-8">
          <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
          <span className="text-sm text-white/40">Scanning for local providers...</span>
        </div>
      ) : (
        <div className="space-y-2">
          {detected.length === 0 && (
            <div className="rounded-xl border border-amber-500/10 bg-amber-500/[0.02] p-4 text-center">
              <WifiOff className="mx-auto mb-2 h-6 w-6 text-amber-400/60" />
              <p className="text-xs text-amber-400/60 mb-3">
                No local providers detected. You can still use cloud providers.
              </p>
              <button
                onClick={onScan}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/15"
              >
                Scan again
              </button>
            </div>
          )}

          {detected.map((provider) => (
            <div
              key={provider.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all cursor-pointer",
                selectedProviders.has(provider.id)
                  ? "border-blue-500/30 bg-blue-500/[0.04]"
                  : "border-white/5 bg-white/[0.02] hover:border-white/10",
              )}
              onClick={() => onToggle(provider.id)}
            >
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg",
                provider.reachable ? "bg-green-500/10" : "bg-red-500/10",
              )}>
                {provider.reachable
                  ? <Wifi className="h-4 w-4 text-green-400" />
                  : <WifiOff className="h-4 w-4 text-red-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white/70">{provider.name}</span>
                  <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-400">
                    {provider.latencyMs}ms
                  </span>
                </div>
                <p className="text-[10px] text-white/40 truncate">{provider.baseUrl}</p>
              </div>
              <div className={cn(
                "flex h-4 w-4 items-center justify-center rounded border transition-all",
                selectedProviders.has(provider.id)
                  ? "border-blue-500 bg-blue-500"
                  : "border-white/20",
              )}>
                {selectedProviders.has(provider.id) && (
                  <Check className="h-3 w-3 text-white" />
                )}
              </div>
            </div>
          ))}

          {/* Cloud providers quick-add */}
          <div className="mt-4">
            <p className="text-[10px] text-white/30 mb-2">Or connect a cloud provider:</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "openai", name: "OpenAI", preset: "https://api.openai.com/v1" },
                { id: "anthropic", name: "Anthropic", preset: "https://api.anthropic.com" },
                { id: "openrouter", name: "OpenRouter", preset: "https://openrouter.ai/api/v1" },
                { id: "groq", name: "Groq", preset: "https://api.groq.com/openai/v1" },
              ].map((cloud) => (
                <div
                  key={cloud.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-all cursor-pointer",
                    selectedProviders.has(cloud.id)
                      ? "border-blue-500/30 bg-blue-500/[0.04]"
                      : "border-white/5 bg-white/[0.02] hover:border-white/10",
                  )}
                  onClick={() => onToggle(cloud.id)}
                >
                  <Globe className="h-3.5 w-3.5 text-blue-400/60" />
                  <span className="text-xs text-white/60">{cloud.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ModelsStep({
  detected,
  selectedProviders,
  apiKeys,
  onSetApiKey,
}: {
  detected: DetectedProvider[]
  selectedProviders: Set<string>
  apiKeys: Record<string, string>
  onSetApiKey: (id: string, key: string) => void
}) {
  const selected = detected.filter((p) => selectedProviders.has(p.id))
  const cloudSelected = ["openai", "anthropic", "openrouter", "groq"].filter((id) => selectedProviders.has(id))

  return (
    <div className="space-y-4 py-4">
      <div>
        <h3 className="text-sm font-semibold text-white/80 mb-1">Configure Providers</h3>
        <p className="text-xs text-white/40">
          Review detected models and enter API keys for cloud providers.
        </p>
      </div>

      <div className="space-y-3">
        {selected.map((provider) => (
          <div key={provider.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center gap-2 mb-2">
              <Wifi className="h-3.5 w-3.5 text-green-400" />
              <span className="text-sm font-medium text-white/70">{provider.name}</span>
              <span className="text-[10px] text-white/30">{provider.baseUrl}</span>
            </div>
            {provider.models.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {provider.models.slice(0, 5).map((model) => (
                  <span key={model} className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/50">
                    {model}
                  </span>
                ))}
                {provider.models.length > 5 && (
                  <span className="text-[10px] text-white/30">+{provider.models.length - 5} more</span>
                )}
              </div>
            )}
          </div>
        ))}

        {cloudSelected.map((id) => (
          <div key={id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-3.5 w-3.5 text-blue-400/60" />
              <span className="text-sm font-medium text-white/70 capitalize">{id}</span>
            </div>
            <input
              type="password"
              placeholder="Enter API key..."
              value={apiKeys[id] ?? ""}
              onChange={(e) => onSetApiKey(id, e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-white/70 placeholder:text-white/20 outline-none focus:border-blue-500/40 transition-colors"
            />
          </div>
        ))}

        {selected.length === 0 && cloudSelected.length === 0 && (
          <p className="text-xs text-white/30 text-center py-4">
            No providers selected. You can configure them later in Settings.
          </p>
        )}
      </div>
    </div>
  )
}

function ProjectStep({
  onOpenWorkspace,
  onSkip,
}: {
  onOpenWorkspace: () => void
  onSkip: () => void
}) {
  return (
    <div className="space-y-4 py-4">
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20">
          <FolderOpen className="h-7 w-7 text-emerald-400" />
        </div>
        <h3 className="text-base font-semibold text-white/80 mb-1">Open a Project</h3>
        <p className="text-xs text-white/40 leading-relaxed">
          Open an existing project to start working with AI agents,
          or skip and open one later from the workspace.
        </p>
      </div>

      <div className="space-y-2">
        <button
          onClick={onOpenWorkspace}
          className="flex w-full items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.04] px-4 py-3 text-left hover:bg-blue-500/[0.06] transition-colors"
        >
          <FolderOpen className="h-5 w-5 text-blue-400" />
          <div>
            <span className="text-sm font-medium text-white/70">Open a project folder</span>
            <p className="text-[10px] text-white/40">Browse and select a project directory</p>
          </div>
        </button>

        <button
          onClick={onSkip}
          className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
        >
          <ArrowRight className="h-5 w-5 text-white/30" />
          <div>
            <span className="text-sm font-medium text-white/50">Skip for now</span>
            <p className="text-[10px] text-white/30">Open a project later from the workspace</p>
          </div>
        </button>
      </div>
    </div>
  )
}
