import { create } from "zustand"
import { usePaneStore, type PaneType } from "./pane-store"
import { useWorkspaceStore } from "./workspace-store"

export type PaneAction =
  | { type: "focus"; pane: PaneType }
  | { type: "open"; pane: PaneType }
  | { type: "close"; pane: PaneType }
  | { type: "navigate"; pane: "browser" | "preview"; url: string }
  | { type: "showArtifact"; artifactId: string }
  | { type: "showDiff"; filePath: string }
  | { type: "runAgent"; task: string }
  | { type: "openTerminal"; command?: string }

export interface PaneState {
  browserUrl: string
  browserHistory: string[]
  previewUrl: string
  previewHistory: string[]
  activeArtifactId: string | null
  activeDesignVersion: string | null
  agentTask: string | null
  terminalCommand: string | null
}

export interface PanelCoordinator {
  dispatch: (action: PaneAction) => void
  paneState: PaneState
  setPaneState: (partial: Partial<PaneState>) => void
  lastAction: PaneAction | null
  aiControlEnabled: boolean
  setAiControlEnabled: (enabled: boolean) => void
}

export const usePanelCoordinator = create<PanelCoordinator>((set, get) => ({
  paneState: {
    browserUrl: "",
    browserHistory: [],
    previewUrl: "",
    previewHistory: [],
    activeArtifactId: null,
    activeDesignVersion: null,
    agentTask: null,
    terminalCommand: null,
  },

  lastAction: null,
  aiControlEnabled: true,

  setAiControlEnabled: (enabled) => set({ aiControlEnabled: enabled }),

  setPaneState: (partial) =>
    set((s) => ({
      paneState: { ...s.paneState, ...partial },
    })),

  dispatch: (action) => {
    set({ lastAction: action })
    const { aiControlEnabled } = get()
    if (!aiControlEnabled) return

    const paneStore = usePaneStore.getState()

    switch (action.type) {
      case "focus":
        paneStore.ensurePane(action.pane)
        paneStore.focusPane(action.pane)
        break

      case "open":
        paneStore.ensurePane(action.pane)
        paneStore.focusPane(action.pane)
        break

      case "close":
        paneStore.setPaneVisibility(action.pane, false)
        break

      case "navigate": {
        const state = get()
        const history = action.pane === "browser"
          ? state.paneState.browserHistory
          : state.paneState.previewHistory
        const newHistory = [...history.filter((u) => u !== action.url), action.url].slice(-50)
        set({
          paneState: {
            ...state.paneState,
            [action.pane === "browser" ? "browserUrl" : "previewUrl"]: action.url,
            [action.pane === "browser" ? "browserHistory" : "previewHistory"]: newHistory,
          },
        })
        paneStore.ensurePane(action.pane)
        paneStore.focusPane(action.pane)
        break
      }

      case "showArtifact":
        paneStore.ensurePane("design")
        paneStore.focusPane("design")
        set((s) => ({
          paneState: { ...s.paneState, activeArtifactId: action.artifactId },
        }))
        break

      case "showDiff":
        paneStore.ensurePane("code")
        paneStore.focusPane("code")
        useWorkspaceStore.getState().openFileInDiffMode(action.filePath)
        break

      case "runAgent":
        paneStore.ensurePane("chat")
        paneStore.focusPane("chat")
        set((s) => ({
          paneState: { ...s.paneState, agentTask: action.task },
        }))
        break

      case "openTerminal":
        paneStore.ensurePane("terminal")
        set((s) => ({
          paneState: { ...s.paneState, terminalCommand: action.command ?? null },
        }))
        break
    }
  },
}))
