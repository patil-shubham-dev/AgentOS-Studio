import { memo, useCallback, useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Cpu, Check, ChevronDown, Bot, Sparkles, Zap, Brain, Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores/settings/app-store"

interface ModelPickerProps {
  selectedProviderId: string
  selectedModel: string
  onSelect: (providerId: string, modelId: string) => void
  compact?: boolean
}

const PROVIDER_ICONS: Record<string, typeof Cpu> = {
  openai: Sparkles,
  anthropic: Brain,
  google: Globe,
  openrouter: Zap,
}

export const ModelPicker = memo(function ModelPicker({
  selectedProviderId,
  selectedModel,
  onSelect,
  compact,
}: ModelPickerProps) {
  const providers = useAppStore((s) => s.providers)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const activeProvider = providers.find((p) => p.id === selectedProviderId)
  const activeModel = selectedModel || activeProvider?.models?.[0]?.id || ""

  const handleSelect = useCallback((providerId: string, modelId: string) => {
    onSelect(providerId, modelId)
    setOpen(false)
  }, [onSelect])

  if (compact) {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-medium transition-all hover:bg-white/[0.04]"
          style={{ color: "var(--text-quaternary)" }}
        >
          <Cpu className="h-2.5 w-2.5" />
          <span className="truncate max-w-[60px]">{activeModel.split("-").slice(0, 2).join("-") || "auto"}</span>
          <ChevronDown className="h-2 w-2" />
        </button>
        <ModelDropdown open={open} providers={providers} selectedProviderId={selectedProviderId} selectedModel={activeModel} onSelect={handleSelect} />
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium transition-all hover:bg-white/[0.04]"
        style={{ color: "var(--text-tertiary)" }}
      >
        <Bot className="h-3 w-3" />
        <span>{activeModel ? activeModel.split("-").slice(0, 2).join(" ") : "Auto"}</span>
        <ChevronDown className="h-2.5 w-2.5" style={{ color: "var(--text-quaternary)" }} />
      </button>
      <ModelDropdown open={open} providers={providers} selectedProviderId={selectedProviderId} selectedModel={activeModel} onSelect={handleSelect} />
    </div>
  )
})

function ModelDropdown({
  open, providers, selectedProviderId, selectedModel, onSelect,
}: {
  open: boolean
  providers: { id: string; name: string; models?: { id: string; name?: string }[] }[]
  selectedProviderId: string
  selectedModel: string
  onSelect: (providerId: string, modelId: string) => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.96 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className="absolute left-0 top-full mt-1 z-50 min-w-[200px] rounded-xl border shadow-2xl py-1 overflow-hidden max-h-64 overflow-y-auto"
          style={{
            backgroundColor: "var(--surface-panel)",
            borderColor: "var(--border-default)",
          }}
        >
          {providers.length === 0 ? (
            <div className="px-3 py-2 text-[9px]" style={{ color: "var(--text-quaternary)" }}>
              No providers configured
            </div>
          ) : providers.map((provider) => {
            const Icon = PROVIDER_ICONS[provider.id] || Cpu
            const models = provider.models ?? []
            return (
              <div key={provider.id}>
                <div className="flex items-center gap-1.5 px-3 py-1.5" style={{ color: "var(--text-quaternary)" }}>
                  <Icon className="h-2.5 w-2.5" />
                  <span className="text-[8px] font-medium uppercase tracking-wider">{provider.name}</span>
                </div>
                {models.map((model) => {
                  const isSelected = selectedProviderId === provider.id && selectedModel === model.id
                  return (
                    <button
                      key={`${provider.id}:${model.id}`}
                      onClick={() => onSelect(provider.id, model.id)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
                      style={{ color: isSelected ? "var(--text-primary)" : "var(--text-secondary)" }}
                    >
                      <div className="h-3.5 w-3.5 flex items-center justify-center">
                        {isSelected && <Check className="h-3 w-3" style={{ color: "var(--color-accent-brand)" }} />}
                      </div>
                      <span className="text-[10px] font-mono">{model.name ?? model.id}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
          <div className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
            <button
              onClick={() => onSelect("", "")}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[9px] transition-colors hover:bg-white/[0.04]"
              style={{ color: "var(--text-quaternary)" }}
            >
              <Zap className="h-2.5 w-2.5" />
              Auto (let AI decide)
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
