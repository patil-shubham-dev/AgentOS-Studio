import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ScheduledTask, TaskStatus } from "@/lib/scheduler/scheduled-task-types"
import { getNextRun } from "@/lib/scheduler/cron-parser"

let taskCounter = 0

function generateId(): string {
  return `sched_${++taskCounter}_${Date.now().toString(36)}`
}

interface ScheduledTaskState {
  tasks: ScheduledTask[]
  addTask: (task: Omit<ScheduledTask, "id" | "createdAt" | "updatedAt" | "runCount">) => void
  removeTask: (id: string) => void
  updateTask: (id: string, partial: Partial<ScheduledTask>) => void
  toggleTask: (id: string) => void
  runNow: (id: string) => void
  recordRun: (id: string, status: TaskStatus) => void
}

export const useScheduledTaskStore = create<ScheduledTaskState>()(
  persist(
    (set, get) => ({
      tasks: [],

      addTask: (task) => {
        const now = new Date().toISOString()
        let nextRunAt: string | undefined
        try {
          nextRunAt = getNextRun(task.cronExpression).toISOString()
        } catch {
          nextRunAt = undefined
        }
        const newTask: ScheduledTask = {
          ...task,
          id: generateId(),
          runCount: 0,
          config: task.config ?? {},
          createdAt: now,
          updatedAt: now,
          nextRunAt,
        }
        set((s) => ({ tasks: [...s.tasks, newTask] }))
      },

      removeTask: (id) => {
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
      },

      updateTask: (id, partial) => {
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== id) return t
            const updates: Partial<ScheduledTask> = { ...partial, updatedAt: new Date().toISOString() }
            if (partial.cronExpression && partial.cronExpression !== t.cronExpression) {
              try {
                updates.nextRunAt = getNextRun(partial.cronExpression).toISOString()
              } catch {
                updates.nextRunAt = undefined
              }
            }
            return { ...t, ...updates }
          }),
        }))
      },

      toggleTask: (id) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, enabled: !t.enabled, updatedAt: new Date().toISOString() } : t,
          ),
        }))
      },

      runNow: (id) => {
        get().updateTask(id, { lastRunAt: new Date().toISOString(), lastRunStatus: "running" })
      },

      recordRun: (id, status) => {
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== id) return t
            const now = new Date().toISOString()
            let nextRunAt: string | undefined
            try {
              nextRunAt = getNextRun(t.cronExpression).toISOString()
            } catch {
              nextRunAt = undefined
            }
            return {
              ...t,
              lastRunAt: now,
              lastRunStatus: status,
              nextRunAt,
              runCount: t.runCount + 1,
              updatedAt: now,
            }
          }),
        }))
      },
    }),
    {
      name: "aos-scheduler-store",
    },
  ),
)
