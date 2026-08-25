import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.2,
  })
}

import App from './App'
import { SafeErrorBoundary } from '@/core/error-boundaries'
import { persistSettings } from './lib/settings-store'
import { persistLedger } from './lib/ledger'
import { useLedgerStore } from './stores/ledger-store'
import { useAppStore } from './stores/app-store'
import { useWorkspaceRuntime } from './runtime/workspace-runtime'
import { cancelPendingRefresh } from './runtime/runtime-coordinator'
import { bootRuntime, shutdownRuntime, getKernel } from './core/kernel/startup'
import { isInSafeMode } from './core/crash-handling/safe-mode'
import { RuntimeCleanupManager } from './runtime/RuntimeCleanupManager'
import { ExecutionSessionManager } from './runtime/sessions/ExecutionSessionManager'

import { loader } from '@monaco-editor/react'
import { StartupTiming } from './lib/startup-timing'
import type { StartupPhase } from './lib/startup-store'

const monacoBase = location.protocol === 'file:'
  ? './monacoeditorwork/vs'
  : '/monacoeditorwork/vs'
loader.config({ paths: { vs: monacoBase } })

import './index.css'

window.addEventListener('error', (e) => {
  console.error('[GLOBAL_ERROR]', e.error?.message || e.message, e.error?.stack || '')
})

window.addEventListener('unhandledrejection', (e) => {
  console.error('[UNHANDLED_PROMISE]', e.reason?.message || String(e.reason), e.reason?.stack || '')
})

function useDebouncedPersist(delay = 2000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const schedule = () => {
    cancel()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      persistSettings()
    }, delay)
  }

  useEffect(() => {
    return cancel
  }, [])

  return { schedule, cancel }
}

function Root() {
  const [startupPhase, setStartupPhase] = useState<StartupPhase>('booting')
  const initGuard = useRef(false)
  const { schedule: schedulePersist, cancel: cancelPersist } = useDebouncedPersist()

  useEffect(() => {
    if (initGuard.current) return
    initGuard.current = true
    StartupTiming.mark('react-mounted')
    console.log('[Startup] Root mounted — app shell rendering immediately')

    const unsubs: (() => void)[] = []
    let cancelled = false

    const init = async () => {
      // Phase 1: platform info (non-critical, runs in background)
      try {
        const { invoke } = await import('@/lib/electron-api')
        const info: { first_launch: boolean } = await invoke('get_install_info')
        sessionStorage.setItem('first-launch', String(info.first_launch))
      } catch {
        sessionStorage.setItem('first-launch', 'false')
      }

      if (window.electronAPI) {
        sessionStorage.setItem('is-electron', 'true')
      }

      // Phase 2: boot runtime — all services initialize here
      // The app shell is already visible; services load in background
      let report
      try {
        report = await bootRuntime()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Boot] Runtime init CRASHED:', msg)
      }

      // Phase 3: attach persistence subscriptions
      if (!cancelled) {
        unsubs.push(
          useAppStore.subscribe(() => schedulePersist()),
          useLedgerStore.subscribe(() => persistLedger()),
        )
      }

      StartupTiming.mark('ui:interactive')
      console.log('[Startup] Runtime ready — app fully interactive')
      if (!cancelled) {
        setStartupPhase('ready')
      }
    }

    init()

    return () => {
      cancelled = true
      for (const unsub of unsubs) unsub()
      cancelPersist()
      cancelPendingRefresh()

      const activeSessions = ExecutionSessionManager.getInstance().getActiveSessions()
      for (const s of activeSessions) {
        ExecutionSessionManager.getInstance().cancel(s.id)
      }

      RuntimeCleanupManager.getInstance().shutdown().catch((err) => {
        console.error('[Cleanup] Shutdown error:', err)
      })
      shutdownRuntime()
    }
  }, [])

  return <App startupPhase={startupPhase} />
}

const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#09090b;color:#e2e8f0;font-family:sans-serif;padding:24px;text-align:center;"><div><h1 style="font-size:18px;font-weight:600;margin-bottom:8px;">AgenticOS couldn't start</h1><p style="font-size:13px;color:#888;max-width:400px;">The application root element was not found. This may indicate a corrupted installation.</p><button onclick="location.reload()" style="padding:10px 24px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;margin-top:16px;">Reload</button></div></div>`
} else {
  try {
    createRoot(rootEl).render(
      <HashRouter>
        <SafeErrorBoundary name="Root">
          <Root />
        </SafeErrorBoundary>
      </HashRouter>,
    )
    console.log('[Startup] React root rendered')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Startup] Fatal React render error:', msg)
    rootEl.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#09090b;color:#e2e8f0;font-family:sans-serif;padding:24px;text-align:center;gap:16px;"><div style="font-size:40px;">!</div><h1 style="font-size:18px;font-weight:600;margin:0;">AgenticOS couldn't start</h1><p style="font-size:13px;color:#888;max-width:440px;line-height:1.5;margin:0;">A critical error occurred while rendering the application.</p><div style="background:#1a1a1f;border-radius:8px;padding:12px 16px;max-width:440px;font-size:12px;color:#ef4444;font-family:monospace;word-break:break-all;">${msg.replace(/</g, '&lt;').replace(/</g, '&gt;')}</div><button onclick="location.reload()" style="padding:10px 24px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;">Retry</button></div>`
  }
}
