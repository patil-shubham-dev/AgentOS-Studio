import { ipcMain, dialog, app, clipboard, Notification, BrowserWindow, safeStorage, session, shell } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, renameSync, unlinkSync, watch } from 'fs'
import { join, dirname, basename } from 'path'
import { spawnSync } from 'child_process'
import type { WindowManager } from '../window-manager'
import type { BrowserManager } from '../services/browser-manager'
import type { TerminalManager } from '../services/terminal-manager'
import { ViewportManager } from '../services/viewport-manager'
import { registerCommandHandlers } from './command'
import { assertPathAllowed, assertGitRepoPath } from './path-utils'
import { registerHttpProxyHandler } from './http-proxy'
import { registerViewportHandlers } from './viewport'
import { log } from '../observability'

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
  registerShellHandlers()
  registerBrowserHandlers(browserManager)
  registerTerminalHandlers(terminalManager)
  registerCommandHandlers()
  registerHttpProxyHandler()
  registerUninstallHandlers()
  registerWorkspaceIpcHandlers()
  registerReplayHandlers()
  registerExtensionHandlers()
  registerPluginBrowserHandlers()
  registerVerificationHandlers()
  registerDevHandlers()
  const viewportManager = new ViewportManager()
  registerViewportHandlers(viewportManager, windowManager)
  registerImportSettingsHandlers()
}

function registerDevHandlers(): void {
  ipcMain.handle('dev:run-benchmark100', async (_event, category?: string) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { error: 'No focused window' }
    try {
      const result = await win.webContents.executeJavaScript(`
        (async () => {
          const { createBenchmarkRunner } = await import('@/runtime/execution/index')
          const runner = createBenchmarkRunner()
          return JSON.stringify(
            ${category ? `await runner.runCategory(${JSON.stringify(category)})` : 'await runner.runAll()'}
          )
        })()
      `)
      return JSON.parse(result)
    } catch (err: any) {
      console.warn("[IPC] test-runner failed:", err.message)
      return { error: err.message }
    }
  })
}

function registerAppHandlers(): void {
  ipcMain.handle('safe-storage-encrypt', async (_event, plaintext: string) => {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('[SafeStorage] Encryption not available on this platform')
      return null
    }
    try {
      const encrypted = safeStorage.encryptString(plaintext)
      return encrypted.toString('base64')
    } catch (err) {
      console.error('[SafeStorage] Encryption failed:', err)
      return null
    }
  })

  ipcMain.handle('safe-storage-decrypt', async (_event, ciphertext: string) => {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('[SafeStorage] Decryption not available on this platform')
      return null
    }
    try {
      const buffer = Buffer.from(ciphertext, 'base64')
      return safeStorage.decryptString(buffer)
    } catch (err) {
      console.error('[SafeStorage] Decryption failed:', err)
      return null
    }
  })

  ipcMain.handle('get-app-info', () => ({
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron
  }))

  ipcMain.handle('get-install-info', () => {
    let gitCommit = "unknown"
    try {
      const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: __dirname, encoding: 'utf-8', timeout: 3000 })
      if (result.status === 0 && result.stdout) {
        gitCommit = result.stdout.trim()
      }
    } catch { console.warn("[IPC] Failed to read git commit hash") }
    return {
      first_launch: !existsSync(join(app.getPath('userData'), 'config.json')),
      build_date: new Date().toISOString().split('T')[0],
      git_commit: gitCommit,
    }
  })

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
      console.warn("[IPC] Failed to get resource data URL")
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

function validatePositiveInt(v: unknown, name: string): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid ${name}: must be a non-negative integer`)
  return n
}

function registerFileSystemHandlers(): void {
  ipcMain.handle('read-text-file', (_e, fp: string) => {
    assertPathAllowed(validatePath(fp))
    return readFileSync(fp, 'utf-8')
  })
  ipcMain.handle('write-text-file', (_e, fp: string, c: string) => {
    assertPathAllowed(validatePath(fp))
    validateString(c, 'content', 10 * 1024 * 1024)
    const d = dirname(fp); if (!existsSync(d)) mkdirSync(d, { recursive: true })
    writeFileSync(fp, c, 'utf-8')
  })
  ipcMain.handle('read-binary-file', (_e, fp: string) => {
    assertPathAllowed(validatePath(fp))
    return Buffer.from(readFileSync(fp)).toString('base64')
  })
  ipcMain.handle('write-binary-file', (_e, fp: string, b64: string) => {
    assertPathAllowed(validatePath(fp))
    validateString(b64, 'base64 data', 50 * 1024 * 1024)
    const d = dirname(fp); if (!existsSync(d)) mkdirSync(d, { recursive: true })
    writeFileSync(fp, Buffer.from(b64, 'base64'))
  })
  ipcMain.handle('file-exists', (_e, fp: string) => {
    try { assertPathAllowed(validatePath(fp)); return existsSync(fp) } catch { console.warn("[IPC] file-exists failed"); return false }
  })
  ipcMain.handle('create-directory', (_e, dp: string) => {
    assertPathAllowed(validatePath(dp))
    mkdirSync(dp, { recursive: true })
  })
  ipcMain.handle('delete-file', (_e, fp: string) => {
    assertPathAllowed(validatePath(fp))
    unlinkSync(fp)
  })
  ipcMain.handle('rename-file', (_e, op: string, np: string) => {
    assertPathAllowed(validatePath(op))
    assertPathAllowed(validatePath(np))
    renameSync(op, np)
  })
  ipcMain.handle('get-file-stats', (_e, fp: string) => {
    assertPathAllowed(validatePath(fp))
    const s = statSync(fp)
    return { isFile: s.isFile(), isDirectory: s.isDirectory(), isSymlink: s.isSymbolicLink(), size: s.size, created: s.birthtimeMs, modified: s.mtimeMs }
  })
  ipcMain.handle('read-directory', (_e, dp: string) => {
    assertPathAllowed(validatePath(dp))
    return readdirSync(dp, { withFileTypes: true }).map(e => ({
      name: e.name, path: join(dp, e.name), isDirectory: e.isDirectory(), isFile: e.isFile()
    }))
  })

  const watchers = new Map<string, ReturnType<typeof watch>>()
  ipcMain.handle('start-file-watcher', (_e, dirPath: string) => {
    assertPathAllowed(validatePath(dirPath))
    if (watchers.has(dirPath)) return
    watchers.set(dirPath, watch(dirPath, { recursive: true }, (eventType, filename) => {
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('file-changed', { eventType, filename, dir: dirPath }))
    }))
  })
  ipcMain.handle('stop-file-watcher', (_e, dirPath: string) => {
    assertPathAllowed(validatePath(dirPath))
    const w = watchers.get(dirPath); if (w) { w.close(); watchers.delete(dirPath) }
  })

  ipcMain.handle('list-directory', (_e, dirPath: string) => {
    assertPathAllowed(validatePath(dirPath))
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
    assertPathAllowed(validatePath(dirPath))
    const files: string[] = []
    function walk(dir: string) {
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const fp = join(dir, entry.name)
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') walk(fp)
          else if (entry.isFile()) files.push(fp)
        }
      } catch { console.warn("[IPC] Failed to read directory entry in workspace-list-files:", dir) }
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
      assertGitRepoPath(validatePath(repoPath, 'git repo path'))
      return git(['status', '--porcelain'], repoPath).split('\n').filter(Boolean).map(l => ({ status: l.substring(0, 2).trim(), file: l.substring(3) }))
    } catch { console.warn("[IPC] git-status failed"); return [] }
  })
  ipcMain.handle('git-log', (_e, repoPath: string, max = 50) => {
    try {
      assertGitRepoPath(validatePath(repoPath, 'git repo path'))
      const count = validatePositiveInt(max, 'max count')
      return git(['log', `--max-count=${count}`, '--pretty=format:%H|%an|%ae|%ad|%s', '--date=short'], repoPath).split('\n').filter(Boolean).map(l => {
        const [hash, author, email, date, ...msg] = l.split('|')
        return { hash, author, email, date, message: msg.join('|') }
      })
    } catch { console.warn("[IPC] git-log failed"); return [] }
  })
  ipcMain.handle('git-diff', (_e, repoPath: string, file?: string) => {
    try {
      assertGitRepoPath(validatePath(repoPath, 'git repo path'))
      if (file) validatePath(file, 'diff file')
      return git(['diff', ...(file ? ['--', file] : [])], repoPath)
    } catch { console.warn("[IPC] git-diff failed"); return '' }
  })
  ipcMain.handle('git-commit', (_e, repoPath: string, msg: string) => {
    try {
      assertGitRepoPath(validatePath(repoPath, 'git repo path'))
      validateString(msg, 'commit message', 10000)
      git(['add', '-A'], repoPath); git(['commit', '-m', msg], repoPath); return true
    } catch { console.warn("[IPC] git-commit failed"); return false }
  })
  ipcMain.handle('git-restore', (_e, repoPath: string, file: string) => {
    try {
      assertGitRepoPath(validatePath(repoPath, 'git repo path'))
      validatePath(file, 'file to restore')
      git(['restore', '--', file], repoPath); return true
    } catch { console.warn("[IPC] git-restore failed"); return false }
  })
  ipcMain.handle('git-init', (_e, repoPath: string) => {
    try {
      assertGitRepoPath(validatePath(repoPath, 'git repo path'))
      git(['init'], repoPath); return true
    } catch { console.warn("[IPC] git-init failed"); return false }
  })
  ipcMain.handle('git-push', (_e, repoPath: string) => {
    try {
      assertGitRepoPath(validatePath(repoPath, 'git repo path'))
      git(['push'], repoPath); return true
    } catch { console.warn("[IPC] git-push failed"); return false }
  })
  ipcMain.handle('git-pull', (_e, repoPath: string) => {
    try {
      assertGitRepoPath(validatePath(repoPath, 'git repo path'))
      git(['pull'], repoPath); return true
    } catch { console.warn("[IPC] git-pull failed"); return false }
  })
  ipcMain.handle('git-branch-list', (_e, repoPath: string) => {
    try {
      assertGitRepoPath(validatePath(repoPath, 'git repo path'))
      const branches = git(['branch', '--list', '--format=%(refname:short)||%(upstream:short)||%(upstream:track)'], repoPath).split('\n').filter(Boolean).map(l => {
        const [name, upstream, tracking] = l.split('||')
        return { name, upstream: upstream || null, tracking: tracking || null }
      })
      const current = git(['branch', '--show-current'], repoPath).trim()
      return branches.map(b => ({ ...b, current: b.name === current }))
    } catch { console.warn("[IPC] git-branch-list failed"); return [] }
  })
  ipcMain.handle('git-checkout', (_e, repoPath: string, branch: string) => {
    try {
      assertGitRepoPath(validatePath(repoPath, 'git repo path'))
      validateString(branch, 'branch name', 256)
      git(['checkout', branch], repoPath); return true
    } catch { console.warn("[IPC] git-checkout failed"); return false }
  })
  ipcMain.handle('git-add', (_e, repoPath: string, file: string) => {
    try {
      assertGitRepoPath(validatePath(repoPath, 'git repo path'))
      validatePath(file, 'file to add')
      git(['add', '--', file], repoPath); return true
    } catch { console.warn("[IPC] git-add failed"); return false }
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
  ipcMain.handle('clipboard-write-text', (_e, t: string) => {
    validateString(t, 'clipboard text', 500000)
    clipboard.writeText(t)
  })
  ipcMain.handle('clipboard-read-image', () => clipboard.readImage().toDataURL())
  ipcMain.handle('clipboard-write-image', (_e, d: string) => {
    validateString(d, 'image data url', 50 * 1024 * 1024)
    clipboard.writeImage(nativeImage.createFromDataURL(d))
  })
}

function registerShellHandlers(): void {
  ipcMain.handle('open-external', async (_e, url: string) => {
    validateString(url, 'url', 8192)
    if (url.startsWith('https://') || url.startsWith('http://')) {
      await shell.openExternal(url)
    }
  })
}

function registerNotificationHandlers(): void {
  ipcMain.handle('notification-show', async (_e, opts: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      validateString(opts?.title ?? '', 'notification title', 1000)
      validateString(opts?.body ?? '', 'notification body', 5000)
      new Notification({ title: opts.title, body: opts.body }).show()
      return true
    }
    return false
  })
  ipcMain.handle('notification-is-supported', () => Notification.isSupported())
}

let browserJsAlwaysAllowed = false

function registerBrowserHandlers(bm: BrowserManager): void {
  ipcMain.handle('browser-launch', async (_e, opts?) => {
    if (opts && typeof opts === 'object') {
      if (opts.url) validateString(opts.url, 'url', 8192)
    }
    return bm.launch(opts)
  })
  ipcMain.handle('browser-close', async (_e, id: string) => {
    validateString(id, 'session id', 128)
    return bm.closeSession(id)
  })
  ipcMain.handle('browser-navigate', async (_e, id: string, url: string) => {
    validateString(id, 'session id', 128)
    validateString(url, 'url', 8192)
    return bm.navigate(id, url)
  })
  ipcMain.handle('browser-new-tab', async (_e, id: string, url?: string) => {
    validateString(id, 'session id', 128)
    if (url) validateString(url, 'url', 8192)
    return bm.newTab(id, url)
  })
  ipcMain.handle('browser-close-tab', async (_e, id: string, tabId: string) => {
    validateString(id, 'session id', 128)
    validateString(tabId, 'tab id', 128)
    return bm.closeTab(id, tabId)
  })
  ipcMain.handle('browser-list-tabs', async (_e, id: string) => {
    validateString(id, 'session id', 128)
    return bm.listTabs(id)
  })
  ipcMain.handle('browser-click', async (_e, id: string, sel: string) => {
    validateString(id, 'session id', 128)
    validateString(sel, 'selector', 4096)
    return bm.click(id, sel)
  })
  ipcMain.handle('browser-type', async (_e, id: string, sel: string, text: string) => {
    validateString(id, 'session id', 128)
    validateString(sel, 'selector', 4096)
    validateString(text, 'text', 10000)
    return bm.type(id, sel, text)
  })
  ipcMain.handle('browser-screenshot', async (_e, id: string) => {
    validateString(id, 'session id', 128)
    return bm.screenshot(id)
  })
  ipcMain.handle('browser-get-text', async (_e, id: string) => {
    validateString(id, 'session id', 128)
    return bm.getText(id)
  })
  ipcMain.handle('browser-get-url', async (_e, id: string) => {
    validateString(id, 'session id', 128)
    return bm.getUrl(id)
  })
  ipcMain.handle('browser-get-title', async (_e, id: string) => {
    validateString(id, 'session id', 128)
    return bm.getTitle(id)
  })
  ipcMain.handle('browser-get-content', async (_e, id: string) => {
    validateString(id, 'session id', 128)
    return bm.getContent(id)
  })
  ipcMain.handle('browser-execute-js', async (event, id: string, js: string) => {
    validateString(id, 'session id', 128)
    validateString(js, 'javascript', 50000)
    if (browserJsAlwaysAllowed) return bm.executeJs(id, js)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const { response, checkboxChecked } = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Approve', 'Deny'],
        defaultId: 1,
        cancelId: 1,
        title: 'Browser JS Execution',
        message: 'Allow executing JavaScript in the browser?',
        detail: `Session: ${id}\n\n${js.slice(0, 500)}${js.length > 500 ? '\n...' : ''}`,
        checkboxLabel: 'Always allow for this session',
      })
      if (checkboxChecked) browserJsAlwaysAllowed = true
      if (response !== 0) return null
    }
    return bm.executeJs(id, js)
  })
  ipcMain.handle('browser-reload', async (_e, id: string) => {
    validateString(id, 'session id', 128)
    return bm.reload(id)
  })
  ipcMain.handle('browser-double-click', async (_e, id: string, sel: string) => {
    validateString(id, 'session id', 128)
    validateString(sel, 'selector', 4096)
    return bm.doubleClick(id, sel)
  })
  ipcMain.handle('browser-hover', async (_e, id: string, sel: string) => {
    validateString(id, 'session id', 128)
    validateString(sel, 'selector', 4096)
    return bm.hover(id, sel)
  })
  ipcMain.handle('browser-press-key', async (_e, id: string, key: string) => {
    validateString(id, 'session id', 128)
    validateString(key, 'key', 100)
    return bm.pressKey(id, key)
  })
  ipcMain.handle('browser-wait-element', async (_e, id: string, sel: string, timeout?: number) => {
    validateString(id, 'session id', 128)
    validateString(sel, 'selector', 4096)
    if (timeout !== undefined) validatePositiveInt(timeout, 'timeout')
    return bm.waitForElement(id, sel, timeout)
  })
  ipcMain.handle('browser-get-console-logs', async (_e, id: string) => {
    validateString(id, 'session id', 128)
    return bm.getConsoleLogs(id)
  })
  ipcMain.handle('browser-save-state', async (_e, path: string) => {
    const validated = validatePath(path)
    try { assertPathAllowed(validated) } catch { console.warn("[IPC] browser-save-state path not allowed"); return false }
    return bm.saveState(validated)
  })
  ipcMain.handle('browser-load-state', async (_e, path: string) => {
    const validated = validatePath(path)
    try { assertPathAllowed(validated) } catch { console.warn("[IPC] browser-load-state path not allowed"); return null }
    return bm.loadState(validated)
  })
  ipcMain.handle('browser-detect', async () => bm.detectBrowsers())
  ipcMain.handle('browser-show-session', async (_e, id: string) => {
    validateString(id, 'session id', 128)
    return bm.showSession(id)
  })
}

function registerTerminalHandlers(tm: TerminalManager): void {
  ipcMain.handle('terminal-create', async (_e, opts?: { shellPath?: string; cwd?: string }) => {
    if (opts && typeof opts === 'object') {
      if (opts.shellPath) validateString(opts.shellPath, 'shell path', 1024)
      if (opts.cwd) validatePath(opts.cwd, 'working directory')
    }
    return tm.create(opts)
  })
  ipcMain.handle('terminal-write', (_e, id: string, data: string) => {
    validateString(id, 'terminal id', 128)
    validateString(data, 'terminal data', 65536)
    return tm.write(id, data)
  })
  ipcMain.handle('terminal-resize', (_e, id: string, cols: number, rows: number) => {
    validateString(id, 'terminal id', 128)
    validatePositiveInt(cols, 'columns')
    validatePositiveInt(rows, 'rows')
    return tm.resize(id, cols, rows)
  })
  ipcMain.handle('terminal-kill', (_e, id: string) => {
    validateString(id, 'terminal id', 128)
    return tm.kill(id)
  })
  ipcMain.handle('terminal-list', () => tm.list())
}

// ── Extension Handlers ──

function registerExtensionHandlers(): void {
  ipcMain.handle('browser-extension-list', async () => {
    try {
      const exts = session.defaultSession.getAllExtensions()
      return exts.map((e: any) => ({
        id: e.id,
        name: e.name,
        version: e.version,
        path: e.path,
        manifestVersion: e.manifestVersion,
      }))
    } catch {
      console.warn("[IPC] browser-extension-list failed")
      return []
    }
  })

  ipcMain.handle('browser-extension-load', async (_e, extPath: string) => {
    try {
      const validated = validatePath(extPath, 'extension path')
      const ext = await session.defaultSession.loadExtension(validated)
      return { id: ext.id, name: ext.manifest.name, version: ext.manifest.version, path: validated }
    } catch (err: any) {
      console.warn("[IPC] browser-extension-load failed:", err.message)
      return { error: err.message }
    }
  })

  ipcMain.handle('browser-extension-unload', async (_e, extId: string) => {
    try {
      validateString(extId, 'extension id', 256)
      session.defaultSession.removeExtension(extId)
      return true
    } catch {
      console.warn("[IPC] browser-extension-unload failed")
      return false
    }
  })
}

// ── Plugin Browser Handlers ──

const pluginBrowserProviders = new Map<string, {
  navigate: (url: string) => Promise<any>
  click: (sel: string) => Promise<any>
  type: (sel: string, text: string) => Promise<any>
  screenshot: () => Promise<any>
  executeJs: (code: string) => Promise<any>
  getDom: () => Promise<any>
  getText: () => Promise<any>
  getUrl: () => Promise<any>
  getTitle: () => Promise<any>
}>()

export function registerPluginBrowserProvider(
  name: string,
  provider: {
    navigate: (url: string) => Promise<any>
    click: (sel: string) => Promise<any>
    type: (sel: string, text: string) => Promise<any>
    screenshot: () => Promise<any>
    executeJs: (code: string) => Promise<any>
    getDom: () => Promise<any>
    getText: () => Promise<any>
    getUrl: () => Promise<any>
    getTitle: () => Promise<any>
  }
): void {
  pluginBrowserProviders.set(name, provider)
}

export function unregisterPluginBrowserProvider(name: string): void {
  pluginBrowserProviders.delete(name)
}

function getProvider(name: string) {
  const p = pluginBrowserProviders.get(name)
  if (!p) throw new Error(`Plugin browser provider "${name}" not found`)
  return p
}

function registerPluginBrowserHandlers(): void {
  ipcMain.handle('plugin-browser-navigate', async (_e, provider: string, url: string) => {
    try {
      validateString(provider, 'provider name', 256)
      validateString(url, 'url', 8192)
      return await getProvider(provider).navigate(url)
    } catch (err: any) { console.warn("[IPC] plugin-browser-navigate failed:", err.message); return { error: err.message } }
  })
  ipcMain.handle('plugin-browser-click', async (_e, provider: string, sel: string) => {
    try {
      validateString(provider, 'provider name', 256)
      validateString(sel, 'selector', 4096)
      return await getProvider(provider).click(sel)
    } catch (err: any) { console.warn("[IPC] plugin-browser-click failed:", err.message); return { error: err.message } }
  })
  ipcMain.handle('plugin-browser-type', async (_e, provider: string, sel: string, text: string) => {
    try {
      validateString(provider, 'provider name', 256)
      validateString(sel, 'selector', 4096)
      validateString(text, 'text', 10000)
      return await getProvider(provider).type(sel, text)
    } catch (err: any) { console.warn("[IPC] plugin-browser-type failed:", err.message); return { error: err.message } }
  })
  ipcMain.handle('plugin-browser-screenshot', async (_e, provider: string) => {
    try {
      validateString(provider, 'provider name', 256)
      return await getProvider(provider).screenshot()
    } catch { console.warn("[IPC] plugin-browser-screenshot failed"); return null }
  })
  ipcMain.handle('plugin-browser-execute-js', async (_e, provider: string, code: string) => {
    try {
      validateString(provider, 'provider name', 256)
      validateString(code, 'javascript', 50000)
      return await getProvider(provider).executeJs(code)
    } catch (err: any) { console.warn("[IPC] plugin-browser-execute-js failed:", err.message); return { error: err.message } }
  })
  ipcMain.handle('plugin-browser-get-dom', async (_e, provider: string) => {
    try {
      validateString(provider, 'provider name', 256)
      return await getProvider(provider).getDom()
    } catch { console.warn("[IPC] plugin-browser-get-dom failed"); return null }
  })
  ipcMain.handle('plugin-browser-get-text', async (_e, provider: string) => {
    try {
      validateString(provider, 'provider name', 256)
      return await getProvider(provider).getText()
    } catch { console.warn("[IPC] plugin-browser-get-text failed"); return null }
  })
  ipcMain.handle('plugin-browser-get-url', async (_e, provider: string) => {
    try {
      validateString(provider, 'provider name', 256)
      return await getProvider(provider).getUrl()
    } catch { console.warn("[IPC] plugin-browser-get-url failed"); return null }
  })
  ipcMain.handle('plugin-browser-get-title', async (_e, provider: string) => {
    try {
      validateString(provider, 'provider name', 256)
      return await getProvider(provider).getTitle()
    } catch { console.warn("[IPC] plugin-browser-get-title failed"); return null }
  })
}

import { registerUninstallIpcHandlers as registerUninstallHandlers } from './uninstall'
import { registerWorkspaceIpcHandlers } from './workspace'
import { registerReplayHandlers } from './replay'
import { registerVerificationHandlers } from '../verification/index'
import { registerImportSettingsHandlers } from './import-settings'
import { nativeImage } from 'electron'
