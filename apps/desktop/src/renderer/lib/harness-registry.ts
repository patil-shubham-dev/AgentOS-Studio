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

export const HARNESS_REGISTRY: Record<HarnessName, HarnessDefinition> = {
  opencode: {
    name: "opencode",
    displayName: "Opencode",
    binary: "opencode",
    versionArgs: ["--version"],
    install: [
      { label: "npm (recommended)", command: ["npm", "i", "-g", "opencode-ai"], url: "https://opencode.ai/docs" },
      { label: "Official script", command: ["curl", "-fsSL", "https://opencode.ai/install", "|", "bash"], url: "https://opencode.ai/docs" },
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
      { label: "PowerShell (Windows)", command: ["powershell", "-Command", "irm https://claude.ai/install.ps1 | iex"], url: "https://claude.ai/docs" },
      { label: "npm (Node >=22)", command: ["npm", "i", "-g", "@anthropic-ai/claude-code"], url: "https://claude.ai/docs" },
      { label: "winget", command: ["winget", "install", "Anthropic.ClaudeCode"], url: "https://claude.ai/docs" },
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
      { label: "npm", command: ["npm", "i", "-g", "@openai/codex"], url: "https://developers.openai.com/codex" },
      { label: "Official installer", command: ["curl", "-fsSL", "https://openai.com/codex/install.sh", "|", "bash"], url: "https://developers.openai.com/codex" },
    ],
    launchArgs: [],
    description: "Codex — OpenAI harness (TUI, -a/--ask-for-approval, -s/--sandbox)",
  },
}

export function getInstallCandidates(name: HarnessName): InstallCandidate[] {
  return HARNESS_REGISTRY[name]?.install ?? []
}

export function listHarnesses(): HarnessName[] {
  return Object.keys(HARNESS_REGISTRY) as HarnessName[]
}
