import { join, basename, extname } from 'path'
import { SkillRegistry, type SkillDefinition } from './SkillRegistry'
import { explainCodeSkill } from './bundled/explain-code.skill'
import { fixBugSkill } from './bundled/fix-bug.skill'
import { addTestsSkill } from './bundled/add-tests.skill'
import { codeReviewSkill } from './bundled/code-review.skill'
import { batchParallelSkill } from './bundled/batch-parallel.skill'

let electronApi: Promise<typeof import("@/lib/electron-api")> | undefined
async function getElectronApi() {
  if (!electronApi) electronApi = import("@/lib/electron-api")
  return electronApi
}

export class SkillLoader {
  private registry: SkillRegistry
  private homeDirPromise: Promise<string> | null = null

  constructor(registry: SkillRegistry) {
    this.registry = registry
  }

  private async getHomeDir(): Promise<string> {
    if (!this.homeDirPromise) {
      this.homeDirPromise = (async () => {
        const { invoke } = await getElectronApi()
        const paths = await invoke('get_app_paths') as { home: string }
        return paths.home
      })()
    }
    return this.homeDirPromise
  }

  parseSkillFile(content: string, filePath?: string, homeDir?: string): SkillDefinition | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (!frontmatterMatch) return null

    const frontmatterStr = frontmatterMatch[1]
    const prompt = frontmatterMatch[2].trim()

    const frontmatter: Record<string, any> = {}
    for (const line of frontmatterStr.split('\n')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim()
      if (value.startsWith('[') && value.endsWith(']')) {
        frontmatter[key] = JSON.parse(value.replace(/'/g, '"'))
      } else {
        frontmatter[key] = value
      }
    }

    if (!frontmatter.name || !prompt) return null

    return {
      name: String(frontmatter.name),
      description: String(frontmatter.description || ''),
      prompt,
      source: filePath?.includes(homeDir ?? '') ? 'user' : filePath?.includes('.agentic') ? 'project' : 'bundled',
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      aliases: Array.isArray(frontmatter.aliases) ? frontmatter.aliases : [],
      requiresConfirmation: frontmatter.requiresConfirmation === true || frontmatter.requiresConfirmation === 'true',
      filePath,
    }
  }

  async loadFromDirectory(dirPath: string, source: SkillDefinition['source']): Promise<number> {
    const { exists, readDir, readTextFile } = await getElectronApi()
    const dirExists = await exists(dirPath)
    if (!dirExists) return 0
    let count = 0
    try {
      const entries = await readDir(dirPath)
      const homeDir = await this.getHomeDir()
      for (const entry of entries) {
        if (entry.isDirectory) continue
        const name = typeof entry.name === 'string' ? entry.name : entry
        if (extname(name).toLowerCase() !== '.md') continue
        const filePath = join(dirPath, name)
        try {
          const content = await readTextFile(filePath)
          const skill = this.parseSkillFile(content, filePath, homeDir)
          if (skill) {
            skill.source = source
            // Replace the inline prompt with a lazy loader for file-based skills
            const originalPrompt = skill.prompt
            skill.loadPrompt = async () => {
              const { readTextFile: read } = await getElectronApi()
              const fresh = await read(filePath)
              const parsed = this.parseSkillFile(fresh, filePath, homeDir)
              return parsed?.prompt ?? originalPrompt
            }
            skill.prompt = ''  // Don't keep prompt text in memory until needed
            this.registry.register(skill)
            count++
          }
        } catch { console.warn("[SkillLoader] Failed to load skill") }
      }
    } catch { console.warn("[SkillLoader] Failed to load skills directory") }
    return count
  }

  loadBundledSkills(): void {
    const builtInSkills: SkillDefinition[] = [
      {
        name: 'compact',
        description: 'Compact the conversation to save context space',
        prompt: 'Please summarize the key points of our conversation so far, preserving all important context, decisions made, file paths, and code patterns discussed. Be concise but thorough.',
        source: 'bundled',
        tags: ['utility', 'conversation'],
        aliases: ['compress', 'summarize', 'condense'],
        requiresConfirmation: true,
      },
      {
        name: 'plan',
        description: 'Create a structured plan for implementing a feature or fixing a bug',
        prompt: 'Create a detailed implementation plan for the requested change. Break it down into steps, list which files need to be modified, and identify potential risks or dependencies.',
        source: 'bundled',
        tags: ['planning', 'development'],
        aliases: ['implement', 'design'],
        requiresConfirmation: false,
      },
      {
        name: 'review',
        description: 'Review code changes for quality, bugs, and best practices',
        prompt: 'Please review the recent changes thoroughly. Check for: 1) Potential bugs or edge cases 2) Code quality and consistency 3) Security concerns 4) Performance implications 5) Test coverage. Provide specific, actionable feedback.',
        source: 'bundled',
        tags: ['code-review', 'quality'],
        aliases: ['code-review', 'audit'],
        requiresConfirmation: false,
      },
      {
        name: 'explain',
        description: 'Explain a concept, code, or architecture in detail',
        prompt: 'Please explain this in detail, breaking down complex concepts into understandable parts. Use analogies where helpful and provide examples.',
        source: 'bundled',
        tags: ['learning', 'documentation'],
        aliases: ['what-is', 'how-does'],
        requiresConfirmation: false,
      },
      {
        name: 'fix',
        description: 'Analyze and fix a bug or issue',
        prompt: 'Analyze the problem, identify root causes, and propose fixes. Consider edge cases and potential regressions.',
        source: 'bundled',
        tags: ['debugging', 'development'],
        aliases: ['bug', 'debug', 'issue'],
        requiresConfirmation: false,
      },
      {
        name: 'test',
        description: 'Generate or analyze tests for code',
        prompt: 'Write thorough tests covering: 1) Happy path 2) Edge cases 3) Error conditions 4) Integration points. Follow existing test patterns in the project.',
        source: 'bundled',
        tags: ['testing', 'quality'],
        aliases: ['unit-test', 'integration-test'],
        requiresConfirmation: false,
      },
      {
        name: 'refactor',
        description: 'Suggest refactoring improvements for code',
        prompt: 'Analyze the code for refactoring opportunities: 1) Duplicate code 2) Complex conditionals 3) Large functions 4) Inappropriate naming 5) Missing abstractions. Provide concrete before/after examples.',
        source: 'bundled',
        tags: ['refactoring', 'quality'],
        aliases: ['improve', 'cleanup'],
        requiresConfirmation: false,
      },
      {
        name: 'doc',
        description: 'Generate documentation for code',
        prompt: 'Generate clear, thorough documentation. Include: 1) Purpose and overview 2) Usage examples 3) API reference 4) Edge cases and limitations.',
        source: 'bundled',
        tags: ['documentation', 'development'],
        aliases: ['document', 'docs'],
        requiresConfirmation: false,
      },
      {
        name: 'help',
        description: 'Show available skills and commands',
        prompt: 'List all available skills and their descriptions to help the user understand what commands are available.',
        source: 'bundled',
        tags: ['utility'],
        aliases: ['commands', 'skills'],
        requiresConfirmation: false,
      },
      {
        name: 'session',
        description: 'Show session information including cost, memory usage, and status',
        prompt: 'Provide a summary of the current session including: 1) Cost incurred 2) Memory usage 3) Files modified 4) Commands run 5) Session duration.',
        source: 'bundled',
        tags: ['utility', 'session'],
        aliases: ['status', 'info'],
        requiresConfirmation: false,
      },
    ]

    for (const skill of builtInSkills) {
      this.registry.register(skill)
    }

    // Register specialized bundled skills from skill files
    this.registry.register(explainCodeSkill)
    this.registry.register(fixBugSkill)
    this.registry.register(addTestsSkill)
    this.registry.register(codeReviewSkill)
    this.registry.register(batchParallelSkill)
  }

  async loadProjectSkills(projectRoot: string): Promise<number> {
    return this.loadFromDirectory(join(projectRoot, '.agentic', 'skills'), 'project')
  }

  async loadUserSkills(): Promise<number> {
    const homeDir = await this.getHomeDir()
    return this.loadFromDirectory(join(homeDir, '.agentic', 'skills'), 'user')
  }

  async loadAll(projectRoot?: string): Promise<void> {
    this.loadBundledSkills()
    if (projectRoot) await this.loadProjectSkills(projectRoot)
    await this.loadUserSkills()
  }
}
