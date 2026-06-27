import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import type { GatewayProvider } from "@/types"
import { getAllTraces, getTraces, getHealth, getProviderDiagnostics } from "@agentic-os/providers"
import type { TraceEntry, ValidationRun, ProviderDiagnostics } from "@agentic-os/providers"
import { PROVIDER_HEALTH_META } from "@agentic-os/providers"
import {
  X, Terminal, Activity, Clock, Wifi, WifiOff,
  RefreshCw, AlertTriangle, CheckCircle, Loader2,
  ChevronDown, ChevronRight, Copy, Trash2,
  ArrowUpRight, Zap, Radio, BarChart3, Search,
} from "lucide-react"

interface DiagnosticsConsoleProps {
  open: boolean
  onClose: () => void
  provider: GatewayProvider | null
}

// ── Trace Entry Component ──

function TraceItem({ entry }: { entry: TraceEntry }) {
  const [expanded, setExpanded] = useState(false)
  const time = new Date(entry.timestamp).toLocaleTimeString()

  const typeMeta = {
    request: { icon: ArrowUpRight, color: "text-blue-400", bg: "bg-blue-500/10", label: "Request" },
    response: { icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10", label: "Response" },
    stream_chunk: { icon: Radio, color: "text-cyan-400", bg: "bg-cyan-500/10", label: "Stream Chunk" },
    error: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10", label: "Error" },
    health_change: { icon: Activity, color: "text-amber-400", bg: "bg-amber-500/10", label: "Health Change" },
    validation: { icon: RefreshCw, color: "text-purple-400", bg: "bg-purple-500/10", label: "Validation" },
  }
  const meta = typeMeta[entry.type] ?? typeMeta.request
  const Icon = meta.icon

  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-all"
      >
        <span className={cn("h-6 w-6 rounded-lg flex items-center justify-center shrink-0", meta.bg)}>
          <Icon className={cn("h-3 w-3", meta.color)} />
        </span>
        <span className={cn("text-[10px] font-medium w-16 shrink-0", meta.color)}>{meta.label}</span>
        <span className="text-[9px] text-white/30 font-mono w-16 shrink-0">{time}</span>
        {entry.statusCode && (
          <span className={cn(
            "text-[9px] font-mono px-1 rounded shrink-0",
            entry.statusCode >= 200 && entry.statusCode < 300 ? "text-green-400/60 bg-green-500/5" :
            entry.statusCode >= 400 ? "text-red-400/60 bg-red-500/5" :
            "text-white/30",
          )}>
            {entry.statusCode}
          </span>
        )}
        {entry.latencyMs && (
          <span className="text-[9px] text-white/30 font-mono shrink-0">{entry.latencyMs}ms</span>
        )}
        <span className="flex-1 min-w-0 text-[9px] text-white/30 truncate">
          {entry.url || entry.errorMessage || entry.providerName}
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-white/20 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-white/20 shrink-0" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-1">
              {entry.url && (
                <div className="flex items-start gap-2">
                  <span className="text-[9px] text-white/30 w-16 shrink-0">URL</span>
                  <span className="text-[9px] text-white/50 font-mono break-all min-w-0">{entry.url}</span>
                </div>
              )}
              {entry.method && (
                <div className="flex items-start gap-2">
                  <span className="text-[9px] text-white/30 w-16 shrink-0">Method</span>
                  <span className="text-[9px] text-cyan-400/60 font-mono">{entry.method}</span>
                </div>
              )}
              {entry.statusCode && (
                <div className="flex items-start gap-2">
                  <span className="text-[9px] text-white/30 w-16 shrink-0">Status</span>
                  <span className={cn(
                    "text-[9px] font-mono",
                    entry.statusCode >= 200 && entry.statusCode < 300 ? "text-green-400/60" : "text-red-400/60",
                  )}>{entry.statusCode}</span>
                </div>
              )}
              {entry.latencyMs && (
                <div className="flex items-start gap-2">
                  <span className="text-[9px] text-white/30 w-16 shrink-0">Latency</span>
                  <span className="text-[9px] text-white/50 font-mono">{entry.latencyMs}ms</span>
                </div>
              )}
              {entry.ttfbMs && (
                <div className="flex items-start gap-2">
                  <span className="text-[9px] text-white/30 w-16 shrink-0">TTFB</span>
                  <span className="text-[9px] text-white/50 font-mono">{entry.ttfbMs}ms</span>
                </div>
              )}
              {entry.errorMessage && (
                <div className="flex items-start gap-2">
                  <span className="text-[9px] text-white/30 w-16 shrink-0">Error</span>
                  <span className="text-[9px] text-red-400/70 break-all">{entry.errorMessage}</span>
                </div>
              )}
              {entry.previousState && entry.newState && (
                <div className="flex items-start gap-2">
                  <span className="text-[9px] text-white/30 w-16 shrink-0">State</span>
                  <span className="text-[9px] text-white/50 font-mono">
                    {entry.previousState} → {entry.newState}
                  </span>
                </div>
              )}
              {entry.requestHeaders && Object.keys(entry.requestHeaders).length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-[9px] text-white/30 w-16 shrink-0">Headers</span>
                  <span className="text-[9px] text-white/20 italic">(hidden for security)</span>
                </div>
              )}
              {entry.responseBody && (
                <div className="flex items-start gap-2">
                  <span className="text-[9px] text-white/30 w-16 shrink-0">Response</span>
                  <span className="text-[9px] text-white/20 italic">(hidden for security)</span>
                </div>
              )}
              {entry.chunkContent && (
                <div className="flex items-start gap-2">
                  <span className="text-[9px] text-white/30 w-16 shrink-0">Chunk</span>
                  <span className="text-[9px] text-cyan-400/50 font-mono break-all">
                    [{entry.chunkIndex}] {entry.chunkContent.slice(0, 200)}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Validation Run Component ──

function ValidationRunView({ run }: { run: ValidationRun }) {
  const [expanded, setExpanded] = useState(false)
  const time = new Date(run.timestamp).toLocaleTimeString()

  return (
    <div className="border-b border-white/5 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-all"
      >
        <span className={cn(
          "h-5 w-5 rounded flex items-center justify-center shrink-0",
          run.overall === "passed" ? "bg-green-500/10" :
          run.overall === "partial" ? "bg-amber-500/10" : "bg-red-500/10",
        )}>
          {run.overall === "passed" ? (
            <CheckCircle className="h-3 w-3 text-green-400" />
          ) : run.overall === "partial" ? (
            <AlertTriangle className="h-3 w-3 text-amber-400" />
          ) : (
            <X className="h-3 w-3 text-red-400" />
          )}
        </span>
        <span className="text-[9px] text-white/30 font-mono w-16 shrink-0">{time}</span>
        <span className={cn(
          "text-[10px] font-medium capitalize",
          run.overall === "passed" ? "text-green-400" :
          run.overall === "partial" ? "text-amber-400" : "text-red-400",
        )}>{run.overall}</span>
        <span className="text-[9px] text-white/30 font-mono shrink-0">{run.totalLatencyMs}ms</span>
        {run.steps.length > 0 && (
          <span className="text-[9px] text-white/20 shrink-0">{run.steps.filter(s => s.passed).length}/{run.steps.length} steps</span>
        )}
        <div className="flex-1" />
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-white/20 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-white/20 shrink-0" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-7 pb-3 space-y-1">
              {run.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] min-w-0">
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    step.passed ? "bg-green-500" : "bg-red-500",
                  )} />
                  <span className="text-white/40 w-16 uppercase text-[9px] font-medium shrink-0">{step.step}</span>
                  <span className={cn("font-mono shrink-0", step.passed ? "text-green-400/60" : "text-red-400/60")}>
                    {step.passed ? "✓ " : "✗ "}
                    {step.latencyMs}ms
                  </span>
                  {step.statusCode && (
                    <span className="text-[9px] text-white/30 shrink-0">HTTP {step.statusCode}</span>
                  )}
                  {!step.passed && step.error && (
                    <span className="text-[9px] text-red-400/50 truncate min-w-0 max-w-[120px] sm:max-w-[200px]">{step.error}</span>
                  )}
                </div>
              ))}
              {run.error && (
                <div className="flex items-start gap-2 mt-1">
                  <AlertTriangle className="h-3 w-3 text-red-400/60 shrink-0 mt-0.5" />
                  <span className="text-[9px] text-red-400/70">{run.error}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main Diagnostics Console ──

export function DiagnosticsConsole({ open, onClose, provider }: DiagnosticsConsoleProps) {
  const [activeTab, setActiveTab] = useState<"traces" | "validation" | "metrics">("traces")
  const [searchQuery, setSearchQuery] = useState("")
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Remove autoRefresh from deps to avoid re-computing on toggle
  const traces = useMemo(() => {
    if (!provider) return []
    const all = getTraces(provider.baseUrl)
    if (!searchQuery) return all
    const q = searchQuery.toLowerCase()
    return all.filter((t) =>
      t.url?.toLowerCase().includes(q) ||
      t.errorMessage?.toLowerCase().includes(q) ||
      t.providerName?.toLowerCase().includes(q) ||
      t.statusCode?.toString().includes(q) ||
      t.type?.toLowerCase().includes(q),
    )
  }, [provider, searchQuery])  

  const health = provider ? getHealth(provider.baseUrl) : null
  const diagnostics = provider ? getProviderDiagnostics(provider.baseUrl) : null

  if (!open || !provider) return null

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[560px] lg:w-[640px] border-l border-white/10 bg-[#0a0a14] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-white/5 shrink-0">
              <div className="h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                <Terminal className="h-4 w-4 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-white truncate">
                  Diagnostics: {provider.name}
                </h2>
                <p className="text-[10px] text-white/30 font-mono truncate">{provider.baseUrl}</p>
              </div>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={cn(
                  "rounded-lg px-2 py-1 text-[9px] font-medium transition-all shrink-0",
                  autoRefresh ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-white/30 border border-white/5",
                )}
              >
                <RefreshCw className={cn("h-3 w-3", autoRefresh && "animate-spin")} />
              </button>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-white/30 hover:text-white hover:bg-white/5 transition-all shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Health summary bar */}
            {health && (
              <div className="flex items-center gap-3 px-4 sm:px-5 py-2.5 border-b border-white/5 bg-white/[0.01] overflow-x-auto">
                {(() => {
                  const meta = PROVIDER_HEALTH_META[health.state] ?? PROVIDER_HEALTH_META.unknown
                  return (
                    <>
                      <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-medium shrink-0", meta.color)}>
                        <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                        {meta.label}
                      </span>
                      <span className="text-[9px] text-white/30 shrink-0">|</span>
                      <span className="text-[9px] text-white/30 font-mono shrink-0">
                        {health.avgLatencyMs > 0 ? `${health.avgLatencyMs}ms avg` : "— latency"}
                      </span>
                      <span className="text-[9px] text-white/30 shrink-0">|</span>
                      <span className="text-[9px] text-white/30 font-mono shrink-0">
                        {health.consecutiveFailures > 0
                          ? `${health.consecutiveFailures} consecutive failure(s)`
                          : `${health.totalSuccesses} success(es), ${health.totalFailures} failure(s)`}
                      </span>
                    </>
                  )
                })()}
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center border-b border-white/5 px-4 sm:px-5 overflow-x-auto">
              {[
                { id: "traces" as const, label: "Traces", icon: Activity, count: traces.length },
                { id: "validation" as const, label: "Validation", icon: BarChart3, count: health?.validationHistory.length ?? 0 },
                { id: "metrics" as const, label: "Metrics", icon: Activity },
              ].map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-medium border-b-2 transition-all -mb-px shrink-0",
                      isActive
                        ? "text-cyan-400 border-cyan-400"
                        : "text-white/30 border-transparent hover:text-white/50",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className={cn(
                        "text-[9px] px-1 rounded",
                        isActive ? "bg-cyan-500/10 text-cyan-400" : "bg-white/5 text-white/30",
                      )}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* Traces Tab */}
              {activeTab === "traces" && (
                <div>
                  {/* Search */}
                  <div className="px-4 sm:px-5 py-2.5 border-b border-white/5">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20" />
                      <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search traces by URL, status, error..."
                        className="w-full h-8 rounded-lg border border-white/10 bg-white/[0.02] pl-9 pr-3 text-[10px] text-white outline-none placeholder:text-white/20 focus:border-white/20 transition-all"
                      />
                    </div>
                  </div>

                  {/* Trace list */}
                  <div className="divide-y divide-white/5">
                    {traces.length === 0 ? (
                      <div className="flex flex-col items-center py-12 px-4 text-center">
                        <Terminal className="h-8 w-8 text-white/10 mb-3" />
                        <p className="text-xs text-white/30 mb-1">No traces yet</p>
                        <p className="text-[10px] text-white/20">
                          {searchQuery ? "No traces match your search" : "Traces appear when the provider is used"}
                        </p>
                      </div>
                    ) : (
                      traces.slice().reverse().map((entry) => (
                        <TraceItem key={entry.id} entry={entry} />
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Validation Tab */}
              {activeTab === "validation" && (
                <div>
                  <div className="px-4 sm:px-5 py-2.5 border-b border-white/5">
                    <p className="text-[9px] text-white/30 font-medium uppercase tracking-wider">
                      Validation History ({health?.validationHistory.length ?? 0})
                    </p>
                  </div>
                  <div className="divide-y divide-white/5">
                    {(!health?.validationHistory || health.validationHistory.length === 0) ? (
                      <div className="flex flex-col items-center py-12 px-4 text-center">
                        <BarChart3 className="h-8 w-8 text-white/10 mb-3" />
                        <p className="text-xs text-white/30 mb-1">No validation runs</p>
                        <p className="text-[10px] text-white/20">
                          Run a validation check to see results here
                        </p>
                      </div>
                    ) : (
                      health.validationHistory.slice().reverse().map((run) => (
                        <ValidationRunView key={run.id} run={run} />
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Metrics Tab */}
              {activeTab === "metrics" && health && (
                <div className="p-4 sm:p-5 space-y-4">
                  {/* Latency stats */}
                  <div>
                    <p className="text-[9px] text-white/30 font-medium uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Clock className="h-2.5 w-2.5" /> Latency
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: "Average", value: `${Math.round(health.avgLatencyMs)}ms`, color: "text-blue-400" },
                        { label: "P50", value: `${Math.round(health.p50LatencyMs)}ms`, color: "text-green-400" },
                        { label: "P95", value: `${Math.round(health.p95LatencyMs)}ms`, color: "text-amber-400" },
                        { label: "Last", value: `${Math.round(health.lastLatencyMs)}ms`, color: "text-cyan-400" },
                      ].map((stat) => (
                        <div key={stat.label} className="rounded-xl bg-white/[0.02] border border-white/5 px-3 py-2.5">
                          <span className={cn("block text-xs font-mono font-medium", stat.color)}>{stat.value}</span>
                          <span className="block text-[9px] text-white/20 mt-0.5">{stat.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Uptime */}
                  <div>
                    <p className="text-[9px] text-white/30 font-medium uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Activity className="h-2.5 w-2.5" /> Reliability
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[
                        {
                          label: "Uptime",
                          value: diagnostics ? `${diagnostics.uptimePercent}%` : "—",
                          color: (diagnostics?.uptimePercent ?? 0) >= 80 ? "text-green-400" : (diagnostics?.uptimePercent ?? 0) >= 50 ? "text-amber-400" : "text-red-400",
                        },
                        {
                          label: "Successes",
                          value: health.totalSuccesses.toString(),
                          color: "text-green-400",
                        },
                        {
                          label: "Failures",
                          value: health.totalFailures.toString(),
                          color: health.totalFailures > 0 ? "text-red-400" : "text-white/50",
                        },
                      ].map((stat) => (
                        <div key={stat.label} className="rounded-xl bg-white/[0.02] border border-white/5 px-3 py-2.5">
                          <span className={cn("block text-xs font-mono font-medium", stat.color)}>{stat.value}</span>
                          <span className="block text-[9px] text-white/20 mt-0.5">{stat.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Streaming stats */}
                  <div>
                    <p className="text-[9px] text-white/30 font-medium uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Radio className="h-2.5 w-2.5" /> Streaming
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="rounded-xl bg-white/[0.02] border border-white/5 px-3 py-2.5">
                        <span className={cn(
                          "block text-xs font-mono font-medium",
                          health.streamingSupported === true ? "text-green-400" :
                          health.streamingSupported === false ? "text-red-400" : "text-white/50",
                        )}>
                          {health.streamingSupported === true ? "Supported" :
                           health.streamingSupported === false ? "Broken" : "Unknown"}
                        </span>
                        <span className="block text-[9px] text-white/20 mt-0.5">Streaming</span>
                      </div>
                      <div className="rounded-xl bg-white/[0.02] border border-white/5 px-3 py-2.5">
                        <span className="block text-xs font-mono text-white/70">
                          {health.streamingFailures > 0 ? `${health.streamingFailures} failure(s)` : "No failures"}
                        </span>
                        <span className="block text-[9px] text-white/20 mt-0.5">Streaming Errors</span>
                      </div>
                    </div>
                  </div>

                  {/* Error log */}
                  {health.lastError && (
                    <div className="rounded-xl bg-red-500/5 border border-red-500/10 p-3">
                      <p className="text-[9px] text-red-400/60 font-medium uppercase tracking-wider mb-1">Last Error</p>
                      <p className="text-[10px] text-red-400/80 font-mono break-all">{health.lastError}</p>
                      {health.lastErrorCode && (
                        <p className="text-[9px] text-red-400/40 mt-1">Code: {health.lastErrorCode}</p>
                      )}
                    </div>
                  )}

                  {/* Latency samples */}
                  {health.latencySamples.length > 0 && (
                    <div>
                      <p className="text-[9px] text-white/30 font-medium uppercase tracking-wider mb-2">
                        Latency Samples ({health.latencySamples.length})
                      </p>
                      <div className="flex items-end gap-0.5 h-12">
                        {health.latencySamples.slice(-40).map((sample, i) => {
                          const maxLatency = Math.max(...health.latencySamples.slice(-40), 1)
                          const height = (sample / maxLatency) * 100
                          return (
                            <div
                              key={i}
                              className="flex-1 rounded-t"
                              style={{
                                height: `${Math.max(height, 5)}%`,
                                background: `linear-gradient(to top, rgba(6,182,212,0.3), rgba(6,182,212,0.1))`,
                              }}
                              title={`${sample}ms`}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
