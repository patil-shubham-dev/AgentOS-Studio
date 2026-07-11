import { invoke } from '@/lib/electron-api'

const ROLE_PROMPT_CACHE = new Map<string, string>()
let initialized = false

const ROLE_TO_FILE = new Map<string, string>([
  ['fast-chat', 'fast-chat.md'],
  ['fast_chat', 'fast-chat.md'],
  ['manager', 'manager.md'],
  ['coder', 'coder.md'],
  ['vision', 'vision.md'],
  ['research', 'research.md'],
  ['runtime', 'runtime.md'],
  ['design', 'design.md'],
  ['browser', 'browser.md'],
  ['qa', 'qa.md'],
  ['verification', 'verification.md'],
  ['fast-inference', 'fast-inference.md'],
  ['fast_inference', 'fast-inference.md'],
  ['memory', 'memory.md'],
])

async function loadRolePromptFromFile(roleId: string): Promise<string | null> {
  const fileName = ROLE_TO_FILE.get(roleId)
  if (!fileName) return null
  try {
    const content = await invoke<string>('read_instruction_file', { instructionPath: `roles/${fileName}` })
    const body = extractFrontmatterBody(content)
    ROLE_PROMPT_CACHE.set(roleId, body)
    return body
  } catch (err) {
    console.warn(
      `%c⚠️ INSTRUCTION FILE LOAD FAILED — agent-instructions/roles/${fileName} could not be read. ` +
      `Error: ${err instanceof Error ? err.message : String(err)}. ` +
      `The app will fall back to the hardcoded prompt from runtime-role-registry.ts. ` +
      `Check that the file exists and the read-instruction-file IPC handler is registered.`,
      'background: #ff8800; color: white; font-weight: bold; padding: 2px 4px; border-radius: 2px; font-size: 13px;'
    )
    return null
  }
}

function extractFrontmatterBody(markdown: string): string {
  const match = markdown.match(/^---\n[\s\S]*?\n---\n\n?([\s\S]*)$/)
  return match ? match[1].trim() : markdown.trim()
}

export async function ensureInstructionFilesInitialized(): Promise<void> {
  if (initialized) return
  const roles = Array.from(new Set(ROLE_TO_FILE.values()))
    .map(f => f.replace(/\.md$/, ''))
  const uniqueRoles = [...new Set(roles)]
  const results = await Promise.allSettled(uniqueRoles.map(r => loadRolePromptFromFile(r)))
  const loaded = results.filter(r => r.status === 'fulfilled' && r.value !== null).length
  console.log(`[Instructions] Loaded ${loaded}/${uniqueRoles.length} role prompt files`)
  initialized = true
}

export function getRolePromptFromCache(roleId: string): string | null {
  const fileName = ROLE_TO_FILE.get(roleId)
  if (!fileName) return null
  const key = fileName.replace(/\.md$/, '')
  return ROLE_PROMPT_CACHE.get(key) ?? null
}

export function extractPromptFromMarkdown(markdown: string): string {
  const body = extractFrontmatterBody(markdown)
  const match = body.match(/^[\s\S]*?(?=\n## |\n---|$)/)
  return match ? match[0].trim() : body
}
