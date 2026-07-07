import { useCallback } from "react"
import { useWorkspaceStore } from "@/stores/workspace-store"
import {
  readFile,
  createFile as fsCreateFile,
  createFolder as fsCreateFolder,
  deleteEntry as fsDeleteEntry,
  renameEntry as fsRenameEntry,
} from "@/lib/filesystem"

function getStore() {
  return useWorkspaceStore.getState()
}

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
        useWorkspaceStore.getState().openFile({
          path: relativePath,
          name,
          content,
          isDirty: false,
        })
      } catch {
        useWorkspaceStore.getState().setActiveFile(relativePath)
      }
    },
    [rootPath]
  )

  const createFile = useCallback(
    async (parentAbsolutePath: string, name: string) => {
      if (!rootPath) return
      const fullPath = parentAbsolutePath.replace(/\\/g, "/") + "/" + name
      const relPath = fullPath.replace(rootPath.replace(/\\/g, "/"), "").replace(/^\//, "")
      try {
        await fsCreateFile(fullPath)
        const content = ''
        getStore().insertFileEntry(parentAbsolutePath.replace(/\\/g, "/"), {
          name, path: relPath, is_dir: false, children: [],
          size: 0, lastModified: Date.now(),
        })
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
      const relPath = fullPath.replace(rootPath.replace(/\\/g, "/"), "").replace(/^\//, "")
      try {
        await fsCreateFolder(fullPath)
        getStore().insertFileEntry(parentAbsolutePath.replace(/\\/g, "/"), {
          name, path: relPath, is_dir: true, children: [],
          lastModified: Date.now(),
        })
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
        const oldRel = oldAbsolutePath.replace(rootPath.replace(/\\/g, "/"), "").replace(/^\//, "")
        const newRel = newAbsolutePath.replace(rootPath.replace(/\\/g, "/"), "").replace(/^\//, "")
        getStore().renameFileEntry(oldRel, newRel)
      } catch {
        await refreshTree()
      }
    },
    [rootPath, refreshTree]
  )

  const deleteEntry = useCallback(
    async (path: string) => {
      if (!rootPath) return
      const relPath = path.replace(rootPath.replace(/\\/g, "/"), "").replace(/^\//, "")
      try {
        await fsDeleteEntry(path)
        getStore().removeFileEntry(relPath)
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
        const newRel = newPath.replace(rootPath.replace(/\\/g, "/"), "").replace(/^\//, "")
        getStore().insertFileEntry(parentDir.replace(/\\/g, "/"), {
          name: newName, path: newRel, is_dir: false, children: [],
          size: content.length, lastModified: Date.now(),
        })
      } catch {
        await refreshTree()
      }
    },
    [rootPath, refreshTree]
  )

  const copyPath = useCallback((absolutePath: string) => {
    try {
      navigator.clipboard.writeText(absolutePath)
    } catch { console.warn("[Explorer] Failed to copy path") }
  }, [])

  const revealInOs = useCallback(async (absolutePath: string) => {
    try {
      const { shellOpen } = await import("@/lib/electron-api")
      await shellOpen(absolutePath.replace(/\//g, "\\"))
    } catch {
      try {
        const { invoke } = await import("@/lib/electron-api")
        await invoke("open_in_explorer", { path: absolutePath })
      } catch { console.warn("[Explorer] Failed to reveal in OS") }
    }
  }, [])

  const deletePaths = useCallback(
    async (paths: string[]) => {
      if (!rootPath || paths.length === 0) return
      let allSucceeded = true
      for (const p of paths) {
        try {
          await fsDeleteEntry(p)
          const relPath = p.replace(rootPath.replace(/\\/g, "/"), "").replace(/^\//, "")
          getStore().removeFileEntry(relPath)
        } catch {
          allSucceeded = false
        }
      }
      if (!allSucceeded) {
        console.warn("[Explorer] Some files could not be deleted")
        await refreshTree()
      }
    },
    [rootPath, refreshTree]
  )

  const copyPaths = useCallback((paths: string[]) => {
    try {
      navigator.clipboard.writeText(paths.join("\n"))
    } catch { console.warn("[Explorer] Failed to copy paths") }
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
