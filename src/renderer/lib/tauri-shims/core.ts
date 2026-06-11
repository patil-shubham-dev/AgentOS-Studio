// Electron shim for @tauri-apps/api/core
// Provides invoke() and other core APIs using window.electronAPI

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
    }
  }
}

export {}

const api = () => window.electronAPI

export async function invoke(cmd: string, args?: Record<string, unknown>): Promise<any> {
  if (!window.electronAPI) {
    throw new Error('electronAPI not available - not running in Electron')
  }

  const eapi = window.electronAPI

  // Map Tauri command names to Electron API methods
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
    case 'browser_fill': return eapi.browserType(args?.sessionId as string, args?.selector as string, args?.value as string)
    case 'browser_reload': return eapi.browserReload(args?.sessionId as string)
    case 'browser_double_click': return eapi.browserDoubleClick(args?.sessionId as string, args?.selector as string)
    case 'browser_hover': return eapi.browserHover(args?.sessionId as string, args?.selector as string)
    case 'browser_press_key': return eapi.browserPressKey(args?.sessionId as string, args?.key as string)
    case 'browser_wait': return eapi.browserWaitElement(args?.sessionId as string, args?.selector as string, args?.timeout as number)
    case 'browser_get_console_logs': return eapi.browserGetConsoleLogs(args?.sessionId as string)
    case 'browser_save_state': return eapi.browserSaveState(args?.path as string)
    case 'browser_load_state': return eapi.browserLoadState(args?.path as string)
    case 'terminal_create': return eapi.terminalCreate(args)
    case 'terminal_write': return eapi.terminalWrite(args?.id as string, args?.data as string)
    case 'terminal_resize': return eapi.terminalResize(args?.id as string, args?.cols as number, args?.rows as number)
    case 'terminal_kill': return eapi.terminalKill(args?.id as string)
    case 'terminal_list': return eapi.terminalList()

    // Command execution (used by TerminalRuntime)
    case 'run_command': return eapi.runCommand(args as any)
    case 'run_command_stream': return eapi.runCommandStream(args as any)
    case 'kill_command': return eapi.killCommand(args?.streamId as string) || eapi.terminalKill(args?.id as string)
    case 'secure_get': return localStorage.getItem(`secure:${args?.key}`)
    case 'secure_set': localStorage.setItem(`secure:${args?.key}`, args?.value as string); return
    case 'secure_remove': localStorage.removeItem(`secure:${args?.key}`); return

    // ── File History ──
    case 'get_history': throw new Error(`Tauri command "get_history" not available in Electron — file snapshots require Tauri`)
    case 'rollback_to': throw new Error(`Tauri command "rollback_to" not available in Electron — file snapshots require Tauri`)
    case 'compute_diff': throw new Error(`Tauri command "compute_diff" not available in Electron — file snapshots require Tauri`)

    // ── Debug ──
    case 'debug_launch': throw new Error(`Tauri command "debug_launch" not available in Electron — debugger requires Tauri`)
    case 'debug_stop': throw new Error(`Tauri command "debug_stop" not available in Electron — debugger requires Tauri`)

    // ── Workspace Snapshots (Tauri-only) ──
    case 'save_snapshot': throw new Error(`Tauri command "save_snapshot" not available in Electron`)

    // ── Directory Watching (Tauri-only) ──
    case 'watch_directory': throw new Error(`Tauri command "watch_directory" not available in Electron — use workspace:start-watcher instead`)

    // ── Context Menu (Tauri-only) ──
    case 'is_context_menu_registered': return false
    case 'register_context_menu': console.warn('[Tauri Shim] register_context_menu not available in Electron'); return
    case 'unregister_context_menu': console.warn('[Tauri Shim] unregister_context_menu not available in Electron'); return

    // ── System Info (Tauri-only) ──
    case 'get_system_info': return {
      os: navigator.platform || 'unknown',
      cpu: navigator.hardwareConcurrency || 0,
      memory_gb: (navigator as any).deviceMemory || 0,
      hostname: 'electron-host',
    }
    case 'open_install_location': console.warn('[Tauri Shim] open_install_location not available in Electron'); return

    // ── Reset/Cleanup (stubbed for Electron) ──
    case 'clear_cache': return 'clear_cache: Ok'
    case 'clear_workspace_memory': return 'clear_workspace_memory: Ok'
    case 'clear_model_cache': return 'clear_model_cache: Ok'
    case 'reset_settings': return 'reset_settings: Ok'
    case 'uninstall_app_data': return 'uninstall_app_data: Ok'

    default:
      console.warn(`[Tauri Shim] Unknown command: ${cmd}`, args)
      throw new Error(`Unknown Tauri command: ${cmd}`)
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
  // In Electron, we don't emit from renderer to main via event
  // For one-way notification, we just ignore
  console.debug(`[Tauri Shim] emit: ${event}`, payload)
}
