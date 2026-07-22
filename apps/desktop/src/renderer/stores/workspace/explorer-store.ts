import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface ExplorerState {
  explorerOpen: boolean
  explorerWidth: number
  workspacePanelOpen: boolean
  workspacePanelWidth: number
  workspacePanel: "code" | "design"

  setExplorerOpen: (open: boolean) => void
  toggleExplorer: () => void
  setExplorerWidth: (width: number) => void
  setWorkspacePanelOpen: (open: boolean) => void
  toggleWorkspacePanel: () => void
  setWorkspacePanelWidth: (width: number) => void
  setWorkspacePanel: (panel: "code" | "design") => void
}

export const useExplorerStore = create<ExplorerState>()(
  persist(
    (set) => ({
      explorerOpen: false,
      explorerWidth: 320,
      workspacePanelOpen: true,
      workspacePanelWidth: 420,
      workspacePanel: "code",

      setExplorerOpen: (open) => set({ explorerOpen: open }),
      toggleExplorer: () => set((s) => ({ explorerOpen: !s.explorerOpen })),
      setExplorerWidth: (width) => set({ explorerWidth: width }),
      setWorkspacePanelOpen: (open) => set({ workspacePanelOpen: open }),
      toggleWorkspacePanel: () => set((s) => ({ workspacePanelOpen: !s.workspacePanelOpen })),
      setWorkspacePanelWidth: (width) => set({ workspacePanelWidth: width }),
      setWorkspacePanel: (panel) => set({ workspacePanel: panel }),
    }),
    { name: "aos-explorer-layout" },
  ),
)
