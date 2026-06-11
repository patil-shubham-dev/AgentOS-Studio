import { ipcMain, BrowserWindow } from 'electron'
import { resolve, normalize } from 'path'
import { WorkspaceManager } from '../WorkspaceManager'
import { setAllowedWorkspacePath } from './path-utils'

let workspaceManager: WorkspaceManager

export function getWorkspaceManager(): WorkspaceManager {
  if (!workspaceManager) workspaceManager = new WorkspaceManager()
  return workspaceManager
}

export function registerWorkspaceIpcHandlers(): void {
  const wm = getWorkspaceManager()

  // Open folder dialog
  ipcMain.handle('workspace:open-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const folderPath = await wm.openFolderDialog(win)
    setAllowedWorkspacePath(folderPath)
    return folderPath
  })

  // Open workspace file dialog
  ipcMain.handle('workspace:open-workspace', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    return wm.openWorkspaceDialog(win)
  })

  // Normalize the main-process FileEntry (camelCase) to renderer FileEntry (snake_case)
  function toRendererEntry(camel: import('../WorkspaceManager').FileEntry): {
    name: string; path: string; is_dir: boolean; size: number; lastModified: number; children: any[]
  } {
    return {
      name: camel.name,
      path: camel.path,
      is_dir: camel.isDirectory,
      size: camel.size,
      lastModified: camel.modified,
      children: camel.children ? camel.children.map(toRendererEntry) : [],
    }
  }

  // Get file tree
  ipcMain.handle('workspace:get-tree', async (_event, dirPath: string, maxDepth?: number) => {
    const resolvedPath = resolve(normalize(dirPath))
    console.log("[TRACE:IPC:workspace:get-tree] START dirPath=", dirPath, "resolved=", resolvedPath, "maxDepth=", maxDepth)
    setAllowedWorkspacePath(resolvedPath)
    const entries = wm.getFileTree(resolvedPath, maxDepth || 10)
    console.log("[TRACE:IPC:workspace:get-tree] raw entries from WorkspaceManager:", entries.length, "first.name=", entries[0]?.name ?? "EMPTY")
    const normalized = entries.map(toRendererEntry)
    console.log("[TRACE:IPC:workspace:get-tree] normalized first entry:", normalized[0] ? JSON.stringify(normalized[0]).slice(0, 300) : "EMPTY")
    return normalized
  })

  // Read file
  ipcMain.handle('workspace:read-file', async (_event, filePath: string) => {
    return wm.readFile(filePath)
  })

  // Write file
  ipcMain.handle('workspace:write-file', async (_event, filePath: string, content: string) => {
    return wm.writeFile(filePath, content)
  })

  // Create file
  ipcMain.handle('workspace:create-file', async (_event, dirPath: string, name: string) => {
    return wm.createFile(dirPath, name)
  })

  // Create directory
  ipcMain.handle('workspace:create-directory', async (_event, dirPath: string, name: string) => {
    return wm.createDirectory(dirPath, name)
  })

  // Rename entry
  ipcMain.handle('workspace:rename', async (_event, oldPath: string, newPath: string) => {
    return wm.rename(oldPath, newPath)
  })

  // Delete entry
  ipcMain.handle('workspace:delete', async (_event, targetPath: string) => {
    return wm.deleteEntry(targetPath)
  })

  // Start file watcher
  ipcMain.handle('workspace:start-watcher', async (_event, dirPath: string) => {
    const resolvedPath = resolve(normalize(dirPath))
    return wm.startWatching(resolvedPath, (_eventType, filePath) => {
      const windows = BrowserWindow.getAllWindows()
      for (const w of windows) {
        try {
          if (!w.isDestroyed()) w.webContents.send('file-changed', { path: filePath, type: _eventType })
        } catch {}
      }
    })
  })

  // Stop file watcher
  ipcMain.handle('workspace:stop-watcher', async (_event, dirPath: string) => {
    wm.stopWatching(dirPath)
  })

  // Recent workspaces
  ipcMain.handle('workspace:get-recent', async () => {
    return wm.getRecentWorkspaces()
  })

  ipcMain.handle('workspace:add-recent', async (_event, folderPath: string) => {
    wm.addRecentWorkspace(folderPath)
    return true
  })

  ipcMain.handle('workspace:remove-recent', async (_event, folderPath: string) => {
    wm.removeRecentWorkspace(folderPath)
    return true
  })

  ipcMain.handle('workspace:pin-recent', async (_event, folderPath: string, pinned: boolean) => {
    wm.pinRecentWorkspace(folderPath, pinned)
    return true
  })

  // Search files
  ipcMain.handle('workspace:search-files', async (_event, rootDir: string, query: string, maxResults?: number) => {
    return wm.searchFiles(rootDir, query, maxResults || 100)
  })
}
