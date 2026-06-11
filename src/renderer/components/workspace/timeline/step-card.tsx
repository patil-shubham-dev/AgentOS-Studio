import type { StepCardStatus, ToolCallRecord } from "./types"

export type { StepCardStatus, ToolCallRecord }

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
