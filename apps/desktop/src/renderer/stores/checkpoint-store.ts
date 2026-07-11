import { create } from "zustand"
import type { CheckpointMetadata } from "@/runtime/execution/CheckpointStore"

export interface CheckpointUIState {
  isOpen: boolean
  checkpoints: CheckpointMetadata[]
  selectedId: string | null
  isLoading: boolean
  error: string | null
  restoreStatus: "idle" | "restoring" | "success" | "failed" | null
}

export interface CheckpointStoreActions {
  togglePanel: () => void
  openPanel: () => void
  closePanel: () => void
  setCheckpoints: (checkpoints: CheckpointMetadata[]) => void
  selectCheckpoint: (id: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setRestoreStatus: (status: CheckpointUIState["restoreStatus"]) => void
  reset: () => void
}

const initialState: CheckpointUIState = {
  isOpen: false,
  checkpoints: [],
  selectedId: null,
  isLoading: false,
  error: null,
  restoreStatus: null,
}

export const useCheckpointStore = create<CheckpointUIState & CheckpointStoreActions>((set) => ({
  ...initialState,

  togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),
  openPanel: () => set({ isOpen: true }),
  closePanel: () => set({ isOpen: false }),

  setCheckpoints: (checkpoints) => set({
    checkpoints,
    isLoading: false,
    error: null,
  }),

  selectCheckpoint: (id) => set({ selectedId: id }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),

  setRestoreStatus: (restoreStatus) => set({ restoreStatus }),

  reset: () => set(initialState),
}))
