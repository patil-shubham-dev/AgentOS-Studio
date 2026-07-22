import { create } from "zustand"
import type { Sandbox, SandboxDiff } from "@/lib/git/WorktreeSandbox"

export type SandboxUIMode = "idle" | "creating" | "reviewing" | "merging" | "discarding" | "completed" | "error"

interface SandboxStoreState {
  activeSandbox: Sandbox | null
  diff: SandboxDiff | null
  uiMode: SandboxUIMode
  error: string | null

  setActiveSandbox: (sandbox: Sandbox | null) => void
  setDiff: (diff: SandboxDiff | null) => void
  setUIMode: (mode: SandboxUIMode) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useSandboxStore = create<SandboxStoreState>((set) => ({
  activeSandbox: null,
  diff: null,
  uiMode: "idle",
  error: null,

  setActiveSandbox: (sandbox) =>
    set({
      activeSandbox: sandbox,
      uiMode: sandbox ? "reviewing" : "idle",
    }),

  setDiff: (diff) => set({ diff }),

  setUIMode: (mode) => set({ uiMode: mode }),

  setError: (error) =>
    set({
      error,
      uiMode: error ? "error" : "idle",
    }),

  reset: () =>
    set({
      activeSandbox: null,
      diff: null,
      uiMode: "idle",
      error: null,
    }),
}))
