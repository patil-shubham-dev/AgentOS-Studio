export interface ReviewCheckResult {
  severity: 'error' | 'warning' | 'info'
  file: string
  line: number
  message: string
  rule: string
}

export interface ReviewCheckSummary {
  passed: boolean
  results: ReviewCheckResult[]
  summary: string
}

const SECRET_PATTERNS: { regex: RegExp; name: string }[] = [
  { regex: /(?:API[_-]?KEY|API[_-]?TOKEN|SECRET[_-]?KEY|SECRET[_-]?TOKEN|PRIVATE[_-]?KEY)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/gi, name: 'api-key' },
  { regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, name: 'github-token' },
  { regex: /(?:sk-[A-Za-z0-9]{32,}|sk-[A-Za-z0-9]{48,})/g, name: 'openai-key' },
  { regex: /(?:AC[0-9A-Za-z_\-]{32}|AKIA[0-9A-Z]{16})/g, name: 'aws-key' },
  { regex: /(?:-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH|PRIVATE)\s+KEY-----)/g, name: 'private-key' },
  { regex: /(?:mongodb\+srv:\/\/[^\s]+)/g, name: 'mongodb-connection' },
  { regex: /(?:password|passwd|pwd)\s*[:=]\s*['\"][^'\"]{8,}['\"]/gi, name: 'password' },
]

const CODE_QUALITY_RULES: { name: string; check: (file: string, line: string, lineNum: number) => ReviewCheckResult | null }[] = [
  {
    name: 'console-log',
    check: (file, line, lineNum) => {
      if (line.includes('console.log(') && !file.includes('test')) {
        return { severity: 'warning', file, line: lineNum, message: 'Remove console.log before committing', rule: 'no-console-log' }
      }
      return null
    },
  },
  {
    name: 'todo-comment',
    check: (file, line, lineNum) => {
      if (line.includes('TODO') || line.includes('FIXME') || line.includes('HACK')) {
        return { severity: 'info', file, line: lineNum, message: 'Outstanding TODO/FIXME/HACK comment', rule: 'no-todo' }
      }
      return null
    },
  },
  {
    name: 'long-line',
    check: (file, line, lineNum) => {
      if (line.length > 200) {
        return { severity: 'warning', file, line: lineNum, message: `Line too long (${line.length} > 200 chars)`, rule: 'max-line-length' }
      }
      return null
    },
  },
  {
    name: 'large-file',
    check: (_file, line, _lineNum) => {
      return null
    },
  },
  {
    name: 'debugger',
    check: (file, line, lineNum) => {
      if (line.includes('debugger')) {
        return { severity: 'error', file, line: lineNum, message: 'debugger statement found', rule: 'no-debugger' }
      }
      return null
    },
  },
]

export function parseDiff(diffText: string): Map<string, { additions: Array<{ lineNum: number; content: string }>; deletions: Array<{ lineNum: number; content: string }>; filePath: string }> {
  const files = new Map<string, { additions: Array<{ lineNum: number; content: string }>; deletions: Array<{ lineNum: number; content: string }>; filePath: string }>()
  let currentFile: string | null = null
  let currentLine = 0
  let addedLines = 0

  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git a/')) {
      const match = line.match(/diff --git a\/(.+?) b\/(.+)/)
      if (match) {
        currentFile = match[2]
        currentLine = 0
        addedLines = 0
        if (!files.has(currentFile)) {
          files.set(currentFile, { additions: [], deletions: [], filePath: currentFile })
        }
      }
    } else if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        currentLine = parseInt(match[1], 10)
        addedLines = 0
      }
    } else if (currentFile && line.startsWith('+') && !line.startsWith('+++')) {
      const fileInfo = files.get(currentFile)
      if (fileInfo) {
        fileInfo.additions.push({ lineNum: currentLine + addedLines, content: line.slice(1) })
        addedLines++
      }
    } else if (currentFile && line.startsWith('-') && !line.startsWith('---')) {
      const fileInfo = files.get(currentFile)
      if (fileInfo) {
        fileInfo.deletions.push({ lineNum: currentLine, content: line.slice(1) })
      }
    } else if (currentFile && !line.startsWith('-')) {
      currentLine += addedLines > 0 ? 1 : 0
      if (currentLine !== 0) {
        currentLine++
        addedLines = 0
      }
    }
  }

  return files
}

export function checkSecrets(diffText: string): ReviewCheckResult[] {
  const results: ReviewCheckResult[] = []
  const lines = diffText.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('+')) continue

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(line)) {
        results.push({
          severity: 'error',
          file: 'diff',
          line: i + 1,
          message: `Potential ${pattern.name} detected in diff. Check if this should be an environment variable.`,
          rule: `secret-${pattern.name}`,
        })
      }
    }
  }

  return results
}

export function checkCodeQuality(diffFiles: Map<string, { additions: Array<{ lineNum: number; content: string }>; deletions: Array<{ lineNum: number; content: string }>; filePath: string }>): ReviewCheckResult[] {
  const results: ReviewCheckResult[] = []

  for (const [filePath, file] of diffFiles) {
    for (const addition of file.additions) {
      for (const rule of CODE_QUALITY_RULES) {
        const result = rule.check(filePath, addition.content, addition.lineNum)
        if (result) {
          results.push(result)
        }
      }
    }

    if (file.additions.length > 500) {
      results.push({
        severity: 'warning',
        file: filePath,
        line: 1,
        message: `Large change set (${file.additions.length} additions) — consider splitting into smaller PRs`,
        rule: 'large-change',
      })
    }
  }

  return results
}

export function reviewDiff(diffText: string): ReviewCheckSummary {
  const diffFiles = parseDiff(diffText)
  const secrets = checkSecrets(diffText)
  const quality = checkCodeQuality(diffFiles)
  const results = [...secrets, ...quality]

  const errors = results.filter((r) => r.severity === 'error')
  const warnings = results.filter((r) => r.severity === 'warning')
  const info = results.filter((r) => r.severity === 'info')

  const summaryParts: string[] = []
  if (errors.length > 0) summaryParts.push(`${errors.length} error(s)`)
  if (warnings.length > 0) summaryParts.push(`${warnings.length} warning(s)`)
  if (info.length > 0) summaryParts.push(`${info.length} info(s)`)

  const summary = summaryParts.length > 0
    ? `Automated check found ${summaryParts.join(', ')}.`
    : '✅ No issues found in automated check.'

  return {
    passed: errors.length === 0,
    results,
    summary,
  }
}
