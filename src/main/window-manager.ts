import { BrowserWindow, screen, app } from 'electron'
import { join } from 'path'

export interface WindowManager {
  createMainWindow(): BrowserWindow
  createFloatingPanel(name: string): BrowserWindow
  getMainWindow(): BrowserWindow | null
  getAllWindows(): BrowserWindow[]
  restoreLayout(): void
  saveLayout(): void
}

let mainWindow: BrowserWindow | null = null
const floatingPanels: Map<string, BrowserWindow> = new Map()

export function createWindowManager(): WindowManager {
  return {
    createMainWindow(): BrowserWindow {
      const { width, height } = screen.getPrimaryDisplay().workAreaSize

      mainWindow = new BrowserWindow({
        width: Math.min(1280, width),
        height: Math.min(860, height),
        minWidth: 900,
        minHeight: 600,
        center: true,
        resizable: true,
        fullscreenable: true,
        show: false,
        icon: join(__dirname, '../../resources/branding/icon.png'),
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          webSecurity: true
        }
      })

      mainWindow.on('ready-to-show', () => {
        mainWindow?.show()
        mainWindow?.focus()
      })

      // Log renderer console messages (guarded against EPIPE on shutdown)
      mainWindow.webContents.on('console-message', (_event: Electron.Event & { level: number; message: string; line: number; sourceId: string }) => {
        try {
          const levelName = ['verbose', 'info', 'warning', 'error'][_event.level] || 'unknown'
          process.stdout.write(`[Renderer:${levelName}] ${_event.message} (${_event.sourceId}:${_event.line})\n`)
        } catch { /* EPIPE during shutdown — safe to ignore */ }
      })

      mainWindow.on('closed', () => {
        mainWindow = null
      })

      return mainWindow
    },

    createFloatingPanel(name: string): BrowserWindow {
      const panel = new BrowserWindow({
        width: 400,
        height: 600,
        resizable: true,
        show: false,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false
        }
      })

      panel.on('ready-to-show', () => panel.show())
      panel.on('closed', () => floatingPanels.delete(name))
      floatingPanels.set(name, panel)

      return panel
    },

    getMainWindow(): BrowserWindow | null {
      return mainWindow
    },

    getAllWindows(): BrowserWindow[] {
      return BrowserWindow.getAllWindows()
    },

    restoreLayout(): void {
      const layout = localStorage.getItem('agenticos-layout')
      if (layout) {
        try {
          const config = JSON.parse(layout)
          if (config.bounds && mainWindow) {
            mainWindow.setBounds(config.bounds)
          }
        } catch {}
      }
    },

    saveLayout(): void {
      if (mainWindow) {
        const bounds = mainWindow.getBounds()
        localStorage.setItem('agenticos-layout', JSON.stringify({ bounds }))
      }
    }
  }
}
