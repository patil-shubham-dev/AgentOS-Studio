export interface IndexPersistence {
  loadAll(): Promise<{ files: string[]; symbols: unknown[] }>
  saveAll(): Promise<boolean>
  getApproximateSize(): number
}

export const indexPersistence: IndexPersistence = {
  async loadAll() {
    return { files: [], symbols: [] }
  },
  async saveAll() {
    return true
  },
  getApproximateSize() {
    return 0
  },
}
