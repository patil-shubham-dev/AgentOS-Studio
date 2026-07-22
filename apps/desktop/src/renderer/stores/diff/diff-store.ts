/**
 * DiffStore — tracks pending file diffs and their per-change accept/reject status.
 *
 * Each diff entry represents a single file's changes with per-hunk tracking.
 * The store supports:
 *   - Adding diffs from agent execution or sandbox review
 *   - Per-file accept/reject
 *   - Per-hunk granular accept/reject within a file
 *   - Bulk accept-all / reject-all
 *   - Querying status for UI rendering
 */

import { create } from "zustand"

export interface DiffHunkStatus {
  /** 0-based hunk index within the file's diff */
  hunkIndex: number
  /** The hunk header (e.g. @@ -1,5 +1,8 @@) */
  header: string
  /** Whether this hunk has been accepted or rejected */
  status: "pending" | "accepted" | "rejected"
  /** Number of additions in this hunk */
  additions: number
  /** Number of deletions in this hunk */
  deletions: number
}

export interface DiffFileEntry {
  /** File path relative to workspace root */
  path: string
  /** Original file content (before changes) */
  originalContent: string
  /** Modified file content (after changes) */
  modifiedContent: string
  /** Raw unified diff string */
  rawDiff: string
  /** Per-hunk status tracking */
  hunks: DiffHunkStatus[]
  /** Overall file status */
  status: "pending" | "accepted" | "rejected"
  /** Timestamp when this diff was created */
  createdAt: number
  /** Which execution/session produced this diff */
  source: "agent" | "sandbox" | "manual"
}

export interface DiffStoreState {
  /** All pending file diffs, keyed by file path */
  files: Map<string, DiffFileEntry>
  /** Optional correlation ID to group diffs by execution */
  correlationId: string | null

  /** Actions */
  addFileDiff: (entry: DiffFileEntry) => void
  addFileDiffs: (entries: DiffFileEntry[]) => void
  acceptFile: (path: string) => void
  rejectFile: (path: string) => void
  acceptHunk: (path: string, hunkIndex: number) => void
  rejectHunk: (path: string, hunkIndex: number) => void
  acceptAll: () => void
  rejectAll: () => void
  removeFile: (path: string) => void
  clear: () => void
  setCorrelationId: (id: string | null) => void

  /** Queries */
  getPendingFiles: () => DiffFileEntry[]
  getAcceptedFiles: () => DiffFileEntry[]
  getFileStatus: (path: string) => DiffFileEntry | undefined
  getTotalChanges: () => { files: number; additions: number; deletions: number; pending: number }
}

/** Maximum number of file diffs tracked at once */
const MAX_DIFF_FILES = 200

export const useDiffStore = create<DiffStoreState>((set, get) => ({
  files: new Map(),
  correlationId: null,

  /** File diffs capped at MAX_DIFF_FILES (removes oldest entries by insertion order) */
  addFileDiff: (entry) =>
    set((state) => {
      const newFiles = new Map(state.files)
      newFiles.set(entry.path, entry)
      if (newFiles.size > MAX_DIFF_FILES) {
        const toDelete = [...newFiles.keys()].slice(0, newFiles.size - MAX_DIFF_FILES)
        for (const k of toDelete) newFiles.delete(k)
      }
      return { files: newFiles }
    }),

  /** File diffs capped at MAX_DIFF_FILES (removes oldest entries by insertion order) */
  addFileDiffs: (entries) =>
    set((state) => {
      const newFiles = new Map(state.files)
      for (const entry of entries) {
        newFiles.set(entry.path, entry)
      }
      if (newFiles.size > MAX_DIFF_FILES) {
        const toDelete = [...newFiles.keys()].slice(0, newFiles.size - MAX_DIFF_FILES)
        for (const k of toDelete) newFiles.delete(k)
      }
      return { files: newFiles }
    }),

  acceptFile: (path) =>
    set((state) => {
      const file = state.files.get(path)
      if (!file) return state
      const newFiles = new Map(state.files)
      newFiles.set(path, {
        ...file,
        status: "accepted",
        hunks: file.hunks.map((h) => ({ ...h, status: "accepted" as const })),
      })
      return { files: newFiles }
    }),

  rejectFile: (path) =>
    set((state) => {
      const file = state.files.get(path)
      if (!file) return state
      const newFiles = new Map(state.files)
      newFiles.set(path, {
        ...file,
        status: "rejected",
        hunks: file.hunks.map((h) => ({ ...h, status: "rejected" as const })),
      })
      return { files: newFiles }
    }),

  acceptHunk: (path, hunkIndex) =>
    set((state) => {
      const file = state.files.get(path)
      if (!file || hunkIndex < 0 || hunkIndex >= file.hunks.length) return state
      const newHunks = [...file.hunks]
      newHunks[hunkIndex] = { ...newHunks[hunkIndex], status: "accepted" }

      // If all hunks accepted, mark file as accepted
      const allAccepted = newHunks.every((h) => h.status === "accepted")

      const newFiles = new Map(state.files)
      newFiles.set(path, {
        ...file,
        status: allAccepted ? "accepted" : "pending",
        hunks: newHunks,
      })
      return { files: newFiles }
    }),

  rejectHunk: (path, hunkIndex) =>
    set((state) => {
      const file = state.files.get(path)
      if (!file || hunkIndex < 0 || hunkIndex >= file.hunks.length) return state
      const newHunks = [...file.hunks]
      newHunks[hunkIndex] = { ...newHunks[hunkIndex], status: "rejected" }

      // If any hunk was accepted and not all rejected, file stays pending
      const anyAccepted = newHunks.some((h) => h.status === "accepted")
      const allRejected = newHunks.every((h) => h.status === "rejected")

      const newFiles = new Map(state.files)
      newFiles.set(path, {
        ...file,
        status: allRejected ? "rejected" : anyAccepted ? "pending" : "pending",
        hunks: newHunks,
      })
      return { files: newFiles }
    }),

  acceptAll: () =>
    set((state) => {
      const newFiles = new Map(state.files)
      for (const [path, file] of newFiles) {
        newFiles.set(path, {
          ...file,
          status: "accepted",
          hunks: file.hunks.map((h) => ({ ...h, status: "accepted" as const })),
        })
      }
      return { files: newFiles }
    }),

  rejectAll: () =>
    set((state) => {
      const newFiles = new Map(state.files)
      for (const [path, file] of newFiles) {
        newFiles.set(path, {
          ...file,
          status: "rejected",
          hunks: file.hunks.map((h) => ({ ...h, status: "rejected" as const })),
        })
      }
      return { files: newFiles }
    }),

  removeFile: (path) =>
    set((state) => {
      const newFiles = new Map(state.files)
      newFiles.delete(path)
      return { files: newFiles }
    }),

  clear: () => set({ files: new Map(), correlationId: null }),

  setCorrelationId: (id) => set({ correlationId: id }),

  getPendingFiles: () => {
    return Array.from(get().files.values()).filter(
      (f) => f.status === "pending",
    )
  },

  getAcceptedFiles: () => {
    return Array.from(get().files.values()).filter(
      (f) => f.status === "accepted",
    )
  },

  getFileStatus: (path) => {
    return get().files.get(path)
  },

  getTotalChanges: () => {
    const files = Array.from(get().files.values())
    const result = { files: files.length, additions: 0, deletions: 0, pending: 0 }
    for (const f of files) {
      for (const h of f.hunks) {
        result.additions += h.additions
        result.deletions += h.deletions
      }
      if (f.status === "pending") result.pending++
    }
    return result
  },
}))
