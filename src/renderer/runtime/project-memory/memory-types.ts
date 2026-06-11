/**
 * Memory types — defines the structure for AgenticOS's project memory system.
 * Adapted from Claude Code's CLAUDE.md architecture with hierarchical loading
 * (global → project → local → path-scoped rules).
 */

export type MemoryScope = "none" | "session" | "project" | "global"

export interface MemoryEntry {
  id: string
  type: "preference" | "convention" | "decision" | "pattern" | "workflow" | "error" | "learning"
  scope: MemoryScope
  summary: string
  detail: string
  filePaths?: string[]
  tags: string[]
  createdAt: number
  updatedAt: number
  source: string
}

export interface MemoryFile {
  path: string
  source: "global" | "project" | "local" | "rules"
  content: string
  priority: number
  pathPattern?: string // Glob pattern for rule files (e.g., "src/api/**/*.ts")
}

export interface ProjectMemoryConfig {
  projectPath: string
  globalMemoryPath: string
  rulesDir: string
  maxMemoryEntries: number
  enabled: boolean
}

export const DEFAULT_MEMORY_CONFIG: ProjectMemoryConfig = {
  projectPath: "",
  globalMemoryPath: "",
  rulesDir: ".agentic-os/memory",
  maxMemoryEntries: 500,
  enabled: true,
}

export interface SessionMemory {
  sessionId: string
  createdAt: number
  updatedAt: number
  title: string
  currentState: string
  taskSpecification: string
  filesAndFunctions: string
  workflow: string
  errorsAndCorrections: string
  learnings: string
  keyResults: string
  worklog: string
}

export function createEmptySessionMemory(sessionId: string): SessionMemory {
  return {
    sessionId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: "",
    currentState: "Initializing...",
    taskSpecification: "",
    filesAndFunctions: "",
    workflow: "",
    errorsAndCorrections: "",
    learnings: "",
    keyResults: "",
    worklog: "",
  }
}
