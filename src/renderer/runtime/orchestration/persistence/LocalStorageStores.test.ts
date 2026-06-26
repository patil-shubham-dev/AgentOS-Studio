import { describe, it, expect, beforeEach } from "vitest"
import {
  LocalStorageBackend,
  LocalStorageWalStore,
  LocalStorageHistoryStore,
} from "./LocalStorageStores"

/* ------------------------------------------------------------------ */
/*  Note: these tests use a prefix unique to each test to avoid        */
/*  cross-contamination when running in a shared localStorage env.     */
/* ------------------------------------------------------------------ */

describe("LocalStorageBackend", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("writes and reads a value", async () => {
    const s = new LocalStorageBackend("test_backend")
    await s.write("foo", "bar")
    const val = await s.read("foo")
    expect(val).toBe("bar")
  })

  it("returns null for missing key", async () => {
    const s = new LocalStorageBackend("test_backend")
    const val = await s.read("nope")
    expect(val).toBeNull()
  })

  it("deletes a key", async () => {
    const s = new LocalStorageBackend("test_backend")
    await s.write("x", "y")
    await s.delete("x")
    expect(await s.read("x")).toBeNull()
  })

  it("lists keys with prefix", async () => {
    const s = new LocalStorageBackend("test_backend")
    await s.write("a/1", "v1")
    await s.write("a/2", "v2")
    await s.write("b/1", "v3")
    const keys = await s.list("a/")
    expect(keys.sort()).toEqual(["a/1", "a/2"])
  })
})

describe("LocalStorageWalStore", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("appends and replays entries", async () => {
    const w = new LocalStorageWalStore("test_wal")
    await w.append({ id: "1", operation: "CREATE_TASK", timestamp: 100 } as any)
    await w.append({ id: "2", operation: "UPDATE_TASK", timestamp: 200 } as any)
    const entries = await w.replay()
    expect(entries).toHaveLength(2)
    expect(entries[0].id).toBe("1")
    expect(entries[1].id).toBe("2")
  })

  it("truncates entries before timestamp", async () => {
    const w = new LocalStorageWalStore("test_wal")
    await w.append({ id: "1", operation: "CREATE_TASK", timestamp: 100 } as any)
    await w.append({ id: "2", operation: "UPDATE_TASK", timestamp: 200 } as any)
    await w.append({ id: "3", operation: "CHECKPOINT", timestamp: 300 } as any)
    await w.truncate(200)
    const entries = await w.replay()
    expect(entries).toHaveLength(2)
    expect(entries[0].id).toBe("2")
    expect(entries[1].id).toBe("3")
  })

  it("clears all entries", async () => {
    const w = new LocalStorageWalStore("test_wal")
    await w.append({ id: "1", operation: "CREATE_TASK", timestamp: 100 } as any)
    await w.clear()
    expect(await w.replay()).toHaveLength(0)
  })
})

describe("LocalStorageHistoryStore", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("appends and retrieves by task ID", async () => {
    const h = new LocalStorageHistoryStore("test_hist")
    await h.append({
      id: "e1", taskId: "t1", timestamp: 100,
      previousStatus: "pending", newStatus: "ready", triggeringEvent: "test",
    })
    await h.append({
      id: "e2", taskId: "t2", timestamp: 200,
      previousStatus: "ready", newStatus: "running", triggeringEvent: "test",
    })
    const t1 = await h.getByTaskId("t1")
    expect(t1).toHaveLength(1)
    expect(t1[0].id).toBe("e1")
  })

  it("retrieves by time range", async () => {
    const h = new LocalStorageHistoryStore("test_hist")
    await h.append({
      id: "e1", taskId: "t1", timestamp: 100,
      previousStatus: null, newStatus: "pending", triggeringEvent: "create",
    })
    await h.append({
      id: "e2", taskId: "t1", timestamp: 200,
      previousStatus: "pending", newStatus: "ready", triggeringEvent: "enqueue",
    })
    await h.append({
      id: "e3", taskId: "t1", timestamp: 300,
      previousStatus: "ready", newStatus: "running", triggeringEvent: "start",
    })
    const mid = await h.getByTimeRange(150, 250)
    expect(mid).toHaveLength(1)
    expect(mid[0].id).toBe("e2")
  })

  it("retrieves recent entries", async () => {
    const h = new LocalStorageHistoryStore("test_hist")
    for (let i = 0; i < 10; i++) {
      await h.append({
        id: `e${i}`, taskId: "t1", timestamp: i * 100,
        previousStatus: null, newStatus: "pending", triggeringEvent: "test",
      })
    }
    const recent = await h.getRecent(3)
    expect(recent).toHaveLength(3)
    expect(recent[0].id).toBe("e9")
    expect(recent[2].id).toBe("e7")
  })

  it("clears all entries", async () => {
    const h = new LocalStorageHistoryStore("test_hist")
    await h.append({
      id: "e1", taskId: "t1", timestamp: 100,
      previousStatus: null, newStatus: "pending", triggeringEvent: "test",
    })
    await h.clear()
    expect(await h.getRecent(10)).toHaveLength(0)
  })
})
