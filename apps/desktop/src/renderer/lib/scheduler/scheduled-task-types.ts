export type TaskAction =
  | "code_review"
  | "dependency_audit"
  | "security_scan"
  | "memory_consolidation"
  | "performance_report"
  | "custom_prompt"

export type TaskStatus = "idle" | "running" | "completed" | "failed" | "skipped"

export interface ScheduledTask {
  id: string
  name: string
  description: string
  action: TaskAction
  cronExpression: string
  enabled: boolean
  lastRunAt?: string
  lastRunStatus?: TaskStatus
  nextRunAt?: string
  runCount: number
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface TaskTemplate {
  action: TaskAction
  name: string
  description: string
  defaultCron: string
  icon: string
}
