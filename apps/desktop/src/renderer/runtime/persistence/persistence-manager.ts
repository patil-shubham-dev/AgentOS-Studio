import type { PersistenceConfig, PersistedSnapshot, SnapshotMetadata, RecoveryResult } from "./types"
import { SessionStore } from "./session-store"
import { MigrationRunner, migrationRunner, getStoredSchemaVersion, setStoredSchemaVersion } from "./migration-runner"
import * as t from "./types"

export class PersistenceManager {
  readonly config: PersistenceConfig
  readonly sessions: SessionStore
  readonly migrations: MigrationRunner
  private snapshots: PersistedSnapshot[] = []
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null
  private crashRecoveryKey: string
  private currentVersion = 0
  private stateCollector: (() => Record<string, unknown>) | null = null
  private stateRestorer: ((state: Record<string, unknown>) => void) | null = null

  constructor(config?: Partial<PersistenceConfig>) {
    this.config = {
      storagePrefix: "agentic-",
      maxSnapshots: 20,
      snapshotIntervalMs: 60000,
      autoSaveIntervalMs: 10000,
      crashRecoveryEnabled: true,
      migrationEnabled: true,
      ...config,
    }
    this.sessions = new SessionStore(this.config.storagePrefix)
    this.migrations = migrationRunner
    this.crashRecoveryKey = `${this.config.storagePrefix}crash-state`
    this.currentVersion = getStoredSchemaVersion(this.config.storagePrefix)
  }

  registerStateProvider(collector: () => Record<string, unknown>, restorer: (state: Record<string, unknown>) => void): void {
    this.stateCollector = collector
    this.stateRestorer = restorer
  }

  async start(): Promise<RecoveryResult> {
    const recovery = await this.attemptCrashRecovery()
    this.sessions.restoreFromDisk()
    this.autoSaveTimer = setInterval(() => this.autoSave(), this.config.autoSaveIntervalMs)
    return recovery
  }

  stop(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
      this.autoSaveTimer = null
    }
    this.flush()
  }

  flush(): void {
    this.sessions.persistToDisk()
    this.saveCrashState()
    this.saveSnapshots()
  }

  async createSnapshot(label: string): Promise<SnapshotMetadata> {
    const fullState = this.collectFullState()
    const snapshot: PersistedSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      version: this.currentVersion + 1,
      timestamp: Date.now(),
      state: {
        agentState: fullState as Record<string, unknown>,
        conversationState: {},
        browserState: {},
        codeIntelligenceState: {},
        orchestrationState: {},
      },
    }

    this.snapshots.push(snapshot)
    this.currentVersion = snapshot.version
    setStoredSchemaVersion(this.config.storagePrefix, this.currentVersion)

    if (this.snapshots.length > this.config.maxSnapshots) {
      this.snapshots.sort((a, b) => b.timestamp - a.timestamp)
      this.snapshots = this.snapshots.slice(0, this.config.maxSnapshots)
    }

    this.saveSnapshots()

    return {
      id: snapshot.id,
      version: snapshot.version,
      timestamp: snapshot.timestamp,
      label,
      sizeBytes: new Blob([JSON.stringify(snapshot)]).size,
    }
  }

  recoveryFromSnapshot(snapshotId: string): boolean {
    const snapshot = this.snapshots.find((s) => s.id === snapshotId)
    if (!snapshot) return false

    try {
      const merged = { ...snapshot.state.agentState, ...snapshot.state.orchestrationState }
      this.restoreFullState(merged)
      this.currentVersion = snapshot.version
      setStoredSchemaVersion(this.config.storagePrefix, this.currentVersion)
      return true
    } catch {
      return false
    }
  }

  getSnapshots(): SnapshotMetadata[] {
    return [...this.snapshots]
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((s) => ({
        id: s.id,
        version: s.version,
        timestamp: s.timestamp,
        label: `Snapshot ${new Date(s.timestamp).toISOString()}`,
        sizeBytes: 0,
      }))
  }

  deleteSnapshot(snapshotId: string): void {
    this.snapshots = this.snapshots.filter((s) => s.id !== snapshotId)
    this.saveSnapshots()
  }

  async attemptCrashRecovery(): Promise<RecoveryResult> {
    const errors: string[] = []
    let recovered = false
    let snapshotId: string | null = null
    let snapshotTimestamp: number | null = null

    if (!this.config.crashRecoveryEnabled) {
      return { recovered: false, snapshotId: null, snapshotTimestamp: null, age: 0, errors: [] }
    }

    try {
      const raw = localStorage.getItem(this.crashRecoveryKey)
      if (raw) {
        const state = JSON.parse(raw) as Record<string, unknown>
        snapshotId = (state._snapshotId as string) || null
        snapshotTimestamp = (state._timestamp as number) || null

        if (this.migrations.hasPendingMigrations(this.currentVersion)) {
          const result = await this.migrations.run(state, this.currentVersion)
          setStoredSchemaVersion(this.config.storagePrefix, result.version)
          this.currentVersion = result.version
          if (result.errors.length > 0) {
            errors.push(...result.errors.map((e) => `Migration: ${e}`))
          }
        }

        if (this.stateRestorer) {
          this.stateRestorer(state)
        }

        recovered = true
        localStorage.removeItem(this.crashRecoveryKey)

        if (snapshotTimestamp) {
          const age = Date.now() - snapshotTimestamp
          if (age > 300000) {
            errors.push(`Recovered from stale snapshot (${Math.round(age / 1000)}s old)`)
          }
        }
      }
    } catch (err) {
      errors.push(`Crash recovery failed: ${err}`)
      try { localStorage.removeItem(this.crashRecoveryKey) } catch { /* ignore */ }
    }

    const now = Date.now()
    return {
      recovered,
      snapshotId,
      snapshotTimestamp,
      age: snapshotTimestamp ? now - snapshotTimestamp : 0,
      errors,
    }
  }

  private autoSave(): void {
    this.sessions.persistToDisk()
    this.saveCrashState()
  }

  private saveCrashState(): void {
    if (!this.config.crashRecoveryEnabled) return
    try {
      const state = this.collectFullState()
      localStorage.setItem(this.crashRecoveryKey, JSON.stringify(state))
    } catch {
      try { localStorage.removeItem(this.crashRecoveryKey) } catch { /* ignore */ }
    }
  }

  private collectFullState(): Record<string, unknown> {
    const state: Record<string, unknown> = {
      _version: this.currentVersion,
      _snapshotId: `crash_${Date.now()}`,
      _timestamp: Date.now(),
    }
    if (this.stateCollector) {
      try {
        const collected = this.stateCollector()
        Object.assign(state, collected)
      } catch (err) {
        console.warn("[Persistence] State collection failed:", err)
      }
    }
    return state
  }

  private restoreFullState(state: Record<string, unknown>): void {
    if (this.stateRestorer) {
      this.stateRestorer(state)
    }
  }

  private saveSnapshots(): void {
    try {
      const data = this.snapshots.map((s) => ({
        id: s.id,
        version: s.version,
        timestamp: s.timestamp,
        state: s.state,
      }))
      localStorage.setItem(`${this.config.storagePrefix}snapshots`, JSON.stringify(data))
    } catch {
      // storage may be full; prune and retry
      if (this.snapshots.length > 5) {
        this.snapshots = this.snapshots.slice(-5)
        this.saveSnapshots()
      }
    }
  }

  private loadSnapshots(): void {
    try {
      const raw = localStorage.getItem(`${this.config.storagePrefix}snapshots`)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          this.snapshots = parsed
        }
      }
    } catch {
      this.snapshots = []
    }
  }
}

export const persistenceManager = new PersistenceManager()
