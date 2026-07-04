import { create } from "zustand"
import type { ChangeSet, ChangeSetId } from "./types"

const STORAGE_KEY = "agentic-changeset-state"

function persistChangeSets(changeSets: Map<ChangeSetId, ChangeSet>): void {
  try {
    const pending = Array.from(changeSets.values()).filter(
      (cs) => cs.status === "pending_review" || cs.status === "partially_accepted"
    )
    if (pending.length === 0) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pending))
    }
  } catch (err) {
    console.warn("[ChangeSetStore] Failed to persist:", err)
  }
}

function restoreChangeSets(): Map<ChangeSetId, ChangeSet> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const parsed = JSON.parse(raw) as ChangeSet[]
    const map = new Map<ChangeSetId, ChangeSet>()
    for (const cs of parsed) {
      map.set(cs.id, cs)
    }
    return map
  } catch (err) {
    console.warn("[ChangeSetStore] Failed to restore:", err)
    return new Map()
  }
}

export interface ChangeSetStoreState {
  changeSets: Map<ChangeSetId, ChangeSet>
  activeChangeSetId: ChangeSetId | null

  addChangeSet: (cs: ChangeSet) => void
  updateChangeSet: (id: ChangeSetId, partial: Partial<ChangeSet>) => void
  removeChangeSet: (id: ChangeSetId) => void
  setActiveChangeSet: (id: ChangeSetId | null) => void

  getChangeSet: (id: ChangeSetId) => ChangeSet | undefined
  getChangeSetsBySession: (sessionId: string) => ChangeSet[]
  getPendingChangeSets: () => ChangeSet[]
  persistNow: () => void
}

const restored = restoreChangeSets()

export const useChangeSetStore = create<ChangeSetStoreState>((set, get) => ({
  changeSets: restored,
  activeChangeSetId: null,

  addChangeSet: (cs) =>
    set((state) => {
      const newMap = new Map(state.changeSets)
      newMap.set(cs.id, cs)
      return { changeSets: newMap }
    }),

  updateChangeSet: (id, partial) =>
    set((state) => {
      const existing = state.changeSets.get(id)
      if (!existing) return state
      const newMap = new Map(state.changeSets)
      newMap.set(id, { ...existing, ...partial })
      return { changeSets: newMap }
    }),

  removeChangeSet: (id) =>
    set((state) => {
      const newMap = new Map(state.changeSets)
      newMap.delete(id)
      const activeChangeSetId = state.activeChangeSetId === id ? null : state.activeChangeSetId
      return { changeSets: newMap, activeChangeSetId }
    }),

  setActiveChangeSet: (id) => set({ activeChangeSetId: id }),

  getChangeSet: (id) => get().changeSets.get(id),

  getChangeSetsBySession: (sessionId) =>
    Array.from(get().changeSets.values()).filter((cs) => cs.sessionId === sessionId),

  getPendingChangeSets: () =>
    Array.from(get().changeSets.values()).filter(
      (cs) => cs.status === "pending_review" || cs.status === "partially_accepted"
    ),

  persistNow: () => persistChangeSets(get().changeSets),
}))

// Auto-persist on every state change
const originalSet = useChangeSetStore.setState
let persistTimer: ReturnType<typeof setTimeout> | null = null
useChangeSetStore.setState = ((partial, replace) => {
  originalSet(partial, replace)
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistChangeSets(useChangeSetStore.getState().changeSets)
  }, 500)
}) as typeof useChangeSetStore.setState
