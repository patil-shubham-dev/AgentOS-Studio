export const BLOCKED_COMMAND_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\//,
  /rm\s+-rf\s+~/,
  /rm\s+-rf\s+\$\{HOME\}/,
  /rm\s+-rf\s+\$HOME/,
  /:\(\s*\)\s*\{[^}]*\}/,
  /dd\s+if=\/dev\/zero\s+of=\/dev\//,
  /chmod\s+777\s+\/etc/,
  />\s+\/dev\/sda/,
  /mkfs\.[a-z]+\s+\/dev\/sda/,
  /wget\s+http:\/\/[^\s]+\s+-O\s+\/tmp\//,
  /curl\s+http:\/\/[^\s]+\s+\|\s*(?:sh|bash|zsh)/,
  /eval\s+\$\(curl/,
  /sudo\s+rm\s+-rf/,
  /git\s+push\s+origin\s+main\s+--force/,
  /git\s+push\s+--force\s+origin/,
]

export function isCommandBlocked(command: string): { blocked: boolean; reason?: string } {
  for (const pattern of BLOCKED_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      return { blocked: true, reason: `Command matches blocked pattern: ${pattern}` }
    }
  }
  return { blocked: false }
}
