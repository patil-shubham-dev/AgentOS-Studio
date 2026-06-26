export type WalOperation =
  | "CREATE_TASK"
  | "UPDATE_TASK"
  | "DELETE_TASK"
  | "UPDATE_STATUS"
  | "SAVE_GRAPH"
  | "CHECKPOINT"
  | "BEGIN_TRANSACTION"
  | "COMMIT_TRANSACTION"
  | "ROLLBACK_TRANSACTION"

export interface WalEntry {
  id: string
  operation: WalOperation
  taskId?: string
  executionId?: string
  data?: Record<string, unknown>
  timestamp: number
  transactionId?: string
}

export interface WalStore {
  append(entry: WalEntry): Promise<void>

  replay(): Promise<WalEntry[]>

  truncate(beforeTimestamp: number): Promise<void>

  clear(): Promise<void>
}

export class InMemoryWalStore implements WalStore {
  private entries: WalEntry[] = []

  async append(entry: WalEntry): Promise<void> {
    this.entries.push(entry)
  }

  async replay(): Promise<WalEntry[]> {
    return [...this.entries]
  }

  async truncate(beforeTimestamp: number): Promise<void> {
    this.entries = this.entries.filter((e) => e.timestamp >= beforeTimestamp)
  }

  async clear(): Promise<void> {
    this.entries = []
  }
}

export class WriteAheadLog {
  private store: WalStore

  constructor(store: WalStore) {
    this.store = store
  }

  async beginTransaction(transactionId: string): Promise<void> {
    await this.store.append({
      id: `wal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      operation: "BEGIN_TRANSACTION",
      transactionId,
      timestamp: Date.now(),
    })
  }

  async commitTransaction(transactionId: string): Promise<void> {
    await this.store.append({
      id: `wal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      operation: "COMMIT_TRANSACTION",
      transactionId,
      timestamp: Date.now(),
    })
  }

  async rollbackTransaction(transactionId: string): Promise<void> {
    await this.store.append({
      id: `wal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      operation: "ROLLBACK_TRANSACTION",
      transactionId,
      timestamp: Date.now(),
    })
  }

  async logOperation(
    operation: WalOperation,
    params: { taskId?: string; executionId?: string; data?: Record<string, unknown>; transactionId?: string },
  ): Promise<void> {
    await this.store.append({
      id: `wal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      operation,
      taskId: params.taskId,
      executionId: params.executionId,
      data: params.data,
      transactionId: params.transactionId,
      timestamp: Date.now(),
    })
  }

  async recover(): Promise<{
    committed: WalEntry[]
    incomplete: WalEntry[]
    inFlightTransactions: string[]
  }> {
    const entries = await this.store.replay()

    // First pass: identify committed / rolled back transactions
    // true = committed, false = in-flight (no commit/rollback seen), absent = rolled back
    const txStatus = new Map<string, boolean>()
    for (const entry of entries) {
      if (entry.operation === "BEGIN_TRANSACTION" && entry.transactionId) {
        if (!txStatus.has(entry.transactionId)) {
          txStatus.set(entry.transactionId, false)
        }
      } else if (entry.operation === "COMMIT_TRANSACTION" && entry.transactionId) {
        txStatus.set(entry.transactionId, true)
      } else if (entry.operation === "ROLLBACK_TRANSACTION" && entry.transactionId) {
        txStatus.delete(entry.transactionId)
      }
    }

    // Second pass: classify entries based on transaction outcome
    // committed = in a committed tx or outside any tx
    // incomplete = in an open (in-flight) tx
    // rolled-back entries are discarded
    const committed: WalEntry[] = []
    const incomplete: WalEntry[] = []

    for (const entry of entries) {
      const isTxMarker =
        entry.operation === "BEGIN_TRANSACTION" ||
        entry.operation === "COMMIT_TRANSACTION" ||
        entry.operation === "ROLLBACK_TRANSACTION"

      if (isTxMarker) {
        committed.push(entry)
      } else if (entry.transactionId) {
        const status = txStatus.get(entry.transactionId)
        if (status === true) {
          committed.push(entry)
        } else if (status === false) {
          incomplete.push(entry)
        }
        // if status is undefined → rolled back, discarded silently
      } else {
        committed.push(entry)
      }
    }

    const inFlightTransactions = Array.from(txStatus.entries())
      .filter(([, isCommitted]) => !isCommitted)
      .map(([id]) => id)

    return { committed, incomplete, inFlightTransactions }
  }

  async truncate(beforeTimestamp: number): Promise<void> {
    await this.store.truncate(beforeTimestamp)
  }

  async clear(): Promise<void> {
    await this.store.clear()
  }
}
