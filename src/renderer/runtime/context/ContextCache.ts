import type { CacheEntry, CacheStats, CachePolicy, CacheWarmSpec, CacheTier } from "./context-types"
import { DEFAULT_CACHE_POLICY } from "./context-types"

interface L1Entry<T> {
  entry: CacheEntry<T>
  lastAccessed: number
}

interface L2Persisted {
  key: string
  value: string
  sizeTokens: number
  createdAt: number
  ttl: number
  version: number
  tags: string[]
}

const DB_NAME = "agentic-context-cache"
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains("cache")) {
        const store = db.createObjectStore("cache", { keyPath: "key" })
        store.createIndex("ttl", "ttl", { unique: false })
        store.createIndex("version", "version", { unique: false })
        store.createIndex("tags", "tags", { unique: false, multiEntry: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class ContextCache {
  private static instance: ContextCache
  private l1 = new Map<string, L1Entry<unknown>>()
  private db: IDBDatabase | null = null
  private dbReady: Promise<void>
  private dbResolve!: () => void
  private policy: CachePolicy
  private l1Hits = 0
  private l2Hits = 0
  private totalMisses = 0
  private evictions = 0

  private constructor(policy: Partial<CachePolicy> = {}) {
    this.policy = { ...DEFAULT_CACHE_POLICY, ...policy }
    this.dbReady = new Promise((resolve) => { this.dbResolve = resolve })
    this.initDB()
  }

  static getInstance(policy?: Partial<CachePolicy>): ContextCache {
    if (!ContextCache.instance) {
      ContextCache.instance = new ContextCache(policy)
    }
    return ContextCache.instance
  }

  private async initDB(): Promise<void> {
    try {
      this.db = await openDB()
    } catch (err) {
      console.warn("[ContextCache] IndexedDB unavailable, L2 disabled:", err)
    }
    this.dbResolve()
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const l1Hit = this.l1.get(key)
    if (l1Hit) {
      l1Hit.lastAccessed = Date.now()
      l1Hit.entry.lastAccessed = Date.now()
      l1Hit.entry.accessCount++
      this.l1Hits++
      return l1Hit.entry as CacheEntry<T>
    }

    await this.dbReady
    if (this.db) {
      try {
        const persisted = await this.getFromDB(key)
        if (persisted) {
          if (this.isExpired(persisted)) {
            await this.deleteFromDB(key)
            this.totalMisses++
            return undefined
          }
          const entry: CacheEntry<T> = {
            key: persisted.key,
            value: JSON.parse(persisted.value) as T,
            sizeTokens: persisted.sizeTokens,
            createdAt: persisted.createdAt,
            lastAccessed: Date.now(),
            accessCount: 1,
            ttl: persisted.ttl,
            version: persisted.version,
            tags: persisted.tags,
          }
          this.promoteToL1(entry)
          this.l2Hits++
          return entry
        }
      } catch {}
    }

    this.totalMisses++
    return undefined
  }

  async set<T>(key: string, value: T, meta?: {
    sizeTokens?: number
    ttl?: number
    tags?: string[]
    version?: number
  }): Promise<void> {
    const now = Date.now()
    const entry: CacheEntry<T> = {
      key,
      value,
      sizeTokens: meta?.sizeTokens ?? 0,
      createdAt: now,
      lastAccessed: now,
      accessCount: 0,
      ttl: meta?.ttl ?? this.policy.l2DefaultTTL,
      version: meta?.version ?? 1,
      tags: meta?.tags ?? [],
    }

    this.promoteToL1(entry)

    await this.dbReady
    if (this.db) {
      try {
        const persisted: L2Persisted = {
          key: entry.key,
          value: JSON.stringify(entry.value),
          sizeTokens: entry.sizeTokens,
          createdAt: entry.createdAt,
          ttl: entry.ttl,
          version: entry.version,
          tags: entry.tags,
        }
        await this.putInDB(persisted)
      } catch {}
    }
  }

  async invalidate(key: string): Promise<void> {
    this.l1.delete(key)
    await this.dbReady
    if (this.db) {
      try {
        await this.deleteFromDB(key)
      } catch {}
    }
  }

  async invalidateByTag(tag: string): Promise<void> {
    for (const [key] of this.l1) {
      const entry = this.l1.get(key)
      if (entry?.entry.tags.includes(tag)) {
        this.l1.delete(key)
      }
    }
    await this.dbReady
    if (this.db) {
      try {
        const entries = await this.getAllFromDB()
        for (const persisted of entries) {
          if (persisted.tags.includes(tag)) {
            if (this.isExpired(persisted)) {
              await this.deleteFromDB(persisted.key)
            } else {
              await this.deleteFromDB(persisted.key)
            }
          }
        }
      } catch {}
    }
  }

  async warm(specs: CacheWarmSpec[]): Promise<void> {
    if (!this.policy.enableWarming) return

    const sorted = [...specs].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      return order[a.priority] - order[b.priority]
    })

    for (const spec of sorted) {
      for (const key of spec.keys) {
        if (this.l1.has(key)) continue
        await this.get(key)
      }
    }
  }

  async clear(): Promise<void> {
    this.l1.clear()
    await this.dbReady
    if (this.db) {
      try {
        const tx = this.db.transaction("cache", "readwrite")
        const store = tx.objectStore("cache")
        store.clear()
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      } catch {}
    }
    this.l1Hits = 0
    this.l2Hits = 0
    this.totalMisses = 0
    this.evictions = 0
  }

  getStats(): CacheStats {
    return {
      l1: {
        entries: this.l1.size,
        sizeTokens: Array.from(this.l1.values()).reduce((s, e) => s + e.entry.sizeTokens, 0),
        hitRate: this.getHitRate(this.l1Hits, this.l2Hits, this.totalMisses, 'l1'),
      },
      l2: {
        entries: 0,
        sizeTokens: 0,
        hitRate: this.getHitRate(this.l2Hits, this.l1Hits, this.totalMisses, 'l2'),
      },
      totalHits: this.l1Hits + this.l2Hits,
      totalMisses: this.totalMisses,
      evictions: this.evictions,
    }
  }

  private promoteToL1<T>(entry: CacheEntry<T>): void {
    if (this.l1.size >= this.policy.l1MaxEntries) {
      const oldest = Array.from(this.l1.entries())
        .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)
        .slice(0, Math.ceil(this.l1.size * 0.2))
      for (const [key] of oldest) {
        this.l1.delete(key)
        this.evictions++
      }
    }

    let currentSize = Array.from(this.l1.values()).reduce((s, e) => s + e.entry.sizeTokens, 0)
    if (currentSize + entry.sizeTokens > this.policy.l1MaxSizeTokens) {
      const sorted = Array.from(this.l1.entries())
        .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)
      for (const [key, val] of sorted) {
        if (currentSize + entry.sizeTokens <= this.policy.l1MaxSizeTokens) break
        this.l1.delete(key)
        currentSize -= val.entry.sizeTokens
        this.evictions++
      }
    }

    this.l1.set(entry.key, { entry, lastAccessed: Date.now() })
  }

  private isExpired(persisted: L2Persisted): boolean {
    if (persisted.ttl <= 0) return false
    return Date.now() - persisted.createdAt > persisted.ttl
  }

  private getHitRate(hits: number, otherHits: number, misses: number, tier: CacheTier): number {
    const total = hits + misses
    if (total === 0) return 0
    return Math.round((hits / total) * 1000) / 1000
  }

  private async getFromDB(key: string): Promise<L2Persisted | undefined> {
    if (!this.db) return undefined
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("cache", "readonly")
      const store = tx.objectStore("cache")
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result ?? undefined)
      req.onerror = () => reject(req.error)
    })
  }

  private async putInDB(entry: L2Persisted): Promise<void> {
    if (!this.db) return
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("cache", "readwrite")
      const store = tx.objectStore("cache")
      store.put(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  private async deleteFromDB(key: string): Promise<void> {
    if (!this.db) return
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("cache", "readwrite")
      const store = tx.objectStore("cache")
      store.delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  private async getAllFromDB(): Promise<L2Persisted[]> {
    if (!this.db) return []
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction("cache", "readonly")
      const store = tx.objectStore("cache")
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result as L2Persisted[])
      req.onerror = () => reject(req.error)
    })
  }
}
