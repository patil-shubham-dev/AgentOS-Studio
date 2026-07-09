export type CommandTier = "read-only" | "ask" | "deny"

export type CommandRule = {
  pattern: RegExp
  tier: CommandTier
  reason: string
}

export type CommandClassification = {
  tier: CommandTier
  reason: string
  matchedRule?: string
}

const DEFAULT_RULES: CommandRule[] = [
  // ── DENY (always checked first, regardless of position in command) ──
  { pattern: /^(sudo|doas|pkexec)\b/i, tier: "deny", reason: "Privileged execution is blocked" },
  { pattern: /\b(chown|mkfs|fdisk)\b|^passwd\b|chmod\s+4\d{2}\s|dd\s+if=/i, tier: "deny", reason: "System-modifying command is blocked" },
  { pattern: /^rm\s+(-rf?\s+)?\/[^\s]*/i, tier: "deny", reason: "Root filesystem delete is blocked" },
  { pattern: /^rm\s+(-rf\s+)?~[/\\]/i, tier: "deny", reason: "Recursive delete in home directory is blocked" },
  { pattern: /[;&|]\s+(sudo|doas|pkexec|passwd|rm|chmod|chown|mkfs|fdisk|dd)\b/i, tier: "deny", reason: "Chained dangerous command is blocked" },

  // ── ASK: redirection and piping that could make read-only commands dangerous ──
  { pattern: /^(cat|echo|head|tail|wc|ls|dir|pwd|type|which)\b.*>/i, tier: "ask", reason: "Output redirection with inspection command requires approval" },
  { pattern: /(curl|wget)\s+.*?(\||>\s*\/|[^-]\s+\.\w+\s*$)/i, tier: "ask", reason: "Network download with output redirection requires approval" },

  // ── ASK: safe commands that require approval ──
  { pattern: /^npm\s+(install|add|update|remove|uninstall)\b/i, tier: "ask", reason: "Package modification requires approval" },
  { pattern: /^git\s+(add|commit|push|fetch|merge|rebase|reset|restore|stash|checkout\s+-b)\b/i, tier: "ask", reason: "Git modification requires approval" },
  { pattern: /^npm\s+(start|run\b(?!\s+(test|build|lint|typecheck|format|check)\b))/i, tier: "ask", reason: "Starting a process requires approval" },

  // ── READ-ONLY: known-safe commands ──
  { pattern: /^npm\s+(run\s+)?(test|build|lint|typecheck|format|check)\b/i, tier: "read-only", reason: "Standard project scripts" },
  { pattern: /^(ls|dir|pwd|echo|cat|head|tail|wc|which|type)\b/i, tier: "read-only", reason: "Read-only file/process inspection" },
  { pattern: /^git\s+(status|diff|log|show|branch|stash\s+list)\b/i, tier: "read-only", reason: "Read-only git inspection" },
  { pattern: /(curl|wget)\b/i, tier: "read-only", reason: "Network fetch" },

  // ── CATCH-ALL: unrecognized commands ──
  { pattern: /./, tier: "ask", reason: "Unrecognized command requires approval" },
]

export class CommandExecutionPolicy {
  private rules: CommandRule[]

  constructor(rules: CommandRule[] = DEFAULT_RULES) {
    this.rules = rules
  }

  classify(command: string): CommandClassification {
    for (const rule of this.rules) {
      if (rule.pattern.test(command.trim())) {
        return { tier: rule.tier, reason: rule.reason, matchedRule: rule.pattern.source }
      }
    }
    return { tier: "read-only", reason: "Default: read-only" }
  }

  isAllowed(command: string): { allowed: boolean; reason?: string; requiresApproval: boolean } {
    const { tier, reason } = this.classify(command)
    switch (tier) {
      case "deny":
        return { allowed: false, reason, requiresApproval: false }
      case "ask":
        return { allowed: true, reason, requiresApproval: true }
      case "read-only":
        return { allowed: true, reason, requiresApproval: false }
    }
  }

  setRules(rules: CommandRule[]): void {
    this.rules = rules
  }

  addRule(rule: CommandRule): void {
    this.rules.unshift(rule)
  }

  getRules(): CommandRule[] {
    return [...this.rules]
  }
}
