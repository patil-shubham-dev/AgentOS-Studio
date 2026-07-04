import { create } from "zustand"
import { usePaneStore, type PaneType } from "./pane-store"
import { useWorkspaceStore } from "./workspace-store"

export type PaneAction =
  | { type: "focus"; pane: PaneType }
  | { type: "open"; pane: PaneType }
  | { type: "close"; pane: PaneType }
  | { type: "navigate"; pane: "design"; url: string }
  | { type: "showArtifact"; artifactId: string }
  | { type: "showDiff"; filePath: string }
  | { type: "runAgent"; task: string }

export interface PaneState {
  browserUrl: string
  browserHistory: string[]
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
        const newHistory = [...state.paneState.browserHistory.filter((u) => u !== action.url), action.url].slice(-50)
        set({
          paneState: {
            ...state.paneState,
            browserUrl: action.url,
            browserHistory: newHistory,
          },
        })
        paneStore.ensurePane("design")
        paneStore.focusPane("design")
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

    }
  },
}))
