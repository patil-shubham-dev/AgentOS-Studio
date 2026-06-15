import { useCallback } from "react"
import { useWorkspaceStore } from "@/stores/workspace-store"
import {
  readFile,
  createFile as fsCreateFile,
  createFolder as fsCreateFolder,
  deleteEntry as fsDeleteEntry,
  renameEntry as fsRenameEntry,
} from "@/lib/filesystem"

export function useFileActions(
  refreshTree: () => Promise<void>
) {
  const rootPath = useWorkspaceStore((s) => s.rootPath)

  const openFile = useCallback(
    async (relativePath: string) => {
      if (!rootPath) return
      const absPath = `${rootPath}\\${relativePath.replace(/\//g, "\\")}`
      try {
        const content = await readFile(absPath)
        const name = relativePath.split("/").pop() || relativePath
        const { useWorkspaceStore } = await import("@/stores/workspace-store")
        useWorkspaceStore.getState().openFile({
          path: relativePath,
          name,
          content,
          isDirty: false,
        })
      } catch {
        const { useWorkspaceStore } = await import("@/stores/workspace-store")
        useWorkspaceStore.getState().setActiveFile(relativePath)
      }
    },
    [rootPath]
  )

  const createFile = useCallback(
    async (parentAbsolutePath: string, name: string) => {
      if (!rootPath) return
      const fullPath = parentAbsolutePath.replace(/\\/g, "/") + "/" + name
      try {
        await fsCreateFile(fullPath)
        await refreshTree()
      } catch {
        await refreshTree()
      }
    },
    [rootPath, refreshTree]
  )

  const createFolder = useCallback(
    async (parentAbsolutePath: string, name: string) => {
      if (!rootPath) return
      const fullPath = parentAbsolutePath.replace(/\\/g, "/") + "/" + name
      try {
        await fsCreateFolder(fullPath)
        await refreshTree()
      } catch {
        await refreshTree()
      }
    },
    [rootPath, refreshTree]
  )

  const renameEntry = useCallback(
    async (oldAbsolutePath: string, newAbsolutePath: string) => {
      if (!rootPath) return
      try {
        await fsRenameEntry(oldAbsolutePath, newAbsolutePath)
        await refreshTree()
      } catch {
        await refreshTree()
      }
    },
    [rootPath, refreshTree]
  )

  const deleteEntry = useCallback(
    async (path: string) => {
      if (!rootPath) return
      try {
        await fsDeleteEntry(path)
        await refreshTree()
      } catch {
        await refreshTree()
      }
    },
    [rootPath, refreshTree]
  )

  const duplicateEntry = useCallback(
    async (absolutePath: string) => {
      if (!rootPath) return
      try {
        const content = await readFile(absolutePath)
        const dirParts = absolutePath.replace(/\\/g, "/").split("/")
        const fileName = dirParts.pop() || ""
        const parentDir = dirParts.join("/")
        const ext = fileName.includes(".")
          ? fileName.substring(fileName.lastIndexOf("."))
          : ""
        const baseName = ext
          ? fileName.substring(0, fileName.lastIndexOf("."))
          : fileName
        const newName = `${baseName} copy${ext}`
        const newPath = parentDir + "/" + newName
        await fsCreateFile(newPath, content)
        await refreshTree()
      } catch {
        await refreshTree()
      }
    },
    [rootPath, refreshTree]
  )

  const copyPath = useCallback((absolutePath: string) => {
    try {
      navigator.clipboard.writeText(absolutePath)
    } catch {}
  }, [])

  const revealInOs = useCallback(async (absolutePath: string) => {
    try {
      const { shellOpen } = await import("@/lib/electron-api")
      await shellOpen(absolutePath.replace(/\//g, "\\"))
    } catch {
      try {
        const { invoke } = await import("@/lib/electron-api")
        await invoke("open_in_explorer", { path: absolutePath })
      } catch {}
    }
  }, [])

  const deletePaths = useCallback(
    async (paths: string[]) => {
      if (!rootPath || paths.length === 0) return
      let allSucceeded = true
      for (const p of paths) {
        try {
          await fsDeleteEntry(p)
        } catch {
          allSucceeded = false
        }
      }
      await refreshTree()
      if (!allSucceeded) {
        console.warn("[Explorer] Some files could not be deleted")
      }
    },
    [rootPath, refreshTree]
  )

  const copyPaths = useCallback((paths: string[]) => {
    try {
      navigator.clipboard.writeText(paths.join("\n"))
    } catch {}
  }, [])

  return {
    openFile,
    createFile,
    createFolder,
    renameEntry,
    deleteEntry,
    duplicateEntry,
    copyPath,
    revealInOs,
    deletePaths,
    copyPaths,
  }
}
