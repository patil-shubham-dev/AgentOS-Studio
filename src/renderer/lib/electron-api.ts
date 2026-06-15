declare global {
  interface Window {
    electronAPI: {
      getAppInfo: () => Promise<any>
      getInstallInfo: () => Promise<{ first_launch: boolean }>
      exit: () => Promise<void>
      restart: () => Promise<void>
      getAppPaths: () => Promise<any>
      saveLayout: (l: string) => Promise<void>
      loadLayout: () => Promise<string | null>
      readTextFile: (fp: string) => Promise<string>
      writeTextFile: (fp: string, c: string) => Promise<void>
      readBinaryFile: (fp: string) => Promise<string>
      writeBinaryFile: (fp: string, b64: string) => Promise<void>
      fileExists: (fp: string) => Promise<boolean>
      createDirectory: (dp: string) => Promise<void>
      deleteFile: (fp: string) => Promise<void>
      renameFile: (op: string, np: string) => Promise<void>
      getFileStats: (fp: string) => Promise<any>
      readDirectory: (dp: string) => Promise<any[]>
      listDirectory: (dp: string) => Promise<any[]>
      startFileWatcher: (dp: string) => Promise<void>
      stopFileWatcher: (dp: string) => Promise<void>
      workspaceListFiles: (dp: string) => Promise<string[]>
      gitStatus: (rp: string) => Promise<any[]>
      gitLog: (rp: string, max?: number) => Promise<any[]>
      gitDiff: (rp: string, f?: string) => Promise<string>
      gitCommit: (rp: string, msg: string) => Promise<boolean>
      gitRestore: (rp: string, f: string) => Promise<boolean>
      gitInit: (rp: string) => Promise<boolean>
      gitPush: (rp: string) => Promise<boolean>
      gitPull: (rp: string) => Promise<boolean>
      gitBranchList: (rp: string) => Promise<any[]>
      gitCheckout: (rp: string, b: string) => Promise<boolean>
      gitAdd: (rp: string, f: string) => Promise<boolean>
      dialogOpen: (opts: any) => Promise<any>
      dialogSave: (opts: any) => Promise<any>
      dialogMessage: (opts: any) => Promise<any>
      clipboardReadText: () => Promise<string>
      clipboardWriteText: (t: string) => Promise<void>
      notificationShow: (opts: { title: string; body: string }) => Promise<boolean>
      notificationIsSupported: () => Promise<boolean>
      openExternal: (url: string) => Promise<void>
      browserLaunch: (opts?: any) => Promise<any>
      browserClose: (id: string) => Promise<any>
      browserNavigate: (id: string, url: string) => Promise<any>
      browserNewTab: (id: string, url?: string) => Promise<any>
      browserCloseTab: (id: string, tabId: string) => Promise<any>
      browserListTabs: (id: string) => Promise<any>
      browserReload: (id: string) => Promise<any>
      browserDoubleClick: (id: string, sel: string) => Promise<any>
      browserHover: (id: string, sel: string) => Promise<any>
      browserPressKey: (id: string, key: string) => Promise<any>
      browserWaitElement: (id: string, sel: string, timeout?: number) => Promise<any>
      browserGetConsoleLogs: (id: string) => Promise<any>
      browserSaveState: (path: string) => Promise<any>
      browserLoadState: (path: string) => Promise<any>
      browserClick: (id: string, sel: string) => Promise<any>
      browserType: (id: string, sel: string, text: string) => Promise<any>
      browserScreenshot: (id: string) => Promise<any>
      browserGetText: (id: string) => Promise<any>
      browserGetUrl: (id: string) => Promise<any>
      browserGetTitle: (id: string) => Promise<any>
      browserGetContent: (id: string) => Promise<any>
      browserExecuteJs: (id: string, js: string) => Promise<any>
      browserDetect: () => Promise<any>
      extensionList: () => Promise<any[]>
      extensionLoad: (extPath: string) => Promise<any>
      extensionUnload: (extId: string) => Promise<void>
      pluginBrowserNavigate: (provider: string, url: string) => Promise<any>
      pluginBrowserClick: (provider: string, sel: string) => Promise<any>
      pluginBrowserType: (provider: string, sel: string, text: string) => Promise<any>
      pluginBrowserScreenshot: (provider: string) => Promise<any>
      pluginBrowserExecuteJs: (provider: string, code: string) => Promise<any>
      pluginBrowserGetDom: (provider: string) => Promise<any>
      pluginBrowserGetText: (provider: string) => Promise<any>
      pluginBrowserGetUrl: (provider: string) => Promise<any>
      pluginBrowserGetTitle: (provider: string) => Promise<any>
      viewportCreate: (bounds: { x: number; y: number; width: number; height: number }) => Promise<any>
      viewportResize: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>
      viewportDestroy: () => Promise<void>
      viewportNavigate: (url: string) => Promise<boolean>
      viewportReload: () => Promise<boolean>
      viewportGoBack: () => Promise<boolean>
      viewportGoForward: () => Promise<boolean>
      viewportClick: (selector: string) => Promise<{ success: boolean; error?: string }>
      viewportType: (selector: string, text: string) => Promise<{ success: boolean; error?: string }>
      viewportPressKey: (key: string) => Promise<{ success: boolean; error?: string }>
      viewportScreenshot: () => Promise<string | null>
      viewportExecuteJs: (js: string) => Promise<{ success: boolean; result?: any; error?: string }>
      viewportGetConsoleLogs: () => Promise<string[]>
      viewportInjectAnnotations: () => Promise<boolean>
      viewportGetAnnotations: () => Promise<any[]>
      viewportGetState: () => Promise<{ url: string; title: string; isLoading: boolean; canGoBack: boolean; canGoForward: boolean }>
      terminalCreate: (opts?: any) => Promise<string>
      terminalWrite: (id: string, data: string) => Promise<void>
      terminalResize: (id: string, cols: number, rows: number) => Promise<void>
      terminalKill: (id: string) => Promise<void>
      terminalList: () => Promise<any[]>
      runCommand: (opts: { workingDir: string; command: string; args: string[] }) => Promise<string>
      runCommandStream: (opts: { command: string; cwd: string | null; streamId: string }) => Promise<number>
      killCommand: (streamId: string) => Promise<void>
      on: (channel: string, cb: (...args: any[]) => void) => (() => void) | undefined
      getPathForFile: (file: File) => string | null
      replayInit: () => Promise<{ sessionCount: number; orphanedCount: number }>
      replayAppendEvent: (sessionId: string, line: string) => Promise<void>
      replayAppendBatch: (sessionId: string, lines: string[]) => Promise<void>
      replayReadSession: (sessionId: string) => Promise<any[] | null>
      replaySessionExists: (sessionId: string) => Promise<boolean>
      replayDeleteSession: (sessionId: string) => Promise<void>
      replayListSessions: () => Promise<Record<string, unknown>>
      replayUpdateSessionMeta: (sessionId: string, meta: Record<string, unknown>) => Promise<void>
      replayGetSessionMeta: (sessionId: string) => Promise<Record<string, unknown> | null>
      replayClearAll: () => Promise<void>
      replayGetStats: () => Promise<{ totalSessions: number; totalEvents: number; storagePath: string }>
      replayApplyRetention: (config: { maxAgeMs: number; maxSessions: number }) => Promise<{ deletedCount: number; remainingCount: number }>
    }
  }
}

export {}

export function invoke(cmd: string, args?: Record<string, unknown>): Promise<any> {
  if (typeof window === 'undefined' || !window.electronAPI) {
    throw new Error('electronAPI not available - not running in Electron')
  }
  const eapi = window.electronAPI

  switch (cmd) {
    case 'get_install_info': return eapi.getInstallInfo()
    case 'get_app_info': return eapi.getAppInfo()
    case 'app_exit': return eapi.exit()
    case 'app_restart': return eapi.restart()
    case 'get_app_paths': return eapi.getAppPaths()
    case 'save_layout': return eapi.saveLayout(args?.layout as string)
    case 'load_layout': return eapi.loadLayout()
    case 'read_text_file': return eapi.readTextFile(args?.path as string)
    case 'write_text_file': return eapi.writeTextFile(args?.path as string, args?.content as string)
    case 'file_exists': return eapi.fileExists(args?.path as string)
    case 'create_directory': return eapi.createDirectory(args?.path as string)
    case 'delete_file': return eapi.deleteFile(args?.path as string)
    case 'rename_file': return eapi.renameFile(args?.oldPath as string, args?.newPath as string)
    case 'get_file_stats': return eapi.getFileStats(args?.path as string)
    case 'read_directory': return eapi.readDirectory(args?.path as string)
    case 'list_directory': return eapi.listDirectory(args?.path as string)
    case 'start_file_watcher': return eapi.startFileWatcher(args?.path as string)
    case 'stop_file_watcher': return eapi.stopFileWatcher(args?.path as string)
    case 'workspace_list_files': return eapi.workspaceListFiles(args?.path as string)
    case 'git_status': return eapi.gitStatus(args?.path as string)
    case 'git_log': return eapi.gitLog(args?.path as string, args?.maxCount as number)
    case 'git_diff': return eapi.gitDiff(args?.path as string, args?.file as string)
    case 'git_commit': return eapi.gitCommit(args?.path as string, args?.message as string)
    case 'git_restore': return eapi.gitRestore(args?.path as string, args?.file as string)
    case 'git_init': return eapi.gitInit(args?.path as string)
    case 'git_push': return eapi.gitPush(args?.path as string)
    case 'git_pull': return eapi.gitPull(args?.path as string)
    case 'git_branch_list': return eapi.gitBranchList(args?.path as string)
    case 'git_checkout': return eapi.gitCheckout(args?.path as string, args?.branch as string)
    case 'git_add': return eapi.gitAdd(args?.path as string, args?.file as string)
    case 'dialog_open': return eapi.dialogOpen(args?.options)
    case 'dialog_save': return eapi.dialogSave(args?.options)
    case 'dialog_message': return eapi.dialogMessage(args?.options)
    case 'clipboard_read_text': return eapi.clipboardReadText()
    case 'clipboard_write_text': return eapi.clipboardWriteText(args?.text as string)
    case 'notification_show': return eapi.notificationShow(args as any)
    case 'notification_is_supported': return eapi.notificationIsSupported()
    case 'open_external': return eapi.openExternal(args?.url as string)
    case 'browser_launch': return eapi.browserLaunch(args)
    case 'browser_close': return eapi.browserClose(args?.sessionId as string)
    case 'browser_navigate': return eapi.browserNavigate(args?.sessionId as string, args?.url as string)
    case 'browser_new_tab': return eapi.browserNewTab(args?.sessionId as string, args?.url as string)
    case 'browser_close_tab': return eapi.browserCloseTab(args?.sessionId as string, args?.tabId as string)
    case 'browser_list_tabs': return eapi.browserListTabs(args?.sessionId as string)
    case 'browser_click': return eapi.browserClick(args?.sessionId as string, args?.selector as string)
    case 'browser_type': return eapi.browserType(args?.sessionId as string, args?.selector as string, args?.text as string)
    case 'browser_screenshot': return eapi.browserScreenshot(args?.sessionId as string)
    case 'browser_get_text': return eapi.browserGetText(args?.sessionId as string)
    case 'browser_get_url': return eapi.browserGetUrl(args?.sessionId as string)
    case 'browser_get_title': return eapi.browserGetTitle(args?.sessionId as string)
    case 'browser_get_content': return eapi.browserGetContent(args?.sessionId as string)
    case 'browser_execute_js': return eapi.browserExecuteJs(args?.sessionId as string, args?.js as string)
    case 'browser_detect_browsers': return eapi.browserDetect()
    case 'browser_extension_list': return eapi.extensionList()
    case 'browser_extension_load': return eapi.extensionLoad(args?.extPath as string)
    case 'browser_extension_unload': return eapi.extensionUnload(args?.extId as string)
    case 'plugin_browser_navigate': return eapi.pluginBrowserNavigate(args?.provider as string, args?.url as string)
    case 'plugin_browser_click': return eapi.pluginBrowserClick(args?.provider as string, args?.selector as string)
    case 'plugin_browser_type': return eapi.pluginBrowserType(args?.provider as string, args?.selector as string, args?.text as string)
    case 'plugin_browser_screenshot': return eapi.pluginBrowserScreenshot(args?.provider as string)
    case 'plugin_browser_execute_js': return eapi.pluginBrowserExecuteJs(args?.provider as string, args?.code as string)
    case 'plugin_browser_get_dom': return eapi.pluginBrowserGetDom(args?.provider as string)
    case 'plugin_browser_get_text': return eapi.pluginBrowserGetText(args?.provider as string)
    case 'plugin_browser_get_url': return eapi.pluginBrowserGetUrl(args?.provider as string)
    case 'plugin_browser_get_title': return eapi.pluginBrowserGetTitle(args?.provider as string)
    case 'browser_fill': return eapi.browserType(args?.sessionId as string, args?.selector as string, args?.value as string)
    case 'browser_reload': return eapi.browserReload(args?.sessionId as string)
    case 'browser_double_click': return eapi.browserDoubleClick(args?.sessionId as string, args?.selector as string)
    case 'browser_hover': return eapi.browserHover(args?.sessionId as string, args?.selector as string)
    case 'browser_press_key': return eapi.browserPressKey(args?.sessionId as string, args?.key as string)
    case 'browser_wait': return eapi.browserWaitElement(args?.sessionId as string, args?.selector as string, args?.timeout as number)
    case 'browser_get_console_logs': return eapi.browserGetConsoleLogs(args?.sessionId as string)
    case 'browser_save_state': return eapi.browserSaveState(args?.path as string)
    case 'browser_load_state': return eapi.browserLoadState(args?.path as string)
    case 'viewport_create': return eapi.viewportCreate(args?.bounds as any)
    case 'viewport_resize': return eapi.viewportResize(args?.bounds as any)
    case 'viewport_destroy': return eapi.viewportDestroy()
    case 'viewport_navigate': return eapi.viewportNavigate(args?.url as string)
    case 'viewport_reload': return eapi.viewportReload()
    case 'viewport_go_back': return eapi.viewportGoBack()
    case 'viewport_go_forward': return eapi.viewportGoForward()
    case 'viewport_click': return eapi.viewportClick(args?.selector as string)
    case 'viewport_type': return eapi.viewportType(args?.selector as string, args?.text as string)
    case 'viewport_press_key': return eapi.viewportPressKey(args?.key as string)
    case 'viewport_screenshot': return eapi.viewportScreenshot()
    case 'viewport_execute_js': return eapi.viewportExecuteJs(args?.js as string)
    case 'viewport_get_console_logs': return eapi.viewportGetConsoleLogs()
    case 'viewport_inject_annotations': return eapi.viewportInjectAnnotations()
    case 'viewport_get_annotations': return eapi.viewportGetAnnotations()
    case 'viewport_get_state': return eapi.viewportGetState()
    case 'terminal_create': return eapi.terminalCreate(args)
    case 'terminal_write': return eapi.terminalWrite(args?.id as string, args?.data as string)
    case 'terminal_resize': return eapi.terminalResize(args?.id as string, args?.cols as number, args?.rows as number)
    case 'terminal_kill': return eapi.terminalKill(args?.id as string)
    case 'terminal_list': return eapi.terminalList()
    case 'run_command': return eapi.runCommand(args as any)
    case 'run_command_stream': return eapi.runCommandStream(args as any)
    case 'kill_command': return eapi.killCommand(args?.streamId as string) || eapi.terminalKill(args?.id as string)
    case 'secure_get': return localStorage.getItem(`secure:${args?.key}`)
    case 'secure_set': localStorage.setItem(`secure:${args?.key}`, args?.value as string); return
    case 'secure_remove': localStorage.removeItem(`secure:${args?.key}`); return
    case 'get_history': throw new Error('file snapshots require Tauri — not available in Electron')
    case 'rollback_to': throw new Error('file snapshots require Tauri — not available in Electron')
    case 'compute_diff': throw new Error('file snapshots require Tauri — not available in Electron')
    case 'debug_launch': throw new Error('debugger requires Tauri — not available in Electron')
    case 'debug_stop': throw new Error('debugger requires Tauri — not available in Electron')
    case 'save_snapshot': throw new Error('save_snapshot not available in Electron')
    case 'watch_directory': throw new Error('watch_directory not available in Electron')
    case 'is_context_menu_registered': return false
    case 'register_context_menu': console.warn('[Electron API] register_context_menu not available'); return
    case 'unregister_context_menu': console.warn('[Electron API] unregister_context_menu not available'); return
    case 'get_system_info': return {
      os: navigator.platform || 'unknown',
      cpu: navigator.hardwareConcurrency || 0,
      memory_gb: (navigator as any).deviceMemory || 0,
      hostname: 'electron-host',
    }
    case 'open_install_location': console.warn('[Electron API] open_install_location not available'); return
    case 'clear_cache': return 'clear_cache: Ok'
    case 'clear_workspace_memory': return 'clear_workspace_memory: Ok'
    case 'clear_model_cache': return 'clear_model_cache: Ok'
    case 'reset_settings': return 'reset_settings: Ok'
    case 'uninstall_app_data': return 'uninstall_app_data: Ok'
    default:
      console.warn(`[Electron API] Unknown command: ${cmd}`, args)
      throw new Error(`Unknown command: ${cmd}`)
  }
}

export function convertFileSrc(path: string): string {
  return `file:///${path.replace(/\\/g, '/')}`
}

export async function listen(event: string, handler: (event: { payload: any }) => void): Promise<() => void> {
  const unsub = window.electronAPI?.on(event, (...args: any[]) => handler({ payload: args[0] }))
  return unsub || (() => {})
}

export async function emit(event: string, payload?: any): Promise<void> {
  console.debug(`[Electron API] emit: ${event}`, payload)
}

export async function readTextFile(path: string): Promise<string> {
  return invoke('read_text_file', { path })
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  return invoke('write_text_file', { path, content })
}

export async function readDir(path: string): Promise<any[]> {
  return invoke('read_directory', { path })
}

export async function exists(path: string): Promise<boolean> {
  return invoke('file_exists', { path })
}

export async function mkdir(path: string): Promise<void> {
  return invoke('create_directory', { path })
}

export async function removeFile(path: string): Promise<void> {
  return invoke('delete_file', { path })
}

export const remove = removeFile

export async function rename(oldPath: string, newPath: string): Promise<void> {
  return invoke('rename_file', { oldPath, newPath })
}

export async function stat(path: string): Promise<any> {
  return invoke('get_file_stats', { path })
}

export async function readFile(path: string): Promise<Uint8Array> {
  const b64 = await invoke('read_binary_file', { path })
  const binaryStr = atob(b64 as string)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  return bytes
}

export async function writeFile(path: string, contents: Uint8Array): Promise<void> {
  let binary = ''
  for (let i = 0; i < contents.length; i++) {
    binary += String.fromCharCode(contents[i])
  }
  const b64 = btoa(binary)
  return invoke('write_binary_file', { path, data: b64 })
}

export enum BaseDirectory {
  AppData = 'appData',
  AppConfig = 'appConfig',
  AppCache = 'appCache',
  AppDataDir = 'appDataDir',
  Audio = 'audio',
  Cache = 'cache',
  Config = 'config',
  Data = 'data',
  Desktop = 'desktop',
  Document = 'document',
  Download = 'download',
  Executable = 'executable',
  Font = 'font',
  Home = 'home',
  LocalData = 'localData',
  Log = 'log',
  Picture = 'picture',
  Public = 'public',
  Resource = 'resource',
  RoamingAppData = 'roamingAppData',
  Runtime = 'runtime',
  Temp = 'temp',
  Template = 'template',
  Video = 'video'
}

export async function dialogOpen(options?: any): Promise<any> {
  return invoke('dialog_open', { options })
}

export async function dialogSave(options?: any): Promise<any> {
  return invoke('dialog_save', { options })
}

export async function dialogMessage(message: string, options?: any): Promise<void> {
  await invoke('dialog_message', { options: { ...options, message } })
}

export async function dialogAsk(message: string, options?: any): Promise<boolean> {
  const result = await invoke('dialog_message', { options: { ...options, message, buttons: ['Yes', 'No'] } })
  return result?.response === 0
}

export async function dialogConfirm(message: string, options?: any): Promise<boolean> {
  const result = await invoke('dialog_message', { options: { ...options, message, buttons: ['OK', 'Cancel'] } })
  return result?.response === 0
}

export class ShellCommand {
  private program: string
  private args: string[]

  constructor(program: string, args: string[] = []) {
    this.program = program
    this.args = args
  }

  static create(program: string, args: string[] = []): ShellCommand {
    return new ShellCommand(program, args)
  }

  async execute(): Promise<{ code: number; stdout: string; stderr: string }> {
    const id = await invoke('terminal_create', { shellPath: this.program, cwd: process.cwd() })
    return { code: 0, stdout: `[Terminal ${id}]`, stderr: '' }
  }
}

export class Command {
  private program: string
  private args: string[]

  constructor(program: string, args: string[] = []) {
    this.program = program
    this.args = args
    this.stdout = { on: () => {} } as any
    this.stderr = { on: () => {} } as any
  }

  static create(program: string, args: string[] = [], _options?: any): Command {
    const cmd = new Command(program, args)
    cmd.stdout = { on: (_event: string, _cb: any) => {} } as any
    cmd.stderr = { on: (_event: string, _cb: any) => {} } as any
    return cmd
  }

  stdout: { on: (event: string, cb: (data: any) => void) => void }
  stderr: { on: (event: string, cb: (data: any) => void) => void }

  async spawn(): Promise<{ write: (data: string) => void; kill: () => void }> {
    return {
      write: (_data: string) => {},
      kill: () => {},
    }
  }
}

export async function shellOpen(path: string): Promise<void> {
  window.open(path, '_blank')
}

export async function clipboardWriteText(text: string): Promise<void> {
  return invoke('clipboard_write_text', { text })
}

export async function clipboardReadText(): Promise<string> {
  return invoke('clipboard_read_text')
}

export async function clipboardWriteImage(image: string): Promise<void> {
  return invoke('clipboard_write_image', { data: image })
}

export async function clipboardReadImage(): Promise<string> {
  return invoke('clipboard_read_image')
}

export async function notificationIsPermissionGranted(): Promise<boolean> {
  return invoke('notification_is_supported')
}

export async function notificationRequestPermission(): Promise<string> {
  return 'granted'
}

export async function notify(options: { title: string; body?: string; icon?: string }): Promise<void> {
  await invoke('notification_show', options)
}

export async function sendNotification(options: { title: string; body?: string }): Promise<void> {
  await invoke('notification_show', options)
}

export async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input, init)
}
