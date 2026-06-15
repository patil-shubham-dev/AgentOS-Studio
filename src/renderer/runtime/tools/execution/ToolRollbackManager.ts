import { normalizeError } from "@/lib/normalize-error"

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

  static getInstance(): ToolRollbackManager {
    if (!ToolRollbackManager.instance) {
      ToolRollbackManager.instance = new ToolRollbackManager()
    }
    return ToolRollbackManager.instance
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
    if (!point) return { success: false, error: "Rollback point not found" }

    try {
      for (const snapshot of point.fileSnapshots) {
        if (snapshot.existed && snapshot.content !== undefined) {
          const { writeFile } = await import("@/lib/filesystem")
          await writeFile(snapshot.path, snapshot.content)
        } else if (!snapshot.existed) {
          const { deleteFile } = await import("@/lib/filesystem")
          try {
            await deleteFile(snapshot.path)
          } catch {
            // File may not exist — that's fine
          }
        }
      }

      point.status = "rolled_back"
      return { success: true }
    } catch (err) {
      return { success: false, error: normalizeError(err).message }
    }
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
      // Bash rollback is best-effort — record what files might be affected
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
