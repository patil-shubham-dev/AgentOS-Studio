const DB_NAME = 'AgenticOS'
const DB_VERSION = 1
const STORE_NAME = 'timeline'

interface TimelinePersistedState {
  events: unknown[]
  agentSessions: [string, unknown][]
  streamingTexts: [string, string][]
  sessionOrder: string[]
  sessionCreatedAtEventCount: number[]
  collapsedSections: string[]
  savedAt: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveTimelineToIndexedDB(state: TimelinePersistedState): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({ id: 'timeline-state', ...state })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // fallback to localStorage
    try {
      localStorage.setItem('agentic-timeline-state', JSON.stringify(state))
    } catch {
      // both failed — data stays in memory only
    }
  }
}

export async function loadTimelineFromIndexedDB(): Promise<TimelinePersistedState | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get('timeline-state')
    const result = await new Promise<TimelinePersistedState | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as TimelinePersistedState | undefined)
      request.onerror = () => reject(request.error)
    })
    db.close()
    if (result) return result
  } catch {
    // IndexedDB failed, try localStorage
  }

  try {
    const raw = localStorage.getItem('agentic-timeline-state')
    if (raw) return JSON.parse(raw) as TimelinePersistedState
  } catch {
    // localStorage also failed
  }

  return null
}

export async function clearIndexedDB(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete('timeline-state')
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem('agentic-timeline-state')
  } catch {
    // ignore
  }
}

export async function getIndexedDBSize(): Promise<number> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()
    const all = await new Promise<unknown[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return new Blob([JSON.stringify(all)]).size
  } catch {
    return 0
  }
}

export async function isIndexedDBAvailable(): Promise<boolean> {
  try {
    const db = await openDB()
    db.close()
    return true
  } catch {
    return false
  }
}
