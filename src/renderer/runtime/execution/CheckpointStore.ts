import { normalizeError } from "@/lib/normalize-error"

export interface CheckpointMetadata {
  id: string
  sessionId: string
  label: string
  timestamp: number
  fileCount: number
  totalBytes: number
  agentToolCall: string
  toolInput: Record<string, unknown>
}

export interface CheckpointData {
  metadata: CheckpointMetadata
  files: Map<string, { backupPath: string; originalPath: string; size: number }>
}

export interface CheckpointStoreConfig {
  baseDir: string
  maxCheckpoints: number
}

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
  ".exe", ".dll", ".so", ".dylib", ".wasm",
  ".zip", ".tar", ".gz", ".7z", ".rar",
  ".mp3", ".mp4", ".avi", ".mov", ".wav",
  ".ico", ".woff", ".woff2", ".ttf", ".eot",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
])

export class CheckpointStore {
  private config: CheckpointStoreConfig
  private index: Map<string, CheckpointData> = new Map()
  private indexLoaded = false

  static readonly DEFAULT_MAX = 50

  constructor(config?: Partial<CheckpointStoreConfig>) {
    this.config = {
      baseDir: config?.baseDir ?? ".agentic-os/checkpoints",
      maxCheckpoints: config?.maxCheckpoints ?? CheckpointStore.DEFAULT_MAX,
    }
  }

  async init(): Promise<void> {
    if (this.indexLoaded) return
    await this.ensureDir(this.config.baseDir)
    await this.loadIndex()
    this.indexLoaded = true
  }

  async save(
    checkpointId: string,
    sessionId: string,
    label: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    fileSnapshots: Array<{ path: string; content?: string; existed: boolean }>,
  ): Promise<CheckpointMetadata> {
    await this.init()

    const checkpointDir = `${this.config.baseDir}/${checkpointId}`
    const filesDir = `${checkpointDir}/files`
    await this.ensureDir(filesDir)

    const fileBackups: CheckpointData["files"] = new Map()
    let totalBytes = 0

    for (const snapshot of fileSnapshots) {
      if (this.isBinary(snapshot.path)) continue

      const ext = this.extFromPath(snapshot.path)
      const backupName = `${this.hashPath(snapshot.path)}${ext ? `.${ext}` : ""}.bak`
      const backupPath = `${filesDir}/${backupName}`

      const size = snapshot.content ? snapshot.content.length : 0
      totalBytes += size

      fileBackups.set(snapshot.path, { backupPath, originalPath: snapshot.path, size })

      if (snapshot.content !== undefined) {
        try {
          const { writeFile } = await import("@/lib/filesystem")
          await writeFile(backupPath, snapshot.content)
        } catch {
          // Skip if backup file write fails
        }
      }
    }

    const metadata: CheckpointMetadata = {
      id: checkpointId,
      sessionId,
      label,
      timestamp: Date.now(),
      fileCount: fileBackups.size,
      totalBytes,
      agentToolCall: toolName,
      toolInput,
    }

    const manifestPath = `${checkpointDir}/metadata.json`
    try {
      const { writeFile } = await import("@/lib/filesystem")
      await writeFile(manifestPath, JSON.stringify(metadata, null, 2))
    } catch {
    }

    const data: CheckpointData = { metadata, files: fileBackups }
    this.index.set(checkpointId, data)

    await this.prune()

    return metadata
  }

  async load(checkpointId: string): Promise<CheckpointData | null> {
    await this.init()

    const cached = this.index.get(checkpointId)
    if (cached) return cached

    const checkpointDir = `${this.config.baseDir}/${checkpointId}`
    const manifestPath = `${checkpointDir}/metadata.json`

    try {
      const { readFile } = await import("@/lib/filesystem")
      const raw = await readFile(manifestPath)
      const metadata: CheckpointMetadata = JSON.parse(raw)
      const files = await this.loadFileBackups(checkpointDir, metadata)
      const data: CheckpointData = { metadata, files }
      this.index.set(checkpointId, data)
      return data
    } catch {
      return null
    }
  }

  async restore(checkpointId: string): Promise<{ success: boolean; error?: string }> {
    const data = await this.load(checkpointId)
    if (!data) return { success: false, error: "Checkpoint not found" }

    let restoredCount = 0
    const errors: string[] = []

    for (const [, backup] of data.files) {
      try {
        const { readFile } = await import("@/lib/filesystem")
        const content = await readFile(backup.backupPath)
        if (content) {
          const { writeFile } = await import("@/lib/filesystem")
          await writeFile(backup.originalPath, content)
          restoredCount++
        }
      } catch (err) {
        errors.push(`Failed to restore ${backup.originalPath}: ${normalizeError(err).message}`)
      }
    }

    if (errors.length > 0) {
      return { success: restoredCount > 0, error: errors.join("; ") }
    }

    return { success: true }
  }

  async delete(checkpointId: string): Promise<boolean> {
    await this.init()

    const checkpointDir = `${this.config.baseDir}/${checkpointId}`
    try {
      const { deleteEntry } = await import("@/lib/filesystem")
      await deleteEntry(checkpointDir)
    } catch {
    }

    this.index.delete(checkpointId)
    return true
  }

  async listMetadata(): Promise<CheckpointMetadata[]> {
    await this.init()
    return Array.from(this.index.values())
      .map((d) => d.metadata)
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  async clear(): Promise<void> {
    await this.init()
    try {
      const { deleteEntry } = await import("@/lib/filesystem")
      await deleteEntry(this.config.baseDir)
    } catch {
    }
    this.index.clear()
  }

  getStats() {
    return {
      totalCheckpoints: this.index.size,
      maxCheckpoints: this.config.maxCheckpoints,
      baseDir: this.config.baseDir,
    }
  }

  private async loadIndex(): Promise<void> {
    try {
      const { listDirectory } = await import("@/lib/filesystem")
      const entries = await listDirectory(this.config.baseDir)
      for (const entry of entries) {
        if (entry.type === "directory") {
          const manifestPath = `${this.config.baseDir}/${entry.name}/metadata.json`
          try {
            const { readFile } = await import("@/lib/filesystem")
            const raw = await readFile(manifestPath)
            const metadata: CheckpointMetadata = JSON.parse(raw)
            const checkpointDir = `${this.config.baseDir}/${entry.name}`
            const files = await this.loadFileBackups(checkpointDir, metadata)
            this.index.set(entry.name, { metadata, files })
          } catch {
          }
        }
      }
    } catch {
    }
  }

  private async loadFileBackups(
    checkpointDir: string,
    metadata: CheckpointMetadata,
  ): Promise<CheckpointData["files"]> {
    const files: CheckpointData["files"] = new Map()
    try {
      const { listDirectory } = await import("@/lib/filesystem")
      const filesDir = `${checkpointDir}/files`
      const fileEntries = await listDirectory(filesDir)
      for (const fe of fileEntries) {
        if (fe.type === "file" && fe.name.endsWith(".bak")) {
          const originalExt = fe.name.split(".").slice(1, -1).join(".")
          const hash = fe.name.replace(`.${originalExt}.bak`, "")
          files.set(hash, {
            backupPath: `${filesDir}/${fe.name}`,
            originalPath: `unknown/${fe.name}`,
            size: 0,
          })
        }
      }
    } catch {
    }
    return files
  }

  private async prune(): Promise<void> {
    if (this.index.size <= this.config.maxCheckpoints) return

    const sorted = Array.from(this.index.entries())
      .sort(([, a], [, b]) => a.metadata.timestamp - b.metadata.timestamp)

    const toRemove = sorted.slice(0, sorted.length - this.config.maxCheckpoints)
    for (const [id] of toRemove) {
      try {
        const { deleteEntry } = await import("@/lib/filesystem")
        await deleteEntry(`${this.config.baseDir}/${id}`)
      } catch {
      }
      this.index.delete(id)
    }
  }

  private async ensureDir(dir: string): Promise<void> {
    try {
      const { mkdir } = await import("@/lib/electron-api")
      await mkdir(dir)
    } catch {
    }
  }

  private isBinary(filePath: string): boolean {
    const ext = this.extFromPath(filePath)
    return ext ? BINARY_EXTENSIONS.has(`.${ext.toLowerCase()}`) : false
  }

  private extFromPath(filePath: string): string {
    const idx = filePath.lastIndexOf(".")
    return idx >= 0 ? filePath.slice(idx + 1) : ""
  }

  private hashPath(filePath: string): string {
    let hash = 0
    for (let i = 0; i < filePath.length; i++) {
      const char = filePath.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0
    }
    return Math.abs(hash).toString(36)
  }
}
