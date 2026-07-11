/**
 * PersonaLoader — discovers and loads persona preset files.
 *
 * Scans the following locations in order:
 *   1. Built-in defaults (always available, no filesystem access needed)
 *   2. User directory: ~/.agentic/presets/*.md
 *   3. Project directory: <root>/.agentic/presets/*.md
 *
 * Built-in personas are always included. Filesystem personas override
 * builtins with the same ID (so users can customize built-in presets).
 */

import { isTauri } from '@/runtime/environment'
import { withTimeoutFallback } from '@/runtime/with-timeout'
import {
  type Persona,
  BUILTIN_PERSONAS,
  NO_STYLE_PERSONA,
  parsePersonaMarkdown,
  personaIdFromFilename,
} from './PersonaTypes'

export class PersonaLoader {
  private static instance: PersonaLoader
  private cachedPersonas: Persona[] | null = null
  private cacheDurationMs = 10_000
  private lastLoadTime = 0
  private readTimeoutMs = 3_000

  static getInstance(): PersonaLoader {
    if (!PersonaLoader.instance) {
      PersonaLoader.instance = new PersonaLoader()
    }
    return PersonaLoader.instance
  }

  /**
   * Load all available personas — builtins + user + project.
   * Results are cached for cacheDurationMs.
   */
  async load(rootPath?: string | null): Promise<Persona[]> {
    const now = Date.now()
    if (this.cachedPersonas && now - this.lastLoadTime < this.cacheDurationMs) {
      return this.cachedPersonas
    }

    const personas = new Map<string, Persona>()

    // 1. Built-in personas (lowest priority)
    for (const p of BUILTIN_PERSONAS) {
      personas.set(p.id, p)
    }

    // 2. User-level personas (~/.agentic/presets/*.md)
    const userDir = this.getUserPresetsDir()
    if (userDir) {
      const userPersonas = await this.loadDirectory(userDir, 'user')
      for (const p of userPersonas) {
        personas.set(p.id, p) // overwrites builtins
      }
    }

    // 3. Project-level personas (<root>/.agentic/presets/*.md)
    if (rootPath) {
      const projectDir = `${rootPath}/.agentic/presets`
      const projectPersonas = await this.loadDirectory(projectDir, 'project')
      for (const p of projectPersonas) {
        personas.set(p.id, p) // overwrites user & builtins (highest priority)
      }
    }

    const result = [NO_STYLE_PERSONA, ...personas.values()]
    this.cachedPersonas = result
    this.lastLoadTime = now
    return result
  }

  /**
   * Load a single persona by ID. Returns the No Style persona if not found.
   */
  async loadById(id: string, rootPath?: string | null): Promise<Persona> {
    const all = await this.load(rootPath)
    return all.find((p) => p.id === id) ?? NO_STYLE_PERSONA
  }

  /**
   * Invalidate the cache so the next load() re-reads from disk.
   */
  invalidateCache(): void {
    this.cachedPersonas = null
    this.lastLoadTime = 0
  }

  // ── Private ──

  private getUserPresetsDir(): string | null {
    try {
      const home =
        typeof process !== 'undefined'
          ? process.env.HOME || process.env.USERPROFILE
          : null
      if (!home) return null
      return `${home}/.agentic/presets`
    } catch {
      return null
    }
  }

  private async loadDirectory(
    dir: string,
    source: Persona['source'],
  ): Promise<Persona[]> {
    const env = isTauri() ? 'tauri' : 'browser'
    if (env === 'browser') return []

    try {
      // Dynamic import for filesystem access
      const { readDir, readTextFile } = await import('@/lib/electron-api')

      const entries = await withTimeoutFallback(
        readDir(dir),
        `read presets dir: ${dir}`,
        [],
        this.readTimeoutMs,
      )

      if (!entries || entries.length === 0) return []

      const personas: Persona[] = []

      for (const entry of entries) {
        if (!entry.name || !entry.name.endsWith('.md')) continue

        const filePath = `${dir}/${entry.name}`
        const content = await withTimeoutFallback(
          readTextFile(filePath),
          `read persona: ${filePath}`,
          null,
          this.readTimeoutMs,
        )

        if (!content) continue

        try {
          const persona = parsePersonaMarkdown(content, source, filePath)
          personas.push(persona)
        } catch (err) {
          console.warn(`[PersonaLoader] Failed to parse persona ${filePath}:`, err)
        }
      }

      return personas
    } catch {
      return []
    }
  }
}

/** Singleton instance */
export const personaLoader = PersonaLoader.getInstance()
