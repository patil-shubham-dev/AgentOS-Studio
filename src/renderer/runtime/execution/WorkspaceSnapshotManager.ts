import { RepositoryKnowledgeGraph } from "@/runtime/intelligence/RepositoryKnowledgeGraph"

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

  static getInstance(): WorkspaceSnapshotManager {
    if (!WorkspaceSnapshotManager.instance) {
      WorkspaceSnapshotManager.instance = new WorkspaceSnapshotManager()
    }
    return WorkspaceSnapshotManager.instance
  }

  async create(label: string): Promise<string> {
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
    if (!snapshot || !snapshot.active) return false

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

  clear(): void {
    this.snapshots.clear()
  }
}
