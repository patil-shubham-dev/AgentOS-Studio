import { ipcMain, app, shell } from 'electron'
import { join, dirname } from 'path'
import { readdirSync, statSync, existsSync, rmSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'

const PRODUCT_NAME = 'AgenticOS'
const LOG_PREFIX = '[Uninstaller]'

// ─── Types ───────────────────────────────────────────────────────────────────

interface UninstallDataInfo {
  appSize: string
  settings: string
  cache: string
  logs: string
  workspaces: string
  sessions: string
  terminalHistory: string
  memoryDb: string
  localAiModels: string
  snapshots: string
  totalRecoverable: string
  totalRecoverableBytes: number
  allSizes: Record<string, number>
}

interface UninstallBackupInfo {
  backupPath: string
  timestamp: string
  items: string[]
  totalSize: string
}

interface BackupOptions {
  exportSettings: boolean
  exportConfigs: boolean
  exportWorkspaces: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`
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
      } catch {
        console.warn(`${LOG_PREFIX} Skipping inaccessible: ${fullPath}`)
      }
    }
    return total
  } catch {
    console.warn(`${LOG_PREFIX} Failed to calculate directory size`)
    return 0
  }
}

function safeRmdir(dir: string): void {
  try {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true })
      console.log(`${LOG_PREFIX} Removed: ${dir}`)
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error removing ${dir}:`, err)
  }
}

function safeUnlink(file: string): void {
  try {
    if (existsSync(file)) {
      rmSync(file, { force: true })
      console.log(`${LOG_PREFIX} Removed: ${file}`)
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Error removing ${file}:`, err)
  }
}

function copyDir(src: string, dest: string): void {
  if (!existsSync(src)) return
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true })

  const entries = readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else if (entry.isFile()) {
      try {
        copyFileSync(srcPath, destPath)
      } catch (err) {
        console.warn(`${LOG_PREFIX} Failed to copy ${srcPath}:`, err)
      }
    }
  }
}

// ─── Data Detection ──────────────────────────────────────────────────────────

export function detectUserData(): UninstallDataInfo {
  const userData = app.getPath('userData')
  const home = app.getPath('home')
  const localAppData = join(home, 'AppData', 'Local', PRODUCT_NAME)
  const appData = join(home, 'AppData', 'Roaming', PRODUCT_NAME)

  const paths: Record<string, string> = {
    appSize: dirname(process.execPath),
    settings: userData,
    cache: join(localAppData, 'cache'),
    logs: join(localAppData, 'logs'),
    workspaces: join(userData, 'workspaces'),
    sessions: join(userData, 'sessions'),
    terminalHistory: join(userData, 'terminal'),
    memoryDb: join(userData, 'memory'),
    localAiModels: join(userData, 'models'),
    snapshots: join(localAppData, 'snapshots'),
  }

  const sizes: Record<string, number> = {}
  for (const [key, path] of Object.entries(paths)) {
    sizes[key] = getDirSize(path)
  }

  const totalRecoverableBytes = Object.entries(sizes)
    .filter(([key]) => key !== 'appSize') // exclude app itself
    .reduce((sum, [, val]) => sum + val, 0)

  const formatted: Record<string, string> = {}
  for (const [key, val] of Object.entries(sizes)) {
    formatted[key] = formatSize(val)
  }

  return {
    appSize: formatted.appSize,
    settings: formatted.settings,
    cache: formatted.cache,
    logs: formatted.logs,
    workspaces: formatted.workspaces,
    sessions: formatted.sessions,
    terminalHistory: formatted.terminalHistory,
    memoryDb: formatted.memoryDb,
    localAiModels: formatted.localAiModels,
    snapshots: formatted.snapshots,
    totalRecoverable: formatSize(totalRecoverableBytes),
    totalRecoverableBytes,
    allSizes: sizes,
  }
}

// ─── Data Removal ────────────────────────────────────────────────────────────

export function removeUserData(
  options: {
    settings: boolean
    cache: boolean
    logs: boolean
    workspaces: boolean
    sessions: boolean
    terminalHistory: boolean
    memoryDb: boolean
    localAiModels: boolean
    snapshots: boolean
  },
): { success: boolean; removed: string[]; errors: string[] } {
  const userData = app.getPath('userData')
  const home = app.getPath('home')
  const localAppData = join(home, 'AppData', 'Local', PRODUCT_NAME)
  const removed: string[] = []
  const errors: string[] = []

  const removalMap: Array<{ key: string; path: string; label: string }> = [
    { key: 'settings', path: userData, label: 'Settings' },
    { key: 'cache', path: join(localAppData, 'cache'), label: 'Cache' },
    { key: 'logs', path: join(localAppData, 'logs'), label: 'Logs' },
    { key: 'workspaces', path: join(userData, 'workspaces'), label: 'Workspaces' },
    { key: 'sessions', path: join(userData, 'sessions'), label: 'Sessions' },
    { key: 'terminalHistory', path: join(userData, 'terminal'), label: 'Terminal History' },
    { key: 'memoryDb', path: join(userData, 'memory'), label: 'Memory DB' },
    { key: 'localAiModels', path: join(userData, 'models'), label: 'AI Models' },
    { key: 'snapshots', path: join(localAppData, 'snapshots'), label: 'Snapshots' },
  ]

  for (const item of removalMap) {
    if (options[item.key as keyof typeof options]) {
      try {
        safeRmdir(item.path)
        removed.push(item.label)
      } catch (err) {
        errors.push(`${item.label}: ${err}`)
      }
    }
  }

  // If settings removed, also clean registry
  if (options.settings) {
    try {
      execSync(`reg delete "HKCU\\Software\\${PRODUCT_NAME}" /f`, { timeout: 3000, windowsHide: true })
    } catch {
      // Registry key may not exist
    }
  }

  // Notify shell
  try {
    execSync('powershell -command "& {$ shells = New-Object -ComObject Shell.Application; $shells.Windows() | ForEach-Object { $_.Refresh() }}"', { timeout: 2000, windowsHide: true })
  } catch {
    // Best effort
  }

  return { success: errors.length === 0, removed, errors }
}

// ─── Backup Operations ───────────────────────────────────────────────────────

export function backupUserData(options: BackupOptions): UninstallBackupInfo {
  const userData = app.getPath('userData')
  const home = app.getPath('home')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(app.getPath('temp'), `${PRODUCT_NAME}-backup`, timestamp)
  const items: string[] = []

  mkdirSync(backupPath, { recursive: true })

  if (options.exportSettings) {
    // Backup config files
    const configFiles = ['config.json', 'layout.json', 'providers.json', 'settings.json', 'keybindings.json', 'preferences.json']
    const settingsDir = join(backupPath, 'settings')
    mkdirSync(settingsDir, { recursive: true })

    for (const file of configFiles) {
      const src = join(userData, file)
      if (existsSync(src)) {
        try {
          copyFileSync(src, join(settingsDir, file))
          items.push(`settings/${file}`)
        } catch (err) {
          console.warn(`${LOG_PREFIX} Failed to backup ${file}:`, err)
        }
      }
    }

    // Backup ledger
    const ledgerPath = join(userData, 'ledger.json')
    if (existsSync(ledgerPath)) {
      try {
        copyFileSync(ledgerPath, join(settingsDir, 'ledger.json'))
        items.push('settings/ledger.json')
      } catch {
        console.warn(`${LOG_PREFIX} Failed to backup ledger.json`)
      }
    }
  }

  if (options.exportConfigs) {
    // Export AGENTIC.md files from workspaces
    const configsDir = join(backupPath, 'configs')
    mkdirSync(configsDir, { recursive: true })

    const workspacesDir = join(userData, 'workspaces')
    if (existsSync(workspacesDir)) {
      try {
        const entries = readdirSync(workspacesDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const agenticPath = join(workspacesDir, entry.name, 'AGENTIC.md')
            if (existsSync(agenticPath)) {
              try {
                const destDir = join(configsDir, entry.name)
                mkdirSync(destDir, { recursive: true })
                copyFileSync(agenticPath, join(destDir, 'AGENTIC.md'))
                items.push(`configs/${entry.name}/AGENTIC.md`)
              } catch {
                console.warn(`${LOG_PREFIX} Failed to backup AGENTIC.md for ${entry.name}`)
              }
            }
          }
        }
      } catch {
        console.warn(`${LOG_PREFIX} Failed to scan workspaces for AGENTIC.md files`)
      }
    }
  }

  if (options.exportWorkspaces) {
    const workspacesSrc = join(userData, 'workspaces')
    if (existsSync(workspacesSrc)) {
      const workspacesDest = join(backupPath, 'workspaces')
      try {
        copyDir(workspacesSrc, workspacesDest)
        items.push('workspaces/')
      } catch (err) {
        console.warn(`${LOG_PREFIX} Failed to backup workspaces:`, err)
      }
    }
  }

  // Write manifest
  const manifest = {
    product: PRODUCT_NAME,
    version: app.getVersion(),
    timestamp,
    items,
    options,
  }
  writeFileSync(join(backupPath, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')
  items.push('manifest.json')

  const totalSize = formatSize(getDirSize(backupPath))

  return { backupPath, timestamp, items, totalSize }
}

// ─── Rollback / Restore ─────────────────────────────────────────────────────

export function restoreBackup(backupPath: string): { success: boolean; restored: string[]; errors: string[] } {
  const restored: string[] = []
  const errors: string[] = []

  const manifestPath = join(backupPath, 'manifest.json')
  if (!existsSync(manifestPath)) {
    return { success: false, restored: [], errors: ['Backup manifest not found'] }
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    const userData = app.getPath('userData')

    // Restore settings
    const settingsDir = join(backupPath, 'settings')
    if (existsSync(settingsDir)) {
      const entries = readdirSync(settingsDir)
      for (const entry of entries) {
        try {
          const src = join(settingsDir, entry)
          const dest = join(userData, entry)
          copyFileSync(src, dest)
          restored.push(`settings/${entry}`)
        } catch (err) {
          errors.push(`Failed to restore ${entry}: ${err}`)
        }
      }
    }

    // Restore configs
    const configsDir = join(backupPath, 'configs')
    if (existsSync(configsDir)) {
      const projects = readdirSync(configsDir)
      for (const project of projects) {
        const projectDir = join(configsDir, project)
        if (statSync(projectDir).isDirectory()) {
          const agenticSrc = join(projectDir, 'AGENTIC.md')
          if (existsSync(agenticSrc)) {
            try {
              const destDir = join(userData, 'workspaces', project)
              if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
              copyFileSync(agenticSrc, join(destDir, 'AGENTIC.md'))
              restored.push(`configs/${project}/AGENTIC.md`)
            } catch (err) {
              errors.push(`Failed to restore config ${project}: ${err}`)
            }
          }
        }
      }
    }

    // Restore workspaces
    const workspacesDir = join(backupPath, 'workspaces')
    if (existsSync(workspacesDir)) {
      const dest = join(userData, 'workspaces')
      try {
        copyDir(workspacesDir, dest)
        restored.push('workspaces/')
      } catch (err) {
        errors.push(`Failed to restore workspaces: ${err}`)
      }
    }

    return { success: errors.length === 0, restored, errors }
  } catch (err) {
    return { success: false, restored, errors: [`Failed to parse manifest: ${err}`] }
  }
}

// ─── Feedback Collection ────────────────────────────────────────────────────

export function collectUninstallFeedback(reason: string, details?: string): void {
  const home = app.getPath('home')
  const feedbackDir = join(home, 'AppData', 'Roaming', PRODUCT_NAME)
  if (!existsSync(feedbackDir)) mkdirSync(feedbackDir, { recursive: true })

  const timestamp = new Date().toISOString()
  const feedbackEntry = {
    timestamp,
    version: app.getVersion(),
    reason,
    details: details || '',
  }

  const feedbackPath = join(feedbackDir, 'uninstall-feedback.json')
  let feedback: typeof feedbackEntry[] = []

  if (existsSync(feedbackPath)) {
    try {
      feedback = JSON.parse(readFileSync(feedbackPath, 'utf-8'))
    } catch {
      feedback = []
    }
  }

  feedback.push(feedbackEntry)

  // Keep last 10 entries
  if (feedback.length > 10) {
    feedback = feedback.slice(-10)
  }

  writeFileSync(feedbackPath, JSON.stringify(feedback, null, 2), 'utf-8')
  console.log(`${LOG_PREFIX} Uninstall feedback recorded`)
}

// ─── Get NSIS Uninstall Path ────────────────────────────────────────────────

function getNsisUninstallPath(): string | null {
  try {
    const keys = [
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AgenticOS',
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.agenticos.studio',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AgenticOS',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\com.agenticos.studio',
    ]

    for (const key of keys) {
      try {
        const result = execSync(`reg query "${key}" /v "UninstallString"`, {
          timeout: 3000,
          encoding: 'utf-8',
          windowsHide: true,
        })
        const match = result.match(/UninstallString\s+REG_SZ\s+(.+)/)
        if (match) {
          return match[1].trim().replace(/^"/, '').replace(/"$/, '')
        }
      } catch {
        // Try next key
      }
    }

    // Fallback: look in the app directory
    const nsisUninstaller = join(dirname(process.execPath), 'Uninstall AgenticOS.exe')
    if (existsSync(nsisUninstaller)) return nsisUninstaller

    return null
  } catch {
    return null
  }
}

// ─── IPC Handler Registration ───────────────────────────────────────────────

export function registerUninstallIpcHandlers(): void {
  // Detect all user data
  ipcMain.handle('uninstall:detect-data', async () => {
    return detectUserData()
  })

  // Perform removal with granular options
  ipcMain.handle(
    'uninstall:perform',
    async (
      _event,
      options: {
        settings: boolean
        cache: boolean
        logs: boolean
        workspaces: boolean
        sessions: boolean
        terminalHistory: boolean
        memoryDb: boolean
        localAiModels: boolean
        snapshots: boolean
      },
    ) => {
      return removeUserData(options)
    },
  )

  // Backup user data before uninstall
  ipcMain.handle(
    'uninstall:backup',
    async (
      _event,
      options: {
        exportSettings: boolean
        exportConfigs: boolean
        exportWorkspaces: boolean
      },
    ) => {
      return backupUserData(options)
    },
  )

  // Restore from a backup
  ipcMain.handle('uninstall:restore', async (_event, backupPath: string) => {
    return restoreBackup(backupPath)
  })

  // List available backups
  ipcMain.handle('uninstall:list-backups', async () => {
    const backupDir = join(app.getPath('temp'), `${PRODUCT_NAME}-backup`)
    if (!existsSync(backupDir)) return []

    try {
      return readdirSync(backupDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => {
          const manifestPath = join(backupDir, e.name, 'manifest.json')
          let manifest = null
          try {
            manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
          } catch {
            // No manifest
          }
          return {
            id: e.name,
            path: join(backupDir, e.name),
            timestamp: manifest?.timestamp || e.name,
            items: manifest?.items?.length || 0,
            totalSize: manifest ? formatSize(getDirSize(join(backupDir, e.name))) : 'Unknown',
          }
        })
        .sort((a, b) => b.id.localeCompare(a.id)) // Most recent first
    } catch {
      return []
    }
  })

  // Submit uninstall feedback
  ipcMain.handle('uninstall:feedback', async (_event, reason: string, details?: string) => {
    collectUninstallFeedback(reason, details)
    return { success: true }
  })

  // Open system uninstaller
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

  // Self-uninstall (launch NSIS uninstaller)
  ipcMain.handle('uninstall:self', async () => {
    try {
      if (process.platform === 'win32') {
        const { spawn } = await import('child_process')
        const uninstallPath = getNsisUninstallPath()
        if (uninstallPath) {
          spawn(uninstallPath, ['/S'], { detached: true, stdio: 'ignore' }).unref()
          console.log(`${LOG_PREFIX} Launched NSIS uninstaller: ${uninstallPath}`)
        } else {
          const nsisUninstaller = join(dirname(process.execPath), 'Uninstall AgenticOS.exe')
          if (existsSync(nsisUninstaller)) {
            spawn(nsisUninstaller, ['/S'], { detached: true, stdio: 'ignore' }).unref()
          } else {
            return {
              success: false,
              error: 'Uninstaller not found. Use Settings → Apps & Features to uninstall.',
            }
          }
        }
      } else if (process.platform === 'darwin') {
        const { spawn } = await import('child_process')
        spawn(
          'osascript',
          [
            '-e',
            'tell application "Finder" to delete POSIX file "/Applications/AgenticOS.app"',
          ],
          { detached: true, stdio: 'ignore' },
        ).unref()
      } else {
        // Linux
        const { spawn } = await import('child_process')
        const uninstallScript = '/usr/local/bin/agenticos-uninstall'
        if (existsSync(uninstallScript)) {
          spawn(uninstallScript, [], { detached: true, stdio: 'ignore' }).unref()
        }
      }

      app.exit(0)
      return { success: true }
    } catch (err) {
      console.error(`${LOG_PREFIX} Error during self-uninstall:`, err)
      return { success: false, error: String(err) }
    }
  })

  // Check for existing installation
  ipcMain.handle('uninstall:check-existing', async () => {
    const result = {
      exists: false,
      version: '',
      installPath: '',
      userDataSize: '',
    }

    try {
      const keys = [
        'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AgenticOS',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AgenticOS',
      ]

      for (const key of keys) {
        try {
          const verResult = execSync(`reg query "${key}" /v "DisplayVersion"`, {
            timeout: 2000,
            encoding: 'utf-8',
            windowsHide: true,
          })
          const verMatch = verResult.match(/DisplayVersion\s+REG_SZ\s+(.+)/)
          if (verMatch) {
            result.exists = true
            result.version = verMatch[1].trim()
          }

          const pathResult = execSync(`reg query "${key}" /v "InstallLocation"`, {
            timeout: 2000,
            encoding: 'utf-8',
            windowsHide: true,
          })
          const pathMatch = pathResult.match(/InstallLocation\s+REG_SZ\s+(.+)/)
          if (pathMatch) {
            result.installPath = pathMatch[1].trim()
          }
        } catch {
          // Try next key
        }
      }

      const userData = app.getPath('userData')
      if (existsSync(userData)) {
        result.userDataSize = formatSize(getDirSize(userData))
      }
    } catch {
      // Non-existent
    }

    return result
  })

  // Toggle auto-launch on startup
  ipcMain.handle('uninstall:set-auto-launch', async (_event, enable: boolean) => {
    try {
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
