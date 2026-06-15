const DB_NAME = "AgenticOS"
const DB_VERSION = 2

export class IndexedDBStorage<T extends { id: string }> {
  private dbName: string
  private storeName: string
  private dbVersion: number

  constructor(storeName: string, dbName = DB_NAME, dbVersion = DB_VERSION) {
    this.storeName = storeName
    this.dbName = dbName
    this.dbVersion = dbVersion
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "id" })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async get(id: string): Promise<T | null> {
    try {
      const db = await this.openDB()
      const tx = db.transaction(this.storeName, "readonly")
      const store = tx.objectStore(this.storeName)
      const request = store.get(id)
      const result = await new Promise<T | undefined>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result as T | undefined)
        request.onerror = () => reject(request.error)
      })
      db.close()
      return result ?? null
    } catch {
      return null
    }
  }

  async put(item: T): Promise<void> {
    try {
      const db = await this.openDB()
      const tx = db.transaction(this.storeName, "readwrite")
      const store = tx.objectStore(this.storeName)
      store.put(item)
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    } catch (err) {
      console.error(`[IndexedDBStorage] put failed:`, err)
    }
  }

  async getAll(): Promise<T[]> {
    try {
      const db = await this.openDB()
      const tx = db.transaction(this.storeName, "readonly")
      const store = tx.objectStore(this.storeName)
      const request = store.getAll()
      const result = await new Promise<T[]>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result as T[])
        request.onerror = () => reject(request.error)
      })
      db.close()
      return result
    } catch {
      return []
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const db = await this.openDB()
      const tx = db.transaction(this.storeName, "readwrite")
      const store = tx.objectStore(this.storeName)
      store.delete(id)
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    } catch {
      // ignore
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.openDB()
      const tx = db.transaction(this.storeName, "readwrite")
      const store = tx.objectStore(this.storeName)
      store.clear()
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    } catch {
      // ignore
    }
  }

  async count(): Promise<number> {
    try {
      const db = await this.openDB()
      const tx = db.transaction(this.storeName, "readonly")
      const store = tx.objectStore(this.storeName)
      const request = store.count()
      const result = await new Promise<number>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      db.close()
      return result
    } catch {
      return 0
    }
  }

  async approximateSize(): Promise<number> {
    try {
      const all = await this.getAll()
      return new Blob([JSON.stringify(all)]).size
    } catch {
      return 0
    }
  }
}
