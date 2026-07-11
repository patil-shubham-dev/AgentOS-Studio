import { describe, it, expect, beforeEach } from "vitest"
import {
  InMemoryStorageAdapter,
  CorruptibleStorageAdapter,
  MockLocalStorageAdapter,
  installTestStorage,
  uninstallTestStorage,
} from "../fixtures/StorageAdapter"

describe("InMemoryStorageAdapter", () => {
  let adapter: InMemoryStorageAdapter

  beforeEach(() => {
    adapter = new InMemoryStorageAdapter()
  })

  it("should store and retrieve values", () => {
    adapter.setItem("key1", "value1")
    expect(adapter.getItem("key1")).toBe("value1")
  })

  it("should return null for missing keys", () => {
    expect(adapter.getItem("nonexistent")).toBeNull()
  })

  it("should overwrite existing values", () => {
    adapter.setItem("key", "old")
    adapter.setItem("key", "new")
    expect(adapter.getItem("key")).toBe("new")
  })

  it("should remove values", () => {
    adapter.setItem("key", "value")
    adapter.removeItem("key")
    expect(adapter.getItem("key")).toBeNull()
  })

  it("should clear all values", () => {
    adapter.setItem("a", "1")
    adapter.setItem("b", "2")
    adapter.clear()
    expect(adapter.length).toBe(0)
  })

  it("should list all keys", () => {
    adapter.setItem("a", "1")
    adapter.setItem("b", "2")
    const keys = adapter.keys()
    expect(keys).toContain("a")
    expect(keys).toContain("b")
  })

  it("should track length", () => {
    expect(adapter.length).toBe(0)
    adapter.setItem("a", "1")
    expect(adapter.length).toBe(1)
    adapter.setItem("b", "2")
    expect(adapter.length).toBe(2)
  })

  it("should dump and load state", () => {
    adapter.setItem("key", "value")
    const dump = adapter.dump()
    expect(dump).toEqual({ key: "value" })

    const a2 = new InMemoryStorageAdapter()
    a2.load(dump)
    expect(a2.getItem("key")).toBe("value")
  })

  it("should handle corruption simulation", () => {
    adapter.setItem("good", '{"valid":true}')
    adapter.simulateCorruption("good")
    const val = adapter.getItem("good")
    expect(val).toBe('{invalid json')
  })
})

describe("CorruptibleStorageAdapter", () => {
  let inner: InMemoryStorageAdapter
  let adapter: CorruptibleStorageAdapter

  beforeEach(() => {
    inner = new InMemoryStorageAdapter()
    adapter = new CorruptibleStorageAdapter(inner)
  })

  it("should pass through normal operations", () => {
    adapter.setItem("key", "value")
    expect(adapter.getItem("key")).toBe("value")
  })

  it("should fail on specific key", () => {
    adapter.failNextSet("failKey")
    adapter.setItem("ok", "works")
    expect(() => adapter.setItem("failKey", "boom")).toThrow("Simulated storage failure")
  })

  it("should fail all sets when configured", () => {
    adapter.failAllSets()
    expect(() => adapter.setItem("any", "thing")).toThrow("Simulated storage failure")
  })

  it("should fail after N sets", () => {
    adapter.failAfter(2)
    adapter.setItem("a", "1")
    adapter.setItem("b", "2")
    expect(() => adapter.setItem("c", "3")).toThrow("Simulated storage exhaustion")
  })

  it("should reset state on clear", () => {
    adapter.failAllSets()
    adapter.clear()
    expect(() => adapter.setItem("key", "value")).not.toThrow()
    expect(adapter.getItem("key")).toBe("value")
  })
})

describe("MockLocalStorageAdapter", () => {
  it("should enforce quota", () => {
    const adapter = new MockLocalStorageAdapter(100)
    adapter.setItem("small", "x".repeat(50))
    expect(() => adapter.setItem("large", "x".repeat(100))).toThrow("QuotaExceededError")
  })

  it("should allow normal operations within quota", () => {
    const adapter = new MockLocalStorageAdapter(1024 * 1024)
    adapter.setItem("key", "value")
    expect(adapter.getItem("key")).toBe("value")
  })

  it("should recover after clear", () => {
    const adapter = new MockLocalStorageAdapter(50)
    expect(() => adapter.setItem("big", "x".repeat(100))).toThrow()
    adapter.clear()
    adapter.setItem("small", "ok")
    expect(adapter.getItem("small")).toBe("ok")
  })
})

describe("installTestStorage", () => {
  it("should provide global localStorage", () => {
    installTestStorage()
    expect(globalThis.localStorage).toBeDefined()
    globalThis.localStorage.setItem("test", "value")
    expect(globalThis.localStorage.getItem("test")).toBe("value")
    expect(globalThis.localStorage.length).toBe(1)
    globalThis.localStorage.removeItem("test")
    expect(globalThis.localStorage.getItem("test")).toBeNull()
    uninstallTestStorage()
  })

  it("should handle clear", () => {
    installTestStorage()
    globalThis.localStorage.setItem("a", "1")
    globalThis.localStorage.setItem("b", "2")
    globalThis.localStorage.clear()
    expect(globalThis.localStorage.length).toBe(0)
    uninstallTestStorage()
  })
})
