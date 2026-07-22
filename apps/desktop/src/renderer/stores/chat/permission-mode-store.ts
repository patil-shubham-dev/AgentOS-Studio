import { create } from "zustand"

export type PermissionMode = "automatic" | "prompt" | "manual" | "plan"

interface PermissionModeState {
  mode: PermissionMode
  setMode: (mode: PermissionMode) => void
  isPlanMode: () => boolean
  requireApproval: () => boolean
  allowExecution: () => boolean
  allowWriteTools: () => boolean
  autoApprovePatterns: RegExp[]
}

export const usePermissionModeStore = create<PermissionModeState>((set, get) => ({
  mode: "prompt",

  setMode: (mode) => set({ mode }),

  isPlanMode: () => get().mode === "plan",

  requireApproval: () => {
    const { mode } = get()
    return mode === "prompt" || mode === "manual"
  },

  allowExecution: () => {
    const { mode } = get()
    return mode === "automatic"
  },

  allowWriteTools: () => {
    const { mode } = get()
    return mode !== "plan"
  },

  autoApprovePatterns: [],
}))
