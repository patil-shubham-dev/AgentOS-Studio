import { useCallback } from "react"
import { useWorkspaceStore } from "@/stores/workspace-store"
import {
  readFile,
  createFile as fsCreateFile,
  createFolder as fsCreateFolder,
  deleteEntry as fsDeleteEntry,
  renameEntry as fsRenameEntry,
} from "@/lib/filesystem"

export function useFileActions(refreshTree: () => Promise<void>) {
  const rootPath = useWorkspaceStore((s) => s.rootPath)

  const openFile = useCallback(async (absolutePath: string) => {
    if (!rootPath) return
    const relPath = absolutePath.replace(rootPath.replace(/\\/g, "/"), "").replace(/^\//, "")
    try {
      const content = await readFile(absolutePath)
      const name = relPath.split("/").pop() || relPath
      useWorkspaceStore.getState().openFile({ path: relPath, name, content, isDirty: false })
    } catch {
      useWorkspaceStore.getState().setActiveFile(relPath)
    }
  }, [rootPath])

  const createFile = useCallback(async (parentAbsolutePath: string, name: string) => {
    if (!rootPath) return
    try {
      await fsCreateFile(parentAbsolutePath.replace(/\\/g, "/") + "/" + name)
    } catch { /* fall through to refresh */ }
    await refreshTree()
  }, [rootPath, refreshTree])

  const createFolder = useCallback(async (parentAbsolutePath: string, name: string) => {
    if (!rootPath) return
    try {
      await fsCreateFolder(parentAbsolutePath.replace(/\\/g, "/") + "/" + name)
    } catch { /* fall through to refresh */ }
    await refreshTree()
  }, [rootPath, refreshTree])

  const renameEntry = useCallback(async (oldAbsolutePath: string, newAbsolutePath: string) => {
    if (!rootPath) return
    try {
      await fsRenameEntry(oldAbsolutePath, newAbsolutePath)
    } catch { /* fall through to refresh */ }
    await refreshTree()
  }, [rootPath, refreshTree])

  const deleteEntry = useCallback(async (absolutePath: string) => {
    if (!rootPath) return
    try {
      await fsDeleteEntry(absolutePath)
    } catch { /* fall through to refresh */ }
    await refreshTree()
  }, [rootPath, refreshTree])

  const duplicateEntry = useCallback(async (absolutePath: string) => {
    if (!rootPath) return
    try {
      const content = await readFile(absolutePath)
      const dirParts = absolutePath.replace(/\\/g, "/").split("/")
      const fileName = dirParts.pop() || ""
      const parentDir = dirParts.join("/")
      const ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : ""
      const baseName = ext ? fileName.substring(0, fileName.lastIndexOf(".")) : fileName
      const newName = `${baseName} copy${ext}`
      await fsCreateFile(parentDir + "/" + newName, content)
    } catch { /* fall through to refresh */ }
    await refreshTree()
  }, [rootPath, refreshTree])

  const copyPath = useCallback((path: string) => {
    try { navigator.clipboard.writeText(path) } catch { /* noop */ }
  }, [])

  return { openFile, createFile, createFolder, renameEntry, deleteEntry, duplicateEntry, copyPath }
}
