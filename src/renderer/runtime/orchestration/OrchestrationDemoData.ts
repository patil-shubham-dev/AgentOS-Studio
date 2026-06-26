import type { TaskId, SchedulerVisualization, ExecutionMetricsSnapshot } from "./types"

export interface OrchestrationDashboardData {
  sessions: SessionDashboardData[]
  aggregate: AggregatedDashboardData
  metrics: ExecutionMetricsSnapshot
  timeline: TimelineEntry[]
  snapshotTakenAt: number
}

export interface SessionDashboardData {
  id: string
  label: string
  status: "running" | "completed" | "failed" | "idle"
  progress: number
  taskCount: number
  completedCount: number
  failedCount: number
  startedAt: number
  duration: number
  visualization: SchedulerVisualization
}

export interface AggregatedDashboardData {
  totalSessions: number
  activeSessions: number
  totalTasks: number
  completedTasks: number
  failedTasks: number
  runningTasks: number
  pendingTasks: number
  readyTasks: number
  blockedTasks: number
}

export interface TimelineEntry {
  id: string
  time: number
  type: "task_started" | "task_completed" | "task_failed" | "task_blocked" | "session_started" | "session_completed"
  sessionId: string
  taskId?: string
  taskTitle?: string
  detail?: string
}

const TASK_TEMPLATES = [
  { type: "plan" as const, title: "Analyze requirements" },
  { type: "research" as const, title: "Research API options" },
  { type: "code" as const, title: "Implement core logic" },
  { type: "code" as const, title: "Write unit tests" },
  { type: "browser" as const, title: "Validate UI behavior" },
  { type: "verify" as const, title: "Run integration tests" },
  { type: "design" as const, title: "Design component layout" },
  { type: "code" as const, title: "Build data layer" },
  { type: "verify" as const, title: "Security audit" },
  { type: "memory" as const, title: "Store session results" },
]

export function createDemoSessionData(
  sessionId: string,
  label: string,
  taskCount: number,
  completedCount: number,
  failedCount: number,
  status: "running" | "completed" | "failed" = "running"
): SessionDashboardData {
  const taskIds: TaskId[] = Array.from({ length: taskCount }, (_, i) => `${sessionId}_task_${i}`)
  const runningCount = status === "running" ? Math.max(1, taskCount - completedCount - failedCount - 2) : 0
  const pendingCount = Math.max(0, taskCount - completedCount - failedCount - runningCount)

  const running = taskIds.slice(0, runningCount)
  const completed = taskIds.slice(runningCount, runningCount + completedCount)
  const failed = taskIds.slice(runningCount + completedCount, runningCount + completedCount + failedCount)
  const pending = taskIds.slice(runningCount + completedCount + failedCount, runningCount + completedCount + failedCount + pendingCount)
  const blocked = taskIds.filter((_, i) => i >= runningCount + completedCount + failedCount + pendingCount && i < taskCount)

  const readyCount = status === "running" ? Math.min(2, pending.length) : 0
  const ready = pending.slice(0, readyCount)
  const remainingPending = pending.slice(readyCount)

  const frontier = [
    { level: 0, tasks: taskIds.filter((_, i) => i < 3) },
    { level: 1, tasks: taskIds.filter((_, i) => i >= 3 && i < 6) },
    { level: 2, tasks: taskIds.filter((_, i) => i >= 6 && i < 9) },
    { level: 3, tasks: taskIds.filter((_, i) => i >= 9) },
  ].filter((f) => f.tasks.length > 0)

  const criticalPath = taskIds.filter((_, i) => i % 3 === 0)

  return {
    id: sessionId,
    label,
    status,
    progress: taskCount > 0 ? (completedCount + failedCount) / taskCount : 0,
    taskCount,
    completedCount,
    failedCount,
    startedAt: Date.now() - 30000,
    duration: Date.now() - (status === "running" ? Date.now() - 30000 : Date.now() - 60000),
    visualization: {
      running,
      ready,
      blocked,
      completed,
      failed,
      cancelled: [],
      pending: remainingPending,
      criticalPath: { path: criticalPath, length: criticalPath.length },
      frontier,
    },
  }
}

export function createDemoTimeline(sessions: SessionDashboardData[]): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  for (const session of sessions) {
    const now = Date.now()
    entries.push({
      id: `timeline-${session.id}-start`,
      time: now - session.duration,
      type: "session_started",
      sessionId: session.id,
      detail: `Session "${session.label}" started`,
    })

    const completedIds = session.visualization.completed
    for (let i = 0; i < completedIds.length; i++) {
      const tpl = TASK_TEMPLATES[i % TASK_TEMPLATES.length]
      entries.push({
        id: `timeline-${completedIds[i]}-complete`,
        time: now - session.duration + (i + 1) * (session.duration / (session.taskCount + 1)),
        type: "task_completed",
        sessionId: session.id,
        taskId: completedIds[i],
        taskTitle: tpl.title,
      })
    }

    const failedIds = session.visualization.failed
    for (let i = 0; i < failedIds.length; i++) {
      entries.push({
        id: `timeline-${failedIds[i]}-failed`,
        time: now - session.duration + (completedIds.length + i + 1) * (session.duration / (session.taskCount + 1)),
        type: "task_failed",
        sessionId: session.id,
        taskId: failedIds[i],
        taskTitle: "Execute task",
        detail: "Execution timed out",
      })
    }

    const runningIds = session.visualization.running
    for (const tid of runningIds) {
      entries.push({
        id: `timeline-${tid}-running`,
        time: now - 5000,
        type: "task_started",
        sessionId: session.id,
        taskId: tid,
        taskTitle: "Processing",
      })
    }

    if (session.status !== "running") {
      entries.push({
        id: `timeline-${session.id}-end`,
        time: now,
        type: "session_completed",
        sessionId: session.id,
        detail: `Session "${session.label}" ${session.status}`,
      })
    }
  }

  entries.sort((a, b) => b.time - a.time)
  return entries
}

export function createDemoDashboardData(): OrchestrationDashboardData {
  const sessions: SessionDashboardData[] = [
    createDemoSessionData("session_demo_1", "Feature: User auth", 10, 6, 1, "running"),
    createDemoSessionData("session_demo_2", "Bugfix: Memory leak", 5, 5, 0, "completed"),
    createDemoSessionData("session_demo_3", "Refactor: Data layer", 8, 3, 0, "running"),
  ]

  const totalTasks = sessions.reduce((s, sess) => s + sess.taskCount, 0)
  const completedTasks = sessions.reduce((s, sess) => s + sess.completedCount, 0)
  const failedTasks = sessions.reduce((s, sess) => s + sess.failedCount, 0)

  const aggregate: AggregatedDashboardData = {
    totalSessions: sessions.length,
    activeSessions: sessions.filter((s) => s.status === "running").length,
    totalTasks,
    completedTasks,
    failedTasks,
    runningTasks: sessions.reduce((s, sess) => s + sess.visualization.running.length, 0),
    pendingTasks: sessions.reduce((s, sess) => s + sess.visualization.pending.length + sess.visualization.ready.length, 0),
    readyTasks: sessions.reduce((s, sess) => s + sess.visualization.ready.length, 0),
    blockedTasks: sessions.reduce((s, sess) => s + sess.visualization.blocked.length, 0),
  }

  const metrics: ExecutionMetricsSnapshot = {
    criticalPath: { path: ["task_0", "task_3", "task_6", "task_9"], length: 4 },
    parallelEfficiency: 0.72,
    totalWallTime: 30000,
    totalComputeTime: 65000,
    maxConcurrency: 3,
    averageConcurrency: 2.1,
    idleTime: 1200,
    waitingTime: 0,
    dependencyBottlenecks: sessions.flatMap((s) => s.visualization.blocked),
  }

  return {
    sessions,
    aggregate,
    metrics,
    timeline: createDemoTimeline(sessions),
    snapshotTakenAt: Date.now(),
  }
}
