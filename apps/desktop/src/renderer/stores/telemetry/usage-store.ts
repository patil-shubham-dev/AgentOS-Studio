import { create } from "zustand"
import { getAllMetrics, type MetricDefinition } from "@/lib/telemetry/metrics"
import { getTelemetryEvents } from "@/lib/telemetry"
import { getTelemetryBuffer } from "@/runtime/services/RuntimeTelemetry"
import { CostTracker } from "@/runtime/cost/CostTracker"
import { startPeriodicSampling } from "@/lib/domain-telemetry"

export interface SessionStats {
  totalSessions: number
  activeSessions: number
  avgSessionDuration: number
  totalToolCalls: number
  totalFilesEdited: number
  totalCommandsRun: number
}

export interface TokenUsage {
  totalTokens: number
  tokensByModel: Record<string, number>
  tokensByProvider: Record<string, number>
  avgTokensPerSession: number
}

export interface CostData {
  totalCost: number
  costByProvider: Record<string, number>
  costByDay: { date: string; cost: number }[]
  projectedMonthly: number
}

export interface TopModel {
  model: string
  tokens: number
  cost: number
  calls: number
}

export type ActivityEventType = "session_start" | "tool_call" | "file_edit" | "command_run" | "completion_generated"

export interface ActivityEvent {
  id: string
  type: ActivityEventType
  timestamp: number
  description: string
}

export type TimeRange = "24h" | "7d" | "30d" | "all"

interface UsageStore {
  lastRefresh: number
  timeRange: TimeRange
  setTimeRange: (range: TimeRange) => void
  refresh: () => void
  getSessionStats: () => SessionStats
  getTokenUsage: () => TokenUsage
  getCostData: () => CostData
  getTopModels: () => TopModel[]
  getActivityTimeline: (hours: number) => ActivityEvent[]
}

function findMetric(name: string, domain: string): MetricDefinition | undefined {
  return getAllMetrics().find(m => m.name === name && m.domain === domain)
}

function getCounterValue(name: string, domain: string): number {
  const m = findMetric(name, domain)
  if (m?.value.type === "counter") return m.value.value
  return 0
}

function getGaugeValue(name: string, domain: string): number {
  const m = findMetric(name, domain)
  if (m?.value.type === "gauge") return m.value.value
  return 0
}

function getHistogramAvg(name: string, domain: string): number {
  const m = findMetric(name, domain)
  if (m?.value.type === "histogram" && m.value.count > 0) return m.value.sum / m.value.count
  return 0
}

export const useUsageStore = create<UsageStore>((set) => {
  const costTracker = CostTracker.getInstance()

  function computeSessionStats(): SessionStats {
    const totalSessions = costTracker.getSummary().sessionCount
    const activeSessions = getGaugeValue("agent_sessions_active", "agent")
    const avgDurationMs = getHistogramAvg("agent_latency_ms", "agent")
    const totalToolCalls = getCounterValue("tool_total", "tool")

    const events = getTelemetryEvents()
    const runtimePoints = getTelemetryBuffer()

    const allPoints = [
      ...events.map(e => ({ stage: e.type, timestamp: e.timestamp, metadata: e.metadata })),
      ...runtimePoints.map(p => ({ stage: p.stage, timestamp: p.timestamp, metadata: p.metadata })),
    ]

    const fileEditCount = allPoints.filter(p => {
      if (p.stage === "tool_success" || p.stage === "execution_complete") {
        const tn = p.metadata?.toolName
        if (typeof tn === "string") return tn.toLowerCase().includes("write") || tn.toLowerCase().includes("edit") || tn.toLowerCase().includes("rename")
      }
      return false
    }).length

    const commandRunCount = allPoints.filter(p => {
      if (p.stage === "tool_success" || p.stage === "execution_complete") {
        const tn = p.metadata?.toolName
        if (typeof tn === "string") return tn.toLowerCase().includes("bash") || tn.toLowerCase().includes("command") || tn.toLowerCase().includes("terminal")
      }
      return p.stage === "command_run"
    }).length

    return {
      totalSessions,
      activeSessions,
      avgSessionDuration: Math.round(avgDurationMs / 1000),
      totalToolCalls,
      totalFilesEdited: fileEditCount,
      totalCommandsRun: commandRunCount,
    }
  }

  function computeTokenUsage(): TokenUsage {
    const summary = costTracker.getSummary()
    const totalTokens = getCounterValue("agent_tokens_total", "agent")

    const tokensByModel: Record<string, number> = {}
    for (const [model, info] of Object.entries(summary.modelBreakdown)) {
      tokensByModel[model] = info.tokens
    }

    const tokensByProvider: Record<string, number> = {}
    for (const [provider, info] of Object.entries(summary.providerBreakdown)) {
      tokensByProvider[provider] = info.tokens
    }

    const sessions = summary.sessionCount || 1

    return {
      totalTokens: Math.max(totalTokens, summary.totalTokens),
      tokensByModel,
      tokensByProvider,
      avgTokensPerSession: Math.round(Math.max(totalTokens, summary.totalTokens) / sessions),
    }
  }

  function computeCostData(): CostData {
    const summary = costTracker.getSummary()

    const costByProvider: Record<string, number> = {}
    for (const [provider, info] of Object.entries(summary.providerBreakdown)) {
      costByProvider[provider] = info.cost
    }

    const recentSessions = costTracker.getRecentSessions(200)
    const dailyMap = new Map<string, number>()
    for (const session of recentSessions) {
      for (const entry of session.entries) {
        const day = new Date(entry.timestamp).toISOString().slice(0, 10)
        dailyMap.set(day, (dailyMap.get(day) ?? 0) + entry.cost)
      }
    }
    const costByDay = Array.from(dailyMap.entries())
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const now = Date.now()
    const dayMs = 86400000
    let thisMonthCost = 0
    const monthStart = now - dayMs * 30
    for (const session of recentSessions) {
      for (const entry of session.entries) {
        if (entry.timestamp >= monthStart) thisMonthCost += entry.cost
      }
    }
    const projectedMonthly = thisMonthCost

    return {
      totalCost: summary.totalCost,
      costByProvider,
      costByDay,
      projectedMonthly,
    }
  }

  function computeTopModels(): TopModel[] {
    const summary = costTracker.getSummary()
    return Object.entries(summary.modelBreakdown)
      .map(([model, info]) => ({ model, tokens: info.tokens, cost: info.cost, calls: info.calls }))
      .sort((a, b) => b.tokens - a.tokens)
  }

  function computeActivityTimeline(hours: number): ActivityEvent[] {
    const since = hours === 0 ? 0 : Date.now() - hours * 3600000

    const events: ActivityEvent[] = []
    let idCounter = 0

    const costEntries = costTracker.getRecentSessions(100)
    for (const session of costEntries) {
      for (const entry of session.entries) {
        if (entry.timestamp < since) continue
        events.push({
          id: `cost-${++idCounter}`,
          type: "completion_generated",
          timestamp: entry.timestamp,
          description: `${entry.model} — ${costTracker.formatTokens(entry.totalTokens)} tokens (${costTracker.formatCost(entry.cost)})`,
        })
      }
    }

    const telemetryEvents = getTelemetryEvents()
    for (const e of telemetryEvents) {
      if (e.timestamp < since) continue
      if (e.type === "execution_complete" && e.metadata?.stage === "tool_success") {
        const toolName = e.metadata?.toolName
        if (typeof toolName === "string") {
          const toolType: ActivityEventType = toolName.toLowerCase().includes("write") || toolName.toLowerCase().includes("edit") || toolName.toLowerCase().includes("rename")
            ? "file_edit"
            : toolName.toLowerCase().includes("bash") || toolName.toLowerCase().includes("command") || toolName.toLowerCase().includes("terminal")
              ? "command_run"
              : "tool_call"
          events.push({
            id: `tel-${++idCounter}`,
            type: toolType,
            timestamp: e.timestamp,
            description: toolType === "file_edit" ? `Edited file via ${toolName}` : toolType === "command_run" ? `Ran command via ${toolName}` : `Executed ${toolName}`,
          })
        } else {
          events.push({
            id: `tel-${++idCounter}`,
            type: "tool_call",
            timestamp: e.timestamp,
            description: "Tool execution completed",
          })
        }
      } else if (e.type === "execution_complete" && e.metadata?.stage === "agent_run") {
        events.push({
          id: `tel-${++idCounter}`,
          type: "session_start",
          timestamp: e.timestamp,
          description: `Agent execution${e.durationMs ? ` (${(e.durationMs / 1000).toFixed(1)}s)` : ""}`,
        })
      }
    }

    const runtimePoints = getTelemetryBuffer()
    for (const p of runtimePoints) {
      if (p.timestamp < since) continue
      if (p.stage === "tool_success" || p.stage === "tool_call") {
        const tn = p.metadata?.toolName
        if (typeof tn === "string" && (tn.toLowerCase().includes("bash") || tn.toLowerCase().includes("command") || tn.toLowerCase().includes("terminal"))) {
          events.push({
            id: `rt-${++idCounter}`,
            type: "command_run",
            timestamp: p.timestamp,
            description: `Ran: ${tn}`,
          })
        }
      }
      if (p.stage === "execution_start") {
        events.push({
          id: `rt-${++idCounter}`,
          type: "session_start",
          timestamp: p.timestamp,
          description: `Session ${p.executionId.slice(0, 8)} started`,
        })
      }
    }

    events.sort((a, b) => b.timestamp - a.timestamp)
    return events.slice(0, 100)
  }

  return {
    lastRefresh: Date.now(),
    timeRange: "24h",

    setTimeRange: (range) => set({ timeRange: range }),

    refresh: () => {
      startPeriodicSampling()
      set({ lastRefresh: Date.now() })
    },

    getSessionStats: computeSessionStats,
    getTokenUsage: computeTokenUsage,
    getCostData: computeCostData,
    getTopModels: computeTopModels,
    getActivityTimeline: computeActivityTimeline,
  }
})
