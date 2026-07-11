import { create } from "zustand"

export type CursorType = "click" | "type" | "navigate" | "wait" | "scroll"

interface CursorPosition {
  x: number
  y: number
}

interface AICursorState {
  position: CursorPosition
  type: CursorType
  label: string
  visible: boolean
  targetSelector: string
  showCursor: (position: CursorPosition, type: CursorType, label?: string, selector?: string) => void
  hideCursor: () => void
}

export const useAICursorStore = create<AICursorState>((set) => ({
  position: { x: 0, y: 0 },
  type: "click",
  label: "",
  visible: false,
  targetSelector: "",
  showCursor: (position, type, label = "", selector = "") => {
    set({ position, type, label, targetSelector: selector, visible: true })
  },
  hideCursor: () => {
    set({ visible: false })
  },
}))
