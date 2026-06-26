import { useState, useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { safeCapitalize } from "@/lib/safeCapitalize"
import { createDemoDashboardData, createDemoSessionData, createDemoTimeline } from "@/runtime/orchestration/OrchestrationDemoData"
import type {
  OrchestrationDashboardData, SessionDashboardData,
  AggregatedDashboardData, TimelineEntry,
} from "@/runtime/orchestration/OrchestrationDemoData"
import type { SchedulerVisualization, ExecutionMetricsSnapshot } from "@/runtime/orchestration/types"
import {
  BarChart3, Activity, Clock, Zap, AlertTriangle, CheckCircle2,
  Cpu, Layers, GitBranch, Play, Square, Timer, TrendingUp,
} from "lucide-react"

const TASK_COLORS: Record<string, string> = {
  running: "bg-blue-500 border-blue-400",
  ready: "bg-amber-500 border-amber-400",
  pending: "bg-white/10 border-white/20",
  blocked: "bg-red-500/50 border-red-400",
  completed: "bg-emerald-500 border-emerald-400",
  failed: "bg-red-500 border-red-400",
  cancelled: "bg-white/5 border-white/10",
}

const TIMELINE_TYPE_COLORS: Record<string, string> = {
  task_started: "text-blue-400",
  task_completed: "text-emerald-400",
  task_failed: "text-red-400",
  task_blocked: "text-amber-400",
  session_started: "text-white/50",
  session_completed: "text-white/30",
}

function OverviewCards({ aggregate, metrics }: { aggregate: AggregatedDashboardData; metrics: ExecutionMetricsSnapshot }) {
  const cards = [
    { label: "Active Sessions", value: aggregate.activeSessions, icon: Layers, color: "text-blue-400" },
    { label: "Running Tasks", value: aggregate.runningTasks, icon: Play, color: "text-emerald-400" },
    { label: "Pending Tasks", value: aggregate.pendingTasks, icon: Clock, color: "text-amber-400" },
    { label: "Blocked Tasks", value: aggregate.blockedTasks, icon: AlertTriangle, color: "text-red-400" },
    { label: "Completed", value: aggregate.completedTasks, icon: CheckCircle2, color: "text-emerald-400" },
    { label: "Failed", value: aggregate.failedTasks, icon: AlertTriangle, color: "text-red-400" },
    { label: "Max Concurrency", value: metrics.maxConcurrency, icon: Cpu, color: "text-cyan-400" },
    { label: "Parallel Eff.", value: `${(metrics.parallelEfficiency * 100).toFixed(0)}%`, icon: TrendingUp, color: "text-purple-400" },
    { label: "Wall Time", value: `${(metrics.totalWallTime / 1000).toFixed(1)}s`, icon: Timer, color: "text-white/60" },
  ]

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 gap-2">
      {cards.map((card, i) => {
        const Icon = card.icon
        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.2 }}
            className="border border-white/[0.06] rounded-xl p-3 bg-black/20"
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Icon className={cn("h-3 w-3", card.color)} />
            </div>
            <p className="text-[9px] text-white/40 truncate mb-0.5">{card.label}</p>
            <p className="text-lg font-bold text-white/90 tabular-nums">{card.value}</p>
          </motion.div>
        )
      })}
    </div>
  )
}

function QueueDepthBar({ viz }: { viz: SchedulerVisualization }) {
  const total = viz.running.length + viz.ready.length + viz.pending.length +
    viz.blocked.length + viz.completed.length + viz.failed.length + viz.cancelled.length

  if (total === 0) return <p className="text-xs text-white/30 py-4 text-center">No tasks</p>

  const segments = [
    { label: "Running", count: viz.running.length, color: "bg-blue-500" },
    { label: "Ready", count: viz.ready.length, color: "bg-amber-500" },
    { label: "Pending", count: viz.pending.length, color: "bg-white/20" },
    { label: "Blocked", count: viz.blocked.length, color: "bg-red-500/60" },
    { label: "Completed", count: viz.completed.length, color: "bg-emerald-500" },
    { label: "Failed", count: viz.failed.length, color: "bg-red-500" },
    { label: "Cancelled", count: viz.cancelled.length, color: "bg-white/10" },
  ].filter((s) => s.count > 0)

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden border border-white/[0.06]">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={seg.color}
            style={{ width: `${(seg.count / total) * 100}%` }}
            title={`${seg.label}: ${seg.count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-sm", seg.color)} />
            <span className="text-[10px] text-white/40">{seg.label}</span>
            <span className="text-[10px] text-white/70 font-medium tabular-nums">{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function CriticalPathBar({ metrics }: { metrics: ExecutionMetricsSnapshot }) {
  const total = metrics.totalComputeTime || 1
  const computePct = Math.min((metrics.totalWallTime / total) * 100, 100)

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-white/40">Compute vs Wall Time</span>
          <span className="text-white/70 tabular-nums">{formatMs(metrics.totalComputeTime)} / {formatMs(metrics.totalWallTime)}</span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
            style={{ width: `${computePct}%` }}
          />
        </div>
      </div>

      {metrics.criticalPath.path.length > 0 && (
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1.5">
            <span className="text-white/40">Critical Path ({metrics.criticalPath.length} tasks)</span>
            <span className="text-white/50 tabular-nums">{formatMs(metrics.totalWallTime)}</span>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {metrics.criticalPath.path.map((taskId, i) => (
              <div key={taskId} className="flex items-center gap-1">
                <div className="h-5 px-1.5 rounded text-[8px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center">
                  {taskId.length > 12 ? `${taskId.slice(0, 10)}..` : taskId}
                </div>
                {i < metrics.criticalPath.path.length - 1 && (
                  <span className="text-white/20 text-[8px]">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {metrics.dependencyBottlenecks.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] text-white/40">Bottlenecks ({metrics.dependencyBottlenecks.length})</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {metrics.dependencyBottlenecks.map((id) => (
              <span key={id} className="text-[8px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20 font-mono">
                {id.length > 16 ? `${id.slice(0, 14)}..` : id}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DAGLevelView({ viz, sessionId }: { viz: SchedulerVisualization; sessionId: string }) {
  const statusColor = (taskId: string): string => {
    if (viz.running.includes(taskId)) return "bg-blue-500 border-blue-400"
    if (viz.ready.includes(taskId)) return "bg-amber-500 border-amber-400"
    if (viz.pending.includes(taskId)) return "bg-white/10 border-white/20"
    if (viz.blocked.includes(taskId)) return "bg-red-500/50 border-red-400"
    if (viz.completed.includes(taskId)) return "bg-emerald-500 border-emerald-400"
    if (viz.failed.includes(taskId)) return "bg-red-500 border-red-400"
    return "bg-white/5 border-white/10"
  }

  if (viz.frontier.length === 0) return <p className="text-xs text-white/30 py-4 text-center">No tasks</p>

  return (
    <div className="space-y-3">
      {viz.frontier.map((level) => (
        <div key={level.level} className="space-y-1">
          <div className="text-[9px] text-white/20 font-mono">Level {level.level}</div>
          <div className="flex flex-wrap gap-1.5">
            {level.tasks.map((taskId) => {
              const isCritical = viz.criticalPath.path.includes(taskId)
              return (
                <div
                  key={taskId}
                  className={cn(
                    "h-6 px-2 rounded text-[9px] font-mono border flex items-center gap-1",
                    statusColor(taskId),
                    isCritical && "ring-1 ring-blue-400/50"
                  )}
                  title={`${taskId}${isCritical ? " (critical path)" : ""}`}
                >
                  {taskId.length > 8 ? `${taskId.slice(0, 6)}..` : taskId}
                  {isCritical && <span className="text-[7px] opacity-60">★</span>}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function SessionCard({ session, defaultExpanded }: { session: SessionDashboardData; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const statusColor = session.status === "running" ? "border-l-blue-500" :
    session.status === "completed" ? "border-l-emerald-500" :
    session.status === "failed" ? "border-l-red-500" : "border-l-white/10"

  return (
    <div className={cn("border border-white/[0.06] rounded-xl bg-black/20 border-l-2", statusColor)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <div className={cn(
            "h-2 w-2 rounded-full",
            session.status === "running" ? "bg-blue-500 animate-pulse" :
            session.status === "completed" ? "bg-emerald-500" :
            session.status === "failed" ? "bg-red-500" : "bg-white/20",
          )} />
          <span className="text-xs font-medium text-white/70">{session.label}</span>
          <span className={cn(
            "text-[9px] px-1.5 py-0.5 rounded font-medium",
            session.status === "running" ? "bg-blue-500/10 text-blue-300" :
            session.status === "completed" ? "bg-emerald-500/10 text-emerald-300" :
            "bg-red-500/10 text-red-300",
          )}>
            {safeCapitalize(session.status)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-400/60" />
            <span className="text-[10px] text-white/50 tabular-nums">{session.completedCount}/{session.taskCount}</span>
          </div>
          <span className="text-[10px] text-white/30 w-12 text-right tabular-nums">
            {formatMs(session.duration)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.04] px-4 py-3 space-y-3">
          <div className="flex items-center gap-4 text-[10px]">
            <span className="text-white/40">Progress: <span className="text-white/70 font-medium">{(session.progress * 100).toFixed(0)}%</span></span>
            <span className="text-white/40">Tasks: <span className="text-white/70 font-medium">{session.taskCount}</span></span>
            <span className="text-white/40">Completed: <span className="text-emerald-400 font-medium">{session.completedCount}</span></span>
            {session.failedCount > 0 && (
              <span className="text-white/40">Failed: <span className="text-red-400 font-medium">{session.failedCount}</span></span>
            )}
          </div>

          <QueueDepthBar viz={session.visualization} />
          <div>
            <span className="text-[9px] text-white/30 font-medium mb-1 block">DAG Levels</span>
            <DAGLevelView viz={session.visualization} sessionId={session.id} />
          </div>
        </div>
      )}
    </div>
  )
}

function TimelineView({ entries, maxItems = 20 }: { entries: TimelineEntry[]; maxItems?: number }) {
  const visible = entries.slice(0, maxItems)

  if (visible.length === 0) return <p className="text-xs text-white/30 py-4 text-center">No activity yet</p>

  return (
    <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
      {visible.map((entry) => (
        <div key={entry.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.03] text-[11px]">
          <span className={cn("shrink-0 text-[9px]", TIMELINE_TYPE_COLORS[entry.type] ?? "text-white/20")}>
            {entry.type === "task_started" ? "▶" :
             entry.type === "task_completed" ? "✓" :
             entry.type === "task_failed" ? "✗" :
             entry.type === "task_blocked" ? "⊘" :
             entry.type === "session_started" ? "●" :
             entry.type === "session_completed" ? "●" : "·"}
          </span>
          <span className="text-white/20 text-[9px] tabular-nums shrink-0 w-16 font-mono">
            {new Date(entry.time).toLocaleTimeString()}
          </span>
          <span className="text-white/50 truncate max-w-[200px]">
            {entry.taskTitle ?? entry.detail ?? entry.type}
          </span>
          {entry.taskId && (
            <span className="text-white/20 text-[8px] font-mono ml-auto truncate max-w-[80px]">
              {entry.taskId.length > 10 ? `${entry.taskId.slice(0, 8)}..` : entry.taskId}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function MetricsDetails({ metrics }: { metrics: ExecutionMetricsSnapshot }) {
  const items = [
    { label: "Wall Time", value: formatMs(metrics.totalWallTime) },
    { label: "Compute Time", value: formatMs(metrics.totalComputeTime) },
    { label: "Parallel Efficiency", value: `${(metrics.parallelEfficiency * 100).toFixed(1)}%` },
    { label: "Max Concurrency", value: metrics.maxConcurrency.toString() },
    { label: "Avg Concurrency", value: metrics.averageConcurrency.toFixed(1) },
    { label: "Idle Time", value: formatMs(metrics.idleTime) },
    { label: "Critical Path", value: `${metrics.criticalPath.length} tasks` },
    { label: "Bottlenecks", value: metrics.dependencyBottlenecks.length.toString() },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map((item) => (
        <div key={item.label} className="bg-white/[0.02] rounded-lg px-3 py-2">
          <p className="text-[9px] text-white/30">{item.label}</p>
          <p className="text-xs font-mono text-white/70 font-bold mt-0.5 tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  )
}

export function OrchestrationDashboardPage() {
  const [data, setData] = useState<OrchestrationDashboardData | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({})

  const updateData = () => {
    const d = createDemoDashboardData()
    setData(d)

    setExpandedSessions((prev) => {
      const next = { ...prev }
      for (const session of d.sessions) {
        if (!(session.id in next)) {
          next[session.id] = session.status === "running"
        }
      }
      return next
    })
  }

  useEffect(() => {
    updateData()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(updateData, 3000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  if (!data) {
    return (
      <div className="h-full overflow-y-auto bg-[#0a0a0b]">
        <div className="p-6 max-w-7xl mx-auto">
          <p className="text-white/40 text-sm">Loading orchestration data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0b]">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/10 border border-white/10">
              <Layers className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Orchestration</h1>
              <p className="text-sm text-white/40 mt-0.5">
                DAG execution, task queue, critical path, and session timeline
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
              onClick={updateData}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-white/50 hover:text-white/70 transition-all"
            >
              <BarChart3 className="h-3 w-3" />
              Refresh
            </button>
          </div>
        </div>

        <OverviewCards aggregate={data.aggregate} metrics={data.metrics} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-black/20">
            <div className="px-4 py-3 border-b border-white/[0.04] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-white/30" />
                <span className="text-xs font-semibold text-white/70">Active Sessions</span>
                <span className="text-[9px] text-white/20">({data.aggregate.activeSessions} running)</span>
              </div>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {data.sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  defaultExpanded={expandedSessions[session.id] ?? false}
                />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-black/20">
              <div className="px-4 py-3 border-b border-white/[0.04] bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-white/30" />
                  <span className="text-xs font-semibold text-white/70">Critical Path</span>
                </div>
              </div>
              <div className="px-4 py-3">
                <CriticalPathBar metrics={data.metrics} />
              </div>
            </div>

            <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-black/20">
              <div className="px-4 py-3 border-b border-white/[0.04] bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-white/30" />
                  <span className="text-xs font-semibold text-white/70">Metrics</span>
                </div>
              </div>
              <div className="px-4 py-3">
                <MetricsDetails metrics={data.metrics} />
              </div>
            </div>
          </div>
        </div>

        <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-black/20">
          <div className="px-4 py-3 border-b border-white/[0.04] bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-white/30" />
              <span className="text-xs font-semibold text-white/70">Timeline</span>
              <span className="text-[9px] text-white/20">({data.timeline.length} events)</span>
            </div>
          </div>
          <div className="px-2 py-2">
            <TimelineView entries={data.timeline} />
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-[9px] text-white/15">
          <Clock className="h-2.5 w-2.5" />
          Snapshot: {new Date(data.snapshotTakenAt).toLocaleTimeString()}
          <span className="text-white/10">·</span>
          {data.aggregate.totalSessions} session(s) · {data.aggregate.totalTasks} task(s)
          {data.metrics.dependencyBottlenecks.length > 0 && (
            <>
              <span className="text-white/10">·</span>
              <span className="text-amber-400/60">{data.metrics.dependencyBottlenecks.length} bottleneck(s)</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
