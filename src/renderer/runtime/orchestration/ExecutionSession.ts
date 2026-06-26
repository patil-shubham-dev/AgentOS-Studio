import type { Task, TaskId, TaskStatus } from "./types"
import type { TaskGraph } from "./TaskGraph"
import { createTaskId } from "./types"
import type { SharedPipelineContext } from "./SharedPipelineContext"

export type SessionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "recovering"

export interface SessionMetadata {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  runningTasks: number
  pendingTasks: number
  blockedTasks: number
  criticalPathLength: number
  parallelEfficiency?: number
  maxConcurrency?: number
  averageConcurrency?: number
}

export interface ExecutionSession {
  id: string
  status: SessionStatus
  graph: TaskGraph
  rootTaskId?: TaskId
  parentTaskId?: TaskId
  createdAt: number
  startedAt?: number
  completedAt?: number
  progress: SessionMetadata
  error?: string
  tags: string[]
  sharedContext?: SharedPipelineContext
}

export function createSession(graph: TaskGraph, options?: {
  id?: string
  tags?: string[]
  rootTaskId?: TaskId
}): ExecutionSession {
  const id = options?.id ?? `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const tasks = graph.getAllTasks()
  const totalTasks = tasks.length

  return {
    id,
    status: "pending",
    graph,
    rootTaskId: options?.rootTaskId,
    createdAt: Date.now(),
    progress: {
      totalTasks,
      completedTasks: 0,
      failedTasks: 0,
      runningTasks: 0,
      pendingTasks: totalTasks,
      blockedTasks: 0,
      criticalPathLength: 0,
    },
    tags: options?.tags ?? [],
  }
}

export function computeSessionMetadata(graph: TaskGraph): SessionMetadata {
  const tasks = graph.getAllTasks()
  const totalTasks = tasks.length
  let completedTasks = 0
  let failedTasks = 0
  let runningTasks = 0
  let pendingTasks = 0
  let blockedTasks = 0

  for (const task of tasks) {
    switch (task.status) {
      case "completed":
        completedTasks++
        break
      case "failed":
        failedTasks++
        break
      case "running":
        runningTasks++
        break
      case "pending":
        pendingTasks++
        break
      case "blocked":
        blockedTasks++
        break
      default:
        pendingTasks++
    }
  }

  return {
    totalTasks,
    completedTasks,
    failedTasks,
    runningTasks,
    pendingTasks,
    blockedTasks,
    criticalPathLength: graph.getCriticalPath().length,
  }
}
