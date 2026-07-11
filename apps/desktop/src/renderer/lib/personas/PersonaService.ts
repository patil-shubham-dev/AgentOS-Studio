/**
 * PersonaService — CRUD operations for persona preset files on disk.
 *
 * Handles:
 *   - Creating the .agentic/presets/ directory structure
 *   - Writing persona .md files with YAML frontmatter
 *   - Deleting persona files
 *   - Generating the raw markdown from a Persona object
 */

import { isTauri } from '@/runtime/environment'
import { withTimeoutFallback } from '@/runtime/with-timeout'
import type { Persona } from './PersonaTypes'

export class PersonaService {
  private static instance: PersonaService

  static getInstance(): PersonaService {
    if (!PersonaService.instance) {
      PersonaService.instance = new PersonaService()
    }
    return PersonaService.instance
  }

  /**
   * Generate the full markdown content for a persona, including YAML frontmatter.
   */
  toMarkdown(persona: {
    name: string
    description: string
    tags: string[]
    instruction: string
  }): string {
    const tagsStr = persona.tags.length > 0
      ? `tags: [${persona.tags.map((t) => `"${t}"`).join(', ')}]\n`
      : ''
    return `---
name: "${persona.name}"
description: "${persona.description}"
${tagsStr}---
${persona.instruction}
`.trimStart()
  }

  /**
   * Get the user-level presets directory path.
   */
  getUserPresetsDir(): string | null {
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

  /**
   * Generate a unique filename for a new persona.
   */
  toFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) + '.md'
  }

  /**
   * Create a new persona file on disk in the user presets directory.
   * Returns the created Persona or null on failure.
   */
  async create(
    name: string,
    description: string,
    tags: string[],
    instruction: string,
  ): Promise<Persona | null> {
    const dir = this.getUserPresetsDir()
    if (!dir) return null

    const env = isTauri() ? 'tauri' : 'browser'
    if (env === 'browser') return null

    try {
      const { createDir, writeTextFile } = await import('@/lib/electron-api')

      // Ensure directory exists
      await withTimeoutFallback(
        createDir(dir, { recursive: true }),
        `create presets dir: ${dir}`,
        undefined,
        this.readTimeoutMs,
      ).catch(() => {
        // Directory may already exist
      })

      const filename = this.toFilename(name)
      const filePath = `${dir}/${filename}`
      const content = this.toMarkdown({ name, description, tags, instruction })

      await withTimeoutFallback(
        writeTextFile(filePath, content),
        `write persona: ${filePath}`,
        undefined,
        this.readTimeoutMs,
      )

      return {
        id: filename.replace(/\.md$/i, ''),
        name,
        description,
        tags,
        instruction,
        source: 'user',
        filePath,
      }
    } catch (err) {
      console.error('[PersonaService] Failed to create persona:', err)
      return null
    }
  }

  /**
   * Update an existing persona file on disk.
   */
  async update(persona: Persona): Promise<boolean> {
    if (persona.source !== 'user' && persona.source !== 'project') return false
    if (!persona.filePath) return false

    const env = isTauri() ? 'tauri' : 'browser'
    if (env === 'browser') return false

    try {
      const { writeTextFile } = await import('@/lib/electron-api')
      const content = this.toMarkdown({
        name: persona.name,
        description: persona.description,
        tags: persona.tags,
        instruction: persona.instruction,
      })

      await withTimeoutFallback(
        writeTextFile(persona.filePath, content),
        `update persona: ${persona.filePath}`,
        undefined,
        this.readTimeoutMs,
      )

      return true
    } catch (err) {
      console.error('[PersonaService] Failed to update persona:', err)
      return false
    }
  }

  /**
   * Delete a persona file from disk.
   */
  async delete(persona: Persona): Promise<boolean> {
    if (persona.source !== 'user') return false // Can only delete user personas

    const env = isTauri() ? 'tauri' : 'browser'
    if (env === 'browser') return false

    try {
      const { removeFile } = await import('@/lib/electron-api')

      await withTimeoutFallback(
        removeFile(persona.filePath),
        `delete persona: ${persona.filePath}`,
        undefined,
        this.readTimeoutMs,
      )

      return true
    } catch (err) {
      console.error('[PersonaService] Failed to delete persona:', err)
      return false
    }
  }

  private readTimeoutMs = 5_000
}

/** Singleton instance */
export const personaService = PersonaService.getInstance()
