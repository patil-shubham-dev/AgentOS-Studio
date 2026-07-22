import { safeSetItem, safeGetItem, safeRemoveItem } from './safe-storage'

export interface DirtyBuffer {
  path: string
  content: string
  lastModified: number
  originalMtime: number
}

const STORAGE_KEY = 'agentic-dirty-buffers'
const SNAPSHOT_DELAY = 2000
const MAX_BUFFERS = 50

class DirtyBufferManager {
  private buffers = new Map<string, DirtyBuffer>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending = false

  markDirty(path: string, content: string, originalMtime?: number) {
    this.buffers.set(path, {
      path,
      content,
      lastModified: Date.now(),
      originalMtime: originalMtime ?? 0,
    })
    if (this.buffers.size > MAX_BUFFERS) {
      const oldest = [...this.buffers.entries()].sort(
        (a, b) => a[1].lastModified - b[1].lastModified
      )[0]
      if (oldest) this.buffers.delete(oldest[0])
    }
    this.schedule()
  }

  markClean(path: string) {
    this.buffers.delete(path)
    this.schedule()
  }

  markAllClean() {
    this.buffers.clear()
    this.schedule()
  }

  getDirtyBuffers(): DirtyBuffer[] {
    return Array.from(this.buffers.values())
  }

  hasDirtyFiles(): boolean {
    return this.buffers.size > 0
  }

  loadRecovered(): DirtyBuffer[] {
    try {
      const raw = safeGetItem(STORAGE_KEY)
      if (!raw) return []
      const entries: [string, DirtyBuffer][] = JSON.parse(raw)
      this.buffers = new Map(entries)
      safeRemoveItem(STORAGE_KEY)
      return this.getDirtyBuffers()
    } catch {
      return []
    }
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.persist()
  }

  private schedule() {
    if (this.pending) return
    this.pending = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.persist()
      this.pending = false
      this.timer = null
    }, SNAPSHOT_DELAY)
  }

  private persist() {
    if (this.buffers.size === 0) {
      safeRemoveItem(STORAGE_KEY)
      return
    }
    const data = JSON.stringify([...this.buffers.entries()])
    safeSetItem(STORAGE_KEY, data)
  }

  dispose() {
    this.flush()
    this.buffers.clear()
  }
}

export const dirtyBufferManager = new DirtyBufferManager()
