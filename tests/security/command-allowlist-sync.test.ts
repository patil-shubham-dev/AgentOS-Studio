import { describe, it, expect } from "vitest"

/**
 * The authoritative allowlist in src/main/ipc/command.ts.
 * This is the single source of truth — all command execution in the main process
 * is gated by this set.
 */
const MAIN_PROCESS_ALLOWLIST = [
  'git', 'node', 'npm', 'npx', 'yarn', 'pnpm',
  'ls', 'dir', 'cat', 'type', 'head', 'tail',
  'echo', 'find', 'grep', 'findstr', 'sort',
  'mkdir', 'copy', 'move', 'ren',
  'cp', 'mv', 'touch',
  'cd', 'pwd', 'pushd', 'popd',
  'python', 'python3', 'pip', 'pip3',
  'deno', 'bun', 'tsc', 'ts-node',
  'curl', 'wget',
  'docker', 'docker-compose',
  'make', 'cmake', 'gcc', 'g++', 'clang',
  'rustc', 'cargo',
  'go', 'dotnet',
  'which', 'where',
  'whoami', 'hostname',
  'wc', 'uniq', 'tee', 'xargs',
  'date', 'time',
]

/**
 * The renderer-side defense-in-depth allowlist in
 * src/renderer/runtime/tools/ToolExecutionSandbox.ts.
 * Must be an exact subset of MAIN_PROCESS_ALLOWLIST.
 */
const RENDERER_ALLOWLIST = [
  'git', 'node', 'npm', 'npx', 'yarn', 'pnpm',
  'ls', 'dir', 'cat', 'type', 'head', 'tail',
  'echo', 'find', 'grep', 'findstr', 'sort',
  'mkdir', 'copy', 'move', 'ren',
  'cp', 'mv', 'touch',
  'cd', 'pwd', 'pushd', 'popd',
  'python', 'python3', 'pip', 'pip3',
  'deno', 'bun', 'tsc', 'ts-node',
  'curl', 'wget',
  'docker', 'docker-compose',
  'make', 'cmake', 'gcc', 'g++', 'clang',
  'rustc', 'cargo',
  'go', 'dotnet',
  'which', 'where',
  'whoami', 'hostname',
  'wc', 'uniq', 'tee', 'xargs',
  'date', 'time',
]

describe("Command allowlist synchronization", () => {
  // This test ensures the two allowlists don't drift apart.
  // If you add a command to one list, you must add it to the other.
  // If you remove a command from command.ts, remove it from ToolExecutionSandbox.ts too.

  it("renderer allowlist must be a subset of the main process allowlist", () => {
    const mainSet = new Set(MAIN_PROCESS_ALLOWLIST)
    for (const cmd of RENDERER_ALLOWLIST) {
      expect(mainSet.has(cmd)).toBe(true)
    }
  })

  it("both allowlists must contain the same commands (renderer = main process)", () => {
    const mainSorted = [...MAIN_PROCESS_ALLOWLIST].sort()
    const rendererSorted = [...RENDERER_ALLOWLIST].sort()
    expect(rendererSorted).toEqual(mainSorted)
  })

  it("must have no duplicates in the main process allowlist", () => {
    expect(new Set(MAIN_PROCESS_ALLOWLIST).size).toBe(MAIN_PROCESS_ALLOWLIST.length)
  })

  it("must have no duplicates in the renderer allowlist", () => {
    expect(new Set(RENDERER_ALLOWLIST).size).toBe(RENDERER_ALLOWLIST.length)
  })

  it("must exclude shell interpreters (powershell, pwsh, cmd, bash, sh)", () => {
    const shellInterpreters = ["powershell", "pwsh", "cmd", "bash", "sh"]
    for (const shell of shellInterpreters) {
      expect(MAIN_PROCESS_ALLOWLIST).not.toContain(shell)
      expect(RENDERER_ALLOWLIST).not.toContain(shell)
    }
  })
})
