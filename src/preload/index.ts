import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  // App
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getInstallInfo: () => ipcRenderer.invoke('get-install-info'),
  exit: () => ipcRenderer.invoke('app-exit'),
  restart: () => ipcRenderer.invoke('app-restart'),
  getAppPaths: () => ipcRenderer.invoke('get-app-paths'),
  saveLayout: (l: string) => ipcRenderer.invoke('save-layout', l),
  loadLayout: () => ipcRenderer.invoke('load-layout'),

  // File System
  readTextFile: (fp: string) => ipcRenderer.invoke('read-text-file', fp),
  writeTextFile: (fp: string, c: string) => ipcRenderer.invoke('write-text-file', fp, c),
  readBinaryFile: (fp: string) => ipcRenderer.invoke('read-binary-file', fp),
  writeBinaryFile: (fp: string, b64: string) => ipcRenderer.invoke('write-binary-file', fp, b64),
  fileExists: (fp: string) => ipcRenderer.invoke('file-exists', fp),
  createDirectory: (dp: string) => ipcRenderer.invoke('create-directory', dp),
  deleteFile: (fp: string) => ipcRenderer.invoke('delete-file', fp),
  renameFile: (op: string, np: string) => ipcRenderer.invoke('rename-file', op, np),
  getFileStats: (fp: string) => ipcRenderer.invoke('get-file-stats', fp),
  readDirectory: (dp: string) => ipcRenderer.invoke('read-directory', dp),
  listDirectory: (dp: string) => ipcRenderer.invoke('list-directory', dp),
  startFileWatcher: (dp: string) => ipcRenderer.invoke('start-file-watcher', dp),
  stopFileWatcher: (dp: string) => ipcRenderer.invoke('stop-file-watcher', dp),

  // Workspace
  workspaceListFiles: (dp: string) => ipcRenderer.invoke('workspace-list-files', dp),

  // Git
  gitStatus: (rp: string) => ipcRenderer.invoke('git-status', rp),
  gitLog: (rp: string, max?: number) => ipcRenderer.invoke('git-log', rp, max),
  gitDiff: (rp: string, f?: string) => ipcRenderer.invoke('git-diff', rp, f),
  gitCommit: (rp: string, msg: string) => ipcRenderer.invoke('git-commit', rp, msg),
  gitRestore: (rp: string, f: string) => ipcRenderer.invoke('git-restore', rp, f),
  gitInit: (rp: string) => ipcRenderer.invoke('git-init', rp),
  gitPush: (rp: string) => ipcRenderer.invoke('git-push', rp),
  gitPull: (rp: string) => ipcRenderer.invoke('git-pull', rp),
  gitBranchList: (rp: string) => ipcRenderer.invoke('git-branch-list', rp),
  gitCheckout: (rp: string, b: string) => ipcRenderer.invoke('git-checkout', rp, b),
  gitAdd: (rp: string, f: string) => ipcRenderer.invoke('git-add', rp, f),

  // Dialog
  dialogOpen: (opts: any) => ipcRenderer.invoke('dialog-open', opts),
  dialogSave: (opts: any) => ipcRenderer.invoke('dialog-save', opts),
  dialogMessage: (opts: any) => ipcRenderer.invoke('dialog-message', opts),

  // Clipboard
  clipboardReadText: () => ipcRenderer.invoke('clipboard-read-text'),
  clipboardWriteText: (t: string) => ipcRenderer.invoke('clipboard-write-text', t),

  // Notification
  notificationShow: (opts: { title: string; body: string }) => ipcRenderer.invoke('notification-show', opts),
  notificationIsSupported: () => ipcRenderer.invoke('notification-is-supported'),

  // Browser
  browserLaunch: (opts?: any) => ipcRenderer.invoke('browser-launch', opts),
  browserClose: (id: string) => ipcRenderer.invoke('browser-close', id),
  browserNavigate: (id: string, url: string) => ipcRenderer.invoke('browser-navigate', id, url),
  browserNewTab: (id: string, url?: string) => ipcRenderer.invoke('browser-new-tab', id, url),
  browserCloseTab: (id: string, tabId: string) => ipcRenderer.invoke('browser-close-tab', id, tabId),
  browserListTabs: (id: string) => ipcRenderer.invoke('browser-list-tabs', id),
  browserReload: (id: string) => ipcRenderer.invoke('browser-reload', id),
  browserDoubleClick: (id: string, sel: string) => ipcRenderer.invoke('browser-double-click', id, sel),
  browserHover: (id: string, sel: string) => ipcRenderer.invoke('browser-hover', id, sel),
  browserPressKey: (id: string, key: string) => ipcRenderer.invoke('browser-press-key', id, key),
  browserWaitElement: (id: string, sel: string, timeout?: number) => ipcRenderer.invoke('browser-wait-element', id, sel, timeout),
  browserGetConsoleLogs: (id: string) => ipcRenderer.invoke('browser-get-console-logs', id),
  browserSaveState: (path: string) => ipcRenderer.invoke('browser-save-state', path),
  browserLoadState: (path: string) => ipcRenderer.invoke('browser-load-state', path),
  browserClick: (id: string, sel: string) => ipcRenderer.invoke('browser-click', id, sel),
  browserType: (id: string, sel: string, text: string) => ipcRenderer.invoke('browser-type', id, sel, text),
  browserScreenshot: (id: string) => ipcRenderer.invoke('browser-screenshot', id),
  browserGetText: (id: string) => ipcRenderer.invoke('browser-get-text', id),
  browserGetUrl: (id: string) => ipcRenderer.invoke('browser-get-url', id),
  browserGetTitle: (id: string) => ipcRenderer.invoke('browser-get-title', id),
  browserGetContent: (id: string) => ipcRenderer.invoke('browser-get-content', id),
  browserExecuteJs: (id: string, js: string) => ipcRenderer.invoke('browser-execute-js', id, js),
  browserDetect: () => ipcRenderer.invoke('browser-detect'),

  // Terminal
  terminalCreate: (opts?: any) => ipcRenderer.invoke('terminal-create', opts),
  terminalWrite: (id: string, data: string) => ipcRenderer.invoke('terminal-write', id, data),
  terminalResize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('terminal-resize', id, cols, rows),
  terminalKill: (id: string) => ipcRenderer.invoke('terminal-kill', id),
  terminalList: () => ipcRenderer.invoke('terminal-list'),

  // Command execution
  runCommand: (opts: { workingDir: string; command: string; args: string[] }) => ipcRenderer.invoke('run-command', opts),
  runCommandStream: (opts: { command: string; cwd: string | null; streamId: string; args?: string[]; requiresInteraction?: boolean }) => ipcRenderer.invoke('run-command-stream', opts),
  killCommand: (streamId: string) => ipcRenderer.invoke('kill-command', streamId),
  stdinInput: (opts: { streamId: string; input: string }) => ipcRenderer.invoke('stdin-input', opts),
  stdinEnd: (streamId: string) => ipcRenderer.invoke('stdin-end', streamId),

  // Uninstall
  uninstallDetectData: () => ipcRenderer.invoke('uninstall:detect-data'),
  uninstallPerform: (level: string) => ipcRenderer.invoke('uninstall:perform', level),
  uninstallOpenSystem: () => ipcRenderer.invoke('uninstall:open-system'),
  uninstallSelf: () => ipcRenderer.invoke('uninstall:self'),
  uninstallSetAutoLaunch: (enable: boolean) => ipcRenderer.invoke('uninstall:set-auto-launch', enable),

  // Auto-update
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // Resources
  getResourceDataUrl: (resourceName: string) => ipcRenderer.invoke('get-resource-data-url', resourceName),

  // HTTP Proxy (for provider validation in main process to bypass CSP)
  proxyHttpRequest: (request: { method: string; url: string; headers?: Record<string, string>; body?: string; timeout?: number }) =>
    ipcRenderer.invoke('proxy-http-request', request),

  // Workspace
  workspaceOpenFolder: () => ipcRenderer.invoke('workspace:open-folder'),
  workspaceOpenWorkspace: () => ipcRenderer.invoke('workspace:open-workspace'),
  workspaceGetTree: (dirPath: string, maxDepth?: number) => ipcRenderer.invoke('workspace:get-tree', dirPath, maxDepth),
  workspaceReadFile: (filePath: string) => ipcRenderer.invoke('workspace:read-file', filePath),
  workspaceWriteFile: (filePath: string, content: string) => ipcRenderer.invoke('workspace:write-file', filePath, content),
  workspaceCreateFile: (dirPath: string, name: string) => ipcRenderer.invoke('workspace:create-file', dirPath, name),
  workspaceCreateDirectory: (dirPath: string, name: string) => ipcRenderer.invoke('workspace:create-directory', dirPath, name),
  workspaceRename: (oldPath: string, newPath: string) => ipcRenderer.invoke('workspace:rename', oldPath, newPath),
  workspaceDelete: (targetPath: string) => ipcRenderer.invoke('workspace:delete', targetPath),
  workspaceStartWatcher: (dirPath: string) => ipcRenderer.invoke('workspace:start-watcher', dirPath),
  workspaceStopWatcher: (dirPath: string) => ipcRenderer.invoke('workspace:stop-watcher', dirPath),
  workspaceGetRecent: () => ipcRenderer.invoke('workspace:get-recent'),
  workspaceAddRecent: (folderPath: string) => ipcRenderer.invoke('workspace:add-recent', folderPath),
  workspaceRemoveRecent: (folderPath: string) => ipcRenderer.invoke('workspace:remove-recent', folderPath),
  workspacePinRecent: (folderPath: string, pinned: boolean) => ipcRenderer.invoke('workspace:pin-recent', folderPath, pinned),
  workspaceSearchFiles: (rootDir: string, query: string, maxResults?: number) => ipcRenderer.invoke('workspace:search-files', rootDir, query, maxResults),

  // Events from main process
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validPrefixes = [
      'open-folder', 'open-workspace', 'file-changed', 'toggle-sidebar', 'toggle-terminal',
      'command-palette', 'global-search', 'new-chat', 'new-terminal', 'kill-terminal',
      'navigate', 'open-settings', 'open-git-panel', 'open-dashboard', 'check-updates',
      'update-status', 'update-progress', 'terminal-data', 'terminal-exit',
      'cancel-execution', 'git-diff', 'file-save', 'file-save-all',
    ]
    const isPrefixMatch = validPrefixes.includes(channel) || channel.startsWith('terminal-output:') || channel.startsWith('terminal-complete:')
    if (isPrefixMatch) {
      const subscription = (_event: any, ...args: any[]) => callback(...args)
      ipcRenderer.on(channel, subscription)
      return () => { ipcRenderer.removeListener(channel, subscription) }
    }
  },

  // File path utility (for drag-and-drop)
  getPathForFile: (file: File) => {
    try { return webUtils.getPathForFile(file) } catch { return null }
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
