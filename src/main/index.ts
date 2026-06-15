import { app, BrowserWindow, shell, globalShortcut } from 'electron'
import { join } from 'path'
import { createWindowManager } from './window-manager'
import type { WindowManager } from './window-manager'
import { createAppMenu } from './menu'
import { createTray } from './tray'
import { setupUpdater } from './updater'
import { registerAllIpcHandlers } from './ipc/index'
import { BrowserManager } from './services/browser-manager'
import { TerminalManager } from './services/terminal-manager'
import { initializeMainProcessObservability } from './observability'

let windowManager: WindowManager
let browserManager: BrowserManager
let terminalManager: TerminalManager

// Prevent EPIPE crashes from killing the app
process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE' || (err as NodeJS.ErrnoException).code === 'ERR_IPC_CHANNEL_CLOSED') {
    console.error('[Lifecycle] Swallowing EPIPE:', err.message)
    return
  }
  console.error('[Lifecycle] Uncaught exception:', err.message)
})

function sendToWindow(wc: Electron.WebContents | null | undefined, channel: string, ...args: unknown[]): void {
  if (wc && !wc.isDestroyed()) {
    try { wc.send(channel, ...args) } catch { /* webContents disposed */ }
  }
}

app.whenReady().then(async () => {
  // Initialize main process observability
  initializeMainProcessObservability()

  // Initialize managers
  browserManager = new BrowserManager()
  terminalManager = new TerminalManager()

  // Create window manager
  windowManager = createWindowManager()

  // Register IPC handlers
  registerAllIpcHandlers(windowManager, browserManager, terminalManager)

  // Create the main window
  const mainWindow = windowManager.createMainWindow()

  // Set up application menu
  createAppMenu(windowManager, mainWindow)

  // Set up system tray
  createTray(windowManager)

  // Set up auto updater
  setupUpdater(mainWindow)

  // Register global shortcuts
  globalShortcut.register('CommandOrControl+K', () => {
    const wc = mainWindow?.webContents
    sendToWindow(wc, 'command-palette')
  })
  globalShortcut.register('CommandOrControl+`', () => {
    const wc = mainWindow?.webContents
    sendToWindow(wc, 'toggle-terminal')
  })
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    const wc = mainWindow?.webContents
    sendToWindow(wc, 'command-palette')
  })

  // Load the renderer
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  terminalManager.killAll()
  browserManager.cleanup()
})

export { windowManager, browserManager, terminalManager }
