import { BrowserWindow, app, dialog, Notification, ipcMain } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg

let isChecking = false
let progressDialog: BrowserWindow | null = null

const PRODUCT_NAME = 'AgenticOS'
const BG_COLOR = '#0A0A0F'
const TEXT_COLOR = '#E2E8F0'
const ACCENT_COLOR = '#2563EB'
const MUTED_COLOR = '#888888'
const DIALOG_WIDTH = 420
const DIALOG_HEIGHT = 280

function createProgressWindow(): BrowserWindow {
  if (progressDialog && !progressDialog.isDestroyed()) return progressDialog

  progressDialog = new BrowserWindow({
    width: DIALOG_WIDTH,
    height: DIALOG_HEIGHT,
    resizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    parent: BrowserWindow.getFocusedWindow() || undefined,
    modal: true,
    show: false,
    webPreferences: { sandbox: true },
  })

  progressDialog.on('closed', () => { progressDialog = null })
  return progressDialog
}

function renderProgressHtml(percent: number, speed: string, transferred: string, total: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
    background: ${BG_COLOR}; color: ${TEXT_COLOR};
    display:flex; align-items:center; justify-content:center;
    min-height:100vh; padding:24px;
  }
  .card {
    background: #14141A; border:1px solid #1E1E2A;
    border-radius:14px; padding:28px; width:100%; max-width:380px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    text-align:center;
  }
  .logo {
    width:44px; height:44px; margin:0 auto 16px;
    background: linear-gradient(135deg, ${ACCENT_COLOR}, #7C3AED);
    border-radius:10px; display:flex; align-items:center; justify-content:center;
    font-size:22px; font-weight:700; color:white;
  }
  h2 { font-size:18px; font-weight:700; margin-bottom:4px; }
  .sub { font-size:12px; color:${MUTED_COLOR}; margin-bottom:20px; }
  .bar-wrap { background:#1E1E2A; border-radius:6px; height:6px; margin-bottom:10px; overflow:hidden; }
  .bar { height:100%; background:linear-gradient(90deg,${ACCENT_COLOR},#7C3AED); border-radius:6px; width:${percent}%; transition:width .3s; }
  .info { font-size:11px; color:${MUTED_COLOR}; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">A</div>
    <h2>Downloading Update</h2>
    <div class="sub">${PRODUCT_NAME}</div>
    <div class="bar-wrap"><div class="bar"></div></div>
    <div class="info">${transferred} / ${total} (${speed}/s)</div>
  </div>
</body>
</html>`
}

export function setupUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    isChecking = true
    mainWindow.webContents.send('update-status', { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    isChecking = false
    mainWindow.webContents.send('update-status', {
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    })

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: `${PRODUCT_NAME} Update Available`,
      message: `${PRODUCT_NAME} ${info.version} is available for download.`,
      detail: 'Would you like to update now?',
      buttons: ['Download Update', 'Later'],
      cancelId: 1,
      icon: undefined,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate()
    })
  })

  autoUpdater.on('update-not-available', () => {
    isChecking = false
    mainWindow.webContents.send('update-status', { status: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update-status', {
      status: 'downloading',
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      total: progress.total,
      transferred: progress.transferred,
    })

    const win = createProgressWindow()
    const percent = Math.round(progress.percent)
    const speed = formatBytes(progress.bytesPerSecond) + '/s'
    const transferred = formatBytes(progress.transferred)
    const total = formatBytes(progress.total)

    const html = renderProgressHtml(percent, speed, transferred, total)
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    if (!win.isVisible()) win.show()
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('update-status', {
      status: 'downloaded',
      version: info.version,
    })

    if (progressDialog && !progressDialog.isDestroyed()) progressDialog.close()

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: `${PRODUCT_NAME} Update Ready`,
      message: `${PRODUCT_NAME} ${info.version} has been downloaded.`,
      detail: 'Restart the application to complete the installation.',
      buttons: ['Install Now', 'Later'],
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    isChecking = false
    mainWindow.webContents.send('update-status', {
      status: 'error',
      error: err.message,
    })
  })

  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 4 * 60 * 60 * 1000)
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function checkForUpdates(): void {
  if (!isChecking) {
    autoUpdater.checkForUpdates().catch(() => {})
  }
}

export function downloadUpdate(): void {
  autoUpdater.downloadUpdate()
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}
