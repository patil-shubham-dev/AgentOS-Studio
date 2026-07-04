import { create } from "zustand"
import type { ContextPack } from "@/runtime/context/ContextPackBuilder"

interface ContextPackSlotStore {
  currentPack: ContextPack | null
  setCurrentPack: (pack: ContextPack) => void
  clear: () => void
}

export const useContextPackSlot = create<ContextPackSlotStore>((set) => ({
  currentPack: null,
  setCurrentPack: (pack) => set({ currentPack: pack }),
  clear: () => set({ currentPack: null }),
}))
