interface FileSnapshot {
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

export class FileHistoryManager {
  private static instance: FileHistoryManager
  private history = new Map<string, FileHistoryEntry>()
  private snapshotSequence = 0

  static getInstance(): FileHistoryManager {
    if (!FileHistoryManager.instance) {
      FileHistoryManager.instance = new FileHistoryManager()
    }
    return FileHistoryManager.instance
  }

  async createSnapshot(filePath: string, content: string, messageId: string): Promise<FileSnapshot | null> {
    const entry = this.history.get(filePath) ?? { filePath, snapshots: [] }
    const version = this.snapshotSequence++
    const backupPath = `${AGENTIC_HISTORY_DIR}/${this.getRelativePath(filePath)}/v${version}.bak`

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

    try {
      const { writeTextFile: shimWrite } = await import('@/lib/tauri-shims/fs')
      await shimWrite(backupPath, content)
    } catch {
      return snapshot
    }
    return snapshot
  }

  async restoreSnapshot(filePath: string, version: number): Promise<string | null> {
    const entry = this.history.get(filePath)
    if (!entry) return null
    const snapshot = entry.snapshots.find(s => s.version === version)
    if (!snapshot) return null
    try {
      const { readTextFile: shimRead } = await import('@/lib/tauri-shims/fs')
      return await shimRead(snapshot.backupPath)
    } catch {
      return null
    }
  }

  getHistory(filePath: string): FileSnapshot[] {
    return this.history.get(filePath)?.snapshots ?? []
  }

  getAllHistory(): Map<string, FileSnapshot[]> {
    const result = new Map<string, FileSnapshot[]>()
    for (const [path, entry] of this.history) {
      result.set(path, entry.snapshots)
    }
    return result
  }

  clear(): void {
    this.history.clear()
    this.snapshotSequence = 0
  }

  private getRelativePath(absolutePath: string): string {
    return absolutePath.replace(/[\\:]/g, '_')
  }
}
