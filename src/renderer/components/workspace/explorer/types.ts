import type { FileEntry } from "@/types"

export interface FileActionHandlers {
  openFile: (path: string) => Promise<void>
  createFile: (parentPath: string, name: string) => Promise<void>
  createFolder: (parentPath: string, name: string) => Promise<void>
  renameEntry: (oldPath: string, newPath: string) => Promise<void>
  deleteEntry: (path: string) => Promise<void>
  duplicateEntry: (path: string) => Promise<void>
  copyPath: (path: string) => void
  revealInOs: (path: string) => Promise<void>
}

export interface ExplorerHandle {
  collapseAll: () => void
  focusSearch: () => void
}
