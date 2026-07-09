export type MemoryType =
  | "session"
  | "project"
  | "long_term"
  | "execution"
  | "browser"
  | "user"
  | "workspace"
  | "learning"

export type MemoryScope =
  | "ephemeral"
  | "session"
  | "project"
  | "workspace"
  | "user"
  | "global"

export type MemoryCategory =
  | "preference"
  | "convention"
  | "decision"
  | "pattern"
  | "workflow"
  | "error"
  | "learning"
  | "architecture"
  | "command"
  | "browser_action"
  | "tool_usage"
  | "general"

export type MemoryStatus = "active" | "decaying" | "archived" | "deleted"

export interface MemoryEntry {
  id: string
  type: MemoryType
  scope: MemoryScope
  category: MemoryCategory
  content: string
  source: string
  timestamp: number
  updatedAt: number
  lastAccessed: number
  accessCount: number
  importance: number
  confidence: number
  status: MemoryStatus
  tags: string[]
  filePaths: string[]
  metadata: Record<string, unknown>
  ttl: number
  parentId: string
  version: number
  decayFactor: number
}

export function createMemoryEntry(overrides: Partial<MemoryEntry> & { content: string; source: string }): MemoryEntry {
  const now = Date.now()
  return {
    id: overrides.id ?? `mem_${now}_${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type ?? "session",
    scope: overrides.scope ?? "session",
    category: overrides.category ?? "general",
    content: overrides.content,
    source: overrides.source,
    timestamp: overrides.timestamp ?? now,
    updatedAt: now,
    lastAccessed: now,
    accessCount: overrides.accessCount ?? 0,
    importance: overrides.importance ?? 0.5,
    confidence: overrides.confidence ?? 0.5,
    status: overrides.status ?? "active",
    tags: overrides.tags ?? [],
    filePaths: overrides.filePaths ?? [],
    metadata: overrides.metadata ?? {},
    ttl: overrides.ttl ?? 0,
    parentId: overrides.parentId ?? "",
    version: overrides.version ?? 1,
    decayFactor: overrides.decayFactor ?? 1.0,
  }
}

export interface MemoryQuery {
  types?: MemoryType[]
  scopes?: MemoryScope[]
  categories?: MemoryCategory[]
  text?: string
  tags?: string[]
  filePaths?: string[]
  sources?: string[]
  minImportance?: number
  minConfidence?: number
  status?: MemoryStatus
  dateFrom?: number
  dateTo?: number
  limit?: number
  offset?: number
  sortBy?: "timestamp" | "importance" | "confidence" | "accessCount" | "lastAccessed"
  sortDir?: "asc" | "desc"
}

export interface MemoryCandidate {
  content: string
  source: string
  type?: MemoryType
  scope?: MemoryScope
  category?: MemoryCategory
  tags?: string[]
  filePaths?: string[]
  importance?: number
  confidence?: number
  metadata?: Record<string, unknown>
  ttl?: number
}

export interface MemoryStats {
  totalEntries: number
  byType: Record<string, number>
  byScope: Record<string, number>
  byCategory: Record<string, number>
  byStatus: Record<string, number>
  totalSizeBytes: number
  oldestEntry: number
  newestEntry: number
  averageImportance: number
  averageConfidence: number
}

export interface MemoryConfig {
  ephemeralMaxEntries: number
  ephemeralTTL: number
  sessionMaxEntries: number
  sessionTTL: number
  projectMaxEntries: number
  longTermMaxEntries: number
  extractionEnabled: boolean
  consolidationEnabled: boolean
  autoInjectEnabled: boolean
  consolidationIntervalMs: number
  extractionTriggers: ExtractionTrigger[]
}

export type ExtractionTrigger = "execution_complete" | "goal_achieved" | "compaction" | "manual" | "user_correction"

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  ephemeralMaxEntries: 50,
  ephemeralTTL: 30 * 60 * 1000,
  sessionMaxEntries: 500,
  sessionTTL: 24 * 60 * 60 * 1000,
  projectMaxEntries: 2000,
  longTermMaxEntries: 5000,
  extractionEnabled: true,
  consolidationEnabled: true,
  autoInjectEnabled: true,
  consolidationIntervalMs: 60 * 60 * 1000,
  extractionTriggers: ["execution_complete", "goal_achieved", "compaction", "manual"],
}
