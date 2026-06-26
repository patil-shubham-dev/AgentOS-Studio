import { describe, it, expect, beforeEach } from "vitest"
import { InMemoryWalStore, WriteAheadLog } from "./WriteAheadLog"

describe("InMemoryWalStore", () => {
  let store: InMemoryWalStore

  beforeEach(() => {
    store = new InMemoryWalStore()
  })

  it("appends and replays entries", async () => {
    await store.append({
      id: "1",
      operation: "CREATE_TASK",
      timestamp: 100,
    })
    await store.append({
      id: "2",
      operation: "UPDATE_STATUS",
      timestamp: 200,
    })

    const entries = await store.replay()
    expect(entries).toHaveLength(2)
    expect(entries[0].operation).toBe("CREATE_TASK")
    expect(entries[1].operation).toBe("UPDATE_STATUS")
  })

  it("truncates entries before timestamp", async () => {
    await store.append({ id: "1", operation: "CREATE_TASK", timestamp: 100 })
    await store.append({ id: "2", operation: "UPDATE_STATUS", timestamp: 200 })
    await store.append({ id: "3", operation: "COMPLETE_TASK", timestamp: 300 })

    // Keep entries with timestamp >= 250 (only entry 3)
    await store.truncate(250)
    const entries = await store.replay()
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe("3")
  })

  it("clears all entries", async () => {
    await store.append({ id: "1", operation: "CREATE_TASK", timestamp: 100 })
    await store.clear()
    expect(await store.replay()).toHaveLength(0)
  })
})

describe("WriteAheadLog", () => {
  let walStore: InMemoryWalStore
  let wal: WriteAheadLog

  beforeEach(() => {
    walStore = new InMemoryWalStore()
    wal = new WriteAheadLog(walStore)
  })

  it("logs begin transaction", async () => {
    await wal.beginTransaction("tx-1")
    const entries = await walStore.replay()
    expect(entries).toHaveLength(1)
    expect(entries[0].operation).toBe("BEGIN_TRANSACTION")
    expect(entries[0].transactionId).toBe("tx-1")
  })

  it("logs commit transaction", async () => {
    await wal.commitTransaction("tx-1")
    const entries = await walStore.replay()
    expect(entries[0].operation).toBe("COMMIT_TRANSACTION")
  })

  it("logs rollback transaction", async () => {
    await wal.rollbackTransaction("tx-1")
    const entries = await walStore.replay()
    expect(entries[0].operation).toBe("ROLLBACK_TRANSACTION")
  })

  it("logs operations", async () => {
    await wal.logOperation("CREATE_TASK", { taskId: "t1" })
    await wal.logOperation("UPDATE_STATUS", { taskId: "t1", data: { status: "running" } })
    const entries = await walStore.replay()
    expect(entries).toHaveLength(2)
    expect(entries[0].taskId).toBe("t1")
  })

  it("recover returns committed entries with no transactions", async () => {
    await wal.logOperation("CREATE_TASK", { taskId: "t1" })
    await wal.logOperation("UPDATE_STATUS", { taskId: "t1" })

    const { committed, incomplete, inFlightTransactions } = await wal.recover()
    expect(committed).toHaveLength(2)
    expect(incomplete).toHaveLength(0)
    expect(inFlightTransactions).toHaveLength(0)
  })

  it("recover detects incomplete transactions", async () => {
    await wal.beginTransaction("tx-1")
    await wal.logOperation("CREATE_TASK", { taskId: "t1", transactionId: "tx-1" })
    // No COMMIT — this is an interrupted transaction

    const { committed, incomplete, inFlightTransactions } = await wal.recover()
    expect(committed).toHaveLength(1) // Only the BEGIN
    expect(incomplete.length + inFlightTransactions.length).toBeGreaterThan(0)
  })

  it("recover correctly identifies completed transactions", async () => {
    await wal.beginTransaction("tx-1")
    await wal.logOperation("CREATE_TASK", { taskId: "t1", transactionId: "tx-1" })
    await wal.commitTransaction("tx-1")

    const { incomplete, inFlightTransactions } = await wal.recover()
    expect(incomplete).toHaveLength(0)
    expect(inFlightTransactions).toHaveLength(0)
  })

  it("recover handles rolled back transactions", async () => {
    await wal.beginTransaction("tx-1")
    await wal.logOperation("CREATE_TASK", { taskId: "t1", transactionId: "tx-1" })
    await wal.rollbackTransaction("tx-1")

    const { incomplete, inFlightTransactions } = await wal.recover()
    expect(incomplete).toHaveLength(0)
    expect(inFlightTransactions).toHaveLength(0)
  })

  it("truncates old entries", async () => {
    await wal.logOperation("CREATE_TASK", { taskId: "old" })
    await new Promise((r) => setTimeout(r, 10))
    const before = Date.now()
    await new Promise((r) => setTimeout(r, 10))
    await wal.logOperation("CREATE_TASK", { taskId: "new" })

    await wal.truncate(before)
    const entries = await walStore.replay()
    expect(entries).toHaveLength(1)
    expect(entries[0].taskId).toBe("new")
  })

  it("clear removes all entries", async () => {
    await wal.logOperation("CREATE_TASK", { taskId: "t1" })
    await wal.clear()
    expect(await walStore.replay()).toHaveLength(0)
  })
})
