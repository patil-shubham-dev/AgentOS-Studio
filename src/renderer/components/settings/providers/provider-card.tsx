import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import type { GatewayProvider, ProviderModel } from "@/types"
import type { ValidationResult } from "@/types"
import {
  Globe, Eye, EyeOff, MoreHorizontal, Activity,
  Trash2, Clock, Box, Loader2, Zap,
  AlertTriangle, RefreshCw, Check,
  Shield, Server, Terminal, Radio, BarChart3,
  CircleDot, Copy, Wifi, WifiOff,
  Cpu, BookOpen, Gauge, Bug,
  ChevronRight, ChevronDown,
} from "lucide-react"
import { safeValidateProvider } from "@agentic-os/providers"
import { useAppStore } from "@/stores/app-store"
import { PROVIDER_HEALTH_META, type ProviderHealthState } from "@agentic-os/providers"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@agentic-os/ui"
import { getHealthInfo, getProviderDiagnostics } from "@agentic-os/providers"

export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return key
  const visible = key.slice(-4)
  const dashIndex = key.slice(0, -4).lastIndexOf("-")
  const prefixLen = dashIndex >= 0 ? dashIndex + 1 : Math.min(4, key.length - 4)
  const prefix = key.slice(0, prefixLen)
  const dots = Math.max(3, key.length - prefixLen - 4)
  return `${prefix}${"•".repeat(dots)}${visible}`
}

function HealthDot({ state, pulse = false }: { state: ProviderHealthState; pulse?: boolean }) {
  const meta = PROVIDER_HEALTH_META[state] ?? PROVIDER_HEALTH_META.unknown
  return (
    <span className={cn("inline-block h-2 w-2 rounded-full", meta.dot, pulse && (state === "validating" || state === "reconnecting") && "animate-pulse")} />
  )
}

export function ProviderCard({
  provider,
  onRetest,
  onEdit,
  onDelete,
  expanded: controlledExpanded,
  onOpenDiagnostics,
}: {
  provider: GatewayProvider
  onRetest?: () => void
  onEdit: () => void
  onDelete: () => void
  expanded?: boolean
  onOpenDiagnostics?: () => void
}) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const expanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded
  const prevControlled = useRef(controlledExpanded)

  useEffect(() => {
    if (controlledExpanded !== undefined && controlledExpanded !== prevControlled.current) {
      prevControlled.current = controlledExpanded
      setInternalExpanded(controlledExpanded)
    }
  }, [controlledExpanded])

  const [showKey, setShowKey] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ValidationResult | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const mountedRef = useRef(true)

  const updateProvider = useAppStore((s) => s.updateProvider)

  const healthInfo = getHealthInfo(provider.baseUrl, provider.id)
  const diagnostics = getProviderDiagnostics(provider.baseUrl)
  const healthMeta = PROVIDER_HEALTH_META[healthInfo.state] ?? PROVIDER_HEALTH_META.unknown

  const hasApiKey = provider.apiKey.length > 0
  const modelCount = provider.models.length

  const isConnected = healthInfo.state === "connected"
  const streamingOk = diagnostics?.lastValidationRun?.steps?.find(s => s.step === "streaming")?.passed ?? false
  const toolSupport = provider.models.some((m) => m.supportsTools)
  const visionSupport = provider.models.some((m) => m.supportsVision)
  const maxCtx = Math.max(...provider.models.map((m) => m.contextWindow ?? 0), 0)

  const isAnthropic = provider.baseUrl.includes("anthropic.com")
  const isGemini = provider.baseUrl.includes("googleapis.com") || provider.baseUrl.includes("generativelanguage")
  const isOllama = provider.baseUrl.includes("11434")
  const isNvidia = provider.baseUrl.includes("nvidia.com")

  const providerIcon = isAnthropic ? "A" : isGemini ? "G" : isOllama ? "O" : isNvidia ? "N" : provider.name[0]

  async function runHealthCheck() {
    setTesting(true)
    const t0 = performance.now()
    try {
      const result = await safeValidateProvider(provider.baseUrl, provider.apiKey)
      if (!mountedRef.current) return
      setTestResult(result)
      if (result.success) {
        updateProvider(provider.id, { runtime: result.runtime })
      }
    } catch (err) {
      if (!mountedRef.current) return
      const msg = err instanceof Error ? err.message : "Health check failed"
      setTestResult({ success: false, runtime: null, latencyMs: Math.round(performance.now() - t0), error: msg })
    } finally {
      if (mountedRef.current) setTesting(false)
    }
  }

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (!document.getElementById(`menu-${provider.id}`)?.contains(target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [menuOpen, provider.id])

  return (
    <>
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-[#0a0a14] border border-white/10 text-white w-[90vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Provider</DialogTitle>
            <DialogDescription className="text-white/40">
              Are you sure you want to remove <span className="text-white/70 font-medium">{provider.name}</span>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded-xl border border-white/10 text-xs text-white/50 hover:text-white hover:bg-white/5 transition-all">
              Cancel
            </button>
            <button onClick={() => { onDelete(); setShowDeleteConfirm(false) }} className="px-4 py-2 rounded-xl bg-red-500/80 hover:bg-red-500 text-xs text-white font-medium transition-all">
              Delete Provider
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <motion.div
        layout
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={cn(
          "group relative overflow-hidden rounded-2xl border transition-all duration-200 cursor-pointer",
          expanded
            ? cn(healthMeta.border, "bg-gradient-to-br from-white/[0.05] to-white/[0.02]")
            : "border-white/5 bg-gradient-to-br from-white/[0.04] to-white/[0.02] hover:border-white/10",
        )}
        onClick={() => setInternalExpanded(!expanded)}
      >
        {/* Health gradient bar */}
        <div className={cn(
          "absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r transition-opacity duration-500",
          isConnected ? "from-green-500/50 to-green-500/10" :
          healthInfo.state === "invalid_auth" ? "from-red-500/50 to-red-500/10" :
          healthInfo.state === "offline" || healthInfo.state === "timeout" ? "from-orange-500/50 to-orange-500/10" :
          "from-white/10 to-transparent",
        )} />

        {/* Collapsed view */}
        {!expanded && (
          <div className="p-4">
            <div className="flex items-start gap-3">
              {/* Provider avatar */}
              <div className={cn(
                "relative flex items-center justify-center h-10 w-10 rounded-xl border transition-all shrink-0 overflow-hidden",
                isConnected ? "border-green-500/20 bg-gradient-to-br from-green-500/20 to-emerald-500/10" :
                healthInfo.state === "invalid_auth" ? "border-red-500/20 bg-gradient-to-br from-red-500/20 to-rose-500/10" :
                healthInfo.state === "offline" || healthInfo.state === "timeout" ? "border-orange-500/20 bg-gradient-to-br from-orange-500/20 to-amber-500/10" :
                "border-white/10 bg-gradient-to-br from-blue-500/20 to-purple-500/10",
              )}>
                <span className="text-lg font-bold text-white/80">{providerIcon}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-white truncate max-w-[200px]">{provider.name}</h3>
                  {provider.runtime && (
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium shrink-0",
                      provider.isLocal ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20",
                    )}>
                      <Server className="h-2.5 w-2.5" />{provider.runtime}
                    </span>
                  )}
                  {provider.isLocal && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
                      <WifiOff className="h-2.5 w-2.5" />Local
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium shrink-0",
                    healthMeta.bg, healthMeta.color,
                  )}>
                    <HealthDot state={healthInfo.state} />
                    {healthMeta.label}
                  </span>
                  {healthInfo.latencyMs > 0 && (
                    <span className="inline-flex items-center gap-1 text-[9px] text-white/30 font-mono shrink-0">
                      <Zap className="h-2 w-2" />
                      {healthInfo.latencyMs}ms
                    </span>
                  )}
                  <span className="text-[9px] text-white/20 font-mono shrink-0">{modelCount} model{modelCount !== 1 ? "s" : ""}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <div className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-mono border transition-all shrink-0",
                  healthMeta.bg, healthMeta.border, healthMeta.color,
                )}>
                  {testing ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : isConnected ? (
                    <Wifi className="h-2.5 w-2.5" />
                  ) : (
                    <Activity className="h-2.5 w-2.5" />
                  )}
                  {healthInfo.latencyMs > 0 ? `${healthInfo.latencyMs}ms` : "—"}
                </div>
                <div className="rounded-lg p-1 text-white/20 hover:text-white/50 transition-all">
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Expanded view */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="p-4 space-y-4">
                {/* Name + status row */}
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "relative flex items-center justify-center h-12 w-12 rounded-xl border transition-all shrink-0 overflow-hidden",
                    isConnected ? "border-green-500/20 bg-gradient-to-br from-green-500/20 to-emerald-500/10" :
                    healthInfo.state === "invalid_auth" ? "border-red-500/20 bg-gradient-to-br from-red-500/20 to-rose-500/10" :
                    "border-white/10 bg-gradient-to-br from-blue-500/20 to-purple-500/10",
                  )}>
                    <span className="text-xl font-bold text-white/80">{providerIcon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-white truncate">{provider.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        healthMeta.bg, healthMeta.color,
                      )}>
                        <HealthDot state={healthInfo.state} />
                        {healthMeta.label}
                      </span>
                      {healthInfo.latencyMs > 0 && (
                        <span className="text-[10px] text-white/30 font-mono">{healthInfo.latencyMs}ms</span>
                      )}
                      {provider.runtime && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          <Server className="h-2.5 w-2.5" />{provider.runtime}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {onOpenDiagnostics && (
                      <button onClick={(e) => { e.stopPropagation(); onOpenDiagnostics() }} className="rounded-lg p-1.5 text-white/30 hover:text-cyan-400 hover:bg-white/5 transition-all" title="Diagnostics">
                        <Terminal className="h-4 w-4" />
                      </button>
                    )}
                    <div onClick={(e) => e.stopPropagation()} className="relative" id={`menu-${provider.id}`}>
                      <button onClick={() => setMenuOpen(!menuOpen)} className="rounded-lg p-1.5 text-white/30 hover:text-white hover:bg-white/5 transition-all">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      <AnimatePresence>
                        {menuOpen && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-white/10 bg-black/90 backdrop-blur-2xl p-1 shadow-2xl z-20"
                          >
                            <button onClick={() => { onEdit(); setMenuOpen(false) }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white transition-all">
                              <Activity className="h-3.5 w-3.5" /> Edit Provider
                            </button>
                            <button onClick={() => { onRetest?.(); setMenuOpen(false) }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white transition-all">
                              <RefreshCw className="h-3.5 w-3.5" /> Refresh Models
                            </button>
                            <button onClick={() => { runHealthCheck(); setMenuOpen(false) }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white transition-all">
                              <Zap className="h-3.5 w-3.5" /> Validate Connection
                            </button>
                            {onOpenDiagnostics && (
                              <button onClick={() => { onOpenDiagnostics(); setMenuOpen(false) }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white transition-all">
                                <Bug className="h-3.5 w-3.5" /> View Diagnostics
                              </button>
                            )}
                            <div className="my-1 border-t border-white/5" />
                            <button onClick={() => { setShowDeleteConfirm(true); setMenuOpen(false) }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-all">
                              <Trash2 className="h-3.5 w-3.5" /> Remove Provider
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setInternalExpanded(false) }} className="rounded-lg p-1.5 text-white/30 hover:text-white hover:bg-white/5 transition-all">
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* URL + API Key */}
                <div className="flex items-center gap-2 rounded-xl bg-white/[0.02] border border-white/5 px-3 py-2.5 text-xs text-white/30 font-mono min-w-0">
                  <Globe className="h-3.5 w-3.5 text-white/20 shrink-0" />
                  <span className="truncate flex-1">{provider.baseUrl}</span>
                  <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(provider.baseUrl) }} className="p-0.5 text-white/20 hover:text-white transition-all shrink-0">
                    <Copy className="h-3 w-3" />
                  </button>
                </div>

                {hasApiKey && (
                  <div className="flex items-center gap-2 rounded-xl bg-white/[0.02] border border-white/5 px-3 py-2.5 min-w-0" onClick={(e) => e.stopPropagation()}>
                    <Shield className="h-3.5 w-3.5 text-white/20 shrink-0" />
                    <code className="text-xs text-white/40 font-mono select-all flex-1 truncate">
                      {showKey ? provider.apiKey : maskApiKey(provider.apiKey)}
                    </code>
                    <button onClick={() => setShowKey(!showKey)} className="p-0.5 text-white/20 hover:text-white transition-all shrink-0">
                      {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}

                {/* Metrics */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-lg bg-white/[0.02] border border-white/5 px-2.5 py-2">
                    <span className={cn("block font-mono text-xs font-medium", isConnected ? "text-green-400" : "text-white/40")}>
                      {isConnected ? "Online" : "Offline"}
                    </span>
                    <span className="block text-[9px] text-white/20 leading-tight">Status</span>
                  </div>
                  <div className="rounded-lg bg-white/[0.02] border border-white/5 px-2.5 py-2">
                    <span className="block font-mono text-xs font-medium text-white/70">{healthInfo.latencyMs > 0 ? `${healthInfo.latencyMs}ms` : "—"}</span>
                    <span className="block text-[9px] text-white/20 leading-tight">Latency</span>
                  </div>
                  <div className="rounded-lg bg-white/[0.02] border border-white/5 px-2.5 py-2">
                    <span className="block font-mono text-xs font-medium text-white/70">{String(modelCount)}</span>
                    <span className="block text-[9px] text-white/20 leading-tight">Models</span>
                  </div>
                  <div className="rounded-lg bg-white/[0.02] border border-white/5 px-2.5 py-2">
                    <span className={cn("block font-mono text-xs font-medium", streamingOk ? "text-green-400" : "text-white/30")}>{streamingOk ? "✓" : "—"}</span>
                    <span className="block text-[9px] text-white/20 leading-tight">Streaming</span>
                  </div>
                </div>

                {/* Capability badges */}
                {(toolSupport || visionSupport || maxCtx > 0) && (
                  <div className="flex flex-wrap gap-1">
                    {streamingOk && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"><Radio className="h-2.5 w-2.5" />Streaming</span>}
                    {toolSupport && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium bg-green-500/10 text-green-400 border border-green-500/20"><Zap className="h-2.5 w-2.5" />Tools</span>}
                    {visionSupport && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20"><Eye className="h-2.5 w-2.5" />Vision</span>}
                    {maxCtx > 100000 && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"><BookOpen className="h-2.5 w-2.5" />{(maxCtx / 1000).toFixed(0)}K ctx</span>}
                  </div>
                )}

                {/* Model chips */}
                {modelCount > 0 && (
                  <div>
                    <p className="text-[9px] text-white/30 font-medium uppercase tracking-wider mb-1.5">Models ({modelCount})</p>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto overscroll-contain">
                      {provider.models.slice(0, 8).map((m) => (
                        <span key={m.id} className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] border border-white/5 px-2 py-1 text-[10px] font-mono text-white/50 max-w-full">
                          <CircleDot className="h-2 w-2 text-white/20 shrink-0" />
                          <span className="truncate max-w-[120px]">{m.name}</span>
                          {m.supportsTools && <span className="text-[8px] text-green-400/40 shrink-0">t</span>}
                          {m.supportsVision && <span className="text-[8px] text-purple-400/40 shrink-0">v</span>}
                        </span>
                      ))}
                      {modelCount > 8 && (
                        <span className="text-[9px] text-white/20 px-1">+{modelCount - 8} more</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Validation steps */}
                {diagnostics?.lastValidationRun?.steps && diagnostics.lastValidationRun.steps.length > 0 && (
                  <div className="rounded-xl bg-white/[0.02] border border-white/5 p-3 space-y-1">
                    <p className="text-[9px] text-white/30 font-medium uppercase tracking-wider flex items-center gap-1.5">
                      <RefreshCw className="h-2.5 w-2.5" />
                      Last Validation — {diagnostics.lastValidationRun.overall}
                    </p>
                    {diagnostics.lastValidationRun.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px] min-w-0">
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", step.passed ? "bg-green-500" : "bg-red-500")} />
                        <span className="text-white/40 w-20 uppercase text-[9px] font-medium shrink-0">{step.step}</span>
                        <span className={cn("font-mono shrink-0", step.passed ? "text-green-400/60" : "text-red-400/60")}>
                          {step.passed ? "✓ " : "✗ "}{step.latencyMs}ms
                        </span>
                        {step.statusCode && <span className="text-[9px] text-white/30 shrink-0">HTTP {step.statusCode}</span>}
                        {!step.passed && step.error && (
                          <span className="text-red-400/50 truncate min-w-0 text-[9px]" title={step.error}>{step.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Error banner */}
                {healthInfo.lastError && healthInfo.state !== "connected" && (
                  <div className="flex items-start gap-2 rounded-xl bg-red-500/5 border border-red-500/10 px-3 py-2.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-red-400/80 font-medium">Error</p>
                      <p className="text-[9px] text-red-400/50 truncate">{healthInfo.lastError}</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); runHealthCheck() }} className="shrink-0 rounded px-2 py-1 text-[9px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all">
                      Retry
                    </button>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={runHealthCheck} disabled={testing} className={cn(
                    "flex-1 h-9 text-[10px] rounded-xl border transition-all flex items-center justify-center gap-1.5 disabled:opacity-40",
                    testing ? "border-blue-500/20 text-blue-400" : "border-white/10 text-white/50 hover:text-white hover:bg-white/5",
                  )}>
                    {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                    {testing ? "Testing..." : "Validate"}
                  </button>
                  <button onClick={onEdit} className="flex-1 h-9 text-[10px] rounded-xl border border-white/10 text-white/50 hover:text-white hover:bg-white/5 transition-all flex items-center justify-center gap-1.5">
                    <Activity className="h-3 w-3" /> Edit
                  </button>
                  <button onClick={() => setShowDeleteConfirm(true)} className="flex-1 h-9 text-[10px] rounded-xl border border-red-500/20 text-red-400/60 hover:text-red-400 hover:bg-red-500/5 transition-all flex items-center justify-center gap-1.5">
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  )
}
