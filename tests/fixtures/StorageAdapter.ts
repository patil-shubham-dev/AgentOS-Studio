export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  clear(): void
  keys(): string[]
  get length(): number
}

export class InMemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  keys(): string[] {
    return [...this.store.keys()]
  }

  get length(): number {
    return this.store.size
  }

  dump(): Record<string, string> {
    return Object.fromEntries(this.store)
  }

  load(data: Record<string, string>): void {
    this.store = new Map(Object.entries(data))
  }

  simulateCorruption(key: string): void {
    this.store.set(key, '{invalid json')
  }

  simulateFullStorage(maxBytes: number): void {
    const filler = 'x'.repeat(maxBytes + 1)
    this.store.set('__filler__', filler)
  }
}

export class CorruptibleStorageAdapter implements StorageAdapter {
  private inner: StorageAdapter
  private failOnNext = new Set<string>()
  private throwOnSet = false
  private setCallCount = 0
  private failAfterSets: number | null = null

  constructor(inner: StorageAdapter) {
    this.inner = inner
  }

  getItem(key: string): string | null {
    return this.inner.getItem(key)
  }

  setItem(key: string, value: string): void {
    this.setCallCount++
    if (this.failOnNext.has(key)) {
      this.failOnNext.delete(key)
      throw new Error(`Simulated storage failure for key: ${key}`)
    }
    if (this.failAfterSets !== null && this.setCallCount > this.failAfterSets) {
      throw new Error('Simulated storage exhaustion')
    }
    if (this.throwOnSet) {
      throw new Error('Simulated storage failure')
    }
    this.inner.setItem(key, value)
  }

  removeItem(key: string): void {
    this.inner.removeItem(key)
  }

  clear(): void {
    this.inner.clear()
    this.failOnNext.clear()
    this.throwOnSet = false
    this.setCallCount = 0
    this.failAfterSets = null
  }

  keys(): string[] {
    return this.inner.keys()
  }

  get length(): number {
    return this.inner.length
  }

  failNextSet(key: string): void {
    this.failOnNext.add(key)
  }

  failAllSets(): void {
    this.throwOnSet = true
  }

  failAfter(count: number): void {
    this.failAfterSets = count
  }
}

export class MockLocalStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>()
  private quotaExceeded = false
  private maxBytes: number

  constructor(maxBytes = 5 * 1024 * 1024) {
    this.maxBytes = maxBytes
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.quotaExceeded) {
      throw new Error('QuotaExceededError: Storage full')
    }
    const total = [...this.store.entries()].reduce((s, [k, v]) => s + k.length + v.length, 0) + key.length + value.length
    if (total > this.maxBytes) {
      this.quotaExceeded = true
      throw new Error('QuotaExceededError: Storage full')
    }
    this.store.set(key, value)
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
    this.quotaExceeded = false
  }

  keys(): string[] {
    return [...this.store.keys()]
  }

  get length(): number {
    return this.store.size
  }
}

let activeAdapter: StorageAdapter = new InMemoryStorageAdapter()

export function setStorageAdapter(adapter: StorageAdapter): void {
  activeAdapter = adapter
}

export function getStorageAdapter(): StorageAdapter {
  return activeAdapter
}

/** Replaces global localStorage with our adapter for testing */
export function installTestStorage(): void {
  setStorageAdapter(new InMemoryStorageAdapter())
  const adapter = getStorageAdapter()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => adapter.getItem(k),
      setItem: (k: string, v: string) => adapter.setItem(k, v),
      removeItem: (k: string) => adapter.removeItem(k),
      clear: () => adapter.clear(),
      get length() { return adapter.length },
      key: (i: number) => adapter.keys()[i] ?? null,
    },
    writable: true,
    configurable: true,
  })
}

export function uninstallTestStorage(): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: undefined,
    writable: true,
    configurable: true,
  })
}
