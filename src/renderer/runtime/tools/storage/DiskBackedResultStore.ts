import { join, relative } from 'path'

let electronApi: Promise<typeof import("@/lib/electron-api")> | undefined
async function getElectronApi() {
  if (!electronApi) electronApi = import("@/lib/electron-api")
  return electronApi
}

export interface StoredResult {
  id: string
  originalLength: number
  storedLength: number
  filePath: string
  preview: string
  createdAt: number
  toolName: string
}

const RESULTS_DIR_NAME = '.agentic-tool-results'
const MAX_PREVIEW_CHARS = 2000
const MAX_DISK_BYTES = 500 * 1024 * 1024

export class DiskBackedResultStore {
  private static instance: DiskBackedResultStore
  private resultsDir: string | null = null
  private store: Map<string, StoredResult> = new Map()
  private totalBytes: number = 0
  private initialized = false

  static getInstance(): DiskBackedResultStore {
    if (!DiskBackedResultStore.instance) {
      DiskBackedResultStore.instance = new DiskBackedResultStore()
    }
    return DiskBackedResultStore.instance
  }

  async initialize(workspaceRoot: string): Promise<void> {
    if (this.initialized) return
    this.resultsDir = join(workspaceRoot, RESULTS_DIR_NAME)
    const { exists, mkdir } = await getElectronApi()
    const dirExists = await exists(this.resultsDir)
    if (!dirExists) {
      await mkdir(this.resultsDir)
    }
    this.initialized = true
    await this.scanExisting()
  }

  private async scanExisting(): Promise<void> {
    if (!this.resultsDir) return
    try {
      const { readDir, readTextFile, remove } = await getElectronApi()
      const entries = await readDir(this.resultsDir)
      for (const entry of entries) {
        if (entry.isDirectory) continue
        const name = typeof entry.name === 'string' ? entry.name : entry
        if (!name.endsWith('.json')) continue
        try {
          const content = await readTextFile(join(this.resultsDir, name))
          const parsed = JSON.parse(content) as StoredResult & { content?: string }
          this.store.set(parsed.id, {
            id: parsed.id,
            originalLength: parsed.originalLength ?? 0,
            storedLength: parsed.storedLength ?? 0,
            filePath: parsed.filePath ?? join(this.resultsDir!, name),
            preview: parsed.preview ?? '',
            createdAt: parsed.createdAt ?? Date.now(),
            toolName: parsed.toolName ?? '',
          })
          this.totalBytes += parsed.storedLength ?? 0
        } catch {
          try { await remove(join(this.resultsDir!, name)) } catch {}
        }
      }
      this.enforceQuota()
    } catch {}
  }

  private enforceQuota(): void {
    if (this.totalBytes <= MAX_DISK_BYTES) return
    const sorted = Array.from(this.store.values()).sort((a, b) => a.createdAt - b.createdAt)
    while (this.totalBytes > MAX_DISK_BYTES && sorted.length > 0) {
      const oldest = sorted.shift()!
      this.deleteResult(oldest.id)
    }
  }

  async storeResult(id: string, content: string, toolName: string): Promise<StoredResult> {
    if (!this.resultsDir) {
      return {
        id, originalLength: content.length, storedLength: content.length,
        filePath: '', preview: content.slice(0, MAX_PREVIEW_CHARS),
        createdAt: Date.now(), toolName,
      }
    }
    const preview = content.length > MAX_PREVIEW_CHARS
      ? content.slice(0, MAX_PREVIEW_CHARS) + `\n\n... [${content.length - MAX_PREVIEW_CHARS} more chars — see full result at tool result file]`
      : content
    const result: StoredResult = {
      id,
      originalLength: content.length,
      storedLength: content.length,
      filePath: join(this.resultsDir, `${id}.json`),
      preview,
      createdAt: Date.now(),
      toolName,
    }
    const { writeTextFile } = await getElectronApi()
    await writeTextFile(result.filePath, JSON.stringify({ content, ...result }))
    this.store.set(id, result)
    this.totalBytes += content.length
    this.enforceQuota()
    return result
  }

  async getResult(id: string): Promise<{ content: string; meta: StoredResult } | null> {
    const meta = this.store.get(id)
    if (!meta) return null
    try {
      if (meta.filePath) {
        const { exists, readTextFile } = await getElectronApi()
        const fileExists = await exists(meta.filePath)
        if (fileExists) {
          const raw = await readTextFile(meta.filePath)
          const parsed = JSON.parse(raw)
          return { content: parsed.content ?? '', meta }
        }
      }
    } catch {}
    return null
  }

  getPreview(id: string): string | null {
    const meta = this.store.get(id)
    if (!meta) return null
    return meta.preview
  }

  getReferenceBlock(id: string, toolName: string): string {
    const meta = this.store.get(id)
    if (!meta) return ''
    const dir = this.resultsDir ?? ''
    const relPath = relative(dir, meta.filePath)
    return `\n\n[Full ${toolName} result (${meta.originalLength} chars) stored at: ${relPath}]\nPreview:\n${meta.preview}`
  }

  async deleteResult(id: string): Promise<boolean> {
    const meta = this.store.get(id)
    if (!meta) return false
    try {
      if (meta.filePath) {
        const { exists, remove } = await getElectronApi()
        const fileExists = await exists(meta.filePath)
        if (fileExists) {
          await remove(meta.filePath)
        }
      }
    } catch {}
    this.store.delete(id)
    this.totalBytes -= meta.storedLength
    return true
  }

  async clear(): Promise<void> {
    const ids = Array.from(this.store.keys())
    await Promise.allSettled(ids.map((id) => this.deleteResult(id)))
    this.totalBytes = 0
  }

  getStats(): { totalResults: number; totalBytes: number; quotaBytes: number; usagePercent: number } {
    return {
      totalResults: this.store.size,
      totalBytes: this.totalBytes,
      quotaBytes: MAX_DISK_BYTES,
      usagePercent: Math.round((this.totalBytes / MAX_DISK_BYTES) * 10000) / 100,
    }
  }
}
