import { create } from "zustand"
import type { RuntimeState } from "@/runtime/RuntimeTypes"

// ── File History (Tauri-backed) ──

export interface FileSnapshot {
  path: string
  content: string
  timestamp: string
  description: string
}

export interface DiffHunk {
  old_start: number
  old_count: number
  new_start: number
  new_count: number
  lines: string[]
}

export interface DiffResult {
  path: string
  old_content: string
  new_content: string
  hunks: DiffHunk[]
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    const { invoke: tauriInvoke } = await import("@/lib/electron-api")
    return await tauriInvoke<T>(cmd, args)
  } catch {
    throw new Error(`Tauri command "${cmd}" not available in web mode`)
  }
}

export async function saveSnapshot(path: string, content: string, description: string): Promise<void> {
  await invoke("save_snapshot", { path, content, description })
}

export async function getHistory(path: string): Promise<FileSnapshot[]> {
  try {
    return await invoke<FileSnapshot[]>("get_history", { path })
  } catch {
    console.warn("[history] get_history not available, returning empty")
    return []
  }
}

export async function rollbackTo(path: string, timestamp: string): Promise<string> {
  try {
    return await invoke<string>("rollback_to", { path, timestamp })
  } catch {
    throw new Error(`rollback_to not available (Tauri command missing)`)
  }
}

export async function computeDiff(oldContent: string, newContent: string): Promise<DiffResult> {
  try {
    return await invoke<DiffResult>("compute_diff", { oldContent, newContent })
  } catch {
    throw new Error(`compute_diff not available (Tauri command missing)`)
  }
}

// ── Session History (auto-archived execution sessions) ──

export interface SessionHistoryEntry {
  sessionId: string
  label: string
  status: "completed" | "halted" | "orphaned" | "cancelled"
  state: RuntimeState
  createdAt: number
  lastActivity: number
  toolCount: number
  errorCount: number
  archivedAt: number
  // Optional saved timeline for re-opening
  snapshotRef: string | null
}

const SESSION_HISTORY_KEY = "agentic-session-history"
const MAX_HISTORY_ENTRIES = 50

/**
 * Session History Store — auto-archives old execution sessions
 * when the app restarts, giving a Cursor/Claude-Code-like history panel.
 */
interface SessionHistoryStore {
  entries: SessionHistoryEntry[]

  /** Archive a session into history (called on app close / session end) */
  archiveSession: (entry: Omit<SessionHistoryEntry, "archivedAt">) => void

  /** Remove a specific history entry */
  removeEntry: (sessionId: string) => void

  /** Clear all history */
  clearHistory: () => void

  /** Get the most recent entries */
  getRecent: (limit?: number) => SessionHistoryEntry[]
}

export const useSessionHistoryStore = create<SessionHistoryStore>((set, get) => ({
  entries: loadSessionHistoryFromStorage(),

  archiveSession: (entry) => {
    const archived: SessionHistoryEntry = {
      ...entry,
      archivedAt: Date.now(),
    }
    set((s) => {
      // Avoid duplicates by sessionId
      const filtered = s.entries.filter((e) => e.sessionId !== entry.sessionId)
      const entries = [archived, ...filtered].slice(0, MAX_HISTORY_ENTRIES)
      persistSessionHistory(entries)
      return { entries }
    })
  },

  removeEntry: (sessionId) => {
    set((s) => {
      const entries = s.entries.filter((e) => e.sessionId !== sessionId)
      persistSessionHistory(entries)
      return { entries }
    })
  },

  clearHistory: () => {
    set({ entries: [] })
    try {
      localStorage.removeItem(SESSION_HISTORY_KEY)
    } catch { /* ignore */ }
  },

  getRecent: (limit = 10) => {
    return get().entries.slice(0, limit)
  },
}))

function loadSessionHistoryFromStorage(): SessionHistoryEntry[] {
  try {
    const raw = localStorage.getItem(SESSION_HISTORY_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SessionHistoryEntry[]
  } catch {
    return []
  }
}

function persistSessionHistory(entries: SessionHistoryEntry[]): void {
  try {
    localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(entries))
  } catch {
    // Storage full — prune
    const pruned = entries.slice(0, 20)
    try {
      localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(pruned))
    } catch { /* give up */ }
  }
}
