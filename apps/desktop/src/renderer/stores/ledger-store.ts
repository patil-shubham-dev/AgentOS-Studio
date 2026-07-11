import { create } from "zustand"
import type { LedgerEntry } from "@/types"

const MAX_LEDGER_ENTRIES = 200

interface LedgerStore {
  entries: LedgerEntry[]
  addEntry: (entry: LedgerEntry) => void
  addAction: (params: {
    agentRole: string
    action: string
    file?: string | null
    status: "success" | "error"
    summary: string
  }) => void
  clearEntries: () => void
  loadEntries: (entries: LedgerEntry[]) => void
}

function capEntries(entries: LedgerEntry[]): LedgerEntry[] {
  if (entries.length <= MAX_LEDGER_ENTRIES) return entries
  return entries.slice(entries.length - MAX_LEDGER_ENTRIES)
}

export const useLedgerStore = create<LedgerStore>((set) => ({
  entries: [],

  addEntry: (entry) =>
    set((s) => ({ entries: capEntries([...s.entries, entry]) })),

  addAction: ({ agentRole, action, file = null, status, summary }) => {
    const entry: LedgerEntry = {
      timestamp: new Date().toISOString(),
      agentId: agentRole,
      action,
      file,
      status,
      summary,
    }
    set((s) => ({ entries: capEntries([...s.entries, entry]) }))
  },

  clearEntries: () => set({ entries: [] }),

  loadEntries: (entries) => set({ entries: capEntries(entries) }),
}))
