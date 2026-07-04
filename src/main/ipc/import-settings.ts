import { ipcMain, app } from 'electron'
import { existsSync, readFileSync, statSync } from 'fs'
import { join, resolve, normalize } from 'path'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DetectedSource {
  id: 'vscode' | 'cursor' | 'claude-desktop'
  name: string
  icon: string
  detected: boolean
  configFiles: ConfigFileInfo[]
  providerCount?: number
  mcpServerCount?: number
}

export interface ConfigFileInfo {
  path: string
  name: string
  exists: boolean
  size: number
  description: string
}

export interface ImportedSettings {
  source: string
  providers?: Array<{
    name: string
    baseUrl: string
    apiKey: string
    models: string[]
  }>
  mcpServers?: Array<{
    name: string
    command: string
    args: string[]
  }>
  editorSettings?: Record<string, unknown>
  keybindings?: Record<string, unknown>[]
  theme?: string
  fontSize?: number
}

export interface SettingsScanResult {
  sources: DetectedSource[]
  hasImportableData: boolean
}

// ─── Path Helpers ───────────────────────────────────────────────────────────

function getAppDataPath(): string {
  return process.env.APPDATA || join(app.getPath('home'), 'AppData', 'Roaming')
}

void function getLocalAppDataPath(): string {
  return process.env.LOCALAPPDATA || join(app.getPath('home'), 'AppData', 'Local')
}

// ─── VS Code Detection ──────────────────────────────────────────────────────

function detectVSCode(): DetectedSource {
  const userDir = join(getAppDataPath(), 'Code', 'User')
  const configFiles: ConfigFileInfo[] = []

  const settingsPath = join(userDir, 'settings.json')
  const keybindingsPath = join(userDir, 'keybindings.json')

  if (existsSync(settingsPath)) {
    const s = statSync(settingsPath)
    configFiles.push({
      path: settingsPath,
      name: 'settings.json',
      exists: true,
      size: s.size,
      description: 'Editor settings (theme, font, preferences)',
    })
  }

  if (existsSync(keybindingsPath)) {
    const s = statSync(keybindingsPath)
    configFiles.push({
      path: keybindingsPath,
      name: 'keybindings.json',
      exists: true,
      size: s.size,
      description: 'Keyboard shortcuts configuration',
    })
  }

  return {
    id: 'vscode',
    name: 'VS Code',
    icon: 'vscode',
    detected: configFiles.length > 0,
    configFiles,
  }
}

// ─── Cursor Detection ───────────────────────────────────────────────────────

function detectCursor(): DetectedSource {
  const userDir = join(getAppDataPath(), 'Cursor', 'User')
  const configFiles: ConfigFileInfo[] = []

  const settingsPath = join(userDir, 'settings.json')
  const keybindingsPath = join(userDir, 'keybindings.json')

  if (existsSync(settingsPath)) {
    const s = statSync(settingsPath)
    configFiles.push({
      path: settingsPath,
      name: 'settings.json',
      exists: true,
      size: s.size,
      description: 'Editor settings (theme, font, preferences)',
    })
  }

  if (existsSync(keybindingsPath)) {
    const s = statSync(keybindingsPath)
    configFiles.push({
      path: keybindingsPath,
      name: 'keybindings.json',
      exists: true,
      size: s.size,
      description: 'Keyboard shortcuts configuration',
    })
  }

  return {
    id: 'cursor',
    name: 'Cursor',
    icon: 'cursor',
    detected: configFiles.length > 0,
    configFiles,
  }
}

// ─── Claude Desktop Detection ───────────────────────────────────────────────

function detectClaudeDesktop(): DetectedSource {
  const configDir = join(getAppDataPath(), 'Claude')
  const configFiles: ConfigFileInfo[] = []
  let providerCount = 0
  let mcpServerCount = 0

  const configPath = join(configDir, 'claude_desktop_config.json')
  if (existsSync(configPath)) {
    const s = statSync(configPath)
    configFiles.push({
      path: configPath,
      name: 'claude_desktop_config.json',
      exists: true,
      size: s.size,
      description: 'Claude Desktop configuration (providers, MCP servers)',
    })

    try {
      const raw = readFileSync(configPath, 'utf-8')
      const parsed = JSON.parse(raw)

      // Count providers — Claude config has API keys in various places
      if (parsed.anthropic?.apiKey) providerCount++
      if (parsed.openai?.apiKey) providerCount++
      if (parsed.providers && Array.isArray(parsed.providers)) {
        providerCount += parsed.providers.filter((p: any) => p.apiKey).length
      }

      // Count MCP servers
      if (parsed.mcpServers && Array.isArray(parsed.mcpServers)) {
        mcpServerCount = parsed.mcpServers.length
      } else if (parsed.mcp_servers && typeof parsed.mcp_servers === 'object') {
        mcpServerCount = Object.keys(parsed.mcp_servers).length
      } else if (parsed.mcp?.servers && Array.isArray(parsed.mcp.servers)) {
        mcpServerCount = parsed.mcp.servers.length
      }
    } catch {
      // Invalid JSON, ignore
    }
  }

  return {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    icon: 'claude',
    detected: configFiles.length > 0,
    configFiles,
    providerCount,
    mcpServerCount,
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

function scanSettings(): SettingsScanResult {
  const sources = [detectVSCode(), detectCursor(), detectClaudeDesktop()]
  return {
    sources,
    hasImportableData: sources.some((s) => s.detected),
  }
}

function importFromClaudeDesktop(): ImportedSettings | null {
  const configPath = join(getAppDataPath(), 'Claude', 'claude_desktop_config.json')
  if (!existsSync(configPath)) return null

  try {
    const raw = readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw)

    const providers: ImportedSettings['providers'] = []
    const mcpServers: ImportedSettings['mcpServers'] = []

    // Extract provider API keys
    if (config.anthropic?.apiKey) {
      providers.push({
        name: 'Anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: config.anthropic.apiKey,
        models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514'],
      })
    }

    if (config.openai?.apiKey) {
      providers.push({
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: config.openai.apiKey,
        models: ['gpt-4o', 'gpt-4o-mini'],
      })
    }

    if (config.providers && Array.isArray(config.providers)) {
      for (const p of config.providers) {
        if (p.apiKey) {
          providers.push({
            name: p.name || 'Imported Provider',
            baseUrl: p.baseUrl || p.endpoint || '',
            apiKey: p.apiKey,
            models: p.models || [],
          })
        }
      }
    }

    // Extract MCP servers
    if (config.mcpServers && Array.isArray(config.mcpServers)) {
      for (const server of config.mcpServers) {
        mcpServers.push({
          name: server.name || server.id || 'MCP Server',
          command: server.command || '',
          args: server.args || [],
        })
      }
    } else if (config.mcp_servers && typeof config.mcp_servers === 'object') {
      for (const [name, server] of Object.entries(config.mcp_servers)) {
        const s = server as any
        mcpServers.push({
          name: name,
          command: s.command || '',
          args: s.args || [],
        })
      }
    } else if (config.mcp?.servers && Array.isArray(config.mcp.servers)) {
      for (const server of config.mcp.servers) {
        mcpServers.push({
          name: server.name || 'MCP Server',
          command: server.command || '',
          args: server.args || [],
        })
      }
    }

    return {
      source: 'claude-desktop',
      providers: providers.length > 0 ? providers : undefined,
      mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
    }
  } catch {
    return null
  }
}

function importFromVSCode(): ImportedSettings | null {
  const settingsPath = join(getAppDataPath(), 'Code', 'User', 'settings.json')
  if (!existsSync(settingsPath)) return null

  try {
    const raw = readFileSync(settingsPath, 'utf-8')
    const settings = JSON.parse(raw)
    const editorSettings: Record<string, unknown> = {}

    // Extract useful editor settings
    const relevantKeys = [
      'workbench.colorTheme',
      'editor.fontSize',
      'editor.fontFamily',
      'editor.fontWeight',
      'editor.lineHeight',
      'editor.tabSize',
      'editor.wordWrap',
      'editor.minimap.enabled',
      'workbench.startupEditor',
      'editor.formatOnSave',
      'editor.renderWhitespace',
      'editor.cursorStyle',
      'files.autoSave',
      'terminal.integrated.fontSize',
      'terminal.integrated.fontFamily',
    ]

    for (const key of relevantKeys) {
      if (settings[key] !== undefined) {
        editorSettings[key] = settings[key]
      }
    }

    // Extract explicit values for quick display
    const theme = settings['workbench.colorTheme'] as string | undefined
    const fontSize = settings['editor.fontSize'] as number | undefined
    void settings['editor.fontFamily']

    return {
      source: 'vscode',
      editorSettings,
      theme,
      fontSize,
    }
  } catch {
    return null
  }
}

function importFromCursor(): ImportedSettings | null {
  const settingsPath = join(getAppDataPath(), 'Cursor', 'User', 'settings.json')
  if (!existsSync(settingsPath)) return null

  try {
    const raw = readFileSync(settingsPath, 'utf-8')
    const settings = JSON.parse(raw)
    const editorSettings: Record<string, unknown> = {}

    const relevantKeys = [
      'workbench.colorTheme',
      'editor.fontSize',
      'editor.fontFamily',
      'editor.fontWeight',
      'editor.lineHeight',
      'editor.tabSize',
      'editor.wordWrap',
      'editor.formatOnSave',
      'files.autoSave',
      'terminal.integrated.fontSize',
    ]

    for (const key of relevantKeys) {
      if (settings[key] !== undefined) {
        editorSettings[key] = settings[key]
      }
    }

    const theme = settings['workbench.colorTheme'] as string | undefined
    const fontSize = settings['editor.fontSize'] as number | undefined

    return {
      source: 'cursor',
      editorSettings,
      theme,
      fontSize,
    }
  } catch {
    return null
  }
}

// ─── IPC Handler Registration ──────────────────────────────────────────────

export function registerImportSettingsHandlers(): void {
  ipcMain.handle('import-settings:scan', async () => {
    return scanSettings()
  })

  ipcMain.handle('import-settings:read', async (_event, sourceId: string) => {
    switch (sourceId) {
      case 'vscode':
        return importFromVSCode()
      case 'cursor':
        return importFromCursor()
      case 'claude-desktop':
        return importFromClaudeDesktop()
      default:
        return null
    }
  })

  ipcMain.handle('import-settings:read-file', async (_event, filePath: string) => {
    try {
      if (typeof filePath !== 'string' || !filePath) return null

      // Restrict reads to known config directories only
      const appData = getAppDataPath()
      const resolved = resolve(normalize(filePath))
      const allowedPrefixes = [
        join(appData, 'Code', 'User'),
        join(appData, 'Cursor', 'User'),
        join(appData, 'Claude'),
      ]

      const isAllowed = allowedPrefixes.some((prefix) => resolved.startsWith(prefix))
      if (!isAllowed) {
        console.warn(`[ImportSettings] Blocked read of unauthorized path: ${resolved}`)
        return null
      }

      if (!existsSync(resolved)) return null
      const content = readFileSync(resolved, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  })
}
