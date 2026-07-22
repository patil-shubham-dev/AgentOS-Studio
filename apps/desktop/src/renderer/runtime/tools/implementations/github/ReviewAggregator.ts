import type { ReviewCheckResult } from './ReviewChecker'

const SEVERITY_ICONS: Record<string, string> = {
  error: '🔴',
  warning: '🟡',
  info: '🔵',
}

export function aggregateReviewResults(results: ReviewCheckResult[]): string {
  if (results.length === 0) return '✅ No issues found.'

  const errors = results.filter(r => r.severity === 'error')
  const warnings = results.filter(r => r.severity === 'warning')
  const infos = results.filter(r => r.severity === 'info')

  const parts: string[] = []

  if (errors.length > 0) {
    parts.push(formatGroup('Errors', errors))
  }
  if (warnings.length > 0) {
    parts.push(formatGroup('Warnings', warnings))
  }
  if (infos.length > 0) {
    parts.push(formatGroup('Info', infos))
  }

  const errorCount = errors.length
  const totalCount = results.length
  parts.push(
    '',
    `---`,
    `**Summary:** ${errorCount > 0 ? `🔴 ${errorCount} error(s)` : ''}${errorCount > 0 && warnings.length > 0 ? ', ' : ''}${warnings.length > 0 ? `🟡 ${warnings.length} warning(s)` : ''}${(errorCount > 0 || warnings.length > 0) && infos.length > 0 ? ', ' : ''}${infos.length > 0 ? `🔵 ${infos.length} info(s)` : ''} — ${totalCount} total`,
  )

  return parts.join('\n')
}

function formatGroup(title: string, results: ReviewCheckResult[]): string {
  const byRule = new Map<string, ReviewCheckResult[]>()
  for (const r of results) {
    if (!byRule.has(r.rule)) byRule.set(r.rule, [])
    byRule.get(r.rule)!.push(r)
  }

  const icon = SEVERITY_ICONS[results[0].severity] ?? ''
  const lines: string[] = [`### ${icon} ${title} (${results.length})`]

  for (const [rule, items] of byRule) {
    lines.push(`\n**${rule}** — ${items.length} occurrence(s):`)
    for (const item of items.slice(0, 5)) {
      lines.push(`- \`${item.file}:${item.line}\` — ${item.message}`)
    }
    if (items.length > 5) {
      lines.push(`  - ... and ${items.length - 5} more`)
    }
  }

  return lines.join('\n')
}
