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

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

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
  browserShowSession: (id: string) => ipcRenderer.invoke('browser-show-session', id),

  // Live Embedded Viewport (BrowserView/WebContentsView)
  viewportCreate: (bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke('viewport-create', bounds),
  viewportResize: (bounds: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke('viewport-resize', bounds),
  viewportDestroy: () => ipcRenderer.invoke('viewport-destroy'),
  viewportNavigate: (url: string) => ipcRenderer.invoke('viewport-navigate', url),
  viewportReload: () => ipcRenderer.invoke('viewport-reload'),
  viewportGoBack: () => ipcRenderer.invoke('viewport-go-back'),
  viewportGoForward: () => ipcRenderer.invoke('viewport-go-forward'),
  viewportClick: (selector: string) => ipcRenderer.invoke('viewport-click', selector),
  viewportType: (selector: string, text: string) => ipcRenderer.invoke('viewport-type', selector, text),
  viewportPressKey: (key: string) => ipcRenderer.invoke('viewport-press-key', key),
  viewportScreenshot: () => ipcRenderer.invoke('viewport-screenshot'),
  viewportExecuteJs: (js: string) => ipcRenderer.invoke('viewport-execute-js', js),
  viewportGetConsoleLogs: () => ipcRenderer.invoke('viewport-get-console-logs'),
  viewportInjectAnnotations: () => ipcRenderer.invoke('viewport-inject-annotations'),
  viewportGetAnnotations: () => ipcRenderer.invoke('viewport-get-annotations'),
  viewportGetState: () => ipcRenderer.invoke('viewport-get-state'),
  viewportGetNetworkLogs: () => ipcRenderer.invoke('viewport-get-network-logs'),

  // Browser Extensions
  extensionList: () => ipcRenderer.invoke('browser-extension-list'),
  extensionLoad: (extPath: string) => ipcRenderer.invoke('browser-extension-load', extPath),
  extensionUnload: (extId: string) => ipcRenderer.invoke('browser-extension-unload', extId),

  // Plugin Browser Provider
  pluginBrowserNavigate: (provider: string, url: string) => ipcRenderer.invoke('plugin-browser-navigate', provider, url),
  pluginBrowserClick: (provider: string, sel: string) => ipcRenderer.invoke('plugin-browser-click', provider, sel),
  pluginBrowserType: (provider: string, sel: string, text: string) => ipcRenderer.invoke('plugin-browser-type', provider, sel, text),
  pluginBrowserScreenshot: (provider: string) => ipcRenderer.invoke('plugin-browser-screenshot', provider),
  pluginBrowserExecuteJs: (provider: string, code: string) => ipcRenderer.invoke('plugin-browser-execute-js', provider, code),
  pluginBrowserGetDom: (provider: string) => ipcRenderer.invoke('plugin-browser-get-dom', provider),
  pluginBrowserGetText: (provider: string) => ipcRenderer.invoke('plugin-browser-get-text', provider),
  pluginBrowserGetUrl: (provider: string) => ipcRenderer.invoke('plugin-browser-get-url', provider),
  pluginBrowserGetTitle: (provider: string) => ipcRenderer.invoke('plugin-browser-get-title', provider),

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

  // Secure storage
  safeStorageEncrypt: (plaintext: string) => ipcRenderer.invoke('safe-storage-encrypt', plaintext),
  safeStorageDecrypt: (ciphertext: string) => ipcRenderer.invoke('safe-storage-decrypt', ciphertext),

  // HTTP Proxy (for provider validation in main process to bypass CSP)
  proxyHttpRequest: (request: { method: string; url: string; headers?: Record<string, string>; body?: string; timeout?: number }) =>
    ipcRenderer.invoke('proxy-http-request', request),

  // Streaming HTTP Proxy (for AI provider streaming responses)
  proxyHttpStreamStart: (request: { streamId: string; method: string; url: string; headers?: Record<string, string>; body?: string }) =>
    ipcRenderer.invoke('proxy-http-stream-start', request),
  proxyHttpStreamAbort: (streamId: string) =>
    ipcRenderer.invoke('proxy-http-stream-abort', streamId),

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
  workspaceListDirectory: (dirPath: string) => ipcRenderer.invoke('workspace:list-dir', dirPath),

  // Events from main process
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validPrefixes = [
      'open-folder', 'open-workspace', 'file-changed', 'toggle-sidebar', 'toggle-terminal',
      'command-palette', 'global-search', 'new-chat', 'new-terminal', 'kill-terminal',
      'navigate', 'open-settings', 'open-git-panel', 'open-dashboard', 'check-updates',
      'update-status', 'update-progress', 'terminal-data', 'terminal-exit',
      'cancel-execution', 'git-diff', 'file-save', 'file-save-all',
      'extension-message', 'extension-installed', 'extension-uninstalled',
    ]
    const isPrefixMatch = validPrefixes.includes(channel)
      || channel.startsWith('terminal-output:') || channel.startsWith('terminal-complete:')
      || channel.startsWith('stream-chunk:') || channel.startsWith('stream-end:') || channel.startsWith('stream-error:')
      || channel.startsWith('browser-extension:')
      || channel.startsWith('viewport-state-')
      || channel === 'viewport-network-event'
    if (isPrefixMatch) {
      const subscription = (_event: any, ...args: any[]) => callback(...args)
      ipcRenderer.on(channel, subscription)
      return () => { ipcRenderer.removeListener(channel, subscription) }
    }
  },

  // Replay persistence
  replayInit: () => ipcRenderer.invoke('replay-init'),
  replayAppendEvent: (sessionId: string, line: string) => ipcRenderer.invoke('replay-append-event', sessionId, line),
  replayAppendBatch: (sessionId: string, lines: string[]) => ipcRenderer.invoke('replay-append-batch', sessionId, lines),
  replayReadSession: (sessionId: string) => ipcRenderer.invoke('replay-read-session', sessionId),
  replaySessionExists: (sessionId: string) => ipcRenderer.invoke('replay-session-exists', sessionId),
  replayDeleteSession: (sessionId: string) => ipcRenderer.invoke('replay-delete-session', sessionId),
  replayListSessions: () => ipcRenderer.invoke('replay-list-sessions'),
  replayUpdateSessionMeta: (sessionId: string, meta: Record<string, unknown>) => ipcRenderer.invoke('replay-update-session-meta', sessionId, meta),
  replayGetSessionMeta: (sessionId: string) => ipcRenderer.invoke('replay-get-session-meta', sessionId),
  replayClearAll: () => ipcRenderer.invoke('replay-clear-all'),
  replayGetStats: () => ipcRenderer.invoke('replay-get-stats'),
  replayApplyRetention: (config: { maxAgeMs: number; maxSessions: number }) => ipcRenderer.invoke('replay-apply-retention', config),

  // Verification (runs in main process for Node API access)
  verificationRunCommand: (command: string, timeout?: number) => ipcRenderer.invoke('verification:run-command', command, timeout),
  verificationRunBenchmarks: () => ipcRenderer.invoke('verification:run-benchmarks'),
  verificationSecurityScan: (changedFiles: string[]) => ipcRenderer.invoke('verification:security-scan', changedFiles),
  verificationRegressionScan: () => ipcRenderer.invoke('verification:regression-scan'),
  verificationVerifyChanges: (changedFiles: string[]) => ipcRenderer.invoke('verification:verify-changes', changedFiles),
  verificationRunStage: (stage: string, command: string) => ipcRenderer.invoke('verification:run-stage', stage, command),
  verificationAutoFix: () => ipcRenderer.invoke('verification:auto-fix'),

  // File path utility (for drag-and-drop)
  getPathForFile: (file: File) => {
    try { return webUtils.getPathForFile(file) } catch { return null }
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
