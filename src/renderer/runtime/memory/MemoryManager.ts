import { join, dirname } from 'path'
import { exists, readTextFile, writeTextFile, mkdir } from '@/lib/tauri-shims/fs'
import { invoke } from '@/lib/tauri-shims/core'

export interface MemoryEntry {
  key: string
  value: string
  source: 'session' | 'project' | 'user' | 'team' | 'auto'
  scope: 'task' | 'session' | 'permanent'
  timestamp: number
  tags: string[]
}

export interface MemoryLoadResult {
  entries: MemoryEntry[]
  combined: string
}

const AUTO_MEMORY_FILE = '.agentic-memory.json'

export class MemoryManager {
  private static instance: MemoryManager
  private sessionMemory: Map<string, MemoryEntry> = new Map()
  private projectRoot: string | null = null
  private initialized = false
  private homeDir: string | null = null
  private cachedHierarchy: MemoryLoadResult | null = null

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager()
    }
    return MemoryManager.instance
  }

  async initialize(projectRoot: string): Promise<void> {
    this.projectRoot = projectRoot
    this.initialized = true
    const paths = await invoke('get_app_paths') as { home: string }
    this.homeDir = paths.home
    this.cachedHierarchy = await this.doLoadMemoryHierarchy()
  }

  private async ensureDir(dir: string): Promise<boolean> {
    const dirExists = await exists(dir)
    if (!dirExists) {
      try {
        await mkdir(dir)
        return true
      } catch {
        return false
      }
    }
    return true
  }

  private async getProjectMemoryDir(): Promise<string | null> {
    if (!this.projectRoot) return null
    const dir = join(this.projectRoot, '.agentic')
    const ok = await this.ensureDir(dir)
    return ok ? dir : null
  }

  private async getUserMemoryDir(): Promise<string> {
    const dir = join(this.homeDir ?? '', '.agentic')
    await this.ensureDir(dir)
    return dir
  }

  private async readMemoryFile(filePath: string): Promise<string> {
    try {
      const fileExists = await exists(filePath)
      if (fileExists) return (await readTextFile(filePath)).trim()
    } catch {}
    return ''
  }

  private async writeMemoryFile(filePath: string, content: string): Promise<void> {
    try {
      const d = dirname(filePath)
      await this.ensureDir(d)
      await writeTextFile(filePath, content)
    } catch {}
  }

  private async appendMemoryFile(filePath: string, content: string): Promise<void> {
    try {
      const existing = await this.readMemoryFile(filePath)
      await this.writeMemoryFile(filePath, existing ? existing + '\n' + content : content)
    } catch {}
  }

  private async doLoadMemoryHierarchy(): Promise<MemoryLoadResult> {
    const allEntries: MemoryEntry[] = []
    const now = Date.now()

    const teamDir = await this.getProjectMemoryDir()
    if (teamDir) {
      const teamContent = await this.readMemoryFile(join(teamDir, 'team-memory.md'))
      if (teamContent) {
        allEntries.push({
          key: 'team-memory',
          value: teamContent,
          source: 'team',
          scope: 'permanent',
          timestamp: now,
          tags: ['team', 'permanent'],
        })
      }
    }

    if (this.projectRoot) {
      const projectContent = (await this.readMemoryFile(join(this.projectRoot, 'MEMORY.md')))
        || (await this.readMemoryFile(join(this.projectRoot, '.agentic', 'memory.md')))
      if (projectContent) {
        allEntries.push({
          key: 'project-memory',
          value: projectContent,
          source: 'project',
          scope: 'permanent',
          timestamp: now,
          tags: ['project', 'permanent'],
        })
      }
    }

    const userDir = await this.getUserMemoryDir()
    const userContent = await this.readMemoryFile(join(userDir, 'memory.md'))
    if (userContent) {
      allEntries.push({
        key: 'user-memory',
        value: userContent,
        source: 'user',
        scope: 'permanent',
        timestamp: now,
        tags: ['user', 'permanent'],
      })
    }

    for (const [, entry] of this.sessionMemory) {
      allEntries.push(entry)
    }

    if (teamDir) {
      const autoContent = await this.readMemoryFile(join(teamDir, AUTO_MEMORY_FILE))
      if (autoContent) {
        try {
          const autoEntries = JSON.parse(autoContent)
          if (Array.isArray(autoEntries)) {
            for (const ae of autoEntries) {
              allEntries.push({
                key: ae.key,
                value: ae.value,
                source: 'auto',
                scope: ae.scope || 'session',
                timestamp: ae.timestamp || now,
                tags: ae.tags || ['auto'],
              })
            }
          }
        } catch {}
      }
    }

    const combined = allEntries
      .filter(e => e.scope !== 'task')
      .sort((a, b) => {
        const priority = { permanent: 0, session: 1, task: 2 }
        return (priority[a.scope] ?? 0) - (priority[b.scope] ?? 0)
      })
      .map(e => `[${e.source}] ${e.key}: ${e.value}`)
      .join('\n\n')

    return { entries: allEntries, combined }
  }

  async loadMemoryHierarchy(): Promise<MemoryLoadResult> {
    this.cachedHierarchy = await this.doLoadMemoryHierarchy()
    return this.cachedHierarchy
  }

  async formatForPrompt(): Promise<string> {
    const result = await this.loadMemoryHierarchy()
    if (!result.combined) return ''
    return `<saved_knowledge>\n${result.combined}\n</saved_knowledge>`
  }

  async storeMemory(key: string, value: string, scope: 'task' | 'session' | 'permanent' = 'session', tags: string[] = []): Promise<void> {
    const entry: MemoryEntry = {
      key, value, source: 'auto', scope, timestamp: Date.now(), tags,
    }
    this.sessionMemory.set(key, entry)

    if (scope === 'permanent' && this.projectRoot) {
      const dir = await this.getProjectMemoryDir()
      if (dir) {
        const filePath = join(dir, AUTO_MEMORY_FILE)
        let existing: any[] = []
        try {
          existing = JSON.parse(await this.readMemoryFile(filePath) || '[]')
        } catch {}
        const existingIdx = existing.findIndex((e: any) => e.key === key)
        const newEntry = { key, value: entry.value, scope, timestamp: entry.timestamp, tags }
        if (existingIdx >= 0) {
          existing[existingIdx] = newEntry
        } else {
          existing.push(newEntry)
        }
        await this.writeMemoryFile(filePath, JSON.stringify(existing, null, 2))
      }
    }
  }

  extractAutoMemory(taskInput: string, taskResult: string): MemoryEntry[] {
    const extracted: MemoryEntry[] = []
    const now = Date.now()

    const kvPattern = /[-*]\s*\*\*(.+?)\*\*\s*[::]\s*(.+)/g
    let match
    while ((match = kvPattern.exec(taskResult)) !== null) {
      const key = match[1].trim().toLowerCase().replace(/\s+/g, '-')
      const value = match[2].trim()
      if (key.length > 2 && value.length > 5 && key.length < 80) {
        extracted.push({
          key: `auto:${key}`,
          value,
          source: 'auto',
          scope: 'session',
          timestamp: now,
          tags: ['auto-extracted'],
        })
        this.sessionMemory.set(`auto:${key}`, extracted[extracted.length - 1])
      }
    }

    if (taskInput.toLowerCase().includes('build') && taskResult.toLowerCase().includes('command')) {
      const cmdMatch = taskResult.match(/`([^`]+)`/)
      if (cmdMatch) {
        extracted.push({
          key: 'auto:build-command',
          value: `Build command: ${cmdMatch[1]}`,
          source: 'auto',
          scope: 'session',
          timestamp: now,
          tags: ['auto-extracted', 'build'],
        })
        this.sessionMemory.set('auto:build-command', extracted[extracted.length - 1])
      }
    }

    return extracted
  }

  async extractStructuredMemory(taskInput: string, taskResult: string): Promise<MemoryEntry[]> {
    const extracted = this.extractAutoMemory(taskInput, taskResult)
    return extracted
  }

  getSessionMemory(): MemoryEntry[] {
    return Array.from(this.sessionMemory.values())
  }

  clearSessionMemory(): void {
    this.sessionMemory.clear()
  }

  async getMemoryByTag(tag: string): Promise<MemoryEntry[]> {
    const result = await this.loadMemoryHierarchy()
    return result.entries.filter(e => e.tags.includes(tag))
  }

  getCachedMemoryStats(): { totalEntries: number; sessionEntries: number; autoEntries: number; persistentEntries: number } {
    const result = this.cachedHierarchy
    if (!result) {
      return { totalEntries: 0, sessionEntries: this.sessionMemory.size, autoEntries: 0, persistentEntries: 0 }
    }
    return {
      totalEntries: result.entries.length,
      sessionEntries: this.sessionMemory.size,
      autoEntries: result.entries.filter(e => e.source === 'auto').length,
      persistentEntries: result.entries.filter(e => e.scope === 'permanent').length,
    }
  }

  async getMemoryStats(): Promise<{ totalEntries: number; sessionEntries: number; autoEntries: number; persistentEntries: number }> {
    const result = this.cachedHierarchy ?? await this.loadMemoryHierarchy()
    return {
      totalEntries: result.entries.length,
      sessionEntries: this.sessionMemory.size,
      autoEntries: result.entries.filter(e => e.source === 'auto').length,
      persistentEntries: result.entries.filter(e => e.scope === 'permanent').length,
    }
  }
}
