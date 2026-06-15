import { app, dialog, BrowserWindow } from 'electron'
import { join, dirname, basename } from 'path'
import {
  existsSync, readdirSync, statSync, readFileSync, writeFileSync,
  mkdirSync, unlinkSync, renameSync, rmSync, watch,
} from 'fs'
import type { FSWatcher } from 'fs'

export interface WorkspaceFolder {
  path: string
  name: string
}

export interface WorkspaceData {
  folders: WorkspaceFolder[]
  settings?: Record<string, unknown>
}

export interface RecentWorkspace {
  path: string
  name: string
  lastOpened: number
  pinned: boolean
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  size: number
  modified: number
  children?: FileEntry[]
}

const RECENT_WORKSPACES_FILE = 'recent-workspaces.json'
const WORKSPACE_CONFIG_FILE = 'workspace-config.json'
const MAX_RECENT = 20

export class WorkspaceManager {
  private watchers = new Map<string, FSWatcher>()
  private currentFolders: WorkspaceFolder[] = []

  getRecentWorkspaces(): RecentWorkspace[] {
    const filePath = join(app.getPath('userData'), RECENT_WORKSPACES_FILE)
    try {
      if (!existsSync(filePath)) return []
      return JSON.parse(readFileSync(filePath, 'utf-8'))
    } catch { return [] }
  }

  addRecentWorkspace(folderPath: string): void {
    const recent = this.getRecentWorkspaces().filter(r => r.path !== folderPath)
    recent.unshift({
      path: folderPath,
      name: basename(folderPath),
      lastOpened: Date.now(),
      pinned: false,
    })
    if (recent.length > MAX_RECENT) recent.length = MAX_RECENT
    this.saveRecentWorkspaces(recent)
  }

  pinRecentWorkspace(path: string, pinned: boolean): void {
    const recent = this.getRecentWorkspaces()
    const found = recent.find(r => r.path === path)
    if (found) found.pinned = pinned
    this.saveRecentWorkspaces(recent)
  }

  removeRecentWorkspace(path: string): void {
    const recent = this.getRecentWorkspaces().filter(r => r.path !== path)
    this.saveRecentWorkspaces(recent)
  }

  private saveRecentWorkspaces(recent: RecentWorkspace[]): void {
    const filePath = join(app.getPath('userData'), RECENT_WORKSPACES_FILE)
    try { writeFileSync(filePath, JSON.stringify(recent, null, 2)) } catch {}
  }

  async openFolderDialog(win: BrowserWindow): Promise<string | null> {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Open Folder',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const folderPath = result.filePaths[0]
    this.addRecentWorkspace(folderPath)
    return folderPath
  }

  async openWorkspaceDialog(win: BrowserWindow): Promise<WorkspaceData | null> {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      title: 'Open Workspace',
      filters: [{ name: 'Workspace Files', extensions: ['code-workspace', 'agenticos-workspace'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const wsPath = result.filePaths[0]
    const content = readFileSync(wsPath, 'utf-8')
    const ws: WorkspaceData = JSON.parse(content)
    this.addRecentWorkspace(dirname(wsPath))
    return ws
  }

  async saveWorkspaceData(data: WorkspaceData, savePath?: string): Promise<string> {
    const wsPath = savePath || join(app.getPath('userData'), WORKSPACE_CONFIG_FILE)
    writeFileSync(wsPath, JSON.stringify(data, null, 2))
    return wsPath
  }

  setCurrentFolders(folders: WorkspaceFolder[]): void {
    this.currentFolders = folders
  }

  getCurrentFolders(): WorkspaceFolder[] {
    return this.currentFolders
  }

  getFileTree(dirPath: string, maxDepth = 10, currentDepth = 0): FileEntry[] {
    if (currentDepth > maxDepth) return []
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })
      const result: FileEntry[] = []
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        if (entry.name === 'node_modules' && currentDepth > 0) continue
        const fullPath = join(dirPath, entry.name)
        const stats = statSync(fullPath)
        const fileEntry: FileEntry = {
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
          size: stats.size,
          modified: stats.mtimeMs,
        }
        if (entry.isDirectory()) {
          fileEntry.children = this.getFileTree(fullPath, maxDepth, currentDepth + 1)
        }
        result.push(fileEntry)
      }
      return result.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    } catch { return [] }
  }

  readFile(filePath: string): string | null {
    try { return readFileSync(filePath, 'utf-8') } catch { return null }
  }

  writeFile(filePath: string, content: string): boolean {
    try {
      const dir = dirname(filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(filePath, content, 'utf-8')
      return true
    } catch { return false }
  }

  createFile(dirPath: string, name: string): string | null {
    const fullPath = join(dirPath, name)
    try {
      if (existsSync(fullPath)) return null
      writeFileSync(fullPath, '', 'utf-8')
      return fullPath
    } catch { return null }
  }

  createDirectory(dirPath: string, name: string): string | null {
    const fullPath = join(dirPath, name)
    try {
      if (existsSync(fullPath)) return null
      mkdirSync(fullPath, { recursive: true })
      return fullPath
    } catch { return null }
  }

  rename(oldPath: string, newPath: string): boolean {
    try {
      renameSync(oldPath, newPath)
      return true
    } catch { return false }
  }

  deleteEntry(targetPath: string): boolean {
    try {
      const stats = statSync(targetPath)
      if (stats.isDirectory()) {
        rmSync(targetPath, { recursive: true, force: true })
      } else {
        unlinkSync(targetPath)
      }
      return true
    } catch { return false }
  }

  startWatching(dirPath: string, callback: (event: 'change' | 'rename', filePath: string) => void): boolean {
    try {
      if (this.watchers.has(dirPath)) this.stopWatching(dirPath)
      const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (filename) {
          callback(eventType as 'change' | 'rename', join(dirPath, filename.toString()))
        }
      })
      this.watchers.set(dirPath, watcher)
      return true
    } catch { return false }
  }

  stopWatching(dirPath: string): void {
    const watcher = this.watchers.get(dirPath)
    if (watcher) {
      watcher.close()
      this.watchers.delete(dirPath)
    }
  }

  stopAllWatching(): void {
    for (const [dir, watcher] of this.watchers) {
      watcher.close()
    }
    this.watchers.clear()
  }

  /**
   * List the immediate children of a directory (non-recursive).
   * Returns FileEntry objects with empty children arrays for directories.
   */
  listDirectory(dirPath: string): FileEntry[] {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })
      const result: FileEntry[] = []
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        if (entry.name === 'node_modules') continue
        const fullPath = join(dirPath, entry.name)
        const stats = statSync(fullPath)
        const isDir = entry.isDirectory()
        result.push({
          name: entry.name,
          path: fullPath,
          isDirectory: isDir,
          isFile: entry.isFile(),
          size: stats.size,
          modified: stats.mtimeMs,
          children: isDir ? [] : undefined,
        })
      }
      return result.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    } catch { return [] }
  }

  // File search
  searchFiles(rootDir: string, query: string, maxResults = 100): Array<{ path: string; name: string; matches: string[] }> {
    const results: Array<{ path: string; name: string; matches: string[] }> = []
    const lowerQuery = query.toLowerCase()

    function walk(dir: string, depth: number) {
      if (depth > 8 || results.length >= maxResults) return
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
          const fullPath = join(dir, entry.name)
          if (entry.isFile()) {
            if (entry.name.toLowerCase().includes(lowerQuery)) {
              results.push({ path: fullPath, name: entry.name, matches: [] })
            } else if (results.length < maxResults) {
              try {
                const content = readFileSync(fullPath, 'utf-8')
                if (content.toLowerCase().includes(lowerQuery)) {
                  const lines = content.split('\n')
                  const matchingLines = lines
                    .map((l, i) => ({ line: i + 1, text: l.trim() }))
                    .filter(l => l.text.toLowerCase().includes(lowerQuery))
                    .slice(0, 5)
                    .map(l => `L${l.line}: ${l.text.substring(0, 100)}`)
                  results.push({ path: fullPath, name: entry.name, matches: matchingLines })
                }
              } catch {}
            }
          } else if (entry.isDirectory()) {
            walk(fullPath, depth + 1)
          }
        }
      } catch {}
    }

    walk(rootDir, 0)
    return results.slice(0, maxResults)
  }
}
