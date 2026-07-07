import { create } from "zustand"

export interface CommandLogEntry {
  id: string
  sessionId: string
  correlationId?: string
  command: string
  cwd?: string
  fullOutput: string
  exitCode?: number
  durationMs?: number
  status: "running" | "success" | "error" | "cancelled"
  startedAt: number
  completedAt?: number
}

const STORAGE_KEY = "agentic-command-logs"
const MAX_LOGS = 200

function persist(logs: CommandLogEntry[]): void {
  try {
    const recent = logs.slice(-MAX_LOGS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent))
  } catch { console.warn("[CommandLog] Failed to persist logs") }
}

function restore(): CommandLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as CommandLogEntry[]
  } catch {
    return []
  }
}

interface CommandLogStore {
  logs: CommandLogEntry[]
  addLog: (entry: CommandLogEntry) => void
  updateLog: (id: string, updates: Partial<CommandLogEntry>) => void
  appendOutput: (id: string, output: string) => void
  getLogsBySession: (sessionId: string) => CommandLogEntry[]
  clearLogs: () => void
}

export const useCommandLogStore = create<CommandLogStore>((set, get) => ({
  logs: restore(),

  addLog: (entry) => {
    set((s) => {
      const logs = [...s.logs, entry].slice(-MAX_LOGS)
      persist(logs)
      return { logs }
    })
  },

  updateLog: (id, updates) => {
    set((s) => {
      const logs = s.logs.map((l) => (l.id === id ? { ...l, ...updates } : l))
      persist(logs)
      return { logs }
    })
  },

  appendOutput: (id, output) => {
    set((s) => {
      const logs = s.logs.map((l) =>
        l.id === id ? { ...l, fullOutput: l.fullOutput + output } : l
      )
      persist(logs)
      return { logs }
    })
  },

  getLogsBySession: (sessionId) =>
    get().logs.filter((l) => l.sessionId === sessionId),

  clearLogs: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ logs: [] })
  },
}))
