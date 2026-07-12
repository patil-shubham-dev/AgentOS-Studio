import { useState, useEffect } from 'react'
import { StartupTiming } from '@/lib/startup-timing'
import { StartupStore } from '@/lib/startup-store'
import { ReadinessGate } from '@/core/services/ReadinessGate'

import { getStartupMode, generateStartupReport, formatReport } from '@/core/services/StartupReport'
import { detectRegressions, clearHistory } from '@/lib/startup-regression'

function GanttBar({ label, startMs, durationMs, totalMs, color }: {
  label: string; startMs: number; durationMs: number; totalMs: number; color: string
}) {
  const leftPct = totalMs > 0 ? (startMs / totalMs) * 100 : 0
  const widthPct = totalMs > 0 ? (durationMs / totalMs) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
      <span style={{ minWidth: '100px', fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, height: '16px', background: 'var(--surface-panel)', borderRadius: '3px', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: `${leftPct}%`, width: `${Math.max(widthPct, 1)}%`,
          height: '100%', background: color, borderRadius: '3px', opacity: 0.8,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <span style={{ minWidth: '50px', fontSize: '10px', color: 'var(--text-tertiary)', textAlign: 'right' }}>{durationMs}ms</span>
    </div>
  )
}

export function StartupDiagnosticsPage() {
  const [timingData, setTimingData] = useState<Record<string, { time: number; elapsed: number; duration: number }>>({})
  const [services, setServices] = useState(StartupStore.getServices())
  const [readiness, setReadiness] = useState(ReadinessGate.getAll())
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setTimingData({ ...StartupTiming.getAll() })
    const unsubStore = StartupStore.subscribe(() => {
      setServices([...StartupStore.getServices()])
    })
    const unsubReadiness = ReadinessGate.subscribe((states) => {
      setReadiness([...states])
    })
    return () => { unsubStore(); unsubReadiness() }
  }, [])

  const totalDuration = StartupTiming.getTotal()
  const startupReport = generateStartupReport()

  const ganttEntries = Object.entries(timingData)
    .filter(([k]) => k.startsWith('task:') && k.endsWith(':done'))
    .map(([k, v]) => ({
      name: k.replace('task:', '').replace(':done', ''),
      startMs: v.elapsed - v.duration,
      durationMs: v.duration,
      elapsed: v.elapsed,
      color: '#60a5fa',
    }))
    .sort((a, b) => a.elapsed - b.elapsed)

  const failedServices = services.filter(s => s.status === 'failed')
  const readyServices = services.filter(s => s.status === 'ready')

  let copyText = `AgenticOS Startup Diagnostics\n`
  copyText += `Generated: ${new Date().toISOString()}\n`
  copyText += `Mode: ${getStartupMode()}\n`
  copyText += `Total Duration: ${totalDuration}ms\n\n`
  copyText += formatReport(startupReport)
  copyText += `\n\nReadiness:\n`
  copyText += readiness.map(r => `  ${r.level.padEnd(15)} ${r.ready ? '✓' : '…'}  ${r.label}`).join('\n')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const handleExport = () => {
    const blob = new Blob([copyText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agenticos-startup-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', fontFamily: "'Inter', system-ui, sans-serif", color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
          Startup Diagnostics
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleCopy} style={{
            padding: '6px 14px', background: copied ? 'var(--color-success-text)' : 'var(--color-accent-brand)', color: '#fff',
            border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, fontSize: '12px',
          }}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={handleExport} style={{
            padding: '6px 14px', background: 'transparent', color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, fontSize: '12px',
          }}>
            Export
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={{
        background: 'var(--surface-overlay)', borderRadius: '12px', padding: '20px', marginBottom: '20px',
        border: '1px solid var(--border-default)',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
          Summary
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          {[
            ['Total Duration', `${totalDuration}ms`],
            ['Startup Mode', getStartupMode() === 'cold' ? '❄️ Cold' : '🔥 Warm'],
            ['Services Loaded', `${readyServices.length}`],
            ['Services Failed', `${failedServices.length}`],
            ['Critical Path', `${startupReport.criticalPath}ms`],
            ['Background', `${startupReport.deferredDuration}ms`],
          ].map(([label, value]) => (
            <div key={label} style={{
              background: 'var(--surface-panel)', borderRadius: '8px', padding: '12px 16px',
            }}>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Readiness Gates */}
      <div style={{
        background: 'var(--surface-overlay)', borderRadius: '12px', padding: '20px', marginBottom: '20px',
        border: '1px solid var(--border-default)',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
          Readiness
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {readiness.map(r => {
            const color = r.ready ? 'var(--color-success-text)' : 'var(--text-tertiary)'
            return (
              <div key={r.level} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 12px', background: 'var(--surface-panel)', borderRadius: '6px',
              }}>
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: color, flexShrink: 0,
                }} />
                <span style={{ fontSize: '13px', minWidth: '120px' }}>{r.label}</span>
                <span style={{ fontSize: '11px', color }}>{r.ready ? 'Ready' : 'Waiting...'}</span>
                {r.timestamp > 0 && (
                  <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                    {new Date(r.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Visual Timeline (Gantt) */}
      <div style={{
        background: 'var(--surface-overlay)', borderRadius: '12px', padding: '20px', marginBottom: '20px',
        border: '1px solid var(--border-default)',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
          Execution Timeline
        </div>
        {ganttEntries.length > 0 ? (
          <div>
            {ganttEntries.map(e => (
              <GanttBar
                key={e.name}
                label={e.name}
                startMs={e.startMs}
                durationMs={e.durationMs}
                totalMs={totalDuration}
                color={e.color}
              />
            ))}
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '20px' }}>
            No timing data available yet. Restart the application to collect data.
          </div>
        )}
      </div>

      {/* Detailed Timeline */}
      <div style={{
        background: 'var(--surface-overlay)', borderRadius: '12px', padding: '20px', marginBottom: '20px',
        border: '1px solid var(--border-default)',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
          Detailed Timeline
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: '1.8' }}>
          {Object.entries(timingData)
            .sort((a, b) => a[1].time - b[1].time)
            .map(([k, v]) => {
              const isTask = k.startsWith('task:')
              const color = isTask ? '#60a5fa' : k.includes('complete') ? 'var(--color-success-text)' : k.includes('start') ? '#f59e0b' : 'var(--text-tertiary)'
              return (
                <div key={k} style={{ display: 'flex', gap: '12px', padding: '2px 0' }}>
                  <span style={{ color: 'var(--text-tertiary)', minWidth: '50px', textAlign: 'right' }}>{v.elapsed}ms</span>
                  <span style={{ color: 'var(--text-quaternary)', minWidth: '40px', textAlign: 'right' }}>+{v.duration}ms</span>
                  <span style={{ color }}>{k}</span>
                </div>
              )
            })}
        </div>
      </div>

      {/* Services */}
      <div style={{
        background: 'var(--surface-overlay)', borderRadius: '12px', padding: '20px', marginBottom: '20px',
        border: '1px solid var(--border-default)',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
          Services
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {services.map(s => {
            const statusColor = s.status === 'ready' ? 'var(--color-success-text)' : s.status === 'failed' ? '#ef4444' : s.status === 'loading' ? '#f59e0b' : 'var(--text-tertiary)'
            return (
              <div key={s.name} style={{
                background: 'var(--surface-panel)', borderRadius: '8px', padding: '12px 16px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%', background: statusColor,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: '13px' }}>{s.name}</span>
                  {s.duration && (
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{s.duration}ms</span>
                  )}
                </div>
                <span style={{ fontSize: '12px', color: statusColor, textTransform: 'capitalize' }}>
                  {s.status}
                  {s.error && <span title={s.error} style={{ color: '#ef4444', marginLeft: '4px', cursor: 'help' }}>!</span>}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Regression Tracking */}
      {(() => {
        const reg = detectRegressions()
        if (!reg.baseline.totalDuration) return null
        return (
          <div style={{
            background: 'var(--surface-overlay)', borderRadius: '12px', padding: '20px', marginBottom: '20px',
            border: reg.hasRegression ? '1px solid #f59e0b' : '1px solid var(--border-default)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>
                Regression Tracking {reg.hasRegression && <span style={{ color: '#f59e0b', marginLeft: '8px' }}>⚠ Warnings</span>}
              </div>
              <button onClick={() => { clearHistory(); window.location.reload() }} style={{
                padding: '4px 10px', background: 'transparent', color: 'var(--text-quaternary)',
                border: '1px solid var(--border-default)', borderRadius: '6px', cursor: 'pointer', fontSize: '11px',
              }}>
                Clear History
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
              <div style={{ background: 'var(--surface-panel)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>BASELINE AVG</div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-success-text)' }}>{reg.baseline.totalDuration}ms</div>
              </div>
              <div style={{ background: 'var(--surface-panel)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>CURRENT</div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: reg.hasRegression ? '#f59e0b' : 'var(--text-primary)' }}>{reg.current.totalDuration}ms</div>
              </div>
            </div>
            {reg.warnings.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {reg.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: '11px', color: '#f59e0b', padding: '4px 8px', background: 'rgba(245,158,11,0.08)', borderRadius: '4px' }}>
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* Startup Report */}
      {startupReport.longestTask.name && (
        <div style={{
          background: 'var(--surface-overlay)', borderRadius: '12px', padding: '20px',
          border: '1px solid var(--border-default)',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
            Startup Report
          </div>
          <pre style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: '11px',
            color: 'var(--text-tertiary)', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap',
          }}>
            {formatReport(startupReport)}
          </pre>
        </div>
      )}
    </div>
  )
}
