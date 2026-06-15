import { create } from "zustand"

export interface LogEntry {
  id: string
  timestamp: number
  level: "info" | "warn" | "error" | "debug"
  source: string
  message: string
}

const MAX_LOG_ENTRIES = 500
let logIdCounter = 0

interface OutputStore {
  entries: LogEntry[]
  addEntry: (level: LogEntry["level"], source: string, message: string) => void
  clear: () => void
}

export const useOutputStore = create<OutputStore>((set) => ({
  entries: [],
  addEntry: (level, source, message) =>
    set((state) => {
      const entry: LogEntry = { id: `log-${++logIdCounter}`, timestamp: Date.now(), level, source, message }
      const next = [...state.entries, entry]
      if (next.length > MAX_LOG_ENTRIES) next.splice(0, next.length - MAX_LOG_ENTRIES)
      return { entries: next }
    }),
  clear: () => set({ entries: [] }),
}))
