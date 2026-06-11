import { ipcMain, app, shell } from 'electron'
import { join, dirname } from 'path'
import { readdirSync, statSync, existsSync, rmSync } from 'fs'
import { execSync } from 'child_process'

const PRODUCT_NAME = 'AgenticOS'
const LOG_PREFIX = '[Uninstaller]'

interface UninstallDataInfo {
  settings: string
  cache: string
  logs: string
  workspaces: string
  sessions: string
  terminalHistory: string
  memoryDb: string
}

function formatSize(bytes: number): string {
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} bytes`
}

function getDirSize(dir: string): number {
  try {
    if (!existsSync(dir)) return 0
    let total = 0
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      try {
        if (entry.isDirectory()) {
          total += getDirSize(fullPath)
        } else if (entry.isFile()) {
          total += statSync(fullPath).size
        }
      } catch { /* skip inaccessible */ }
    }
    return total
  } catch { return 0 }
}

export function detectUserData(): UninstallDataInfo {
  const appData = join(app.getPath('appData'), PRODUCT_NAME)
  const userData = join(app.getPath('userData'))
  const localAppData = join(app.getPath('home'), 'AppData', 'Local', PRODUCT_NAME)
  const docsDir = join(app.getPath('documents'), PRODUCT_NAME)

  const settingsDir = userData
  const cacheDir = join(localAppData, 'cache')
  const logsDir = join(localAppData, 'logs')
  const sessionsDir = join(userData, 'sessions')
  const terminalHistoryDir = join(userData, 'terminal')
  const memoryDbDir = join(userData, 'memory')
  const workspaceDir = existsSync(docsDir) ? docsDir : join(userData, 'workspaces')

  return {
    settings: formatSize(getDirSize(settingsDir)),
    cache: formatSize(getDirSize(cacheDir)),
    logs: formatSize(getDirSize(logsDir)),
    workspaces: formatSize(getDirSize(workspaceDir)),
    sessions: formatSize(getDirSize(sessionsDir)),
    terminalHistory: formatSize(getDirSize(terminalHistoryDir)),
    memoryDb: formatSize(getDirSize(memoryDbDir)),
  }
}

export function removeUserData(level: 'app' | 'settings' | 'cache' | 'all'): void {
  const userData = join(app.getPath('userData'))
  const localAppData = join(app.getPath('home'), 'AppData', 'Local', PRODUCT_NAME)

  try {
    switch (level) {
      case 'all':
        console.log(`${LOG_PREFIX} Removing all user data`)
        if (existsSync(userData)) rmSync(userData, { recursive: true, force: true })
        if (existsSync(localAppData)) rmSync(localAppData, { recursive: true, force: true })
        break
      case 'cache':
        console.log(`${LOG_PREFIX} Removing settings and cache`)
        if (existsSync(userData)) rmSync(userData, { recursive: true, force: true })
        break
      case 'settings':
        console.log(`${LOG_PREFIX} Removing settings`)
        const settingsPath = join(userData, 'settings.json')
        if (existsSync(settingsPath)) rmSync(settingsPath, { force: true })
        break
      case 'app':
      default:
        console.log(`${LOG_PREFIX} Removing app only, preserving user data`)
        break
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error removing data:`, err)
  }
}

function getNsisUninstallPath(): string | null {
  try {
    const uninstallKey = 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{cfb2d0f0-8e1c-5a1e-8e1c-5a1e8e1c5a1e}'
    const appIdKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.agenticos.studio'
    const productKey = 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AgenticOS'
    for (const key of [uninstallKey, appIdKey, productKey]) {
      try {
        const result = execSync(`reg query "${key}" /v "UninstallString"`, { timeout: 3000, encoding: 'utf-8' })
        const match = result.match(/UninstallString\s+REG_SZ\s+(.+)/)
        if (match) return match[1].trim().replace(/^"/, '').replace(/"$/, '')
      } catch { /* try next key */ }
    }
    const nsisUninstaller = join(app.getPath('exe'), '..', 'Uninstall AgenticOS.exe')
    if (existsSync(nsisUninstaller)) return nsisUninstaller
    return null
  } catch {
    return null
  }
}

export function registerUninstallIpcHandlers(): void {
  ipcMain.handle('uninstall:detect-data', async () => {
    return detectUserData()
  })

  ipcMain.handle('uninstall:perform', async (_event, level: 'app' | 'settings' | 'cache' | 'all') => {
    removeUserData(level)
    return { success: true }
  })

  ipcMain.handle('uninstall:open-system', async () => {
    try {
      if (process.platform === 'win32') {
        await shell.openPath('ms-settings:appsfeatures-app')
      } else if (process.platform === 'darwin') {
        await shell.openPath('/Applications')
      }
      return { success: true }
    } catch (err) {
      console.error(`${LOG_PREFIX} Error opening system uninstaller:`, err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('uninstall:self', async () => {
    try {
      if (process.platform === 'win32') {
        const { spawn } = await import('child_process')
        const uninstallPath = getNsisUninstallPath()
        if (uninstallPath) {
          spawn(uninstallPath, ['/S'], { detached: true, stdio: 'ignore' }).unref()
        } else {
          const nsisUninstaller = join(dirname(process.execPath), 'Uninstall AgenticOS.exe')
          if (existsSync(nsisUninstaller)) {
            spawn(nsisUninstaller, ['/S'], { detached: true, stdio: 'ignore' }).unref()
          } else {
            return { success: false, error: 'Uninstaller not found. Use Settings → Apps & Features to uninstall.' }
          }
        }
      } else if (process.platform === 'darwin') {
        const { spawn } = await import('child_process')
        spawn('osascript', ['-e', 'tell application "Finder" to delete POSIX file "/Applications/AgenticOS.app"'], { detached: true, stdio: 'ignore' }).unref()
      } else {
        const { spawn } = await import('child_process')
        const uninstallScript = '/usr/local/bin/agenticos-uninstall'
        if (existsSync(uninstallScript)) {
          spawn(uninstallScript, [], { detached: true, stdio: 'ignore' }).unref()
        } else {
          const userHome = process.env.HOME || `/home/${process.env.USER}`
          const desktopFile = `${userHome}/.local/share/applications/agenticos.desktop`
          if (existsSync(desktopFile)) rmSync(desktopFile, { force: true })
          const binPath = '/usr/local/bin/agenticos'
          if (existsSync(binPath)) rmSync(binPath, { force: true })
        }
      }

      app.exit(0)
      return { success: true }
    } catch (err) {
      console.error(`${LOG_PREFIX} Error during self-uninstall:`, err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('uninstall:set-auto-launch', async (_event, enable: boolean) => {
    try {
      const { app } = await import('electron')
      app.setLoginItemSettings({
        openAtLogin: enable,
        path: process.execPath,
      })
      return { success: true }
    } catch (err) {
      console.error(`${LOG_PREFIX} Error setting auto-launch:`, err)
      return { success: false, error: String(err) }
    }
  })
}
