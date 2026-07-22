const marks: Record<string, number> = {}
const order: string[] = []

export const StartupTiming = {
  mark(name: string) {
    if (!marks[name]) {
      marks[name] = performance.now()
      order.push(name)
    }
  },

  elapsed(from: string, to?: string): number {
    const t1 = marks[from]
    if (t1 === undefined) return -1
    const t2 = to ? marks[to] : performance.now()
    return Math.round(t2 - t1)
  },

  getAll(): Record<string, { time: number; elapsed: number; duration: number }> {
    const result: Record<string, { time: number; elapsed: number; duration: number }> = {}
    const start = order.length > 0 ? marks[order[0]] : performance.now()
    for (let i = 0; i < order.length; i++) {
      const key = order[i]
      const current = marks[key]
      const prev = i > 0 ? marks[order[i - 1]] : start
      result[key] = {
        time: Math.round(current),
        elapsed: Math.round(current - start),
        duration: Math.round(current - prev),
      }
    }
    return result
  },

  report(): string {
    const start = order.length > 0 ? marks[order[0]] : performance.now()
    return order
      .map((k) => {
        const elapsed = Math.round(marks[k] - start)
        return `${k.padEnd(36)} ${elapsed}ms`
      })
      .join('\n')
  },

  getSummary(): string {
    const s = this.getAll()
    const lines: string[] = []
    lines.push('')
    lines.push('Startup Summary')
    lines.push(''.padEnd(50, '═'))
    const markers: [string, string][] = [
      ['Window Visible', 'window:visible'],
      ['React Mounted', 'react-mounted'],
      ['Shell Rendered', 'app:shell-rendered'],
      ['Workspace Interactive', 'ui:interactive'],
      ['Tier 1 Complete', 'tier1:complete'],
      ['Tier 2 Start', 'tier2:start'],
      ['Tier 2 Complete', 'tier2:complete'],
      ['Boot Complete', 'boot:complete'],
    ]
    for (const [label, mark] of markers) {
      if (s[mark]) {
        lines.push(`  ${label.padEnd(25)} ${s[mark].elapsed}ms`)
      }
    }
    lines.push(''.padEnd(50, '─'))

    const serviceMarks = Object.keys(s).filter(k => k.startsWith('task:') && k.endsWith(':done'))
    if (serviceMarks.length > 0) {
      const slowest = serviceMarks.reduce((a, b) => s[a].duration > s[b].duration ? a : b)
      lines.push(`  Slowest Step: ${s[slowest].duration}ms (${slowest.replace('task:', '').replace(':done', '')})`)
    }
    lines.push('')
    return lines.join('\n')
  },

  getTotal(): number {
    if (order.length < 2) return 0
    return Math.round(marks[order[order.length - 1]] - marks[order[0]])
  },

  clear() {
    Object.keys(marks).forEach(k => delete marks[k])
    order.length = 0
  }
}
