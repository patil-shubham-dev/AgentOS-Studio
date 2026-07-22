import { useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useUsageStore, type TimeRange } from "@/stores/telemetry/usage-store"
import {
  Activity, Terminal, Wrench, FileText, Sparkles, DollarSign,
  Clock,
} from "lucide-react"

const timeRangeOptions: { label: string; value: TimeRange; hours: number }[] = [
  { label: "24h", value: "24h", hours: 24 },
  { label: "7d", value: "7d", hours: 168 },
  { label: "30d", value: "30d", hours: 720 },
  { label: "All", value: "all", hours: 0 },
]

function formatTokens(tokens: number): string {
  if (tokens < 1000) return tokens.toLocaleString()
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`
  return `${(tokens / 1000000).toFixed(2)}M`
}

function formatCost(cost: number): string {
  if (cost < 0.0001) return "$0.00"
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  if (cost < 1) return `$${cost.toFixed(3)}`
  return `$${cost.toFixed(2)}`
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getTimeRangeHours(range: TimeRange): number {
  const opt = timeRangeOptions.find(o => o.value === range)
  return opt?.hours ?? 24
}

interface StatCardProps {
  icon: React.ElementType
  label: string
  value: string
  subtitle?: string
  gradient: string
  iconColor: string
}

function StatCard({ icon: Icon, label, value, subtitle, gradient, iconColor }: StatCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={cn(
        "rounded-2xl border border-white/5 p-4 backdrop-blur-xl relative overflow-hidden group cursor-default",
        gradient,
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">{label}</p>
          <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
          {subtitle && <p className="text-[10px] text-white/30">{subtitle}</p>}
        </div>
        <div className={cn("rounded-xl p-2.5 bg-white/[0.03] border border-white/5", iconColor)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </motion.div>
  )
}

export function UsageTab() {
  const lastRefresh = useUsageStore(s => s.lastRefresh)
  const timeRange = useUsageStore(s => s.timeRange)
  const setTimeRange = useUsageStore(s => s.setTimeRange)
  const refresh = useUsageStore(s => s.refresh)
  const getSessionStats = useUsageStore(s => s.getSessionStats)
  const getTokenUsage = useUsageStore(s => s.getTokenUsage)
  const getCostData = useUsageStore(s => s.getCostData)
  const getTopModels = useUsageStore(s => s.getTopModels)
  const getActivityTimeline = useUsageStore(s => s.getActivityTimeline)

  useEffect(() => {
    refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sessionStats = useMemo(() => getSessionStats(), [lastRefresh]) // eslint-disable-line react-hooks/exhaustive-deps
  const tokenUsage = useMemo(() => getTokenUsage(), [lastRefresh]) // eslint-disable-line react-hooks/exhaustive-deps
  const costData = useMemo(() => getCostData(), [lastRefresh]) // eslint-disable-line react-hooks/exhaustive-deps
  const topModels = useMemo(() => getTopModels(), [lastRefresh]) // eslint-disable-line react-hooks/exhaustive-deps
  const activityEvents = useMemo(() => getActivityTimeline(getTimeRangeHours(timeRange)), [lastRefresh, timeRange]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasData = sessionStats.totalSessions > 0 || sessionStats.totalToolCalls > 0 || tokenUsage.totalTokens > 0

  const totalTokenCount = tokenUsage.totalTokens
  const tokenModels = Object.entries(tokenUsage.tokensByModel).sort(([, a], [, b]) => b - a)

  const costProviders = Object.entries(costData.costByProvider).sort(([, a], [, b]) => b - a)

  const eventIcons: Record<string, React.ElementType> = {
    session_start: Activity,
    tool_call: Wrench,
    file_edit: FileText,
    command_run: Terminal,
    completion_generated: Sparkles,
  }

  const eventColors: Record<string, string> = {
    session_start: "text-blue-400",
    tool_call: "text-yellow-400",
    file_edit: "text-green-400",
    command_run: "text-purple-400",
    completion_generated: "text-cyan-400",
  }

  if (!hasData) {
    return (
      <div className="space-y-8">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white tracking-tight">Usage & Analytics</h2>
          <p className="text-sm text-white/40">Session statistics, token usage, API costs, and activity metrics</p>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex flex-col items-center justify-center py-24 gap-4"
        >
          <motion.div
            animate={{ scale: [1, 1.05, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <Activity className="h-12 w-12 text-white/10" />
          </motion.div>
          <p className="text-sm text-white/30 text-center max-w-xs">
            Start using AgenticOS to see usage analytics
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white tracking-tight">Usage & Analytics</h2>
          <p className="text-sm text-white/40">Session statistics, token usage, API costs, and activity metrics</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-1">
          {timeRangeOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTimeRange(opt.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                timeRange === opt.value
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.03]",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          icon={Activity}
          label="Total Sessions"
          value={sessionStats.totalSessions.toLocaleString()}
          gradient="bg-gradient-to-br from-blue-500/[0.08] to-blue-500/[0.02]"
          iconColor="text-blue-400"
        />
        <StatCard
          icon={Clock}
          label="Active Sessions"
          value={sessionStats.activeSessions.toLocaleString()}
          gradient="bg-gradient-to-br from-green-500/[0.08] to-green-500/[0.02]"
          iconColor="text-green-400"
        />
        <StatCard
          icon={Wrench}
          label="Total Tool Calls"
          value={sessionStats.totalToolCalls.toLocaleString()}
          gradient="bg-gradient-to-br from-yellow-500/[0.08] to-yellow-500/[0.02]"
          iconColor="text-yellow-400"
        />
        <StatCard
          icon={FileText}
          label="Files Edited"
          value={sessionStats.totalFilesEdited.toLocaleString()}
          gradient="bg-gradient-to-br from-purple-500/[0.08] to-purple-500/[0.02]"
          iconColor="text-purple-400"
        />
        <StatCard
          icon={Sparkles}
          label="Tokens Consumed"
          value={formatTokens(tokenUsage.totalTokens)}
          subtitle={tokenUsage.avgTokensPerSession > 0 ? `avg ${formatTokens(tokenUsage.avgTokensPerSession)}/session` : undefined}
          gradient="bg-gradient-to-br from-cyan-500/[0.08] to-cyan-500/[0.02]"
          iconColor="text-cyan-400"
        />
        <StatCard
          icon={DollarSign}
          label="Estimated Cost"
          value={formatCost(costData.totalCost)}
          subtitle={costData.projectedMonthly > 0 ? `proj. ${formatCost(costData.projectedMonthly)}/mo` : undefined}
          gradient="bg-gradient-to-br from-rose-500/[0.08] to-rose-500/[0.02]"
          iconColor="text-rose-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl">
          <h3 className="text-sm font-medium text-white/80 mb-1">Token Usage</h3>
          <p className="text-xs text-white/30 mb-4">
            {formatTokens(totalTokenCount)} total tokens consumed
            {tokenUsage.avgTokensPerSession > 0 ? ` · avg ${formatTokens(tokenUsage.avgTokensPerSession)}/session` : ""}
          </p>
          {tokenModels.length === 0 ? (
            <p className="text-xs text-white/20 py-4 text-center">No token data yet</p>
          ) : (
            <div className="space-y-3">
              {tokenModels.map(([model, tokens]) => {
                const pct = totalTokenCount > 0 ? (tokens / totalTokenCount) * 100 : 0
                return (
                  <motion.div
                    key={model}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 25 }}
                    className="space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/60 truncate max-w-[200px]">{model}</span>
                      <span className="text-white/30">{pct.toFixed(1)}% · {formatTokens(tokens)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                      <motion.div
                        layout
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.1 }}
                        className="h-full rounded-full bg-gradient-to-r from-blue-500/60 to-cyan-500/60"
                      />
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl">
          <h3 className="text-sm font-medium text-white/80 mb-1">Cost Breakdown</h3>
          <p className="text-xs text-white/30 mb-4">
            Total: {formatCost(costData.totalCost)} · Projected monthly: {formatCost(costData.projectedMonthly)}
          </p>
          {costProviders.length === 0 ? (
            <p className="text-xs text-white/20 py-4 text-center">No cost data yet</p>
          ) : (
            <div className="space-y-3">
              {costProviders.map(([provider, cost], idx) => {
                const maxCost = costProviders[0][1]
                const pct = maxCost > 0 ? (cost / maxCost) * 100 : 0
                const colors = [
                  "from-blue-500/60 to-blue-400/40",
                  "from-purple-500/60 to-purple-400/40",
                  "from-green-500/60 to-green-400/40",
                  "from-orange-500/60 to-orange-400/40",
                  "from-rose-500/60 to-rose-400/40",
                  "from-cyan-500/60 to-cyan-400/40",
                ]
                return (
                  <motion.div
                    key={provider}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 25, delay: idx * 0.05 }}
                    className="space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/60">{provider}</span>
                      <span className="text-white/30">{formatCost(cost)}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/[0.05] overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.1 + idx * 0.05 }}
                        className={cn("h-full rounded-full bg-gradient-to-r", colors[idx % colors.length])}
                      />
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl">
        <h3 className="text-sm font-medium text-white/80 mb-4">Activity Timeline</h3>
        {activityEvents.length === 0 ? (
          <p className="text-xs text-white/20 py-4 text-center">No activity in this time range</p>
        ) : (
          <div className="space-y-1">
            {activityEvents.slice(0, 30).map((event) => {
              const Icon = eventIcons[event.type] || Activity
              const color = eventColors[event.type] || "text-white/40"
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-white/[0.02] transition-colors group"
                >
                  <div className={cn("rounded-lg p-1.5 bg-white/[0.03]", color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="flex-1 text-xs text-white/60 truncate group-hover:text-white/80 transition-colors">
                    {event.description}
                  </span>
                  <span className="text-[10px] text-white/20 font-mono whitespace-nowrap">
                    {relativeTime(event.timestamp)}
                  </span>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-white/80">Top Models</h3>
          <span className="text-[10px] text-white/20">by token consumption</span>
        </div>
        {topModels.length === 0 ? (
          <p className="text-xs text-white/20 py-4 text-center">No model data yet</p>
        ) : (
          <div className="space-y-2">
            {topModels.map((model, idx) => {
              const totalTokensAll = topModels.reduce((s, m) => s + m.tokens, 0)
              const pct = totalTokensAll > 0 ? (model.tokens / totalTokensAll) * 100 : 0
              return (
                <motion.div
                  key={model.model}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-[10px] font-mono text-white/20 w-4">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/70 truncate">{model.model}</span>
                      <span className="text-[10px] text-white/30 font-mono">{formatTokens(model.tokens)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.1 + idx * 0.03 }}
                          className="h-full rounded-full bg-gradient-to-r from-blue-500/50 to-purple-500/50"
                        />
                      </div>
                      <span className="text-[9px] text-white/20 font-mono">{model.calls} calls</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-rose-400/60 font-mono">{formatCost(model.cost)}</span>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
