import type { MemoryEntry, MemoryQuery, MemoryScope, MemoryStats, MemoryConfig, MemoryType } from "./types"
import { createMemoryEntry, DEFAULT_MEMORY_CONFIG } from "./types"

interface TierConfig {
  maxEntries: number
  ttl: number
}

interface PersistedEntry {
  id: string
  type: string
  scope: string
  category: string
  content: string
  source: string
  timestamp: number
  updatedAt: number
  lastAccessed: number
  accessCount: number
  importance: number
  confidence: number
  status: string
  tags: string[]
  filePaths: string[]
  metadata: string
  ttl: number
  parentId: string
  version: number
  decayFactor: number
}

const DB_NAME = "agentic-memory"
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains("entries")) {
        const store = db.createObjectStore("entries", { keyPath: "id" })
        store.createIndex("scope", "scope", { unique: false })
        store.createIndex("type", "type", { unique: false })
        store.createIndex("category", "category", { unique: false })
        store.createIndex("status", "status", { unique: false })
        store.createIndex("timestamp", "timestamp", { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class StorageEngine {
  private config: MemoryConfig
  private ephemeral: Map<string, MemoryEntry> = new Map()
  private db: IDBDatabase | null = null
  private dbReady: Promise<void>
  private dbResolve!: () => void

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config }
    this.dbReady = new Promise((resolve) => { this.dbResolve = resolve })
    this.initDB()
  }

  private async initDB(): Promise<void> {
    try {
      this.db = await openDB()
    } catch (err) {
      console.warn("[MemoryStorage] IndexedDB unavailable, using in-memory only:", err)
    }
    this.dbResolve()
  }

  async store(entry: MemoryEntry): Promise<void> {
    entry.lastAccessed = Date.now()
    entry.updatedAt = Date.now()

    if (entry.scope === "ephemeral") {
      this.storeEphemeral(entry)
      return
    }

    await this.dbReady
    if (this.db) {
      try {
        await this.putInDB(entry)
      } catch (err) {
        console.warn("[MemoryStorage] DB store failed, falling back to in-memory:", err)
        this.storeEphemeral(entry)
      }
    } else {
      this.storeEphemeral(entry)
    }
  }

  private storeEphemeral(entry: MemoryEntry): void {
    this.ephemeral.set(entry.id, entry)
    if (this.ephemeral.size > this.config.ephemeralMaxEntries) {
      const oldest = Array.from(this.ephemeral.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, this.ephemeral.size - this.config.ephemeralMaxEntries)
      for (const [id] of oldest) {
        this.ephemeral.delete(id)
      }
    }
  }

  async storeBatch(entries: MemoryEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.store(entry)
    }
  }

  async get(id: string): Promise<MemoryEntry | undefined> {
    const eph = this.ephemeral.get(id)
    if (eph) return this.touch(eph)

    await this.dbReady
    if (this.db) {
      try {
        const stored = await this.getFromDB(id)
        if (stored) {
          const entry = this.fromPersisted(stored)
          return this.touch(entry)
        }
      } catch { console.warn("[StorageEngine] L2 get failed") }
    }
    return undefined
  }

  async update(id: string, updates: Partial<MemoryEntry>): Promise<void> {
    const existing = await this.get(id)
    if (!existing) return
    const updated: MemoryEntry = { ...existing, ...updates, updatedAt: Date.now(), id }
    if (updated.scope === "ephemeral") {
      this.ephemeral.set(id, updated)
    } else {
      await this.dbReady
      if (this.db) {
        try {
          await this.putInDB(updated)
        } catch {
          this.ephemeral.set(id, updated)
        }
      } else {
        this.ephemeral.set(id, updated)
      }
    }
  }

  async delete(id: string): Promise<void> {
    this.ephemeral.delete(id)
    await this.dbReady
    if (this.db) {
      try {
        await this.deleteFromDB(id)
      } catch { console.warn("[StorageEngine] L2 delete failed") }
    }
  }

  async query(query: MemoryQuery): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = []

    const ephResults = this.queryEphemeral(query)
    results.push(...ephResults)

    await this.dbReady
    if (this.db) {
      try {
        const dbResults = await this.queryDB(query)
        for (const dbEntry of dbResults) {
          if (!this.ephemeral.has(dbEntry.id)) {
            results.push(this.touch(dbEntry))
          }
        }
      } catch { console.warn("[StorageEngine] L2 query failed") }
    }

    results.sort((a, b) => {
      const dir = query.sortDir === "asc" ? 1 : -1
      switch (query.sortBy) {
        case "importance": return (a.importance - b.importance) * dir
        case "confidence": return (a.confidence - b.confidence) * dir
        case "accessCount": return (a.accessCount - b.accessCount) * dir
        case "lastAccessed": return (a.lastAccessed - b.lastAccessed) * dir
        default: return (a.timestamp - b.timestamp) * dir
      }
    })

    const limit = query.limit ?? 50
    const offset = query.offset ?? 0
    return results.slice(offset, offset + limit)
  }

  async getAll(query?: MemoryQuery): Promise<MemoryEntry[]> {
    return this.query(query ?? { limit: 10000 })
  }

  async count(query?: MemoryQuery): Promise<number> {
    const results = await this.query(query ?? { limit: 100000 })
    return results.length
  }

  async getStats(): Promise<MemoryStats> {
    const all = await this.getAll()
    const byType: Record<string, number> = {}
    const byScope: Record<string, number> = {}
    const byCategory: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    let sumImportance = 0
    let sumConfidence = 0

    for (const e of all) {
      byType[e.type] = (byType[e.type] ?? 0) + 1
      byScope[e.scope] = (byScope[e.scope] ?? 0) + 1
      byCategory[e.category] = (byCategory[e.category] ?? 0) + 1
      byStatus[e.status] = (byStatus[e.status] ?? 0) + 1
      sumImportance += e.importance
      sumConfidence += e.confidence
    }

    const timestamps = all.map((e) => e.timestamp)
    return {
      totalEntries: all.length,
      byType,
      byScope,
      byCategory,
      byStatus,
      totalSizeBytes: JSON.stringify(all).length,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : 0,
      averageImportance: all.length > 0 ? sumImportance / all.length : 0,
      averageConfidence: all.length > 0 ? sumConfidence / all.length : 0,
    }
  }

  async clear(): Promise<void> {
    this.ephemeral.clear()
    await this.dbReady
    if (this.db) {
      try {
        const tx = this.db.transaction("entries", "readwrite")
        const store = tx.objectStore("entries")
        store.clear()
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      } catch { console.warn("[StorageEngine] clear failed") }
    }
  }

  async clearScope(scope: MemoryScope): Promise<void> {
    for (const [id, entry] of this.ephemeral) {
      if (entry.scope === scope) this.ephemeral.delete(id)
    }
    await this.dbReady
    if (this.db) {
      try {
        const entries = await this.queryDB({ scopes: [scope], limit: 100000 })
        for (const entry of entries) {
          await this.deleteFromDB(entry.id)
        }
      } catch { console.warn("[StorageEngine] clearScope failed") }
    }
  }

  private matchesQuery(entry: MemoryEntry, query: MemoryQuery): boolean {
    if (query.types && !query.types.includes(entry.type)) return false
    if (query.scopes && !query.scopes.includes(entry.scope)) return false
    if (query.categories && !query.categories.includes(entry.category)) return false
    if (query.status && entry.status !== query.status) return false
    if (query.minImportance !== undefined && entry.importance < query.minImportance) return false
    if (query.minConfidence !== undefined && entry.confidence < query.minConfidence) return false
    if (query.dateFrom && entry.timestamp < query.dateFrom) return false
    if (query.dateTo && entry.timestamp > query.dateTo) return false
    if (query.text) {
      const q = query.text.toLowerCase()
      if (!entry.content.toLowerCase().includes(q) && !entry.tags.some((t) => t.toLowerCase().includes(q))) return false
    }
    if (query.tags && query.tags.length > 0) {
      if (!query.tags.some((t) => entry.tags.includes(t))) return false
    }
    if (query.filePaths && query.filePaths.length > 0) {
      if (!query.filePaths.some((fp) => entry.filePaths.includes(fp))) return false
    }
    if (query.sources && !query.sources.includes(entry.source)) return false
    return true
  }

  private queryEphemeral(query: MemoryQuery): MemoryEntry[] {
    return Array.from(this.ephemeral.values()).filter((e) => {
      if (this.isExpired(e)) {
        this.ephemeral.delete(e.id)
        return false
      }
      return this.matchesQuery(e, query)
    })
  }

  private isExpired(entry: MemoryEntry): boolean {
    if (entry.ttl <= 0) return false
    return Date.now() - entry.timestamp > entry.ttl
  }

  private touch(entry: MemoryEntry): MemoryEntry {
    entry.accessCount++
    entry.lastAccessed = Date.now()
    return entry
  }

  private async putInDB(entry: MemoryEntry): Promise<void> {
    if (!this.db) return
    const persisted: PersistedEntry = {
      ...entry,
      metadata: JSON.stringify(entry.metadata),
    }
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("entries", "readwrite")
      const store = tx.objectStore("entries")
      store.put(persisted)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  private async getFromDB(id: string): Promise<PersistedEntry | undefined> {
    if (!this.db) return undefined
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("entries", "readonly")
      const store = tx.objectStore("entries")
      const req = store.get(id)
      req.onsuccess = () => resolve(req.result ?? undefined)
      req.onerror = () => reject(req.error)
    })
  }

  private async deleteFromDB(id: string): Promise<void> {
    if (!this.db) return
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("entries", "readwrite")
      const store = tx.objectStore("entries")
      store.delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  private async queryDB(query: MemoryQuery): Promise<MemoryEntry[]> {
    if (!this.db) return []
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("entries", "readonly")
      const store = tx.objectStore("entries")
      const req = store.getAll()
      req.onsuccess = () => {
        const results: MemoryEntry[] = []
        for (const stored of req.result as PersistedEntry[]) {
          const entry = this.fromPersisted(stored)
          if (this.matchesQuery(entry, query) && !this.isExpired(entry)) {
            results.push(entry)
          }
        }
        resolve(results)
      }
      req.onerror = () => reject(req.error)
    })
  }

  private fromPersisted(stored: PersistedEntry): MemoryEntry {
    return {
      ...stored,
      metadata: typeof stored.metadata === "string" ? JSON.parse(stored.metadata) : (stored.metadata ?? {}),
      type: stored.type as MemoryEntry["type"],
      scope: stored.scope as MemoryEntry["scope"],
      category: stored.category as MemoryEntry["category"],
      status: stored.status as MemoryEntry["status"],
    }
  }
}
