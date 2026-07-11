import { MemoryArchitecture } from "./unified/MemoryArchitecture"
import { createMemoryEntry } from "./unified/types"
import type { MemoryEntry } from "./unified/types"

export interface BrowserMemoryRecord {
  action: string
  sessionId: string
  tabId: string
  url: string
  title: string
  domSnippet?: string
  screenshotRef?: string
  error?: string
  durationMs: number
  timestamp: number
  executionId?: string
  traceId?: string
}

const MAX_BROWSER_MEMORY = 500

export class BrowserMemory {
  private static instance: BrowserMemory
  private records: BrowserMemoryRecord[] = []
  private memoryArch = MemoryArchitecture.getInstance()

  static getInstance(): BrowserMemory {
    if (!BrowserMemory.instance) {
      BrowserMemory.instance = new BrowserMemory()
    }
    return BrowserMemory.instance
  }

  record(entry: BrowserMemoryRecord): void {
    this.records.push(entry)
    if (this.records.length > MAX_BROWSER_MEMORY) {
      this.records = this.records.slice(-Math.floor(MAX_BROWSER_MEMORY / 2))
    }

    this.memoryArch.storage.store(createMemoryEntry({
      content: JSON.stringify({
        action: entry.action,
        url: entry.url,
        title: entry.title,
        error: entry.error,
        durationMs: entry.durationMs,
      }),
      source: "browser",
      type: "session",
      scope: "session",
      tags: ["browser", entry.action, entry.sessionId],
      ttl: 3600000,
    }))

    if (entry.url) {
      this.memoryArch.storage.store(createMemoryEntry({
        content: entry.title || entry.url,
        source: "browser",
        type: "long_term",
        scope: "project",
        tags: ["browser", "url", entry.sessionId],
      }))
    }
  }

  getRecent(limit = 20): BrowserMemoryRecord[] {
    return this.records.slice(-limit).reverse()
  }

  queryBySession(sessionId: string): BrowserMemoryRecord[] {
    return this.records.filter((r) => r.sessionId === sessionId)
  }

  queryByUrl(url: string): BrowserMemoryRecord[] {
    return this.records.filter((r) => r.url === url)
  }

  queryByAction(action: string): BrowserMemoryRecord[] {
    return this.records.filter((r) => r.action === action)
  }

  getSessionSummary(sessionId: string): {
    actionCount: number
    uniqueUrls: string[]
    errors: number
    durationMs: number
  } {
    const sessionRecords = this.records.filter((r) => r.sessionId === sessionId)
    const uniqueUrls = [...new Set(sessionRecords.map((r) => r.url).filter(Boolean))]
    const errors = sessionRecords.filter((r) => r.error).length
    const durationMs = sessionRecords.reduce((a, r) => a + r.durationMs, 0)
    return { actionCount: sessionRecords.length, uniqueUrls, errors, durationMs }
  }

  async searchMemory(query: string): Promise<MemoryEntry[]> {
    return this.memoryArch.storage.query({
      types: ["session"],
      text: query,
      limit: 20,
    })
  }

  clear(): void {
    this.records = []
  }

  get size(): number {
    return this.records.length
  }

  private normalizeUrl(url: string): string {
    try {
      const u = new URL(url)
      return `${u.hostname}${u.pathname.replace(/\/$/, "")}`
    } catch {
      return url
    }
  }
}
