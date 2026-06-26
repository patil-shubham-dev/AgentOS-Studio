import type { ContextSlotRequirement, ContextSlotProduction } from "./SharedPipelineContext"

export type TaskId = string
export type AgentId = string

export type TaskType =
  | "plan"
  | "research"
  | "code"
  | "browser"
  | "vision"
  | "verify"
  | "design"
  | "memory"
  | "manager"
  | "runtime"
  | "tool"
  | "custom"

export type Priority = "critical" | "high" | "normal" | "low"

export type TaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled"

export type DependencyType = "hard" | "soft"

export interface DependencySpec {
  taskId: TaskId
  type: DependencyType
  condition?: string
}

export type DependencyList = (TaskId | DependencySpec)[]

export type FileLockType = "read" | "write"

export interface FileLock {
  filePath: string
  type: FileLockType
  startLine: number
  endLine: number
  taskId: TaskId
}

export interface TaskInput {
  name: string
  type: "text" | "file" | "tool_result" | "context" | "memory"
  value: string
  sourceTaskId?: TaskId
  sourceOutputName?: string
}

export interface TaskOutput {
  name: string
  type: "text" | "file" | "tool_result" | "error"
  value: string
  metadata?: Record<string, unknown>
}

export interface TaskError {
  message: string
  code: string
  retryable: boolean
  timestamp: number
}

export interface Task {
  id: TaskId
  type: TaskType
  title: string
  description: string
  priority: Priority
  status: TaskStatus
  dependencies: DependencyList
  assignedAgent?: AgentId
  createdAt: number
  startedAt?: number
  completedAt?: number
  retries: number
  maxRetries: number
  timeout: number
  inputs: TaskInput[]
  outputs: TaskOutput[]
  metadata: Record<string, unknown>
  error?: TaskError
  tags: string[]
  sessionId?: string
  parentTaskId?: TaskId
  contextRequirements?: ContextSlotRequirement[]
  contextProductions?: ContextSlotProduction[]
  fileLocks?: FileLock[]
}

export interface SerializedTaskGraph {
  version: number
  createdAt: number
  tasks: Task[]
  adjacency: [TaskId, TaskId[]][]
}

export interface ResourceLimits {
  maxConcurrentTasks: number
  maxConcurrentAgents?: Record<string, number>
  maxConcurrentLLMCalls?: number
  maxConcurrentToolExecutions?: number
  maxConcurrentCPUTasks?: number
}

export interface CriticalPathInfo {
  path: TaskId[]
  length: number
}

export interface ExecutionMetricsSnapshot {
  criticalPath: CriticalPathInfo
  parallelEfficiency: number
  totalWallTime: number
  totalComputeTime: number
  maxConcurrency: number
  averageConcurrency: number
  idleTime: number
  waitingTime: number
  dependencyBottlenecks: TaskId[]
}

export interface SchedulerVisualization {
  running: TaskId[]
  ready: TaskId[]
  blocked: TaskId[]
  completed: TaskId[]
  failed: TaskId[]
  cancelled: TaskId[]
  pending: TaskId[]
  criticalPath: CriticalPathInfo
  frontier: { level: number; tasks: TaskId[] }[]
}

export type TaskFilter = {
  status?: TaskStatus[]
  type?: TaskType[]
  priority?: Priority[]
  agent?: AgentId
  tags?: string[]
  sessionId?: string
}

export function createTaskId(): TaskId {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export function isTerminalStatus(status: TaskStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled"
}

export function isActiveStatus(status: TaskStatus): boolean {
  return status === "pending" || status === "ready" || status === "running" || status === "blocked"
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  const valid: Record<TaskStatus, TaskStatus[]> = {
    pending: ["ready", "cancelled", "blocked"],
    ready: ["running", "blocked", "cancelled"],
    running: ["completed", "failed", "cancelled", "blocked"],
    blocked: ["ready", "cancelled"],
    completed: [],
    failed: ["pending"],
    cancelled: [],
  }
  return valid[from]?.includes(to) ?? false
}

export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
}
