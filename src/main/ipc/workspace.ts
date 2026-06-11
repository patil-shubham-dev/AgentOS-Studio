import { ipcMain, BrowserWindow } from 'electron'
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

  // Get file tree
  ipcMain.handle('workspace:get-tree', async (_event, dirPath: string, maxDepth?: number) => {
    return wm.getFileTree(dirPath, maxDepth || 10)
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
    return wm.startWatching(dirPath, (_eventType, filePath) => {
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
