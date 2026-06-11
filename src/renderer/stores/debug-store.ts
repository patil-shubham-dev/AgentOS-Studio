import { create } from "zustand"

export interface DebugBreakpoint {
  id: string
  filePath: string
  line: number
  enabled: boolean
  condition?: string
  hitCount?: number
}

export interface DebugFrame {
  filePath: string
  line: number
  column: number
  functionName?: string
}

export interface CallStackFrame {
  filePath: string
  line: number
  functionName: string
}

export interface VariableEntry {
  name: string
  value: string
  type: string
}

export interface ConsoleEntry {
  level: "log" | "warn" | "error"
  message: string
  timestamp: number
}

interface DebugStore {
  breakpoints: DebugBreakpoint[]
  activeBreakpointId: string | null
  isPaused: boolean
  currentFrame: DebugFrame | null
  callStack: CallStackFrame[]
  variables: VariableEntry[]
  consoleOutput: ConsoleEntry[]
  isRunning: boolean
  isConnecting: boolean
  inspectorUrl: string | null
  sessionId: string | null
  cdpConnected: boolean

  addBreakpoint: (bp: DebugBreakpoint) => void
  removeBreakpoint: (id: string) => void
  toggleBreakpoint: (id: string) => void
  setPaused: (paused: boolean) => void
  setCurrentFrame: (frame: DebugFrame | null) => void
  setCallStack: (stack: CallStackFrame[]) => void
  setVariables: (vars: VariableEntry[]) => void
  addConsoleOutput: (entry: { level: "log" | "warn" | "error"; message: string }) => void
  clearConsole: () => void
  setRunning: (running: boolean) => void
  setConnecting: (connecting: boolean) => void
  setInspectorUrl: (url: string | null) => void
  setSessionId: (id: string | null) => void
  setCdpConnected: (connected: boolean) => void
  reset: () => void
}

let nextBreakpointId = 1

export const useDebugStore = create<DebugStore>((set) => ({
  breakpoints: [],
  activeBreakpointId: null,
  isPaused: false,
  currentFrame: null,
  callStack: [],
  variables: [],
  consoleOutput: [],
  isRunning: false,
  isConnecting: false,
  inspectorUrl: null,
  sessionId: null,
  cdpConnected: false,

  addBreakpoint: (bp) =>
    set((state) => ({
      breakpoints: [...state.breakpoints, { ...bp, id: bp.id || `bp-${nextBreakpointId++}` }],
    })),

  removeBreakpoint: (id) =>
    set((state) => ({
      breakpoints: state.breakpoints.filter((b) => b.id !== id),
      activeBreakpointId: state.activeBreakpointId === id ? null : state.activeBreakpointId,
    })),

  toggleBreakpoint: (id) =>
    set((state) => ({
      breakpoints: state.breakpoints.map((b) =>
        b.id === id ? { ...b, enabled: !b.enabled } : b,
      ),
    })),

  setPaused: (paused) => set({ isPaused: paused }),
  setCurrentFrame: (frame) => set({ currentFrame: frame }),
  setCallStack: (stack) => set({ callStack: stack }),
  setVariables: (vars) => set({ variables: vars }),

  addConsoleOutput: (entry) =>
    set((state) => ({
      consoleOutput: [...state.consoleOutput, { ...entry, timestamp: Date.now() }],
    })),

  clearConsole: () => set({ consoleOutput: [] }),
  setRunning: (running) => set({ isRunning: running }),
  setConnecting: (connecting) => set({ isConnecting: connecting }),
  setInspectorUrl: (url) => set({ inspectorUrl: url }),
  setSessionId: (id) => set({ sessionId: id }),
  setCdpConnected: (connected) => set({ cdpConnected: connected }),
  reset: () => set({
    isPaused: false,
    currentFrame: null,
    callStack: [],
    variables: [],
    isRunning: false,
    isConnecting: false,
    inspectorUrl: null,
    sessionId: null,
    cdpConnected: false,
  }),
}))
