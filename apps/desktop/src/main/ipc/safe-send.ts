import { BrowserWindow } from 'electron'

export function sendToWindow(
  win: BrowserWindow | null | undefined,
  channel: string,
  ...args: unknown[]
): void {
  if (!win) return
  try {
    if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  } catch {
    // webContents disposed — safe to ignore
  }
}

export function sendToFocusedWindow(channel: string, ...args: unknown[]): void {
  const win = BrowserWindow.getFocusedWindow()
  sendToWindow(win, channel, ...args)
}

export function sendToAllWindows(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    sendToWindow(win, channel, ...args)
  }
}
