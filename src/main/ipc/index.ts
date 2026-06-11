import { ipcMain, dialog, app, clipboard, Notification, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, renameSync, unlinkSync, watch } from 'fs'
import { join, dirname, basename } from 'path'
import { spawnSync } from 'child_process'
import type { WindowManager } from '../window-manager'
import type { BrowserManager } from '../services/browser-manager'
import type { TerminalManager } from '../services/terminal-manager'
import { registerCommandHandlers } from './command'
import { assertPathAllowed } from './path-utils'
import { registerHttpProxyHandler } from './http-proxy'

export function registerAllIpcHandlers(
  windowManager: WindowManager,
  browserManager: BrowserManager,
  terminalManager: TerminalManager
): void {
  registerAppHandlers()
  registerFileSystemHandlers()
  registerWorkspaceHandlers()
  registerGitHandlers()
  registerDialogHandlers()
  registerClipboardHandlers()
  registerNotificationHandlers()
  registerBrowserHandlers(browserManager)
  registerTerminalHandlers(terminalManager)
  registerCommandHandlers()
  registerHttpProxyHandler()
  registerUninstallHandlers()
  registerWorkspaceIpcHandlers()
}

function registerAppHandlers(): void {
  ipcMain.handle('get-app-info', () => ({
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron
  }))

  ipcMain.handle('get-install-info', () => ({
    first_launch: !existsSync(join(app.getPath('userData'), 'config.json'))
  }))

  ipcMain.handle('app-exit', () => app.exit(0))
  ipcMain.handle('app-restart', () => { app.relaunch(); app.exit(0) })

  // Auto-update handlers
  const updater = () => import('../updater')
  ipcMain.handle('check-for-updates', async () => { (await updater()).checkForUpdates() })
  ipcMain.handle('download-update', async () => { (await updater()).downloadUpdate() })
  ipcMain.handle('install-update', async () => { (await updater()).installUpdate() })

  ipcMain.handle('get-app-paths', () => ({
    userData: app.getPath('userData'),
    home: app.getPath('home'),
    desktop: app.getPath('desktop'),
    documents: app.getPath('documents'),
    downloads: app.getPath('downloads'),
    appData: app.getPath('appData'),
    temp: app.getPath('temp'),
    exe: app.getPath('exe'),
    logs: app.getPath('logs'),
    crashes: app.getPath('crashDumps')
  }))

  ipcMain.handle('get-resource-data-url', async (_event, resourceName: string) => {
    try {
      const resourcePath = join(__dirname, '../../resources', resourceName)
      if (!existsSync(resourcePath)) return null
      const ext = resourceName.split('.').pop()?.toLowerCase() ?? 'png'
      const mimeMap: Record<string, string> = { png: 'image/png', ico: 'image/x-icon', svg: 'image/svg+xml', bmp: 'image/bmp' }
      const mime = mimeMap[ext] ?? 'application/octet-stream'
      const data = readFileSync(resourcePath)
      const base64 = data.toString('base64')
      return `data:${mime};base64,${base64}`
    } catch {
      return null
    }
  })

  ipcMain.handle('save-layout', (_e, layout: string) => {
    writeFileSync(join(app.getPath('userData'), 'layout.json'), layout, 'utf-8')
  })

  ipcMain.handle('load-layout', () => {
    const p = join(app.getPath('userData'), 'layout.json')
    return existsSync(p) ? readFileSync(p, 'utf-8') : null
  })
}

function registerFileSystemHandlers(): void {
  ipcMain.handle('read-text-file', (_e, fp: string) => {
    assertPathAllowed(fp)
    return readFileSync(fp, 'utf-8')
  })
  ipcMain.handle('write-text-file', (_e, fp: string, c: string) => {
    assertPathAllowed(fp)
    const d = dirname(fp); if (!existsSync(d)) mkdirSync(d, { recursive: true })
    writeFileSync(fp, c, 'utf-8')
  })
  ipcMain.handle('read-binary-file', (_e, fp: string) => {
    assertPathAllowed(fp)
    return Buffer.from(readFileSync(fp)).toString('base64')
  })
  ipcMain.handle('write-binary-file', (_e, fp: string, b64: string) => {
    assertPathAllowed(fp)
    const d = dirname(fp); if (!existsSync(d)) mkdirSync(d, { recursive: true })
    writeFileSync(fp, Buffer.from(b64, 'base64'))
  })
  ipcMain.handle('file-exists', (_e, fp: string) => {
    try { assertPathAllowed(fp); return existsSync(fp) } catch { return false }
  })
  ipcMain.handle('create-directory', (_e, dp: string) => {
    assertPathAllowed(dp)
    mkdirSync(dp, { recursive: true })
  })
  ipcMain.handle('delete-file', (_e, fp: string) => {
    assertPathAllowed(fp)
    unlinkSync(fp)
  })
  ipcMain.handle('rename-file', (_e, op: string, np: string) => {
    assertPathAllowed(op)
    assertPathAllowed(np)
    renameSync(op, np)
  })
  ipcMain.handle('get-file-stats', (_e, fp: string) => {
    const s = statSync(fp)
    return { isFile: s.isFile(), isDirectory: s.isDirectory(), isSymlink: s.isSymbolicLink(), size: s.size, created: s.birthtimeMs, modified: s.mtimeMs }
  })
  ipcMain.handle('read-directory', (_e, dp: string) => {
    assertPathAllowed(dp)
    return readdirSync(dp, { withFileTypes: true }).map(e => ({
      name: e.name, path: join(dp, e.name), isDirectory: e.isDirectory(), isFile: e.isFile()
    }))
  })

  const watchers = new Map<string, ReturnType<typeof watch>>()
  ipcMain.handle('start-file-watcher', (_e, dirPath: string) => {
    assertPathAllowed(dirPath)
    if (watchers.has(dirPath)) return
    watchers.set(dirPath, watch(dirPath, { recursive: true }, (eventType, filename) => {
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('file-changed', { eventType, filename, dir: dirPath }))
    }))
  })
  ipcMain.handle('stop-file-watcher', (_e, dirPath: string) => {
    assertPathAllowed(dirPath)
    const w = watchers.get(dirPath); if (w) { w.close(); watchers.delete(dirPath) }
  })

  ipcMain.handle('list-directory', (_e, dirPath: string) => {
    assertPathAllowed(dirPath)
    const result: Array<{ name: string; path: string; children?: any[] }> = []
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.git') continue
      const fullPath = join(dirPath, entry.name)
      const item: any = { name: entry.name, path: fullPath }
      if (entry.isDirectory()) {
        try {
          item.children = readdirSync(fullPath)
            .filter(c => !c.startsWith('.') || c === '.git')
            .map(c => ({ name: c, path: join(fullPath, c) }))
        } catch { item.children = [] }
      }
      result.push(item)
    }
    return result
  })
}

function registerWorkspaceHandlers(): void {
  ipcMain.handle('workspace-list-files', (_e, dirPath: string) => {
    assertPathAllowed(dirPath)
    const files: string[] = []
    function walk(dir: string) {
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const fp = join(dir, entry.name)
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') walk(fp)
          else if (entry.isFile()) files.push(fp)
        }
      } catch {}
    }
    walk(dirPath)
    return files
  })
}

function registerGitHandlers(): void {
  const git = (args: string[], cwd: string) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, windowsHide: true })
    if (result.status !== 0) throw new Error(result.stderr?.trim() || `git ${args[0]} failed`)
    return result.stdout
  }

  ipcMain.handle('git-status', (_e, repoPath: string) => {
    try {
      return git(['status', '--porcelain'], repoPath).split('\n').filter(Boolean).map(l => ({ status: l.substring(0, 2).trim(), file: l.substring(3) }))
    } catch { return [] }
  })
  ipcMain.handle('git-log', (_e, repoPath: string, max = 50) => {
    try {
      return git(['log', `--max-count=${max}`, '--pretty=format:%H|%an|%ae|%ad|%s', '--date=short'], repoPath).split('\n').filter(Boolean).map(l => {
        const [hash, author, email, date, ...msg] = l.split('|')
        return { hash, author, email, date, message: msg.join('|') }
      })
    } catch { return [] }
  })
  ipcMain.handle('git-diff', (_e, repoPath: string, file?: string) => {
    try { return git(['diff', ...(file ? ['--', file] : [])], repoPath) } catch { return '' }
  })
  ipcMain.handle('git-commit', (_e, repoPath: string, msg: string) => {
    try { git(['add', '-A'], repoPath); git(['commit', '-m', msg], repoPath); return true } catch { return false }
  })
  ipcMain.handle('git-restore', (_e, repoPath: string, file: string) => {
    try { git(['restore', '--', file], repoPath); return true } catch { return false }
  })
  ipcMain.handle('git-init', (_e, repoPath: string) => {
    try { git(['init'], repoPath); return true } catch { return false }
  })
  ipcMain.handle('git-push', (_e, repoPath: string) => {
    try { git(['push'], repoPath); return true } catch { return false }
  })
  ipcMain.handle('git-pull', (_e, repoPath: string) => {
    try { git(['pull'], repoPath); return true } catch { return false }
  })
  ipcMain.handle('git-branch-list', (_e, repoPath: string) => {
    try {
      const branches = git(['branch', '--list', '--format=%(refname:short)||%(upstream:short)||%(upstream:track)'], repoPath).split('\n').filter(Boolean).map(l => {
        const [name, upstream, tracking] = l.split('||')
        return { name, upstream: upstream || null, tracking: tracking || null }
      })
      const current = git(['branch', '--show-current'], repoPath).trim()
      return branches.map(b => ({ ...b, current: b.name === current }))
    } catch { return [] }
  })
  ipcMain.handle('git-checkout', (_e, repoPath: string, branch: string) => {
    try { git(['checkout', branch], repoPath); return true } catch { return false }
  })
  ipcMain.handle('git-add', (_e, repoPath: string, file: string) => {
    try { git(['add', '--', file], repoPath); return true } catch { return false }
  })
}

function registerDialogHandlers(): void {
  ipcMain.handle('dialog-open', async (_e, opts: Electron.OpenDialogOptions) => {
    const win = BrowserWindow.getFocusedWindow()
    return win ? dialog.showOpenDialog(win, opts) : { canceled: true, filePaths: [] }
  })
  ipcMain.handle('dialog-save', async (_e, opts: Electron.SaveDialogOptions) => {
    const win = BrowserWindow.getFocusedWindow()
    return win ? dialog.showSaveDialog(win, opts) : { canceled: true, filePath: '' }
  })
  ipcMain.handle('dialog-message', async (_e, opts: Electron.MessageBoxOptions) => {
    const win = BrowserWindow.getFocusedWindow()
    return win ? dialog.showMessageBox(win, opts) : { response: 0 }
  })
}

function registerClipboardHandlers(): void {
  ipcMain.handle('clipboard-read-text', () => clipboard.readText())
  ipcMain.handle('clipboard-write-text', (_e, t: string) => clipboard.writeText(t))
  ipcMain.handle('clipboard-read-image', () => clipboard.readImage().toDataURL())
  ipcMain.handle('clipboard-write-image', (_e, d: string) => clipboard.writeImage(nativeImage.createFromDataURL(d)))
}

function registerNotificationHandlers(): void {
  ipcMain.handle('notification-show', async (_e, opts: { title: string; body: string }) => {
    if (Notification.isSupported()) { new Notification({ title: opts.title, body: opts.body }).show(); return true }
    return false
  })
  ipcMain.handle('notification-is-supported', () => Notification.isSupported())
}

function registerBrowserHandlers(bm: BrowserManager): void {
  ipcMain.handle('browser-launch', async (_e, opts?) => bm.launch(opts))
  ipcMain.handle('browser-close', async (_e, id: string) => bm.closeSession(id))
  ipcMain.handle('browser-navigate', async (_e, id: string, url: string) => bm.navigate(id, url))
  ipcMain.handle('browser-new-tab', async (_e, id: string, url?: string) => bm.newTab(id, url))
  ipcMain.handle('browser-close-tab', async (_e, id: string, tabId: string) => bm.closeTab(id, tabId))
  ipcMain.handle('browser-list-tabs', async (_e, id: string) => bm.listTabs(id))
  ipcMain.handle('browser-click', async (_e, id: string, sel: string) => bm.click(id, sel))
  ipcMain.handle('browser-type', async (_e, id: string, sel: string, text: string) => bm.type(id, sel, text))
  ipcMain.handle('browser-screenshot', async (_e, id: string) => bm.screenshot(id))
  ipcMain.handle('browser-get-text', async (_e, id: string) => bm.getText(id))
  ipcMain.handle('browser-get-url', async (_e, id: string) => bm.getUrl(id))
  ipcMain.handle('browser-get-title', async (_e, id: string) => bm.getTitle(id))
  ipcMain.handle('browser-get-content', async (_e, id: string) => bm.getContent(id))
  ipcMain.handle('browser-execute-js', async (event, id: string, js: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Approve', 'Deny'],
        defaultId: 1,
        cancelId: 1,
        title: 'Browser JS Execution',
        message: 'Allow executing JavaScript in the browser?',
        detail: `Session: ${id}\n\n${js.slice(0, 500)}${js.length > 500 ? '\n...' : ''}`,
      })
      if (response !== 0) return null
    }
    return bm.executeJs(id, js)
  })
  ipcMain.handle('browser-reload', async (_e, id: string) => bm.reload(id))
  ipcMain.handle('browser-double-click', async (_e, id: string, sel: string) => bm.doubleClick(id, sel))
  ipcMain.handle('browser-hover', async (_e, id: string, sel: string) => bm.hover(id, sel))
  ipcMain.handle('browser-press-key', async (_e, id: string, key: string) => bm.pressKey(id, key))
  ipcMain.handle('browser-wait-element', async (_e, id: string, sel: string, timeout?: number) => bm.waitForElement(id, sel, timeout))
  ipcMain.handle('browser-get-console-logs', async (_e, id: string) => bm.getConsoleLogs(id))
  ipcMain.handle('browser-save-state', async (_e, path: string) => bm.saveState(path))
  ipcMain.handle('browser-load-state', async (_e, path: string) => bm.loadState(path))
  ipcMain.handle('browser-detect', async () => bm.detectBrowsers())
}

function registerTerminalHandlers(tm: TerminalManager): void {
  ipcMain.handle('terminal-create', async (_e, opts?: { shellPath?: string; cwd?: string }) => tm.create(opts))
  ipcMain.handle('terminal-write', (_e, id: string, data: string) => tm.write(id, data))
  ipcMain.handle('terminal-resize', (_e, id: string, cols: number, rows: number) => tm.resize(id, cols, rows))
  ipcMain.handle('terminal-kill', (_e, id: string) => tm.kill(id))
  ipcMain.handle('terminal-list', () => tm.list())
}

import { registerUninstallIpcHandlers as registerUninstallHandlers } from './uninstall'
import { registerWorkspaceIpcHandlers } from './workspace'
import { nativeImage } from 'electron'
