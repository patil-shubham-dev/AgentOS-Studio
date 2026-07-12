import { useState, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { safeCapitalize } from "@/lib/safeCapitalize"
import { getAllMetrics, getMetricsByDomain, getMetricSnapshot, type MetricDefinition } from "@/lib/metrics"
import { getTelemetryStats, getTelemetryEvents, onTelemetry } from "@/lib/telemetry"
import { ObservabilityManager } from "@/runtime/observability/ObservabilityManager"
import { useLeakTracker } from "@/performance/leak-detector"
import {
  BarChart3,
  Activity,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  RefreshCw,
  Loader2,
  Braces,
  Terminal,
  Globe,
  Shield,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Network,
} from "lucide-react"

type MetricCard = {
  label: string
  value: string | number
  trend?: "up" | "down" | "neutral"
  change?: string
  icon: typeof Activity
  color: string
  domain: string
}

interface HealthStatus {
  status: "healthy" | "degraded" | "failed"
  subsystems: Record<string, "healthy" | "degraded" | "failed">
  metrics: Record<string, number>
}

const DOMAIN_CONFIGS: Record<string, { icon: typeof Activity; color: string }> = {
  system: { icon: Cpu, color: "text-blue-400" },
  execution: { icon: Terminal, color: "text-cyan-400" },
  agent: { icon: Braces, color: "text-purple-400" },
  browser: { icon: Globe, color: "text-violet-400" },
  search: { icon: Activity, color: "text-amber-400" },
  persistence: { icon: Database, color: "text-green-400" },
  security: { icon: Shield, color: "text-red-400" },
  network: { icon: Network, color: "text-sky-400" },
  tool: { icon: Zap, color: "text-orange-400" },
}

export function PerformanceDashboardPage() {
  useLeakTracker("PerformanceDashboardPage")
  const [metrics, setMetrics] = useState<MetricDefinition[]>([])
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [telemetryCounts, setTelemetryCounts] = useState<Record<string, number>>({})
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(Date.now())
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [histogramExpanded, setHistogramExpanded] = useState(false)

  const obsManager = ObservabilityManager.getInstance()

  const refresh = useCallback(async () => {
    setRefreshing(true)

    const allMetrics = getAllMetrics()
    setMetrics(allMetrics)

    const telemetryStats = getTelemetryStats()
    setTelemetryCounts(telemetryStats)

    try {
      const healthResult = await obsManager.healthCheck()
      setHealth(healthResult)
    } catch {
      // health check not always available
    }

    setLastRefresh(Date.now())
    setRefreshing(false)
  }, [obsManager])

  // Initial load
  useEffect(() => {
    refresh()
  }, [refresh])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, refresh])

  // Subscribe to telemetry events
  useEffect(() => {
    const unsub = onTelemetry(() => {
      setTelemetryCounts(getTelemetryStats())
    })
    return unsub
  }, [])

  // Build metric cards from raw metrics
  const metricCards = useMemo((): MetricCard[] => {
    const cards: MetricCard[] = []
    const filtered = selectedDomain
      ? metrics.filter((m) => m.domain === selectedDomain)
      : metrics

    for (const m of filtered) {
      const domainConfig = DOMAIN_CONFIGS[m.domain] ?? { icon: Activity, color: "text-white" }
      const v = m.value
      if (v.type === "counter") {
        cards.push({
          label: m.name,
          value: v.value.toLocaleString(),
          icon: domainConfig.icon,
          color: domainConfig.color,
          domain: m.domain,
        })
      } else if (v.type === "gauge") {
        cards.push({
          label: m.name,
          value: v.value.toLocaleString(),
          icon: domainConfig.icon,
          color: domainConfig.color,
          domain: m.domain,
        })
      } else if (v.type === "histogram") {
        cards.push({
          label: m.name,
          value: `${v.count.toLocaleString()} samples`,
          icon: domainConfig.icon,
          color: domainConfig.color,
          domain: m.domain,
        })
      }
    }
    return cards
  }, [metrics, selectedDomain])

  // Build telemetry cards
  const telemetryCards = useMemo((): MetricCard[] => {
    return Object.entries(telemetryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({
        label: name,
        value: count.toLocaleString(),
        icon: AlertTriangle,
        color: "text-amber-400",
        domain: "telemetry",
      }))
  }, [telemetryCounts])

  // All unique domains
  const domains = useMemo(() => {
    const set = new Set(metrics.map((m) => m.domain))
    return Array.from(set).sort()
  }, [metrics])

  // Histogram metrics with detailed data
  const histogramMetrics = useMemo(() => {
    return metrics.filter((m) => m.value.type === "histogram")
  }, [metrics])

  const statusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-green-400 bg-green-500/10 border-green-500/20"
      case "degraded":
        return "text-amber-400 bg-amber-500/10 border-amber-500/20"
      case "failed":
        return "text-red-400 bg-red-500/10 border-red-500/20"
      default:
        return "text-white/30 bg-white/[0.02] border-white/[0.06]"
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface-app)]">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-white/10">
              <BarChart3 className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Performance Dashboard</h1>
              <p className="text-sm text-white/40 mt-0.5">
                Live metrics, health status, and operational telemetry
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Health badge */}
            {health && (
              <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium", statusColor(health.status))}>
                {health.status === "healthy" ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : health.status === "degraded" ? (
                  <AlertTriangle className="h-3 w-3" />
                ) : (
                  <AlertTriangle className="h-3 w-3" />
                )}
                {safeCapitalize(health.status)}
              </div>
            )}

            <label className="flex items-center gap-1.5 text-[10px] text-white/30 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-white/20 bg-white/5"
              />
              Auto-refresh
            </label>

            <button
              onClick={refresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-white/50 hover:text-white/70 transition-all disabled:opacity-40"
            >
              <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        {/* Domain filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setSelectedDomain(null)}
            className={cn(
              "px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all",
              selectedDomain === null
                ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                : "bg-white/[0.02] text-white/30 border-white/[0.06] hover:text-white/50 hover:border-white/10",
            )}
          >
            All
          </button>
          {domains.map((domain) => (
            <button
              key={domain}
              onClick={() => setSelectedDomain(domain === selectedDomain ? null : domain)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all",
                selectedDomain === domain
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  : "bg-white/[0.02] text-white/30 border-white/[0.06] hover:text-white/50 hover:border-white/10",
              )}
            >
              {domain}
            </button>
          ))}
        </div>

        {/* Metric cards grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-white/70">Metrics</h2>
            <span className="text-[9px] text-white/20">{metricCards.length} metric(s) · Last refresh {Math.round((Date.now() - lastRefresh) / 1000)}s ago</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {metricCards.slice(0, 30).map((card, i) => {
              const Icon = card.icon
              return (
                <motion.div
                  key={`${card.domain}-${card.label}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02, duration: 0.2 }}
                  className="border border-white/[0.06] rounded-xl p-3 bg-black/20 hover:bg-black/40 transition-colors"
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon className={cn("h-3 w-3", card.color)} />
                    <span className="text-[8px] text-white/20 uppercase tracking-wider truncate">
                      {card.domain}
                    </span>
                  </div>
                  <p className="text-[9px] text-white/40 truncate mb-1">{card.label}</p>
                  <p className="text-lg font-bold text-white/90 tabular-nums">{card.value}</p>
                </motion.div>
              )
            })}
            {metricCards.length === 0 && (
              <div className="col-span-full flex items-center justify-center py-12 text-center">
                <div>
                  <BarChart3 className="h-8 w-8 text-white/10 mx-auto mb-2" />
                  <p className="text-xs text-white/30">No metrics collected yet</p>
                  <p className="text-[10px] text-white/20 mt-1">Metrics appear as agents execute tasks</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Histogram details section */}
        {histogramMetrics.length > 0 && (
          <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-black/20">
            <button
              onClick={() => setHistogramExpanded((v) => !v)}
              className="flex items-center justify-between w-full px-4 py-3 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-white/30" />
                <span className="text-xs font-semibold text-white/70">Histogram Details</span>
                <span className="text-[9px] text-white/20">({histogramMetrics.length} metrics)</span>
              </div>
              {histogramExpanded ? (
                <ArrowUpRight className="h-3 w-3 text-white/20 rotate-90" />
              ) : (
                <ArrowDownRight className="h-3 w-3 text-white/20" />
              )}
            </button>

            {histogramExpanded && (
              <div className="border-t border-white/[0.04] px-4 py-3 space-y-3">
                {histogramMetrics.map((m) => {
                  if (m.value.type !== "histogram") return null
                  const h = m.value
                  const avg = h.count > 0 ? h.sum / h.count : 0
                  const sorted = [...h.samples].sort((a, b) => a - b)
                  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0
                  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
                  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0

                  return (
                    <div key={m.name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-white/50">{m.name}</span>
                        <span className="text-[9px] text-white/20">{h.count} samples</span>
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {[
                          { label: "Avg", value: avg.toFixed(1) },
                          { label: "Min", value: h.min.toFixed(1) },
                          { label: "P50", value: p50.toFixed(1) },
                          { label: "P95", value: p95.toFixed(1) },
                          { label: "Max", value: h.max.toFixed(1) },
                        ].map((stat) => (
                          <div key={stat.label} className="bg-white/[0.02] rounded-lg px-2 py-1.5 text-center">
                            <span className="text-[7px] text-white/20 uppercase block">{stat.label}</span>
                            <span className="text-[10px] font-mono text-white/60 font-bold">{stat.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Subsystem health */}
        {health && Object.keys(health.subsystems).length > 0 && (
          <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-black/20">
            <div className="px-4 py-3 border-b border-white/[0.04] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-white/30" />
                <span className="text-xs font-semibold text-white/70">System Health</span>
              </div>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {Object.entries(health.subsystems).map(([subsystem, status]) => (
                <div key={subsystem} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        status === "healthy"
                          ? "bg-green-500"
                          : status === "degraded"
                            ? "bg-amber-500"
                            : "bg-red-500",
                      )}
                    />
                    <span className="text-xs text-white/60">{subsystem}</span>
                  </div>
                  <span className={cn("text-[10px] font-medium", statusColor(status))}>
                    {safeCapitalize(status)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Telemetry events summary */}
        {telemetryCards.length > 0 && (
          <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-black/20">
            <div className="px-4 py-3 border-b border-white/[0.04] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-white/30" />
                <span className="text-xs font-semibold text-white/70">Telemetry Events</span>
                <span className="text-[9px] text-white/20">
                  ({Object.values(telemetryCounts).reduce((a, b) => a + b, 0)} total)
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1 p-2">
              {telemetryCards.map((card) => (
                <div
                  key={card.label}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-[9px] text-white/40 truncate">{card.label}</span>
                  <span className="text-[10px] font-mono text-white/70 font-bold ml-2">{card.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last refresh info */}
        <div className="flex items-center justify-center gap-2 text-[9px] text-white/15">
          <Clock className="h-2.5 w-2.5" />
          Last refreshed: {new Date(lastRefresh).toLocaleTimeString()}
          <span className="text-white/10">·</span>
          {metrics.length} metric(s) · {Object.keys(telemetryCounts).length} telemetry type(s)
          {health && (
            <>
              <span className="text-white/10">·</span>
              {Object.keys(health.subsystems).length} subsystem(s)
            </>
          )}
        </div>
      </div>
    </div>
  )
}
