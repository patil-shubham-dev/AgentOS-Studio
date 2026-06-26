import type { StorageBackend } from "./JsonLogTaskStore"
import type { WalEntry, WalStore } from "./WriteAheadLog"
import type { HistoryEntry, HistoryStore } from "./TaskHistory"

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage
    }
  } catch {
    // localStorage not available
  }
  return null
}

export class LocalStorageBackend implements StorageBackend {
  private storage: Storage | null
  private prefix: string

  constructor(prefix: string = "opencode_orchestration") {
    this.storage = getStorage()
    this.prefix = prefix
  }

  async read(key: string): Promise<string | null> {
    if (!this.storage) return null
    try {
      return this.storage.getItem(`${this.prefix}_${key}`)
    } catch {
      return null
    }
  }

  async write(key: string, value: string): Promise<void> {
    if (!this.storage) return
    try {
      this.storage.setItem(`${this.prefix}_${key}`, value)
    } catch {
      // quota exceeded or storage unavailable
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.storage) return
    try {
      this.storage.removeItem(`${this.prefix}_${key}`)
    } catch {
      // ignore
    }
  }

  async list(prefix: string): Promise<string[]> {
    if (!this.storage) return []
    try {
      const fullPrefix = `${this.prefix}_${prefix}`
      const keys: string[] = []
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i)
        if (key && key.startsWith(fullPrefix)) {
          keys.push(key.slice(this.prefix.length + 1))
        }
      }
      return keys
    } catch {
      return []
    }
  }
}

export class LocalStorageWalStore implements WalStore {
  private storage: Storage | null
  private key: string
  private entries: WalEntry[] = []

  constructor(key: string = "opencode_orchestration_wal") {
    this.storage = getStorage()
    this.key = key
    this.load()
  }

  async append(entry: WalEntry): Promise<void> {
    this.entries.push(entry)
    this.save()
  }

  async replay(): Promise<WalEntry[]> {
    return [...this.entries]
  }

  async truncate(beforeTimestamp: number): Promise<void> {
    this.entries = this.entries.filter((e) => e.timestamp >= beforeTimestamp)
    this.save()
  }

  async clear(): Promise<void> {
    this.entries = []
    this.save()
  }

  private load(): void {
    if (!this.storage) return
    try {
      const raw = this.storage.getItem(this.key)
      if (raw) {
        this.entries = JSON.parse(raw)
      }
    } catch {
      this.entries = []
    }
  }

  private save(): void {
    if (!this.storage) return
    try {
      this.storage.setItem(this.key, JSON.stringify(this.entries))
    } catch {
      // quota exceeded
    }
  }
}

export class LocalStorageHistoryStore implements HistoryStore {
  private storage: Storage | null
  private key: string
  private entries: HistoryEntry[] = []

  constructor(key: string = "opencode_orchestration_history") {
    this.storage = getStorage()
    this.key = key
    this.load()
  }

  async append(entry: HistoryEntry): Promise<void> {
    this.entries.push(entry)
    this.save()
  }

  async getByTaskId(taskId: string): Promise<HistoryEntry[]> {
    return this.entries
      .filter((e) => e.taskId === taskId)
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  async getByTimeRange(from: number, to: number): Promise<HistoryEntry[]> {
    return this.entries
      .filter((e) => e.timestamp >= from && e.timestamp <= to)
      .sort((a, b) => a.timestamp - b.timestamp)
  }

  async getRecent(limit: number): Promise<HistoryEntry[]> {
    return [...this.entries]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  async clear(): Promise<void> {
    this.entries = []
    this.save()
  }

  private load(): void {
    if (!this.storage) return
    try {
      const raw = this.storage.getItem(this.key)
      if (raw) {
        this.entries = JSON.parse(raw)
      }
    } catch {
      this.entries = []
    }
  }

  private save(): void {
    if (!this.storage) return
    try {
      this.storage.setItem(this.key, JSON.stringify(this.entries))
    } catch {
      // quota exceeded
    }
  }
}
