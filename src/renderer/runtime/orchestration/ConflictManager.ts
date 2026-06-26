import type { TaskId, FileLock, FileLockType } from "./types"
import type { OrchestrationEventBus } from "./events"

export interface FileLockConflict {
  taskId: TaskId
  filePath: string
  existingLock: FileLock
  attemptedLock: FileLock
  reason: string
}

export interface ConflictResult {
  acquired: boolean
  conflicts: FileLockConflict[]
  acquiredLocks: FileLock[]
}

export interface ConflictManagerStats {
  activeTasks: number
  activeFiles: number
  totalConflicts: number
  totalAcquisitions: number
}

function rangesOverlap(a: FileLock, b: FileLock): boolean {
  if (a.filePath !== b.filePath) return false

  const aEnd = a.endLine === 0 ? Number.MAX_SAFE_INTEGER : a.endLine
  const aStart = a.startLine
  const bEnd = b.endLine === 0 ? Number.MAX_SAFE_INTEGER : b.endLine
  const bStart = b.startLine

  return aStart <= bEnd && aEnd >= bStart
}

function locksConflict(a: FileLock, b: FileLock): boolean {
  if (a.filePath !== b.filePath) return false
  if (!rangesOverlap(a, b)) return false

  if (a.type === "write" || b.type === "write") return true
  return false
}

export class ConflictManager {
  private activeLocks = new Map<string, FileLock[]>()
  private taskLocks = new Map<TaskId, FileLock[]>()
  private conflictCount = 0
  private acquisitionCount = 0

  acquireLocks(taskId: TaskId, locks: FileLock[], options?: {
    eventBus?: OrchestrationEventBus
    sessionId?: string
  }): ConflictResult {
    const conflicts: FileLockConflict[] = []

    for (const lock of locks) {
      const existing = this.activeLocks.get(lock.filePath) ?? []
      for (const active of existing) {
        if (active.taskId === taskId) continue
        if (locksConflict(lock, active)) {
          conflicts.push({
            taskId,
            filePath: lock.filePath,
            existingLock: active,
            attemptedLock: lock,
            reason: `task ${active.taskId} ${active.type === "write" ? "writes to" : "reads"} ${lock.filePath} at lines ${active.startLine}-${active.endLine === 0 ? "EOF" : active.endLine}`,
          })
        }
      }
    }

    if (conflicts.length > 0) {
      this.conflictCount++
      return { acquired: false, conflicts, acquiredLocks: [] }
    }

    const acquiredLocks: FileLock[] = []
    for (const lock of locks) {
      const lockWithTask: FileLock = { ...lock, taskId }
      if (!this.activeLocks.has(lock.filePath)) {
        this.activeLocks.set(lock.filePath, [])
      }
      this.activeLocks.get(lock.filePath)!.push(lockWithTask)
      acquiredLocks.push(lockWithTask)
    }

    this.taskLocks.set(taskId, acquiredLocks)
    this.acquisitionCount++

    if (options?.eventBus && options?.sessionId) {
      for (const lock of acquiredLocks) {
        options.eventBus.emit({
          type: "FileLockAcquired",
          sessionId: options.sessionId,
          taskId,
          filePath: lock.filePath,
          lockType: lock.type,
          startLine: lock.startLine,
          endLine: lock.endLine,
          timestamp: Date.now(),
        } as any)
      }
    }

    return { acquired: true, conflicts: [], acquiredLocks }
  }

  releaseTaskLocks(taskId: TaskId, options?: {
    eventBus?: OrchestrationEventBus
    sessionId?: string
  }): void {
    const locks = this.taskLocks.get(taskId)
    if (!locks) return

    for (const lock of locks) {
      const fileLocks = this.activeLocks.get(lock.filePath)
      if (fileLocks) {
        const idx = fileLocks.findIndex((l) => l.taskId === taskId && l.startLine === lock.startLine && l.endLine === lock.endLine && l.type === lock.type)
        if (idx !== -1) {
          fileLocks.splice(idx, 1)
        }
        if (fileLocks.length === 0) {
          this.activeLocks.delete(lock.filePath)
        }
      }
    }

    this.taskLocks.delete(taskId)

    if (options?.eventBus && options?.sessionId) {
      options.eventBus.emit({
        type: "FileLockReleased",
        sessionId: options.sessionId,
        taskId,
        lockCount: locks.length,
        timestamp: Date.now(),
      } as any)
    }
  }

  getConflicts(taskId: TaskId, locks: FileLock[]): FileLockConflict[] {
    const conflicts: FileLockConflict[] = []

    for (const lock of locks) {
      const existing = this.activeLocks.get(lock.filePath) ?? []
      for (const active of existing) {
        if (active.taskId === taskId) continue
        if (locksConflict(lock, active)) {
          conflicts.push({
            taskId,
            filePath: lock.filePath,
            existingLock: active,
            attemptedLock: lock,
            reason: `conflict with task ${active.taskId} on ${lock.filePath}`,
          })
        }
      }
    }

    return conflicts
  }

  getActiveLocksForFile(filePath: string): FileLock[] {
    return this.activeLocks.get(filePath) ?? []
  }

  getTaskLocks(taskId: TaskId): FileLock[] {
    return this.taskLocks.get(taskId) ?? []
  }

  isFileLocked(filePath: string, type?: FileLockType): boolean {
    const locks = this.activeLocks.get(filePath)
    if (!locks || locks.length === 0) return false
    if (type) return locks.some((l) => l.type === type)
    return true
  }

  clear(): void {
    this.activeLocks.clear()
    this.taskLocks.clear()
    this.conflictCount = 0
    this.acquisitionCount = 0
  }

  getStats(): ConflictManagerStats {
    return {
      activeTasks: this.taskLocks.size,
      activeFiles: this.activeLocks.size,
      totalConflicts: this.conflictCount,
      totalAcquisitions: this.acquisitionCount,
    }
  }

  get activeLockCount(): number {
    let count = 0
    for (const locks of this.activeLocks.values()) {
      count += locks.length
    }
    return count
  }
}
