import { workspaceSymbolIndex } from "./symbol-index"
import { semanticSearch } from "./semantic-search"
import { reindexFile } from "./workspace-intelligence"

export type FileChangeType = "change" | "create" | "delete"

export interface FileChangeEvent {
  type: FileChangeType
  path: string
}

export class FileWatcher {
  private watcher: any = null
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private bulkTimer: ReturnType<typeof setTimeout> | null = null
  private pendingChanges: FileChangeEvent[] = []
  private readonly DEBOUNCE_MS = 300
  private readonly BULK_THROTTLE_MS = 5000
  private readonly BULK_THRESHOLD = 10
  private rootPath = ""
  private onFileChanged?: (event: FileChangeEvent) => void

  start(rootPath: string, onFileChanged?: (event: FileChangeEvent) => void): void {
    this.rootPath = rootPath
    this.onFileChanged = onFileChanged
    this.stop()

    try {
      const fs = require("fs")
      this.watcher = fs.watch(rootPath, { recursive: true }, (eventType: string, filename: string | null) => {
        if (!filename) return
        if (this.shouldIgnore(filename)) return

        let type: FileChangeType
        if (eventType === "rename") {
          const absPath = `${rootPath}/${filename.replace(/\\/g, "/")}`
          try {
            fs.accessSync(absPath)
            type = "create"
          } catch {
            type = "delete"
          }
        } else {
          type = "change"
        }
        const absPath = `${rootPath}/${filename.replace(/\\/g, "/")}`

        this.handleChange({ type, path: absPath })
      })
    } catch (err) {
      console.warn("[FileWatcher] Failed to start:", err)
    }
  }

  stop(): void {
    if (this.watcher) {
      try {
        this.watcher.close()
      } catch {
      }
      this.watcher = null
    }
    for (const [, timer] of this.debounceTimers) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
    if (this.bulkTimer) {
      clearTimeout(this.bulkTimer)
      this.bulkTimer = null
    }
    this.pendingChanges = []
  }

  private handleChange(event: FileChangeEvent): void {
    this.pendingChanges.push(event)
    this.onFileChanged?.(event)

    if (this.pendingChanges.length >= this.BULK_THRESHOLD) {
      if (this.bulkTimer) clearTimeout(this.bulkTimer)
      this.bulkTimer = setTimeout(() => this.processBulkChanges(), this.BULK_THROTTLE_MS)
      return
    }

    const existingTimer = this.debounceTimers.get(event.path)
    if (existingTimer) clearTimeout(existingTimer)

    this.debounceTimers.set(
      event.path,
      setTimeout(() => {
        this.debounceTimers.delete(event.path)
        this.reindexFile(event.path).catch(() => {})
      }, this.DEBOUNCE_MS)
    )
  }

  private async processBulkChanges(): Promise<void> {
    const changes = [...this.pendingChanges]
    this.pendingChanges = []
    this.bulkTimer = null

    console.log(`[FileWatcher] Processing ${changes.length} bulk file changes...`)
    const uniquePaths = [...new Set(changes.map((c) => c.path))]
    await Promise.allSettled(uniquePaths.map((p) => this.reindexFile(p)))
    console.log(`[FileWatcher] Bulk reindexed ${uniquePaths.length} files`)
  }

  private async reindexFile(absPath: string): Promise<void> {
    try {
      await reindexFile(absPath)
    } catch {
      // ignore individual file errors
    }
  }

  private shouldIgnore(filename: string): boolean {
    const ignored = ["node_modules", ".git", "dist", ".next", "build", ".cache", ".turbo"]
    for (const pattern of ignored) {
      if (filename.includes(pattern)) return true
    }
    const extensions = [".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".html", ".vue", ".svelte"]
    return !extensions.some((ext) => filename.endsWith(ext))
  }
}

export const fileWatcher = new FileWatcher()
