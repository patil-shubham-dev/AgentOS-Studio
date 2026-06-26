import { StartupTiming } from '@/lib/startup-timing'
import { StartupStore } from '@/lib/startup-store'
import { StartupScheduler } from '@/lib/startup-scheduler'
import type { StartupReport, StartupReportEntry, ServiceStatus } from '../kernel/types'

let _startupMode: 'cold' | 'warm' = 'cold'

export function detectStartupMode(): 'cold' | 'warm' {
  try {
    const hasSettings = localStorage.getItem('agentic-config') !== null
    const hasSession = sessionStorage.getItem('is-electron') !== null
    _startupMode = (hasSettings && hasSession) ? 'warm' : 'cold'
  } catch {
    _startupMode = 'cold'
  }
  return _startupMode
}

export function getStartupMode(): 'cold' | 'warm' {
  return _startupMode
}

export function generateStartupReport(): StartupReport {
  const timing = StartupTiming.getAll()
  const schedulerResults = StartupScheduler.getResults()
  const services = StartupStore.getServices()

  const entries: StartupReportEntry[] = []
  for (const [name, data] of Object.entries(timing)) {
    if (name.startsWith('task:') && name.endsWith(':done')) {
      entries.push({
        phase: name.replace('task:', '').replace(':done', ''),
        duration: data.duration,
        status: 'success',
        parallel: true,
      })
    }
  }

  const tier1Done = timing['tier1:complete']
  const tier2Start = timing['tier2:start']
  const tier2Done = timing['tier2:complete']
  const bootDone = timing['boot:complete']

  entries.unshift({
    phase: 'Tier 1 (critical)',
    duration: tier1Done ? tier1Done.elapsed : 0,
    status: 'success',
    parallel: false,
  })

  entries.push({
    phase: 'Tier 2 (parallel background)',
    duration: tier2Done && tier2Start ? tier2Done.elapsed - tier2Start.elapsed : 0,
    status: 'success',
    parallel: true,
  })

  const longest = [...entries].sort((a, b) => b.duration - a.duration)[0]
  const failedServices = services.filter(s => s.status === 'failed')

  const report: StartupReport = {
    version: typeof document !== 'undefined'
      ? (document.querySelector('meta[name="app-version"]') as HTMLMetaElement)?.content || '3.0.0'
      : '3.0.0',
    platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
    mode: _startupMode,
    totalDuration: bootDone?.elapsed ?? StartupTiming.getTotal(),
    criticalPath: tier1Done?.elapsed ?? 0,
    deferredDuration: tier2Done && tier2Start ? tier2Done.elapsed - tier2Start.elapsed : 0,
    entries,
    longestTask: longest ? { name: longest.phase, duration: longest.duration } : { name: '', duration: 0 },
    failedServices: failedServices.map(s => s.name),
    services: schedulerResults.map(r => ({
      id: r.id,
      status: r.status === 'completed' ? 'running' as ServiceStatus : r.status === 'failed' ? 'failed' as ServiceStatus : 'uninitialized' as ServiceStatus,
      duration: r.duration,
    })),
  }

  return report
}

export function formatReport(report: StartupReport): string {
  const lines: string[] = []
  lines.push('AgenticOS Startup Report')
  lines.push(''.padEnd(60, '═'))
  lines.push(`Version:          ${report.version}`)
  lines.push(`Platform:         ${report.platform}`)
  lines.push(`Mode:             ${report.mode === 'cold' ? 'Cold Start' : 'Warm Start'}`)
  lines.push('')
  lines.push('Timing')
  lines.push(''.padEnd(60, '─'))
  lines.push(`  Total Duration:     ${report.totalDuration}ms`)
  lines.push(`  Critical Path:      ${report.criticalPath}ms`)
  lines.push(`  Background:         ${report.deferredDuration}ms`)
  if (report.longestTask.name) {
    lines.push(`  Slowest:            ${report.longestTask.name} (${report.longestTask.duration}ms)`)
  }
  lines.push('')
  lines.push('Services')
  lines.push(''.padEnd(60, '─'))
  for (const svc of report.services) {
    const statusIcon = svc.status === 'running' ? '✓' : svc.status === 'failed' ? '✗' : '…'
    lines.push(`  ${statusIcon} ${svc.id.padEnd(20)} ${svc.duration}ms`)
  }
  if (report.failedServices.length > 0) {
    lines.push('')
    lines.push('Failed Services')
    lines.push(''.padEnd(60, '─'))
    for (const f of report.failedServices) {
      lines.push(`  ✗ ${f}`)
    }
  }
  lines.push(''.padEnd(60, '═'))
  return lines.join('\n')
}
