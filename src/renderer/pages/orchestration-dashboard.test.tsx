import { describe, it, expect } from "vitest"
import { createDemoDashboardData, createDemoSessionData, createDemoTimeline } from "@/runtime/orchestration/OrchestrationDemoData"
import type { OrchestrationDashboardData, SessionDashboardData, TimelineEntry } from "@/runtime/orchestration/OrchestrationDemoData"

describe("OrchestrationDashboardData", () => {
  it("generates demo dashboard data with correct structure", () => {
    const data = createDemoDashboardData()
    expect(data).toBeDefined()
    expect(data.sessions).toHaveLength(3)
    expect(data.aggregate).toBeDefined()
    expect(data.metrics).toBeDefined()
    expect(data.timeline.length).toBeGreaterThan(0)
    expect(data.snapshotTakenAt).toBeGreaterThan(0)
  })

  it("aggregates correct totals across sessions", () => {
    const data = createDemoDashboardData()
    const totalTasks = data.sessions.reduce((s, sess) => s + sess.taskCount, 0)
    const completedTasks = data.sessions.reduce((s, sess) => s + sess.completedCount, 0)
    const failedTasks = data.sessions.reduce((s, sess) => s + sess.failedCount, 0)

    expect(data.aggregate.totalTasks).toBe(totalTasks)
    expect(data.aggregate.completedTasks).toBe(completedTasks)
    expect(data.aggregate.failedTasks).toBe(failedTasks)
    expect(data.aggregate.activeSessions).toBe(data.sessions.filter((s) => s.status === "running").length)
  })

  it("generates valid session visualization data", () => {
    const data = createDemoDashboardData()
    for (const session of data.sessions) {
      const viz = session.visualization
      expect(viz.frontier.length).toBeGreaterThan(0)
      expect(viz.criticalPath.length).toBeGreaterThan(0)
      expect(viz.criticalPath.path.length).toBe(viz.criticalPath.length)

      const allVizTasks = [
        ...viz.running, ...viz.ready, ...viz.blocked,
        ...viz.completed, ...viz.failed, ...viz.cancelled, ...viz.pending,
      ]
      expect(new Set(allVizTasks).size).toBe(allVizTasks.length)
    }
  })

  it("computes correct progress for sessions", () => {
    const session = createDemoSessionData("test", "Test Session", 10, 5, 2, "running")
    expect(session.progress).toBe(0.7)
    expect(session.completedCount).toBe(5)
    expect(session.failedCount).toBe(2)
  })

  it("creates completed session with no running tasks", () => {
    const session = createDemoSessionData("complete", "Done", 5, 5, 0, "completed")
    expect(session.status).toBe("completed")
    expect(session.visualization.running).toHaveLength(0)
    expect(session.visualization.completed.length).toBe(5)
    expect(session.progress).toBe(1)
  })

  it("creates failed session with correct metadata", () => {
    const session = createDemoSessionData("failed", "Failed", 8, 3, 3, "failed")
    expect(session.status).toBe("failed")
    expect(session.visualization.failed.length).toBe(3)
    expect(session.progress).toBe(0.75)
  })

  it("generates timeline with all event types", () => {
    const sessions = [
      createDemoSessionData("s1", "Session 1", 5, 3, 1, "running"),
      createDemoSessionData("s2", "Session 2", 3, 3, 0, "completed"),
    ]
    const timeline = createDemoTimeline(sessions)
    expect(timeline.length).toBeGreaterThan(0)

    const types = new Set(timeline.map((e) => e.type))
    expect(types.has("session_started")).toBe(true)
    expect(types.has("task_completed")).toBe(true)
    expect(types.has("task_failed")).toBe(true)
  })

  it("sorts timeline entries descending by time", () => {
    const sessions = [
      createDemoSessionData("s1", "Session 1", 3, 2, 0, "completed"),
    ]
    const timeline = createDemoTimeline(sessions)
    for (let i = 0; i < timeline.length - 1; i++) {
      expect(timeline[i].time).toBeGreaterThanOrEqual(timeline[i + 1].time)
    }
  })

  it("handles empty sessions list", () => {
    const timeline = createDemoTimeline([])
    expect(timeline).toHaveLength(0)
  })

  it("generates at least one critical path entry", () => {
    const data = createDemoDashboardData()
    expect(data.metrics.criticalPath.length).toBeGreaterThanOrEqual(3)
    expect(data.metrics.parallelEfficiency).toBeGreaterThan(0)
    expect(data.metrics.parallelEfficiency).toBeLessThanOrEqual(1)
  })
})
