export interface FileSnapshot {
  version: number
  timestamp: number
  messageId: string
  backupPath: string
  originalPath: string
  size: number
}

interface FileHistoryEntry {
  filePath: string
  snapshots: FileSnapshot[]
}

const MAX_SNAPSHOTS_PER_FILE = 100
const AGENTIC_HISTORY_DIR = '.agentic-os/history'
const STORAGE_KEY = 'agentic-file-history'

export class FileHistoryManager {
  private static instance: FileHistoryManager
  private history = new Map<string, FileHistoryEntry>()
  private snapshotSequence = 0
  private persisted = false

  static getInstance(): FileHistoryManager {
    if (!FileHistoryManager.instance) {
      FileHistoryManager.instance = new FileHistoryManager()
    }
    return FileHistoryManager.instance
  }

  /** Load persisted snapshot metadata from localStorage */
  loadFromStorage(): void {
    if (this.persisted) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as {
        history: Array<{ filePath: string; snapshots: FileSnapshot[] }>
        snapshotSequence: number
      }
      this.history.clear()
      for (const entry of data.history) {
        this.history.set(entry.filePath, entry)
      }
      this.snapshotSequence = data.snapshotSequence
      this.persisted = true
    } catch {
      // Corrupt data — start fresh
      this.history.clear()
    }
  }

  /** Persist snapshot metadata to localStorage */
  private persist(): void {
    try {
      const data = {
        history: Array.from(this.history.values()),
        snapshotSequence: this.snapshotSequence,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // Storage full — ignore
    }
  }

  async createSnapshot(filePath: string, content: string, messageId: string): Promise<FileSnapshot | null> {
    this.loadFromStorage()
    const entry = this.history.get(filePath) ?? { filePath, snapshots: [] }
    const version = this.snapshotSequence++
    const relPath = this.getRelativePath(filePath)
    const backupPath = `${AGENTIC_HISTORY_DIR}/${relPath}/v${version}.bak`

    const snapshot: FileSnapshot = {
      version,
      timestamp: Date.now(),
      messageId,
      backupPath,
      originalPath: filePath,
      size: content.length,
    }

    entry.snapshots.push(snapshot)
    if (entry.snapshots.length > MAX_SNAPSHOTS_PER_FILE) {
      entry.snapshots.shift()
    }
    this.history.set(filePath, entry)
    this.persist()

    try {
      const { writeTextFile } = await import('@/lib/electron-api')
      await writeTextFile(backupPath, content)
    } catch {
      return snapshot
    }
    return snapshot
  }

  async restoreSnapshot(filePath: string, version: number): Promise<string | null> {
    this.loadFromStorage()
    const entry = this.history.get(filePath)
    if (!entry) return null
    const snapshot = entry.snapshots.find(s => s.version === version)
    if (!snapshot) return null
    try {
      const { readTextFile } = await import('@/lib/electron-api')
      return await readTextFile(snapshot.backupPath)
    } catch {
      return null
    }
  }

  getHistory(filePath: string): FileSnapshot[] {
    this.loadFromStorage()
    return this.history.get(filePath)?.snapshots ?? []
  }

  getAllHistory(): Map<string, FileSnapshot[]> {
    this.loadFromStorage()
    const result = new Map<string, FileSnapshot[]>()
    for (const [path, entry] of this.history) {
      result.set(path, entry.snapshots)
    }
    return result
  }

  getSnapshotCount(): number {
    this.loadFromStorage()
    let count = 0
    for (const entry of this.history.values()) {
      count += entry.snapshots.length
    }
    return count
  }

  getFilesWithHistory(): { filePath: string; snapshotCount: number; latestTimestamp: number }[] {
    this.loadFromStorage()
    const result: { filePath: string; snapshotCount: number; latestTimestamp: number }[] = []
    for (const entry of this.history.values()) {
      if (entry.snapshots.length > 0) {
        const latest = entry.snapshots[entry.snapshots.length - 1]
        result.push({ filePath: entry.filePath, snapshotCount: entry.snapshots.length, latestTimestamp: latest.timestamp })
      }
    }
    return result.sort((a, b) => b.latestTimestamp - a.latestTimestamp)
  }

  clear(): void {
    this.history.clear()
    this.snapshotSequence = 0
    this.persisted = false
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
  }

  private getRelativePath(absolutePath: string): string {
    return absolutePath.replace(/[\\:]/g, '_')
  }
}
