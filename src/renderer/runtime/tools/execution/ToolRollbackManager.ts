import { normalizeError } from "@/lib/normalize-error"
import { CheckpointStore } from "@/runtime/execution/CheckpointStore"

export interface RollbackPoint {
  id: string
  executionId: string
  toolName: string
  args: Record<string, unknown>
  createdAt: number
  status: "pending" | "confirmed" | "rolled_back"
  fileSnapshots: Array<{ path: string; content?: string; existed: boolean }>
}

export class ToolRollbackManager {
  private static instance: ToolRollbackManager
  private points = new Map<string, RollbackPoint>()
  private maxPoints = 500
  private checkpointStore = new CheckpointStore()
  private diskPersistenceEnabled = true

  static getInstance(): ToolRollbackManager {
    if (!ToolRollbackManager.instance) {
      ToolRollbackManager.instance = new ToolRollbackManager()
    }
    return ToolRollbackManager.instance
  }

  setDiskPersistenceEnabled(enabled: boolean): void {
    this.diskPersistenceEnabled = enabled
  }

  async init(): Promise<void> {
    if (this.diskPersistenceEnabled) {
      await this.checkpointStore.init()
    }
  }

  async createPoint(executionId: string, toolName: string, args: Record<string, unknown>): Promise<RollbackPoint> {
    const fileSnapshots = await this.captureFileSnapshots(toolName, args)

    const point: RollbackPoint = {
      id: `rollback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      executionId,
      toolName,
      args,
      createdAt: Date.now(),
      status: "pending",
      fileSnapshots,
    }

    this.points.set(point.id, point)

    if (this.diskPersistenceEnabled && fileSnapshots.length > 0) {
      await this.checkpointStore.save(
        point.id,
        executionId,
        `Tool: ${toolName}`,
        toolName,
        args,
        fileSnapshots,
      )
    }

    if (this.points.size > this.maxPoints) {
      const entries = Array.from(this.points.entries())
      const toRemove = entries.slice(0, this.points.size - this.maxPoints)
      for (const [id] of toRemove) {
        this.points.delete(id)
      }
    }

    return point
  }

  confirmPoint(pointId: string): boolean {
    const point = this.points.get(pointId)
    if (!point || point.status !== "pending") return false
    point.status = "confirmed"
    return true
  }

  async rollback(pointId: string): Promise<{ success: boolean; error?: string }> {
    const point = this.points.get(pointId)

    if (point) {
      try {
        for (const snapshot of point.fileSnapshots) {
          if (snapshot.existed && snapshot.content !== undefined) {
            const { writeFile } = await import("@/lib/filesystem")
            await writeFile(snapshot.path, snapshot.content)
          } else if (!snapshot.existed) {
            const { deleteEntry } = await import("@/lib/filesystem")
            try {
              await deleteEntry(snapshot.path)
            } catch {
            }
          }
        }
        point.status = "rolled_back"
        return { success: true }
      } catch (err) {
        return { success: false, error: normalizeError(err).message }
      }
    }

    if (this.diskPersistenceEnabled) {
      const result = await this.checkpointStore.restore(pointId)
      if (result.success) return result
    }

    return { success: false, error: "Rollback point not found" }
  }

  async rollbackTo(executionId: string): Promise<{ rolledBack: number; errors: string[] }> {
    const execPoints = Array.from(this.points.values())
      .filter((p) => p.executionId === executionId && (p.status === "pending" || p.status === "confirmed"))
      .sort((a, b) => b.createdAt - a.createdAt)

    let rolledBack = 0
    const errors: string[] = []

    for (const point of execPoints) {
      const result = await this.rollback(point.id)
      if (result.success) {
        rolledBack++
      } else if (result.error) {
        errors.push(result.error)
      }
    }

    return { rolledBack, errors }
  }

  getPoints(executionId?: string): RollbackPoint[] {
    if (executionId) {
      return Array.from(this.points.values()).filter((p) => p.executionId === executionId)
    }
    return Array.from(this.points.values())
  }

  async getPersistedPoints(): Promise<import("@/runtime/execution/CheckpointStore").CheckpointMetadata[]> {
    if (!this.diskPersistenceEnabled) return []
    return this.checkpointStore.listMetadata()
  }

  private async captureFileSnapshots(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<RollbackPoint["fileSnapshots"]> {
    const snapshots: RollbackPoint["fileSnapshots"] = []

    if (toolName === "write_file" || toolName === "edit_file") {
      const filePath = (args.filePath ?? args.path ?? "") as string
      if (filePath) {
        try {
          const { readFile } = await import("@/lib/filesystem")
          const content = await readFile(filePath)
          snapshots.push({ path: filePath, content: content as string, existed: true })
        } catch {
          snapshots.push({ path: filePath, existed: false })
        }
      }
    }

    if (toolName === "bash" || toolName === "run_command") {
      const command = (args.command ?? args.cmd ?? "") as string
      if (command.includes(">") || command.includes(">>")) {
        const match = command.match(/[>]+\s*(\S+)/)
        if (match) {
          const filePath = match[1]
          try {
            const { readFile } = await import("@/lib/filesystem")
            const content = await readFile(filePath)
            snapshots.push({ path: filePath, content: content as string, existed: true })
          } catch {
            snapshots.push({ path: filePath, existed: false })
          }
        }
      }
    }

    return snapshots
  }

  clear(): void {
    this.points.clear()
  }

  async clearDisk(): Promise<void> {
    await this.checkpointStore.clear()
  }

  get stats() {
    const all = Array.from(this.points.values())
    return {
      total: all.length,
      pending: all.filter((p) => p.status === "pending").length,
      confirmed: all.filter((p) => p.status === "confirmed").length,
      rolledBack: all.filter((p) => p.status === "rolled_back").length,
    }
  }
}
