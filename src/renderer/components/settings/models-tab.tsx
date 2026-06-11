import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { Badge, TooltipSimple as Tooltip } from "@agentic-os/ui"
import { useAppStore } from "@/stores/app-store"
import { useModelBenchmarks, type ModelBenchmarkData } from "@/hooks/use-model-benchmarks"
import type { ProviderModel, GatewayProvider } from "@/types"
import {
  Search, Box, Brain, Code2, Image, Zap,
  Clock, MoveRight, Activity,
  ChevronDown, BarChart3,
  Network,
  SortAsc, SortDesc, X,
} from "lucide-react"

// ── Helpers ──

function getHealthClass(latencyMs: number | null): { color: string; label: string; dotColor: string } {
  if (latencyMs === null) return { color: "text-white/20", label: "No data", dotColor: "bg-gray-500/30" }
  if (latencyMs < 500) return { color: "text-green-400", label: `${latencyMs}ms`, dotColor: "bg-green-400" }
  if (latencyMs < 2000) return { color: "text-amber-400", label: `${latencyMs}ms`, dotColor: "bg-amber-400" }
  if (latencyMs < 5000) return { color: "text-orange-400", label: `${latencyMs}ms`, dotColor: "bg-orange-400" }
  return { color: "text-red-400", label: `${latencyMs}ms`, dotColor: "bg-red-400" }
}

type Capability = "supportsTools" | "supportsVision" | "supportsStreaming"
type SortField = "contextWindow" | "name"
type ViewMode = "grid" | "list" | "benchmark"

const CAP_OPTIONS: { key: Capability; label: string; icon: typeof Code2; color: string }[] = [
  { key: "supportsTools", label: "Tools", icon: Code2, color: "text-amber-400" },
  { key: "supportsVision", label: "Vision", icon: Image, color: "text-purple-400" },
  { key: "supportsStreaming", label: "Streaming", icon: Zap, color: "text-blue-400" },
]

// ── Model Row (list view) ──

function ModelRow({
  model,
  providerName,
  benchmark,
  index,
}: {
  model: ProviderModel
  providerName: string
  benchmark: ModelBenchmarkData
  index: number
}) {
  const health = getHealthClass(benchmark.latencyMs)

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02 }}
      className="group flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 transition-all hover:border-white/10 hover:bg-white/[0.04]"
    >
      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{model.name}</span>
          <span className="text-[10px] text-white/30 font-mono">{providerName}</span>
        </div>
      </div>

      {/* Benchmarks */}
      <div className="hidden md:flex items-center gap-4">
        <Tooltip content={`Latency${benchmark.p95Ms ? ` (p95: ${benchmark.p95Ms}ms)` : ""}`}>
          <div className="flex items-center gap-1.5 text-[11px]">
            <Clock className={cn("h-3 w-3", benchmark.latencyMs !== null ? "text-white/40" : "text-white/10")} />
            <span className={cn("font-mono tabular-nums", health.color)}>
              {benchmark.latencyMs !== null ? `${benchmark.latencyMs}ms` : "—"}
            </span>
          </div>
        </Tooltip>

        <Tooltip content="Tokens/sec">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Activity className={cn("h-3 w-3", benchmark.tokensPerSec !== null ? "text-white/40" : "text-white/10")} />
            <span className={cn("font-mono tabular-nums", benchmark.tokensPerSec !== null ? "text-white/70" : "text-white/20")}>
              {benchmark.tokensPerSec !== null ? `${benchmark.tokensPerSec.toFixed(0)}/s` : "—"}
            </span>
          </div>
        </Tooltip>

        <Tooltip content={`TTFT (Time to First Token)${benchmark.p50Ms ? ` — p50: ${benchmark.p50Ms}ms` : ""}`}>
          <div className="flex items-center gap-1.5 text-[11px]">
            <MoveRight className={cn("h-3 w-3", benchmark.ttftMs !== null ? "text-white/40" : "text-white/10")} />
            <span className={cn("font-mono tabular-nums", benchmark.ttftMs !== null ? "text-white/70" : "text-white/20")}>
              {benchmark.ttftMs !== null ? `${benchmark.ttftMs.toFixed(0)}ms` : "—"}
            </span>
          </div>
        </Tooltip>
      </div>

      {/* Capabilities */}
      <div className="flex items-center gap-1.5">
        {model.supportsTools && <Badge variant="success" size="sm"><Code2 className="h-2.5 w-2.5" /></Badge>}
        {model.supportsVision && <Badge variant="purple" size="sm"><Image className="h-2.5 w-2.5" /></Badge>}
        {model.supportsStreaming && <Badge variant="info" size="sm"><Zap className="h-2.5 w-2.5" /></Badge>}
      </div>

      {/* Context */}
      {model.contextWindow && (
        <div className="hidden lg:flex items-center gap-1 text-[11px] text-white/40 font-mono tabular-nums">
          <Brain className="h-3 w-3" />
          {(model.contextWindow / 1000).toFixed(0)}K
        </div>
      )}

      {/* Health dot */}
      <div className={cn("h-2 w-2 rounded-full shrink-0", health.dotColor)} title={health.label} />
    </motion.div>
  )
}

// ── Provider Group (collapsible) ──

function ProviderGroup({
  provider,
  models,
  search,
  onToggle,
  expanded,
  benchmarks,
}: {
  provider: GatewayProvider
  models: ProviderModel[]
  search: string
  onToggle: () => void
  expanded: boolean
  benchmarks: BenchmarkSummary
}) {
  const ctxAvg = models.length > 0
    ? Math.round(models.reduce((s, m) => s + (m.contextWindow || 0), 0) / models.length)
    : 0

  // Use shared benchmark data for the provider — each ModelRow also receives it
  const sharedBenchmark: ModelBenchmarkData = {
    latencyMs: benchmarks[provider.id]?.latencyMs ?? null,
    tokensPerSec: benchmarks[provider.id]?.tokensPerSec ?? null,
    ttftMs: benchmarks[provider.id]?.ttftMs ?? null,
    p50Ms: benchmarks[provider.id]?.p50Ms ?? null,
    p95Ms: benchmarks[provider.id]?.p95Ms ?? null,
    p99Ms: benchmarks[provider.id]?.p99Ms ?? null,
    samples: benchmarks[provider.id]?.samples ?? 0,
    isHealthy: benchmarks[provider.id]?.isHealthy ?? false,
    lastChecked: benchmarks[provider.id]?.lastChecked ?? 0,
    providerError: benchmarks[provider.id]?.providerError ?? null,
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.02] to-white/[0.01] overflow-hidden backdrop-blur-xl transition-all hover:border-white/10">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className={cn(
          "flex items-center justify-center h-8 w-8 rounded-lg border text-[10px] font-bold transition-colors",
          provider.isLocal
            ? "border-green-500/20 bg-green-500/10 text-green-400"
            : "border-blue-500/20 bg-blue-500/10 text-blue-400",
        )}>
          {provider.name.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{provider.name}</span>
            <Badge variant={provider.isLocal ? "info" : "default"} size="sm" className="text-[10px]">
              {provider.isLocal ? "Local" : "Remote"}
            </Badge>
            {provider.baseUrl && (
              <span className="text-[10px] text-white/20 font-mono truncate max-w-[180px] hidden sm:inline">
                {provider.baseUrl}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] text-white/30">
              {models.length} model{models.length !== 1 ? "s" : ""}
            </span>
            {ctxAvg > 0 && (
              <span className="text-[11px] text-white/20 font-mono">Avg {(ctxAvg / 1000).toFixed(0)}K ctx</span>
            )}
            <span className={cn(
              "text-[11px] flex items-center gap-1",
              sharedBenchmark.isHealthy ? "text-green-400/60" : "text-red-400/60",
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", sharedBenchmark.isHealthy ? "bg-green-400" : "bg-red-400")} />
              {sharedBenchmark.isHealthy ? "Connected" : "No data"}
            </span>
          </div>
        </div>

        <div className={cn(
          "transition-transform duration-200 text-white/20",
          expanded && "rotate-180",
        )}>
          <ChevronDown className="h-4 w-4" />
        </div>
      </button>

      {/* Model list */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 space-y-2 border-t border-white/5 pt-3">
              {models
                .filter((m) => !search || m.name.toLowerCase().includes(search))
                .map((model, i) => (
                  <ModelRow
                    key={model.id}
                    model={model}
                    providerName={provider.name}
                    benchmark={sharedBenchmark}
                    index={i}
                  />
                ))}
              {models.filter((m) => !search || m.name.toLowerCase().includes(search)).length === 0 && (
                <p className="text-xs text-white/20 text-center py-4">No models match your search</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Benchmark Card ──

function BenchmarkCard({
  provider,
  models,
  benchmark,
}: {
  provider: GatewayProvider
  models: ProviderModel[]
  benchmark: ModelBenchmarkData
}) {
  const streamingCount = models.filter((m) => m.supportsStreaming).length
  const toolCount = models.filter((m) => m.supportsTools).length
  const visionCount = models.filter((m) => m.supportsVision).length

  const metrics = [
    { label: "Models", value: models.length.toString() },
    { label: "Streaming", value: `${streamingCount}/${models.length}` },
    { label: "Tool-call", value: `${toolCount}/${models.length}` },
    { label: "Vision", value: `${visionCount}/${models.length}` },
  ]

  // Real latency range from benchmark percentiles, or fallback to single value
  const bestLatency = benchmark.p50Ms ?? benchmark.latencyMs
  const worstLatency = benchmark.p95Ms ?? benchmark.latencyMs
  // Normalize the bar width: map latency 0-5000ms → 0-100%
  const barWidth = benchmark.latencyMs !== null
    ? Math.min(100, (benchmark.latencyMs / 5000) * 100)
    : 0

  return (
    <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className={cn(
          "flex items-center justify-center h-8 w-8 rounded-lg border text-[10px] font-bold",
          provider.isLocal
            ? "border-green-500/20 bg-green-500/10 text-green-400"
            : "border-blue-500/20 bg-blue-500/10 text-blue-400",
        )}>
          {provider.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="text-sm font-semibold text-white">{provider.name}</div>
          <div className="text-[10px] text-white/30 font-mono">{provider.baseUrl}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg bg-white/[0.03] px-3 py-2">
            <div className="text-xs font-semibold text-white">{m.value}</div>
            <div className="text-[10px] text-white/30">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Real latency range from observability data */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-white/30">Avg latency</span>
          <span className="text-white/50 font-mono">
            {benchmark.latencyMs !== null ? `${benchmark.latencyMs}ms` : "—"}
            {benchmark.p95Ms !== null && ` (p95 ${benchmark.p95Ms}ms)`}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-green-500 via-amber-500 to-red-500 transition-all"
            style={{ width: `${barWidth}%` }}
          />
        </div>
        {benchmark.tokensPerSec !== null && (
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-white/30">Throughput</span>
            <span className="text-white/50 font-mono">{benchmark.tokensPerSec.toFixed(0)} tok/s</span>
          </div>
        )}
        {benchmark.ttftMs !== null && (
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-white/30">TTFT</span>
            <span className="text-white/50 font-mono">{benchmark.ttftMs.toFixed(0)}ms</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Type for the benchmark summary map ──

interface BenchmarkSummary {
  [providerId: string]: ModelBenchmarkData
}

// ── Main Component ──

export function ModelsTab() {
  const providers = useAppStore((s) => s.providers)
  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set())
  const [capFilter, setCapFilter] = useState<Capability | null>(null)
  const [sortField, setSortField] = useState<SortField>("contextWindow")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  // Real-time benchmark data from observability layer
  const { benchmarks } = useModelBenchmarks(providers)

  // Derive all models grouped by provider
  const providerModels = useMemo(() => {
    return providers
      .filter((p) => p.models.length > 0)
      .map((p) => ({ provider: p, models: [...p.models] }))
  }, [providers])

  const allModels = useMemo(() => {
    return providerModels.flatMap(({ provider, models }) =>
      models.map((m) => ({ model: m, providerName: provider.name, providerId: provider.id }))
    )
  }, [providerModels])

  // Apply filters
  const filteredGroups = useMemo(() => {
    return providerModels
      .map(({ provider, models }) => {
        let filtered = [...models]

        // Capability filter
        if (capFilter) {
          filtered = filtered.filter((m) => m[capFilter])
        }

        // Sort
        filtered.sort((a, b) => {
          let cmp = 0
          if (sortField === "contextWindow") {
            cmp = (a.contextWindow || 0) - (b.contextWindow || 0)
          } else if (sortField === "name") {
            cmp = a.name.localeCompare(b.name)
          }
          return sortDir === "desc" ? -cmp : cmp
        })

        return { provider, models: filtered }
      })
      .filter(({ models }) => models.length > 0)
  }, [providerModels, search, capFilter, sortField, sortDir])

  // Stats
  const totalModels = allModels.length
  const totalProviders = providers.filter((p) => p.models.length > 0).length
  const avgContext = totalModels > 0
    ? Math.round(allModels.reduce((s, e) => s + (e.model.contextWindow || 0), 0) / totalModels / 1000)
    : 0
  const toolsModels = allModels.filter((e) => e.model.supportsTools).length
  const visionModels = allModels.filter((e) => e.model.supportsVision).length
  const streamingModels = allModels.filter((e) => e.model.supportsStreaming).length
  const configuredProviders = providers.filter((p) => p.apiKey).length

  const toggleProvider = (id: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white tracking-tight">Model Registry & Benchmark</h2>
          <p className="text-sm text-white/40">Models are auto-discovered from connected providers</p>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Models", value: totalModels.toString(), icon: Box, color: "text-blue-400" },
          { label: "Avg Context", value: totalModels > 0 ? `${avgContext}K` : "0", icon: Brain, color: "text-green-400" },
          { label: "Tool-Capable", value: toolsModels.toString(), icon: Code2, color: "text-amber-400", sub: `${totalModels > 0 ? Math.round((toolsModels / totalModels) * 100) : 0}%` },
          { label: "Vision-Capable", value: visionModels.toString(), icon: Image, color: "text-purple-400", sub: `${totalModels > 0 ? Math.round((visionModels / totalModels) * 100) : 0}%` },
          { label: "Streaming", value: streamingModels.toString(), icon: Activity, color: "text-cyan-400", sub: `${totalModels > 0 ? Math.round((streamingModels / totalModels) * 100) : 0}%` },
          { label: "Providers", value: `${configuredProviders}/${totalProviders}`, icon: Network, color: "text-pink-400", sub: `${totalProviders > 0 ? Math.round((configuredProviders / totalProviders) * 100) : 0}% configured` },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-1">                    <span className="text-2xl font-bold text-white">{stat.value}</span>
                    <Icon className={cn("h-4 w-4 opacity-50", stat.color)} />
              </div>
              <p className="text-xs text-white/40">{stat.label}</p>
              {stat.sub && <p className="text-[9px] text-white/20 font-mono mt-0.5">{stat.sub}</p>}
            </div>
          )
        })}
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models..."
            className="w-full h-10 rounded-xl border border-white/5 bg-white/[0.03] pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/20 focus:border-white/10 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Capability Filter */}
        <div className="flex gap-1">
          {CAP_OPTIONS.map((cap) => {
            const Icon = cap.icon
            const active = capFilter === cap.key
            return (
              <button
                key={cap.key}
                onClick={() => setCapFilter(active ? null : cap.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all border",
                  active
                    ? "bg-white/10 text-white border-white/10"
                    : "text-white/30 hover:text-white/50 border-transparent hover:border-white/10",
                )}
              >
                <Icon className={cn("h-3 w-3", active ? cap.color : "")} />
                {cap.label}
              </button>
            )
          })}
        </div>

        <div className="flex-1" />

        {/* View Mode */}
        <div className="flex items-center border border-white/5 rounded-lg overflow-hidden">
          {(["grid", "list", "benchmark"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-all",
                viewMode === mode ? "bg-white/10 text-white" : "text-white/30 hover:text-white/50",
              )}
            >
              {mode === "grid" ? "Grid" : mode === "list" ? "Grouped" : "Benchmark"}
            </button>
          ))}
        </div>
      </div>

      {/* Sort Controls (list view) */}
      {viewMode === "list" && (
        <div className="flex items-center gap-4 px-1">
          <span className="text-[10px] text-white/20 font-medium uppercase tracking-wider">Sort by</span>
          {(["name", "contextWindow"] as const).map((field) => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className={cn(
                "flex items-center gap-1 text-[11px] font-medium transition-colors",
                sortField === field ? "text-white/70" : "text-white/30 hover:text-white/50",
              )}
            >
              {field === "name" ? "Name" : "Context Window"}
              {sortField === field && (
                sortDir === "desc" ? <SortDesc className="h-3 w-3" /> : <SortAsc className="h-3 w-3" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Grid View */}
      {viewMode === "grid" && (
        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {allModels
              .filter((entry) => {
                if (capFilter && !entry.model[capFilter]) return false
                if (!search) return true
                const q = search.toLowerCase()
                return entry.model.name.toLowerCase().includes(q) || entry.providerName.toLowerCase().includes(q)
              })
              .sort((a, b) => {
                let cmp = 0
                if (sortField === "contextWindow") {
                  cmp = (a.model.contextWindow || 0) - (b.model.contextWindow || 0)
                } else if (sortField === "name") {
                  cmp = a.model.name.localeCompare(b.model.name)
                }
                return sortDir === "desc" ? -cmp : cmp
              })
              .map((entry) => {
                const bench = benchmarks[entry.providerId] ?? {
                  latencyMs: null,
                  tokensPerSec: null,
                  ttftMs: null,
                  p50Ms: null,
                  p95Ms: null,
                  p99Ms: null,
                  samples: 0,
                  isHealthy: false,
                  lastChecked: 0,
                  providerError: null,
                }
                return (
                  <motion.div
                    key={`${entry.providerId}-${entry.model.id}`}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="group relative rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl transition-all hover:border-white/10"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-white">{entry.model.name}</h3>
                        </div>
                        <p className="text-xs text-white/40 mt-0.5">{entry.providerName}</p>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-white/20 font-mono">
                        <Clock className="h-3 w-3" />
                        {bench.latencyMs !== null ? `${bench.latencyMs}ms` : "—"}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {entry.model.supportsTools && <Badge variant="success" size="sm"><Code2 className="h-2.5 w-2.5 mr-0.5" />Tools</Badge>}
                      {entry.model.supportsVision && <Badge variant="purple" size="sm"><Image className="h-2.5 w-2.5 mr-0.5" />Vision</Badge>}
                      {entry.model.supportsStreaming && <Badge variant="info" size="sm"><Zap className="h-2.5 w-2.5 mr-0.5" />Streaming</Badge>}
                      {entry.model.contextWindow && (
                        <Badge variant="default" size="sm">
                          <Brain className="h-2.5 w-2.5 mr-0.5" />{(entry.model.contextWindow / 1000).toFixed(0)}K ctx
                        </Badge>
                      )}
                    </div>

                    {/* Mini benchmark bar from real observability data */}
                    <div className="flex items-center gap-3 text-[10px] text-white/20">
                      <span className="flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        {bench.tokensPerSec !== null ? `${bench.tokensPerSec.toFixed(0)}/s` : "—"}
                      </span>
                      <span className="flex items-center gap-1">
                        <MoveRight className="h-3 w-3" />
                        {bench.ttftMs !== null ? `${bench.ttftMs.toFixed(0)}ms` : "—"}
                      </span>
                      {bench.samples > 0 && (
                        <span className="text-white/10 text-[9px]">n={bench.samples}</span>
                      )}
                    </div>
                  </motion.div>
                )
              })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* List (Grouped) View */}
      {viewMode === "list" && (
        <div className="space-y-4">
          {filteredGroups.map(({ provider, models }) => (
            <ProviderGroup
              key={provider.id}
              provider={provider}
              models={models}
              search={search}
              expanded={expandedProviders.has(provider.id)}
              onToggle={() => toggleProvider(provider.id)}
              benchmarks={benchmarks}
            />
          ))}
          {filteredGroups.length === 0 && (
            <div className="text-center py-12">
              <Box className="h-8 w-8 text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/30">
                {providers.length === 0 ? "No providers configured yet" : "No models match your filters"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Benchmark View */}
      {viewMode === "benchmark" && (
        <div>
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-medium text-white/80">Provider Benchmark Comparison</h3>
            <span className="text-[10px] text-white/20 ml-auto">Latency data from recent stream sessions & health checks</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {providers
              .filter((p) => p.models.length > 0)
              .map((p) => {
                const bench = benchmarks[p.id] ?? {
                  latencyMs: null,
                  tokensPerSec: null,
                  ttftMs: null,
                  p50Ms: null,
                  p95Ms: null,
                  p99Ms: null,
                  samples: 0,
                  isHealthy: false,
                  lastChecked: 0,
                  providerError: null,
                }
                return (
                  <BenchmarkCard key={p.id} provider={p} models={p.models} benchmark={bench} />
                )
              })}
          </div>

          {providers.filter((p) => p.models.length > 0).length === 0 && (
            <div className="text-center py-12">
              <BarChart3 className="h-8 w-8 text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/30">Connect providers with models to see benchmark comparisons</p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {providers.length === 0 && (
        <div className="text-center py-12">
          <Box className="h-8 w-8 text-white/10 mx-auto mb-3" />
          <p className="text-sm text-white/30">No providers configured yet. Add a provider in the Providers tab to discover models.</p>
        </div>
      )}
    </div>
  )
}
