import { ipcMain } from 'electron'
import type { ViewportManager } from '../services/viewport-manager'
import type { WindowManager } from '../window-manager'
import { log } from '../observability'

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

function validateBounds(bounds: unknown): { x: number; y: number; width: number; height: number } {
  if (!bounds || typeof bounds !== 'object') throw new Error('Invalid bounds: must be an object')
  const b = bounds as Record<string, unknown>
  return {
    x: validatePositiveInt(b.x, 'bounds.x'),
    y: validatePositiveInt(b.y, 'bounds.y'),
    width: validatePositiveInt(b.width, 'bounds.width'),
    height: validatePositiveInt(b.height, 'bounds.height'),
  }
}

export function registerViewportHandlers(
  viewportManager: ViewportManager,
  windowManager: WindowManager
): void {
  const sendToWindow = (channel: string, ...args: unknown[]) => {
    const mw = windowManager.getMainWindow()
    if (mw && !mw.isDestroyed() && mw.webContents) {
      try { mw.webContents.send(channel, ...args) } catch { console.warn("[IPC] Failed to send message to window") }
    }
  }

  viewportManager.attach(
    windowManager.getMainWindow()!,
    (state) => {
      sendToWindow('viewport-state-changed', state)
    },
    (event) => {
      sendToWindow('viewport-network-event', event)
    }
  )

  ipcMain.handle('viewport-create', async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    const v = validateBounds(bounds)
    log('info', 'viewport', 'create', v)
    return viewportManager.create(v)
  })

  ipcMain.handle('viewport-resize', async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    const v = validateBounds(bounds)
    viewportManager.resize(v)
  })

  ipcMain.handle('viewport-destroy', async () => {
    log('info', 'viewport', 'destroy')
    viewportManager.destroy()
  })

  ipcMain.handle('viewport-navigate', async (_event, url: string) => {
    validateString(url, 'url', 8192)
    log('info', 'viewport', 'navigate', url)
    return viewportManager.navigate(url)
  })

  ipcMain.handle('viewport-reload', async () => {
    log('info', 'viewport', 'reload')
    return viewportManager.reload()
  })

  ipcMain.handle('viewport-go-back', async () => {
    log('info', 'viewport', 'goBack')
    return viewportManager.goBack()
  })

  ipcMain.handle('viewport-go-forward', async () => {
    log('info', 'viewport', 'goForward')
    return viewportManager.goForward()
  })

  ipcMain.handle('viewport-click', async (_event, selector: string) => {
    validateString(selector, 'selector', 4096)
    log('info', 'viewport', 'click', selector)
    return viewportManager.click(selector)
  })

  ipcMain.handle('viewport-type', async (_event, selector: string, text: string) => {
    validateString(selector, 'selector', 4096)
    validateString(text, 'text', 10000)
    log('info', 'viewport', 'type', { selector, textLength: text.length })
    return viewportManager.type(selector, text)
  })

  ipcMain.handle('viewport-press-key', async (_event, key: string) => {
    validateString(key, 'key', 100)
    log('info', 'viewport', 'pressKey', key)
    return viewportManager.pressKey(key)
  })

  ipcMain.handle('viewport-screenshot', async () => {
    log('info', 'viewport', 'screenshot')
    return viewportManager.screenshot()
  })

  ipcMain.handle('viewport-execute-js', async (_event, js: string) => {
    validateString(js, 'javascript', 50000)
    log('info', 'viewport', 'executeJs')
    return viewportManager.executeJs(js)
  })

  ipcMain.handle('viewport-get-console-logs', async () => {
    return viewportManager.getConsoleLogs()
  })

  ipcMain.handle('viewport-inject-annotations', async () => {
    log('info', 'viewport', 'injectAnnotations')
    return viewportManager.injectAnnotationScript()
  })

  ipcMain.handle('viewport-get-annotations', async () => {
    return viewportManager.getAnnotations()
  })

  ipcMain.handle('viewport-get-state', async () => {
    return viewportManager.getState()
  })

  ipcMain.handle('viewport-get-network-logs', async () => {
    return viewportManager.getNetworkLogs()
  })
}
