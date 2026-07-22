import { create } from "zustand"
import { FileHistoryManager, type FileSnapshot } from "@/lib/file-history/FileHistoryManager"

interface HistoryStore {
  /** Whether the history panel is open */
  open: boolean
  /** Current file path being viewed in history */
  activeFilePath: string | null
  /** Snapshots for the active file */
  snapshots: FileSnapshot[]
  /** Currently selected snapshot version for diffing */
  selectedVersion: number | null
  /** Content of the currently selected snapshot (loaded on demand) */
  snapshotContent: string | null
  /** Whether snapshot content is being loaded */
  loading: boolean
  /** Error message */
  error: string | null

  setOpen: (open: boolean) => void
  toggleOpen: () => void
  /** Load history for a specific file */
  loadFileHistory: (filePath: string) => void
  /** Select a snapshot and load its content */
  selectSnapshot: (version: number) => Promise<void>
  /** Clear state */
  clear: () => void
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  open: false,
  activeFilePath: null,
  snapshots: [],
  selectedVersion: null,
  snapshotContent: null,
  loading: false,
  error: null,

  setOpen: (open) => set({ open }),

  toggleOpen: () => set((s) => ({ open: !s.open })),

  loadFileHistory: (filePath) => {
    try {
      const history = FileHistoryManager.getInstance().getHistory(filePath)
      set({
        activeFilePath: filePath,
        snapshots: [...history].reverse(),
        selectedVersion: null,
        snapshotContent: null,
        error: null,
      })
    } catch (err) {
      set({ error: `Failed to load history: ${err instanceof Error ? err.message : String(err)}` })
    }
  },

  selectSnapshot: async (version) => {
    const { activeFilePath } = get()
    if (!activeFilePath) return
    set({ selectedVersion: version, loading: true, error: null })
    try {
      const content = await FileHistoryManager.getInstance().restoreSnapshot(activeFilePath, version)
      set({ snapshotContent: content, loading: false })
    } catch (err) {
      set({
        snapshotContent: null,
        loading: false,
        error: `Failed to load snapshot: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  },

  clear: () =>
    set({
      open: false,
      activeFilePath: null,
      snapshots: [],
      selectedVersion: null,
      snapshotContent: null,
      loading: false,
      error: null,
    }),
}))
