export interface PersistenceConfig {
  storagePrefix: string
  maxSnapshots: number
  snapshotIntervalMs: number
  autoSaveIntervalMs: number
  crashRecoveryEnabled: boolean
  migrationEnabled: boolean
}

export interface PersistedSnapshot {
  id: string
  version: number
  timestamp: number
  state: {
    agentState: Record<string, unknown>
    conversationState: Record<string, unknown>
    browserState: Record<string, unknown>
    codeIntelligenceState: Record<string, unknown>
    orchestrationState: Record<string, unknown>
  }
}

export interface SnapshotMetadata {
  id: string
  version: number
  timestamp: number
  label: string
  sizeBytes: number
}

export interface RecoveryResult {
  recovered: boolean
  snapshotId: string | null
  snapshotTimestamp: number | null
  age: number
  errors: string[]
}

export interface SessionRecord {
  id: string
  startedAt: number
  lastActiveAt: number
  label: string
  state: Record<string, unknown>
}

export interface MigrationStep {
  id: string
  description: string
  version: number
  migrate: (data: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>
}
