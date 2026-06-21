import type { StepCardStatus, ToolCallRecord } from "./types"

export type { StepCardStatus, ToolCallRecord }

/**
 * ParallelGroup — represents a group of tools that ran in parallel
 * during tool execution. Tracks which tools were in the group and
 * their collective timing for timeline visualization.
 */
export interface ParallelGroup {
  id: string
  /** Tool call IDs that belong to this group */
  toolCallIds: string[]
  /** When the group started executing */
  startedAt: number
  /** When the group finished (all tools resolved) */
  completedAt?: number
  /** Whether this group executed in parallel (true) or sequential (false) */
  isParallel: boolean
  /** Group type for visual distinction */
  type: "read" | "write" | "browser" | "mixed"
}

export interface FileEditRecord {
  path: string
  additions: number
  deletions: number
  diffContent: string
  oldContent?: string
  newContent?: string
  /** Auto-verification result after the file edit round */
  verification?: FileEditVerification
}

export interface FileEditVerification {
  passed: boolean
  lintErrors?: number
  message?: string
}

export interface TerminalRecord {
  command: string
  output: string
  exitCode?: number
  status: "running" | "success" | "error" | "cancelled"
  durationMs?: number
  cwd?: string
}

export interface FileOpRecord {
  path: string
  operation: "read" | "write" | "create" | "delete"
  additions?: number
  deletions?: number
  content?: string
}
