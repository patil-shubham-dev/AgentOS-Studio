import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, readdirSync } from 'fs'
import { join, relative } from 'path'

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

  initialize(workspaceRoot: string): void {
    if (this.initialized) return
    this.resultsDir = join(workspaceRoot, RESULTS_DIR_NAME)
    if (!existsSync(this.resultsDir)) {
      mkdirSync(this.resultsDir, { recursive: true })
    }
    this.initialized = true
    this.scanExisting()
  }

  private scanExisting(): void {
    if (!this.resultsDir) return
    try {
      const files = readdirSync(this.resultsDir)
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        try {
          const content = readFileSync(join(this.resultsDir, file), 'utf-8')
          const parsed = JSON.parse(content) as StoredResult
          this.store.set(parsed.id, parsed)
          this.totalBytes += parsed.storedLength
        } catch {
          try { unlinkSync(join(this.resultsDir!, file)) } catch {}
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

  storeResult(id: string, content: string, toolName: string): StoredResult {
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
    writeFileSync(result.filePath, JSON.stringify({ content, ...result }), 'utf-8')
    this.store.set(id, result)
    this.totalBytes += content.length
    this.enforceQuota()
    return result
  }

  getResult(id: string): { content: string; meta: StoredResult } | null {
    const meta = this.store.get(id)
    if (!meta) return null
    try {
      if (meta.filePath && existsSync(meta.filePath)) {
        const raw = readFileSync(meta.filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        return { content: parsed.content ?? '', meta }
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
    const relPath = this.resultsDir ? relative(process.cwd(), meta.filePath) : ''
    return `\n\n[Full ${toolName} result (${meta.originalLength} chars) stored at: ${relPath}]\nPreview:\n${meta.preview}`
  }

  deleteResult(id: string): boolean {
    const meta = this.store.get(id)
    if (!meta) return false
    try {
      if (meta.filePath && existsSync(meta.filePath)) {
        unlinkSync(meta.filePath)
      }
    } catch {}
    this.store.delete(id)
    this.totalBytes -= meta.storedLength
    return true
  }

  clear(): void {
    for (const id of this.store.keys()) {
      this.deleteResult(id)
    }
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
