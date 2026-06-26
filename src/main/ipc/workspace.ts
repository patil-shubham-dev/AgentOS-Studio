import { ipcMain, BrowserWindow } from 'electron'
import { resolve, normalize } from 'path'
import { WorkspaceManager } from '../WorkspaceManager'
import { setAllowedWorkspacePath, addGitAllowedPath, assertPathAllowed } from './path-utils'

function validatePath(p: unknown, name = 'path'): string {
  if (typeof p !== 'string' || p.length === 0) throw new Error(`Invalid ${name}: must be a non-empty string`)
  if (p.length > 4096) throw new Error(`Invalid ${name}: path too long (${p.length} chars)`)
  return p
}

function validateString(v: unknown, name: string, maxLength = 10000): string {
  if (typeof v !== 'string') throw new Error(`Invalid ${name}: must be a string`)
  if (v.length > maxLength) throw new Error(`Invalid ${name}: exceeds max length (${v.length} > ${maxLength})`)
  return v
}

let workspaceManager: WorkspaceManager

export function getWorkspaceManager(): WorkspaceManager {
  if (!workspaceManager) workspaceManager = new WorkspaceManager()
  return workspaceManager
}

export function registerWorkspaceIpcHandlers(): void {
  const wm = getWorkspaceManager()

  // Open folder dialog — user-initiated, no validation needed
  ipcMain.handle('workspace:open-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const folderPath = await wm.openFolderDialog(win)
    setAllowedWorkspacePath(folderPath)
    if (folderPath) addGitAllowedPath(folderPath)
    return folderPath
  })

  // Open workspace file dialog — user-initiated, no validation needed
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
    const validated = validatePath(dirPath, 'directory path')
    const resolvedPath = resolve(normalize(validated))
    setAllowedWorkspacePath(resolvedPath)
    addGitAllowedPath(resolvedPath)
    const depth = maxDepth !== undefined ? Math.min(Math.max(1, maxDepth), 50) : 10
    const entries = wm.getFileTree(resolvedPath, depth)
    const normalized = entries.map(toRendererEntry)
    return normalized
  })

  // Read file
  ipcMain.handle('workspace:read-file', async (_event, filePath: string) => {
    const validated = validatePath(filePath)
    assertPathAllowed(validated)
    return wm.readFile(validated)
  })

  // Write file
  ipcMain.handle('workspace:write-file', async (_event, filePath: string, content: string) => {
    const validated = validatePath(filePath)
    assertPathAllowed(validated)
    validateString(content, 'file content', 10 * 1024 * 1024)
    return wm.writeFile(validated, content)
  })

  // Create file
  ipcMain.handle('workspace:create-file', async (_event, dirPath: string, name: string) => {
    const validated = validatePath(dirPath)
    assertPathAllowed(validated)
    validateString(name, 'file name', 512)
    return wm.createFile(validated, name)
  })

  // Create directory
  ipcMain.handle('workspace:create-directory', async (_event, dirPath: string, name: string) => {
    const validated = validatePath(dirPath)
    assertPathAllowed(validated)
    validateString(name, 'directory name', 512)
    return wm.createDirectory(validated, name)
  })

  // Rename entry
  ipcMain.handle('workspace:rename', async (_event, oldPath: string, newPath: string) => {
    const oldValidated = validatePath(oldPath, 'old path')
    const newValidated = validatePath(newPath, 'new path')
    assertPathAllowed(oldValidated)
    assertPathAllowed(newValidated)
    return wm.rename(oldValidated, newValidated)
  })

  // Delete entry
  ipcMain.handle('workspace:delete', async (_event, targetPath: string) => {
    const validated = validatePath(targetPath)
    assertPathAllowed(validated)
    return wm.deleteEntry(validated)
  })

  // Start file watcher
  ipcMain.handle('workspace:start-watcher', async (_event, dirPath: string) => {
    const validated = validatePath(dirPath, 'directory to watch')
    const resolvedPath = resolve(normalize(validated))
    return wm.startWatching(resolvedPath, (_eventType, filePath) => {
      const windows = BrowserWindow.getAllWindows()
      for (const w of windows) {
        try {
          if (!w.isDestroyed()) w.webContents.send('file-changed', { path: filePath, type: _eventType })
        } catch { console.warn("[IPC] Failed to notify window of file change") }
      }
    })
  })

  // Stop file watcher
  ipcMain.handle('workspace:stop-watcher', async (_event, dirPath: string) => {
    const validated = validatePath(dirPath, 'directory to watch')
    wm.stopWatching(validated)
  })

  // Recent workspaces
  ipcMain.handle('workspace:get-recent', async () => {
    return wm.getRecentWorkspaces()
  })

  ipcMain.handle('workspace:add-recent', async (_event, folderPath: string) => {
    wm.addRecentWorkspace(validatePath(folderPath, 'folder path'))
    return true
  })

  ipcMain.handle('workspace:remove-recent', async (_event, folderPath: string) => {
    wm.removeRecentWorkspace(validatePath(folderPath, 'folder path'))
    return true
  })

  ipcMain.handle('workspace:pin-recent', async (_event, folderPath: string, pinned: boolean) => {
    wm.pinRecentWorkspace(validatePath(folderPath, 'folder path'), pinned)
    return true
  })

  // List directory (non-recursive, immediate children only)
  ipcMain.handle('workspace:list-dir', async (_event, dirPath: string) => {
    const validated = validatePath(dirPath, 'directory path')
    const resolvedPath = resolve(normalize(validated))
    setAllowedWorkspacePath(resolvedPath)
    addGitAllowedPath(resolvedPath)
    const entries = wm.listDirectory(resolvedPath)
    const normalized = entries.map(toRendererEntry)
    return normalized
  })

  // Search files
  ipcMain.handle('workspace:search-files', async (_event, rootDir: string, query: string, maxResults?: number) => {
    validatePath(rootDir, 'search root directory')
    validateString(query, 'search query', 500)
    const results = maxResults !== undefined ? Math.min(Math.max(1, maxResults), 1000) : 100
    return wm.searchFiles(rootDir, query, results)
  })
}
