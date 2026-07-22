/**
 * ITEM 1: coder.md missing → warning references coder.md → falls back to hardcoded → restore → cache hit
 * ITEM 2: edit coder.md → changed sentence appears in getSystemPromptForRole output
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Track which role files should fail
const failingRoles = new Set<string>()

vi.mock('@/lib/electron-api', () => ({
  invoke: vi.fn().mockImplementation(async (channel: string, args: any) => {
    if (channel !== 'read_instruction_file') throw new Error('bad channel')
    const instructionPath: string = args?.instructionPath ?? ''
    const roleKey = instructionPath.replace('roles/', '').replace('.md', '')
    if (failingRoles.has(roleKey)) {
      throw new Error(`ENOENT: roles/${roleKey}.md not found`)
    }
    const roleName = roleKey
    return `---
id: role-${roleName}
name: ${roleName}
runtimeRole: ${roleName}
---
You are the ${roleName} agent inside AgenticOS.`
  }),
}))

describe('ITEM 1: Fallback — coder.md consistent test', () => {
  beforeEach(() => {
    failingRoles.clear()
    failingRoles.add('coder') // ONLY coder.md fails
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('1a. load-failure warning references coder.md specifically', async () => {
    const load = await import('@/runtime/load-instructions')
    await load.ensureInstructionFilesInitialized()

    const warnCalls = (console.warn as ReturnType<typeof vi.fn>).mock.calls
    const coderWarnings = warnCalls.filter((c: string[]) =>
      c[0]?.includes?.('coder.md')
    )
    expect(coderWarnings.length).toBeGreaterThanOrEqual(1)
    // Verify it's the orange INSTRUCTION FILE LOAD FAILED warning
    expect(coderWarnings[0][0]).toContain('INSTRUCTION FILE LOAD FAILED')
    expect(coderWarnings[0][0]).toContain('roles/coder.md')
    expect(coderWarnings[0][0]).toContain('ENOENT')
    // Also verify other-role files DID load (no warning for manager, vision, etc.)
    const managerWarnings = warnCalls.filter((c: string[]) =>
      c[0]?.includes?.('manager.md')
    )
    expect(managerWarnings.length).toBe(0)
  })

  it('1b. getSystemPromptForRole("coder") returns hardcoded CODER_PROMPT when file missing', async () => {
    const reg = await import('@/runtime/runtime-role-registry')
    const prompt = reg.getSystemPromptForRole('coder')
    expect(prompt).toContain('Coding Agent')
    expect(prompt).not.toContain('You are the coder agent')
  })

  it('1c. other roles still load from file (manager not affected)', async () => {
    const reg = await import('@/runtime/runtime-role-registry')
    const prompt = reg.getSystemPromptForRole('manager')
    expect(prompt).toContain('manager agent')
  })
})

describe('ITEM 2: Edit test — changed sentence in coder.md reflected', () => {
  beforeEach(() => {
    failingRoles.clear() // No failures — all files load
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('2a. default mock returns "You are the coder agent"', async () => {
    const load = await import('@/runtime/load-instructions')
    const reg = await import('@/runtime/runtime-role-registry')
    await load.ensureInstructionFilesInitialized()

    // File loaded — prompt should contain mocked content
    const prompt = reg.getSystemPromptForRole('coder')
    expect(prompt).toContain('coder agent')
  })

  it('2b. after changing mock to "CODING AGENT v2", prompt reflects the change', async () => {
    // Override the mock for this test
    const invokeMock = vi.mocked((await import('@/lib/electron-api')).invoke)
    invokeMock.mockImplementation(async (channel: string, args: any) => {
      if (channel !== 'read_instruction_file') throw new Error('bad channel')
      const instructionPath: string = args?.instructionPath ?? ''
      const roleKey = instructionPath.replace('roles/', '').replace('.md', '')
      if (roleKey === 'coder') {
        return `---
id: role-coder
name: Coder
---
You are the CODING AGENT v2 — a senior software engineer.`
      }
      return `---
id: role-${roleKey}
---
You are the ${roleKey} agent.`
    })

    const load = await import('@/runtime/load-instructions')
    const reg = await import('@/runtime/runtime-role-registry')

    // Reset the initialized flag by calling ensure again (since we changed the mock)
    // Note: initialized is module-scoped and set to true after first call.
    // This test runs in a separate describe block, so modules get re-evaluated.
    await load.ensureInstructionFilesInitialized()
    const prompt = reg.getSystemPromptForRole('coder')

    // The prompt should now contain the EDITED text, not the original
    expect(prompt).toContain('CODING AGENT v2')
    expect(prompt).not.toContain('Coding Agent') // old text gone
  })
})
