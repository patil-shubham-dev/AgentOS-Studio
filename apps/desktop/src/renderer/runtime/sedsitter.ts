export type SedEdit = {
  filePath: string
  pattern: string
  replacement: string
  flags: string
}

export function parseSedEditCommand(command: string): SedEdit | null {
  const trimmed = command.trim()

  const sedMatch = trimmed.match(
    /^sed\s+-i(\S*)\s+'s\/((?:[^\/\\]|\\.)*)\/((?:[^\/\\]|\\.)*)\/([g]*)?'\s+(.+)$/,
  )
  if (sedMatch) {
    return {
      filePath: sedMatch[5],
      pattern: sedMatch[2],
      replacement: sedMatch[3],
      flags: sedMatch[4] ?? '',
    }
  }

  const doubleQuoteMatch = trimmed.match(
    /^sed\s+-i(\S*)\s+"s\/((?:[^\/\\]|\\.)*)\/((?:[^\/\\]|\\.)*)\/([g]*)?"\s+(.+)$/,
  )
  if (doubleQuoteMatch) {
    return {
      filePath: doubleQuoteMatch[5],
      pattern: doubleQuoteMatch[2],
      replacement: doubleQuoteMatch[3],
      flags: doubleQuoteMatch[4] ?? '',
    }
  }

  return null
}

export function isSedCommand(command: string): boolean {
  return /^sed\s+-i/.test(command.trim())
}

export function applySedEdit(content: string, edit: SedEdit): string {
  const isGlobal = edit.flags.includes('g')
  const escapedPattern = edit.pattern.replace(/\\(.)/g, '$1')
  const escapedReplacement = edit.replacement.replace(/\\(.)/g, '$1')

  try {
    const regex = new RegExp(escapedPattern, isGlobal ? 'g' : '')
    return content.replace(regex, escapedReplacement)
  } catch {
    return content
  }
}
