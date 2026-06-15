export interface VisualQualityIssue {
  component: string
  severity: 'high' | 'medium' | 'low'
  category: 'motion' | 'color' | 'spacing' | 'typography' | 'accessibility' | 'state'
  description: string
  recommendation: string
}

export interface VisualQualityReport {
  passed: boolean
  issues: VisualQualityIssue[]
  score: number
  componentCount: number
}

const checks: Array<{
  category: VisualQualityIssue['category']
  severity: VisualQualityIssue['severity']
  check: () => VisualQualityIssue | null
}> = []

function registerCheck(
  category: VisualQualityIssue['category'],
  severity: VisualQualityIssue['severity'],
  check: () => VisualQualityIssue | null,
): void {
  checks.push({ category, severity, check })
}

registerCheck('motion', 'medium', () => {
  const style = getComputedStyle(document.documentElement)
  const easing = style.getPropertyValue('--motion-easing').trim()
  if (!easing || !easing.includes('cubic-bezier')) {
    return {
      component: ':root',
      severity: 'medium',
      category: 'motion',
      description: 'Global motion easing token is not set',
      recommendation: 'Add --motion-easing: cubic-bezier(0.16, 1, 0.3, 1) to @theme',
    }
  }
  return null
})

registerCheck('motion', 'low', () => {
  const fast = getComputedStyle(document.documentElement).getPropertyValue('--motion-fast').trim()
  const normal = getComputedStyle(document.documentElement).getPropertyValue('--motion-normal').trim()
  const slow = getComputedStyle(document.documentElement).getPropertyValue('--motion-slow').trim()
  if (!fast || !normal || !slow) {
    return {
      component: ':root',
      severity: 'low',
      category: 'motion',
      description: 'Motion duration tokens are incomplete',
      recommendation: 'Ensure --motion-fast (100ms), --motion-normal (200ms), --motion-slow (300ms) are defined',
    }
  }
  return null
})

registerCheck('typography', 'low', () => {
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim()
  if (!font || font === 'sans-serif') {
    return {
      component: ':root',
      severity: 'low',
      category: 'typography',
      description: 'Custom font family not configured',
      recommendation: 'Set --font-sans to project font stack',
    }
  }
  return null
})

registerCheck('color', 'medium', () => {
  const bg = getComputedStyle(document.body).background
  if (!bg || bg === 'rgba(0, 0, 0, 0)') {
    return {
      component: 'body',
      severity: 'medium',
      category: 'color',
      description: 'Body background color is not set via CSS variable',
      recommendation: 'Use background: var(--color-background) on body',
    }
  }
  return null
})

export function runVisualQualityGate(): VisualQualityReport {
  const issues: VisualQualityIssue[] = []
  for (const { category, severity, check } of checks) {
    const result = check()
    if (result) issues.push(result)
  }

  const total = checks.length
  const passed = total - issues.length
  const score = total > 0 ? Math.round((passed / total) * 100) : 0

  return { passed: issues.length === 0, issues, score, componentCount: total }
}

export function getVisualQualitySummary(report: VisualQualityReport): string {
  if (report.passed) return '✅ All visual quality checks passed'
  const bySeverity = (s: VisualQualityIssue['severity']) => report.issues.filter(i => i.severity === s)
  const parts: string[] = []
  if (bySeverity('high').length > 0) parts.push(`${bySeverity('high').length} high`)
  if (bySeverity('medium').length > 0) parts.push(`${bySeverity('medium').length} medium`)
  if (bySeverity('low').length > 0) parts.push(`${bySeverity('low').length} low`)
  return `⚠ ${report.issues.length} issue(s) found (${parts.join(', ')}). Score: ${report.score}%`
}
