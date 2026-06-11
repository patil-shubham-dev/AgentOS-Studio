/**
 * Hierarchical memory system — inspired by Claude Code's MEMORY.md + auto-memory.
 *
 * Memory hierarchy (checked in order, first found wins):
 *   1. Session memory — in-memory only, lasts one session
 *   2. Project memory — `.agentic/memory.md` in the project root
 *   3. User memory — `~/.agentic/memory.md` (global across all projects)
 *   4. Team memory — `.agentic/team-memory.md` (shared in git repo)
 *
 * Auto-memory: After each task, automatically extracts key facts and stores them.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'

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

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager()
    }
    return MemoryManager.instance
  }

  initialize(projectRoot: string): void {
    this.projectRoot = projectRoot
    this.initialized = true
  }

  private getProjectMemoryDir(): string | null {
    if (!this.projectRoot) return null
    const dir = join(this.projectRoot, '.agentic')
    if (!existsSync(dir)) {
      try { mkdirSync(dir, { recursive: true }) } catch { return null }
    }
    return dir
  }

  private getUserMemoryDir(): string {
    const dir = join(homedir(), '.agentic')
    if (!existsSync(dir)) {
      try { mkdirSync(dir, { recursive: true } ) } catch {}
    }
    return dir
  }

  private readMemoryFile(filePath: string): string {
    try {
      if (existsSync(filePath)) return readFileSync(filePath, 'utf-8').trim()
    } catch {}
    return ''
  }

  private writeMemoryFile(filePath: string, content: string): void {
    try {
      const dir = dirname(filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(filePath, content, 'utf-8')
    } catch {}
  }

  private appendMemoryFile(filePath: string, content: string): void {
    try {
      appendFileSync(filePath, '\n' + content, 'utf-8')
    } catch {}
  }

  /**
   * Load MEMORY.md hierarchy
   */
  loadMemoryHierarchy(): MemoryLoadResult {
    const allEntries: MemoryEntry[] = []
    const now = Date.now()

    // 1. Team memory (.agentic/team-memory.md)
    const teamDir = this.getProjectMemoryDir()
    if (teamDir) {
      const teamContent = this.readMemoryFile(join(teamDir, 'team-memory.md'))
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

    // 2. Project memory (MEMORY.md in project root)
    if (this.projectRoot) {
      const projectContent = this.readMemoryFile(join(this.projectRoot, 'MEMORY.md'))
        || this.readMemoryFile(join(this.projectRoot, '.agentic', 'memory.md'))
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

    // 3. User memory (~/.agentic/memory.md)
    const userContent = this.readMemoryFile(join(this.getUserMemoryDir(), 'memory.md'))
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

    // 4. Session memory
    for (const [, entry] of this.sessionMemory) {
      allEntries.push(entry)
    }

    // 5. Auto-memory (persistent key-value pairs)
    if (teamDir) {
      const autoContent = this.readMemoryFile(join(teamDir, AUTO_MEMORY_FILE))
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

  /**
   * Format memory for system prompt
   */
  formatForPrompt(): string {
    const result = this.loadMemoryHierarchy()
    if (!result.combined) return ''

    return `<saved_knowledge>\n${result.combined}\n</saved_knowledge>`
  }

  /**
   * Store a memory entry
   */
  storeMemory(key: string, value: string, scope: 'task' | 'session' | 'permanent' = 'session', tags: string[] = []): void {
    const entry: MemoryEntry = {
      key, value, source: 'auto', scope, timestamp: Date.now(), tags,
    }
    this.sessionMemory.set(key, entry)

    // Persist permanent memories to .agentic-memory.json
    if (scope === 'permanent' && this.projectRoot) {
      const dir = this.getProjectMemoryDir()
      if (dir) {
        const filePath = join(dir, AUTO_MEMORY_FILE)
        let existing: any[] = []
        try {
          existing = JSON.parse(this.readMemoryFile(filePath) || '[]')
        } catch {}
        const existingIdx = existing.findIndex((e: any) => e.key === key)
        const newEntry = { key, value: entry.value, scope, timestamp: entry.timestamp, tags }
        if (existingIdx >= 0) {
          existing[existingIdx] = newEntry
        } else {
          existing.push(newEntry)
        }
        this.writeMemoryFile(filePath, JSON.stringify(existing, null, 2))
      }
    }
  }

  /**
   * Auto-extract memory from task result — called after task completion
   * Uses simple pattern extraction (would use LLM in production)
   */
  extractAutoMemory(taskInput: string, taskResult: string): MemoryEntry[] {
    const extracted: MemoryEntry[] = []
    const now = Date.now()

    // Extract key-value patterns like "key: value" from the result
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

    // Store build commands, test commands etc.
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

  /**
   * Extract structured memory using LLM analysis
   */
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

  getMemoryByTag(tag: string): MemoryEntry[] {
    const result = this.loadMemoryHierarchy()
    return result.entries.filter(e => e.tags.includes(tag))
  }

  getMemoryStats(): { totalEntries: number; sessionEntries: number; autoEntries: number; persistentEntries: number } {
    const result = this.loadMemoryHierarchy()
    return {
      totalEntries: result.entries.length,
      sessionEntries: this.sessionMemory.size,
      autoEntries: result.entries.filter(e => e.source === 'auto').length,
      persistentEntries: result.entries.filter(e => e.scope === 'permanent').length,
    }
  }
}
