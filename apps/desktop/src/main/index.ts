import * as Sentry from '@sentry/node'
import { app, BrowserWindow, shell, globalShortcut } from 'electron'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.2,
  })
}
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

const startupLog: string[] = []
function log(tag: string, msg: string) {
  const line = `[${tag}] ${msg}`
  startupLog.push(line)
  console.log(line)
}

// Prevent EPIPE crashes from killing the app
process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE' || (err as NodeJS.ErrnoException).code === 'ERR_IPC_CHANNEL_CLOSED') {
    console.error('[Lifecycle] Swallowing EPIPE:', err.message)
    return
  }
  console.error('[Lifecycle] Uncaught exception:', err.message)
  startupLog.push(`[Lifecycle] Uncaught exception: ${err.message}`)
})

function sendToWindow(wc: Electron.WebContents | null | undefined, channel: string, ...args: unknown[]): void {
  if (wc && !wc.isDestroyed()) {
    try { wc.send(channel, ...args) } catch { /* webContents disposed */ }
  }
}

app.whenReady().then(async () => {
  log('Lifecycle', 'App ready — starting initialization')

  // Initialize main process observability
  initializeMainProcessObservability()
  log('Lifecycle', 'Observability initialized')

  // Initialize managers
  browserManager = new BrowserManager()
  terminalManager = new TerminalManager()
  log('Lifecycle', 'Managers initialized')

  // Create window manager
  windowManager = createWindowManager()
  log('Lifecycle', 'Window manager created')

  // Register IPC handlers
  registerAllIpcHandlers(windowManager, browserManager, terminalManager)
  log('Lifecycle', 'IPC handlers registered')

  // Create the main window
  const mainWindow = windowManager.createMainWindow()
  log('Lifecycle', 'Main window created')

  // Set up application menu
  createAppMenu(windowManager, mainWindow)

  // Set up system tray
  createTray(windowManager)

  // Set up auto updater
  setupUpdater(mainWindow)

  // Set Content-Security-Policy via session.webRequest for defense-in-depth
  // Note: CSP is also set in the HTML meta tag; this is redundant but kept for defense-in-depth
  // In dev mode, allow 'unsafe-inline' for Vite's HMR and React DevTools preamble
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const scriptSrc = app.isPackaged ? "'self'" : "'self' 'unsafe-inline' 'unsafe-eval'"
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          `default-src 'self'; ` +
          `script-src ${scriptSrc}; ` +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "img-src 'self' data: blob: asset: resource:; " +
          "font-src 'self' data: https://fonts.gstatic.com; " +
          "connect-src 'self' ws: wss: http://localhost:* https://*.openai.com https://*.anthropic.com https://*.githubusercontent.com https://*.nvidia.com https://integrate.api.nvidia.com https://ai.api.nvidia.com https://fonts.googleapis.com https://fonts.gstatic.com;"
        ],
      },
    })
  })

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
    log('Lifecycle', `Loading renderer from dev URL: ${process.env['ELECTRON_RENDERER_URL']}`)
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const rendererPath = join(__dirname, '../renderer/index.html')
    log('Lifecycle', `Loading renderer from file: ${rendererPath}`)
    mainWindow.loadFile(rendererPath)
  }

  // Handle renderer crashes — show a crash page instead of a blank window
  ;(mainWindow.webContents as any).on('crashed', () => {
    log('Lifecycle', 'Renderer process CRASHED')
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>AgenticOS — Crashed</title></head>
      <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#09090b;color:#e2e8f0;font-family:sans-serif;padding:24px;text-align:center;margin:0;">
        <div style="font-size:40px;margin-bottom:8px;">!</div>
        <h1 style="font-size:18px;font-weight:600;margin-bottom:8px;">Renderer process crashed</h1>
        <p style="font-size:13px;color:#888;max-width:400px;line-height:1.5;">The application window crashed unexpectedly.</p>
        <button onclick="location.reload()" style="padding:10px 24px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;margin-top:16px;">Reload</button>
      </body>
      </html>
    `)}`)
  })

  // Handle preload script errors
  mainWindow.webContents.on('preload-error', (_event, preloadPath, err) => {
    log('Lifecycle', `Preload script error: ${preloadPath} — ${err}`)
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>AgenticOS — Error</title></head>
      <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#09090b;color:#e2e8f0;font-family:sans-serif;padding:24px;text-align:center;margin:0;">
        <div style="font-size:40px;margin-bottom:8px;">!</div>
        <h1 style="font-size:18px;font-weight:600;margin-bottom:8px;">AgenticOS couldn't start</h1>
        <p style="font-size:13px;color:#888;max-width:400px;line-height:1.5;">A critical system component failed to load.</p>
        <p style="font-size:11px;color:#666;max-width:400px;word-break:break-all;">${String(err).replace(/</g, '&lt;')}</p>
        <button onclick="location.reload()" style="padding:10px 24px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;margin-top:16px;">Reload</button>
      </body>
      </html>
    `)}`)
  })

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      log('Lifecycle', 'Activate event — creating new window')
      windowManager.createMainWindow()
    }
  })

  log('Lifecycle', 'Startup complete')
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  log('Lifecycle', 'Before-quit — cleaning up')
  terminalManager.killAll()
  browserManager.cleanup()
})

export { windowManager, browserManager, terminalManager }
