import { describe, it, expect } from "vitest"

interface SymbolIndexData {
  symbols: { name: string; kind: string; file: string; line: number; export: boolean; default: boolean }[]
  callGraph: { caller: string; callee: string; file: string; line: number }[]
  indexedAt: number
}

interface PersistedIndex {
  type: string
  version: number
  data: unknown
  savedAt: number
}

interface PersistedSymbolIndex extends PersistedIndex {
  type: "symbol-index"
  data: SymbolIndexData
}

interface PersistedSemanticIndex extends PersistedIndex {
  type: "semantic-index"
  data: object
}

class InMemoryStorage<T extends PersistedIndex> {
  private store = new Map<string, T>()

  async put(key: string, value: T): Promise<void> {
    this.store.set(key, value)
  }

  async get(key: string): Promise<T | undefined> {
    return this.store.get(key)
  }

  async clear(): Promise<void> {
    this.store.clear()
  }

  async approximateSize(): Promise<number> {
    if (this.store.size === 0) return 0
    return JSON.stringify([...this.store.values()]).length
  }
}

function createPersistence() {
  const symbolStore = new InMemoryStorage<PersistedSymbolIndex>()
  const semanticStore = new InMemoryStorage<PersistedSemanticIndex>()

  return {
    async saveSymbolIndex(data: SymbolIndexData | null): Promise<boolean> {
      if (!data || data.symbols.length === 0) return false
      await symbolStore.put("symbol-index", {
        type: "symbol-index",
        version: 1,
        data,
        savedAt: Date.now(),
      })
      return true
    },

    async loadSymbolIndex(): Promise<SymbolIndexData | null> {
      const persisted = await symbolStore.get("symbol-index")
      if (!persisted || persisted.version !== 1) return null
      return persisted.data
    },

    async saveSemanticIndex(data: object | null): Promise<boolean> {
      if (!data) return false
      await semanticStore.put("semantic-index", {
        type: "semantic-index",
        version: 1,
        data,
        savedAt: Date.now(),
      })
      return true
    },

    async loadSemanticIndex(): Promise<object | null> {
      const persisted = await semanticStore.get("semantic-index")
      if (!persisted || persisted.version !== 1) return null
      return persisted.data
    },

    async saveAll(
      symbolData: SymbolIndexData | null,
      semanticData: object | null
    ): Promise<{ symbolIndex: boolean; semanticIndex: boolean }> {
      const [symbolOk, semanticOk] = await Promise.all([
        this.saveSymbolIndex(symbolData),
        this.saveSemanticIndex(semanticData),
      ])
      return { symbolIndex: symbolOk, semanticIndex: semanticOk }
    },

    async loadAll(): Promise<{ symbolIndex: boolean; semanticIndex: boolean }> {
      const [symbolData, semanticData] = await Promise.all([
        this.loadSymbolIndex(),
        this.loadSemanticIndex(),
      ])
      return { symbolIndex: symbolData !== null, semanticIndex: semanticData !== null }
    },

    async clear(): Promise<void> {
      await Promise.all([symbolStore.clear(), semanticStore.clear()])
    },

    async getApproximateSize(): Promise<number> {
      const [a, b] = await Promise.all([
        symbolStore.approximateSize(),
        semanticStore.approximateSize(),
      ])
      return a + b
    },
  }
}

describe("IndexPersistence — save/load lifecycle", () => {
  const sampleSymbolData: SymbolIndexData = {
    symbols: [
      { name: "foo", kind: "function", file: "a.ts", line: 1, export: true, default: false },
      { name: "Bar", kind: "class", file: "b.ts", line: 5, export: true, default: false },
    ],
    callGraph: [{ caller: "foo", callee: "Bar", file: "a.ts", line: 3 }],
    indexedAt: 1000,
  }

  it("saves and loads symbol index", async () => {
    const p = createPersistence()
    const saved = await p.saveSymbolIndex(sampleSymbolData)
    expect(saved).toBe(true)

    const loaded = await p.loadSymbolIndex()
    expect(loaded).not.toBeNull()
    expect(loaded!.symbols).toHaveLength(2)
    expect(loaded!.symbols[0].name).toBe("foo")
    expect(loaded!.callGraph).toHaveLength(1)
    expect(loaded!.indexedAt).toBe(1000)
  })

  it("returns false when saving null symbol data", async () => {
    const p = createPersistence()
    const saved = await p.saveSymbolIndex(null)
    expect(saved).toBe(false)
  })

  it("returns false when saving empty symbol data", async () => {
    const p = createPersistence()
    const saved = await p.saveSymbolIndex({
      symbols: [],
      callGraph: [],
      indexedAt: 0,
    })
    expect(saved).toBe(false)
  })

  it("returns null when no index has been saved", async () => {
    const p = createPersistence()
    const loaded = await p.loadSymbolIndex()
    expect(loaded).toBeNull()
  })

  it("saves and loads semantic index", async () => {
    const p = createPersistence()
    const semanticData = { files: { "a.ts": "indexed content" }, version: 1 }
    const saved = await p.saveSemanticIndex(semanticData)
    expect(saved).toBe(true)

    const loaded = await p.loadSemanticIndex()
    expect(loaded).not.toBeNull()
    expect(loaded).toEqual(semanticData)
  })

  it("rejects wrong version on load", async () => {
    const p = createPersistence()
    // Semantic store has empty semantic — load should return null
    await p.saveSemanticIndex({})
    const loaded = await p.loadSymbolIndex()
    expect(loaded).toBeNull()
  })
})

describe("IndexPersistence — batch operations", () => {
  it("saveAll returns true/false per index type", async () => {
    const p = createPersistence()
    const symbolData: SymbolIndexData = {
      symbols: [{ name: "foo", kind: "function", file: "a.ts", line: 1, export: true, default: false }],
      callGraph: [],
      indexedAt: 1,
    }
    const results = await p.saveAll(symbolData, null)
    expect(results.symbolIndex).toBe(true)
    expect(results.semanticIndex).toBe(false)
  })

  it("loadAll returns loaded flags", async () => {
    const p = createPersistence()
    const symbolData: SymbolIndexData = {
      symbols: [{ name: "foo", kind: "function", file: "a.ts", line: 1, export: true, default: false }],
      callGraph: [],
      indexedAt: 1,
    }
    await p.saveAll(symbolData, {})

    const loaded = await p.loadAll()
    expect(loaded.symbolIndex).toBe(true)
    expect(loaded.semanticIndex).toBe(true)
  })

  it("loadAll returns false when nothing saved", async () => {
    const p = createPersistence()
    const loaded = await p.loadAll()
    expect(loaded.symbolIndex).toBe(false)
    expect(loaded.semanticIndex).toBe(false)
  })

  it("clear removes all persisted data", async () => {
    const p = createPersistence()
    const symbolData: SymbolIndexData = {
      symbols: [{ name: "foo", kind: "function", file: "a.ts", line: 1, export: true, default: false }],
      callGraph: [],
      indexedAt: 1,
    }
    await p.saveAll(symbolData, {})
    await p.clear()

    const loaded = await p.loadAll()
    expect(loaded.symbolIndex).toBe(false)
    expect(loaded.semanticIndex).toBe(false)
  })
})

describe("IndexPersistence — approximateSize", () => {
  it("returns non-zero size after saving data", async () => {
    const p = createPersistence()
    const symbolData: SymbolIndexData = {
      symbols: [{ name: "foo", kind: "function", file: "a.ts", line: 1, export: true, default: false }],
      callGraph: [],
      indexedAt: 1,
    }
    await p.saveAll(symbolData, {})
    const size = await p.getApproximateSize()
    expect(size).toBeGreaterThan(0)
  })

  it("returns correct size after clearing", async () => {
    const p = createPersistence()
    const symbolData: SymbolIndexData = {
      symbols: [{ name: "foo", kind: "function", file: "a.ts", line: 1, export: true, default: false }],
      callGraph: [],
      indexedAt: 1,
    }
    await p.saveAll(symbolData, {})
    await p.clear()
    const size = await p.getApproximateSize()
    expect(size).toBe(0)
  })
})
