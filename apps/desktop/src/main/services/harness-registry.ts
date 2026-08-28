import { spawnSync } from "child_process"
import { existsSync } from "fs"
import { dirname, join } from "path"

export type HarnessName = "opencode" | "claude" | "codex"

export interface InstallCandidate {
  label: string
  command: string[]
  url: string
}

export interface HarnessDefinition {
  name: HarnessName
  displayName: string
  binary: string
  versionArgs: string[]
  install: InstallCandidate[]
  launchArgs: string[]
  description: string
}

// -- Registry (pure data, per 06_MASTER_PLAN.md:148) ----------------------

export const HARNESS_REGISTRY: Record<HarnessName, HarnessDefinition> = {
  opencode: {
    name: "opencode",
    displayName: "Opencode",
    binary: "opencode",
    versionArgs: ["--version"],
    install: [
      {
        label: "npm (recommended)",
        command: ["npm", "i", "-g", "opencode-ai"],
        url: "https://opencode.ai/docs",
      },
      {
        label: "Official script",
        command: ["curl", "-fsSL", "https://opencode.ai/install", "|", "bash"],
        url: "https://opencode.ai/docs",
      },
    ],
    launchArgs: [],
    description: "Opencode — local harness, serve per workspace",
  },
  claude: {
    name: "claude",
    displayName: "Claude Code",
    binary: "claude",
    versionArgs: ["--version"],
    install: [
      {
        label: "PowerShell (Windows)",
        command: ["powershell", "-Command", "irm https://claude.ai/install.ps1 | iex"],
        url: "https://claude.ai/docs",
      },
      {
        label: "npm (Node >=22)",
        command: ["npm", "i", "-g", "@anthropic-ai/claude-code"],
        url: "https://claude.ai/docs",
      },
      {
        label: "winget",
        command: ["winget", "install", "Anthropic.ClaudeCode"],
        url: "https://claude.ai/docs",
      },
    ],
    launchArgs: [],
    description: "Claude Code — Anthropic harness",
  },
  codex: {
    name: "codex",
    displayName: "Codex",
    binary: "codex",
    versionArgs: ["--version"],
    install: [
      {
        label: "npm",
        command: ["npm", "i", "-g", "@openai/codex"],
        url: "https://developers.openai.com/codex",
      },
      {
        label: "Official installer",
        command: ["curl", "-fsSL", "https://openai.com/codex/install.sh", "|", "bash"],
        url: "https://developers.openai.com/codex",
      },
    ],
    launchArgs: [],
    description: "Codex — OpenAI harness (TUI, -a/--ask-for-approval, -s/--sandbox)",
  },
}

// -- Binary resolution (salvage from deleted OpencodeAdapter.resolveBinary, 10s timeout) -

function findWindowsShimDir(binary: string): string | null {
  try {
    const result = spawnSync("where.exe", [binary], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
    })
    if (result.status !== 0 || !result.stdout) return null
    const line = result.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0)
    if (!line) return null
    return dirname(line)
  } catch {
    return null
  }
}

export function resolveBinary(name: HarnessName): string | null {
  const def = HARNESS_REGISTRY[name]
  if (!def) return null

  // On non-Windows, assume binary is on PATH
  if (process.platform !== "win32") {
    return def.binary
  }

  // Windows: handle npm shim for opencode, native exe for claude, npm for codex
  if (name === "opencode") {
    const shimDir = findWindowsShimDir("opencode")
    if (shimDir) {
      const candidate = join(shimDir, "node_modules", "opencode-ai", "bin", "opencode.exe")
      if (existsSync(candidate)) return candidate
    }
    // Fallback to shim name — where.exe will have found it if installed
    const where = findWindowsShimDir(def.binary)
    return where ? def.binary : null
  }

  if (name === "claude") {
    // Claude on Windows is typically %USERPROFILE%\.local\bin\claude.exe
    const where = findWindowsShimDir(def.binary)
    if (where) return def.binary
    // Check native location
    const native = join(process.env.USERPROFILE ?? "", ".local", "bin", "claude.exe")
    if (existsSync(native)) return native
    return null
  }

  // codex — check where.exe
  const where = findWindowsShimDir(def.binary)
  return where ? def.binary : null
}

// -- Version probing (spawnSync 10s, version regex, per deleted adapter) ---

export function getVersion(name: HarnessName): string | null {
  const binary = resolveBinary(name)
  if (!binary) return null
  const def = HARNESS_REGISTRY[name]
  try {
    const result = spawnSync(binary, def.versionArgs, {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
    })
    if (result.status !== 0 || !result.stdout) return null
    const out = result.stdout.trim()
    const match = out.match(/\d+\.\d+\.\d+/)
    return match ? match[0] : out
  } catch {
    return null
  }
}

export function isInstalled(name: HarnessName): boolean {
  return getVersion(name) !== null
}

export function getInstallCandidates(name: HarnessName): InstallCandidate[] {
  return HARNESS_REGISTRY[name]?.install ?? []
}

export function getLaunchArgs(name: HarnessName): string[] {
  return HARNESS_REGISTRY[name]?.launchArgs ?? []
}

// -- Unhappy path types (explicit, no silent retry, no loop) -------------

export type InstallDeclined = {
  status: "declined"
  harness: HarnessName
  message: string
}

export type InstallFailed = {
  status: "failed"
  harness: HarnessName
  command: string[]
  exitCode: number | null
  output: string
  message: string
}

export type VerifyFailed = {
  status: "verify-failed"
  harness: HarnessName
  command: string[]
  exitCode: number | null
  message: string
}

export type InstallResult =
  | { status: "installed"; harness: HarnessName; version: string }
  | InstallDeclined
  | InstallFailed
  | VerifyFailed

/**
 * Verify install succeeded: binary must be resolvable and version must parse.
 * Call this after PTY install command reports exit 0. If it returns null,
 * the UI must show verify-failed, not retry silently.
 */
export function verifyInstall(name: HarnessName): string | null {
  return getVersion(name)
}

// -- Helpers for UI -------------------------------------------------------

export function listHarnesses(): HarnessName[] {
  return Object.keys(HARNESS_REGISTRY) as HarnessName[]
}

export function getHarness(name: HarnessName): HarnessDefinition | undefined {
  return HARNESS_REGISTRY[name]
}
