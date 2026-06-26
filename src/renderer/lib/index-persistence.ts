import { IndexedDBStorage } from "./indexeddb-storage"
import { workspaceSymbolIndex } from "./symbol-index"
import { semanticSearch } from "./semantic-search"
import { tsProgramManager } from "./ts-program-manager"
import type { SymbolIndexData } from "./symbol-index"

interface PersistedSymbolIndex {
  type: "symbol-index"
  version: number
  data: SymbolIndexData
  savedAt: number
}

interface PersistedSemanticIndex {
  type: "semantic-index"
  version: number
  data: object
  savedAt: number
}

export class IndexPersistence {
  private symbolStore: IndexedDBStorage<PersistedSymbolIndex>
  private semanticStore: IndexedDBStorage<PersistedSemanticIndex>

  constructor() {
    this.symbolStore = new IndexedDBStorage<PersistedSymbolIndex>("symbol-index")
    this.semanticStore = new IndexedDBStorage<PersistedSemanticIndex>("semantic-index")
  }

  async saveAll(): Promise<{ symbolIndex: boolean; semanticIndex: boolean }> {
    const results = await Promise.all([
      this.saveSymbolIndex(),
      this.saveSemanticIndex(),
    ])
    return { symbolIndex: results[0], semanticIndex: results[1] }
  }

  async loadAll(): Promise<{ symbolIndex: boolean; semanticIndex: boolean }> {
    const results = await Promise.all([
      this.loadSymbolIndex(),
      this.loadSemanticIndex(),
    ])
    return { symbolIndex: results[0], semanticIndex: results[1] }
  }

  private async saveSymbolIndex(): Promise<boolean> {
    try {
      const data = workspaceSymbolIndex.exportIndex()
      if (!data) return false
      await this.symbolStore.put({
        type: "symbol-index",
        version: 1,
        data,
        savedAt: Date.now(),
      })
      return true
    } catch {
      return false
    }
  }

  private async loadSymbolIndex(): Promise<boolean> {
    try {
      const persisted = await this.symbolStore.get("symbol-index")
      if (!persisted || persisted.version !== 1) return false

      // Load symbol index
      workspaceSymbolIndex.importIndex(persisted.data)
      return true
    } catch {
      return false
    }
  }

  private async saveSemanticIndex(): Promise<boolean> {
    try {
      const data = semanticSearch.exportIndex()
      if (!data) return false
      await this.semanticStore.put({
        type: "semantic-index",
        version: 1,
        data,
        savedAt: Date.now(),
      })
      return true
    } catch {
      return false
    }
  }

  private async loadSemanticIndex(): Promise<boolean> {
    try {
      const persisted = await this.semanticStore.get("semantic-index")
      if (!persisted || persisted.version !== 1) return false
      return semanticSearch.importIndex(persisted.data)
    } catch {
      return false
    }
  }

  async getLastSavedAt(): Promise<{ symbolIndex: number; semanticIndex: number }> {
    const [symbolPersisted, semanticPersisted] = await Promise.all([
      this.symbolStore.get("symbol-index"),
      this.semanticStore.get("semantic-index"),
    ])
    return {
      symbolIndex: symbolPersisted?.savedAt ?? 0,
      semanticIndex: semanticPersisted?.savedAt ?? 0,
    }
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.symbolStore.clear(),
      this.semanticStore.clear(),
    ])
  }

  getApproximateSize(): Promise<number> {
    return Promise.all([
      this.symbolStore.approximateSize(),
      this.semanticStore.approximateSize(),
    ]).then(([a, b]) => a + b)
  }
}

export const indexPersistence = new IndexPersistence()
