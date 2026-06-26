import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

type FileChangeType = "change" | "create" | "delete"

interface FileChangeEvent {
  type: FileChangeType
  path: string
}

interface DebounceEntry {
  path: string
  timer: ReturnType<typeof setTimeout>
}

/**
 * Test helper that simulates the FileWatcher's debounce and bulk-throttle logic
 * without depending on fs.watch.
 */
class SimulatedFileWatcher {
  debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  bulkTimer: ReturnType<typeof setTimeout> | null = null
  pendingChanges: FileChangeEvent[] = []
  readonly DEBOUNCE_MS = 300
  readonly BULK_THROTTLE_MS = 5000
  readonly BULK_THRESHOLD = 10

  processedEvents: FileChangeEvent[] = []
  onFileChanged?: (event: FileChangeEvent) => void

  private processSingle(event: FileChangeEvent): void {
    this.processedEvents.push(event)
  }

  handleChange(event: FileChangeEvent): void {
    this.pendingChanges.push(event)
    this.onFileChanged?.(event)

    if (this.pendingChanges.length >= this.BULK_THRESHOLD) {
      if (this.bulkTimer) clearTimeout(this.bulkTimer)
      this.bulkTimer = setTimeout(() => this.processBulkChanges(), this.BULK_THROTTLE_MS)
      for (const [, timer] of this.debounceTimers) clearTimeout(timer)
      this.debounceTimers.clear()
      return
    }

    const existingTimer = this.debounceTimers.get(event.path)
    if (existingTimer) clearTimeout(existingTimer)

    this.debounceTimers.set(
      event.path,
      setTimeout(() => {
        this.debounceTimers.delete(event.path)
        this.processSingle(event)
      }, this.DEBOUNCE_MS)
    )
  }

  private async processBulkChanges(): Promise<void> {
    const changes = [...this.pendingChanges]
    this.pendingChanges = []
    this.bulkTimer = null

    const uniquePaths = [...new Set(changes.map((c) => c.path))]
    for (const p of uniquePaths) {
      const ev = changes.find((c) => c.path === p)
      if (ev) this.processedEvents.push(ev)
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

  cancelAll(): void {
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
}

describe("FileWatcher — shouldIgnore", () => {
  const watcher = new SimulatedFileWatcher()

  it("ignores node_modules files", () => {
    expect(watcher.shouldIgnore("node_modules/pkg/index.ts")).toBe(true)
  })

  it("ignores .git files", () => {
    expect(watcher.shouldIgnore(".git/config")).toBe(true)
  })

  it("ignores dist/build output", () => {
    expect(watcher.shouldIgnore("dist/bundle.js")).toBe(true)
    expect(watcher.shouldIgnore("build/output.js")).toBe(true)
    expect(watcher.shouldIgnore(".next/build.js")).toBe(true)
    expect(watcher.shouldIgnore(".cache/file.ts")).toBe(true)
  })

  it("allows .ts and .tsx files", () => {
    expect(watcher.shouldIgnore("src/foo.ts")).toBe(false)
    expect(watcher.shouldIgnore("src/foo.tsx")).toBe(false)
  })

  it("allows .js, .jsx, .json, .css, .html", () => {
    expect(watcher.shouldIgnore("src/foo.js")).toBe(false)
    expect(watcher.shouldIgnore("src/foo.jsx")).toBe(false)
    expect(watcher.shouldIgnore("package.json")).toBe(false)
    expect(watcher.shouldIgnore("src/style.css")).toBe(false)
    expect(watcher.shouldIgnore("index.html")).toBe(false)
  })

  it("ignores .md and .txt files", () => {
    expect(watcher.shouldIgnore("README.md")).toBe(true)
    expect(watcher.shouldIgnore("notes.txt")).toBe(true)
  })

  it("ignores .png and other binary extensions", () => {
    expect(watcher.shouldIgnore("image.png")).toBe(true)
    expect(watcher.shouldIgnore("font.woff2")).toBe(true)
  })
})

describe("FileWatcher — debounce", () => {
  let watcher: SimulatedFileWatcher

  beforeEach(() => {
    vi.useFakeTimers()
    watcher = new SimulatedFileWatcher()
  })

  afterEach(() => {
    watcher.cancelAll()
    vi.useRealTimers()
  })

  it("debounces rapid changes to the same file", () => {
    watcher.handleChange({ type: "change", path: "src/foo.ts" })
    watcher.handleChange({ type: "change", path: "src/foo.ts" })
    watcher.handleChange({ type: "change", path: "src/foo.ts" })

    expect(watcher.debounceTimers.size).toBe(1)
    expect(watcher.processedEvents).toHaveLength(0)

    vi.advanceTimersByTime(300)
    expect(watcher.processedEvents).toHaveLength(1)
    expect(watcher.processedEvents[0].path).toBe("src/foo.ts")
  })

  it("processes different files independently", () => {
    watcher.handleChange({ type: "change", path: "src/a.ts" })
    watcher.handleChange({ type: "change", path: "src/b.ts" })
    watcher.handleChange({ type: "change", path: "src/a.ts" })

    expect(watcher.debounceTimers.size).toBe(2)

    vi.advanceTimersByTime(300)
    expect(watcher.processedEvents).toHaveLength(2)
  })

  it("replaces timer on subsequent changes within debounce window", () => {
    watcher.handleChange({ type: "change", path: "src/foo.ts" })

    const timer1 = watcher.debounceTimers.get("src/foo.ts")
    vi.advanceTimersByTime(100)

    watcher.handleChange({ type: "change", path: "src/foo.ts" })
    const timer2 = watcher.debounceTimers.get("src/foo.ts")

    expect(timer1).not.toBe(timer2)

    vi.advanceTimersByTime(300)
    expect(watcher.processedEvents).toHaveLength(1)
  })
})

describe("FileWatcher — bulk throttle", () => {
  let watcher: SimulatedFileWatcher

  beforeEach(() => {
    vi.useFakeTimers()
    watcher = new SimulatedFileWatcher()
  })

  afterEach(() => {
    watcher.cancelAll()
    vi.useRealTimers()
  })

  it("triggers bulk processing when threshold is reached", () => {
    for (let i = 0; i < 10; i++) {
      watcher.handleChange({ type: "change", path: `src/file${i}.ts` })
    }

    expect(watcher.bulkTimer).not.toBeNull()
    expect(watcher.pendingChanges.length).toBeGreaterThanOrEqual(10)
  })

  it("processes unique paths after bulk throttle fires", () => {
    for (let i = 0; i < 10; i++) {
      watcher.handleChange({ type: "change", path: `src/file${i}.ts` })
    }

    expect(watcher.processedEvents).toHaveLength(0)

    vi.advanceTimersByTime(5000)
    // Unique paths: only 10
    expect(watcher.processedEvents.length).toBeLessThanOrEqual(10)
  })

  it("deduplicates paths in bulk processing", () => {
    // Send 12 changes but only to 3 unique files
    for (let i = 0; i < 4; i++) {
      watcher.handleChange({ type: "change", path: "src/a.ts" })
      watcher.handleChange({ type: "change", path: "src/b.ts" })
      watcher.handleChange({ type: "change", path: "src/c.ts" })
    }

    expect(watcher.bulkTimer).not.toBeNull()

    vi.advanceTimersByTime(5000)
    expect(watcher.processedEvents.length).toBeLessThanOrEqual(3)
  })

  it("does not trigger bulk timer for fewer than threshold changes", () => {
    for (let i = 0; i < 5; i++) {
      watcher.handleChange({ type: "change", path: `src/file${i}.ts` })
    }

    expect(watcher.bulkTimer).toBeNull()
  })
})

describe("FileWatcher — delete detection", () => {
  it("distinguishes create from delete for rename events via existence check", () => {
    const files = new Set<string>(["src/existing.ts"])

    function classifyRename(path: string): FileChangeType {
      if (files.has(path)) {
        files.delete(path)
        return "delete"
      }
      files.add(path)
      return "create"
    }

    expect(classifyRename("src/existing.ts")).toBe("delete")
    expect(files.has("src/existing.ts")).toBe(false)
    expect(classifyRename("src/new.ts")).toBe("create")
    expect(files.has("src/new.ts")).toBe(true)
  })
})
