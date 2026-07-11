import { RepositoryKnowledgeGraph } from "@/runtime/intelligence/RepositoryKnowledgeGraph"
import { CheckpointStore, type CheckpointMetadata } from "./CheckpointStore"

export interface WorkspaceSnapshot {
  id: string
  label: string
  timestamp: number
  files: Map<string, string>
  active: boolean
}

export class WorkspaceSnapshotManager {
  private static instance: WorkspaceSnapshotManager
  private snapshots = new Map<string, WorkspaceSnapshot>()
  private snapshotCounter = 0
  private checkpointStore = new CheckpointStore()
  private checkpointEnabled = true

  static getInstance(): WorkspaceSnapshotManager {
    if (!WorkspaceSnapshotManager.instance) {
      WorkspaceSnapshotManager.instance = new WorkspaceSnapshotManager()
    }
    return WorkspaceSnapshotManager.instance
  }

  setCheckpointEnabled(enabled: boolean): void {
    this.checkpointEnabled = enabled
  }

  async init(): Promise<void> {
    if (this.checkpointEnabled) {
      await this.checkpointStore.init()
    }
  }

  async create(label: string, sessionId?: string): Promise<string> {
    const id = `snap_${Date.now()}_${++this.snapshotCounter}`
    const files = new Map<string, string>()

    try {
      const fs = await import("fs")
      const graph = RepositoryKnowledgeGraph.getInstance()
      const allFiles = graph.query({ type: "file" })
      const visited = new Set<string>()

      for (const file of allFiles) {
        const filePath = file.id
        if (visited.has(filePath)) continue
        visited.add(filePath)

        try {
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, "utf-8")
            files.set(filePath, content)
          }
        } catch {
        }
      }
    } catch {
    }

    const snapshot: WorkspaceSnapshot = { id, label, timestamp: Date.now(), files, active: true }
    this.snapshots.set(id, snapshot)

    if (this.checkpointEnabled) {
      const fileSnapshots = Array.from(files.entries()).map(([path, content]) => ({
        path, content, existed: true,
      }))
      await this.checkpointStore.save(
        id, sessionId ?? "default", label, "snapshot", { label }, fileSnapshots,
      )
    }

    return id
  }

  async commit(id: string): Promise<boolean> {
    const snapshot = this.snapshots.get(id)
    if (!snapshot) return false
    snapshot.active = false
    return true
  }

  async restore(id: string): Promise<boolean> {
    const snapshot = this.snapshots.get(id)
    if (!snapshot || !snapshot.active) {
      const result = await this.checkpointStore.restore(id)
      return result.success
    }

    try {
      const fs = await import("fs")
      for (const [filePath, content] of snapshot.files) {
        try {
          fs.writeFileSync(filePath, content, "utf-8")
        } catch {
        }
      }
      snapshot.active = false
      return true
    } catch {
      return false
    }
  }

  async restoreLatest(): Promise<boolean> {
    let latest: WorkspaceSnapshot | null = null
    for (const snapshot of this.snapshots.values()) {
      if (snapshot.active && (!latest || snapshot.timestamp > latest.timestamp)) {
        latest = snapshot
      }
    }
    if (!latest) return false
    return this.restore(latest.id)
  }

  getActiveSnapshot(): WorkspaceSnapshot | null {
    for (const snapshot of this.snapshots.values()) {
      if (snapshot.active) return snapshot
    }
    return null
  }

  listActive(): WorkspaceSnapshot[] {
    return [...this.snapshots.values()].filter(s => s.active)
  }

  async listCheckpoints(): Promise<CheckpointMetadata[]> {
    if (!this.checkpointEnabled) return []
    return this.checkpointStore.listMetadata()
  }

  async restoreCheckpoint(id: string): Promise<{ success: boolean; error?: string }> {
    return this.checkpointStore.restore(id)
  }

  clear(): void {
    this.snapshots.clear()
  }
}
