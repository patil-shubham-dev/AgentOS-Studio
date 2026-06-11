import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { SafeErrorBoundary } from '@/core/error-boundaries'
import { persistSettings } from './lib/settings-store'
import { persistLedger } from './lib/ledger'
import { useLedgerStore } from './stores/ledger-store'
import { useAppStore } from './stores/app-store'
import { useWorkspaceRuntime } from './runtime/workspace-runtime'
import { useTimelineStore } from './components/workspace/timeline/timeline-store'
import { persistChatState, clearPersistedChatState, saveToHistory } from './components/workspace/timeline/chat-persistence'
import { cancelPendingRefresh } from './runtime/runtime-coordinator'
import { bootRuntime, shutdownRuntime, getKernel } from './core/kernel/startup'
import { isInSafeMode } from './core/crash-handling/safe-mode'
import { RuntimeCleanupManager } from './runtime/RuntimeCleanupManager'
import { ExecutionSessionManager } from './runtime/sessions/ExecutionSessionManager'
import { tauriFetch } from '@agentic-os/providers/http-client'
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
  const [ready, setReady] = useState(false)
  const initGuard = useRef(false)
  const { schedule: schedulePersist, cancel: cancelPersist } = useDebouncedPersist()

  useEffect(() => {
    if (initGuard.current) return
    initGuard.current = true

    const unsubs: (() => void)[] = []
    let cancelled = false

    const init = async () => {
      // Phase 1: platform info
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const info: { first_launch: boolean } = await invoke('get_install_info')
        sessionStorage.setItem('first-launch', String(info.first_launch))
      } catch {
        sessionStorage.setItem('first-launch', 'false')
      }

      // Set Electron environment flag
      if (window.electronAPI) {
        sessionStorage.setItem('is-electron', 'true')
      }

      // Phase 2: kernel boot (orchestrates all services)
      let report
      try {
        report = await bootRuntime()
        if (!report.success) {
          console.error('[Boot] Kernel boot DEGRADED — some services failed')
        }
      } catch (err) {
        console.error('[Boot] Kernel boot CRASHED:', err)
        report = { success: false, duration: 0, services: [], kernel: 'error' }
      }

      // Phase 3: fresh chat on launch — no auto-restore
      // Previous sessions are preserved in History for manual access
      useTimelineStore.getState().clear()

      // Phase 4: attach subscriptions (only if not cancelled)
      if (!cancelled) {
        unsubs.push(
          useAppStore.subscribe(() => {
            schedulePersist()
          }),
        )
        unsubs.push(
          useLedgerStore.subscribe(() => {
            persistLedger()
          }),
        )

        // Debounced timeline persistence — persists 2s after last change
        let timelineTimer: ReturnType<typeof setTimeout> | null = null
        unsubs.push(
          useTimelineStore.subscribe(() => {
            if (timelineTimer) clearTimeout(timelineTimer)
            timelineTimer = setTimeout(() => {
              timelineTimer = null
              const s = useTimelineStore.getState()
              persistChatState(s.events, s.agentSessions, s.streamingTexts, s.sessionOrder, s.sessionCreatedAtEventCount, s.collapsedSections)
            }, 2000)
          }),
        )
      }

      // Always mark ready once boot completes — the cancelled check above only
      // guards subscription setup. setReady is safe to call after cleanup (React
      // ignores state updates from unmounted components). This prevents the app
      // from staying blank forever under React 18 StrictMode.
      setReady(true)
    }

    init()

    return () => {
      cancelled = true
      for (const unsub of unsubs) unsub()
      cancelPersist()
      cancelPendingRefresh()

      // Snapshot timeline state BEFORE any cleanup mutation
      // This ensures history preserves the actual conversation, not post-cleanup state
      const timeline = useTimelineStore.getState()
      const hasEvents = timeline.events.length > 0
      const snapshot = hasEvents ? {
        events: timeline.events.slice(),
        agentSessions: new Map(timeline.agentSessions),
        streamingTexts: new Map(timeline.streamingTexts),
        sessionOrder: timeline.sessionOrder.slice(),
        sessionCreatedAtEventCount: timeline.sessionCreatedAtEventCount.slice(),
        collapsedSections: new Set(timeline.collapsedSections),
      } : null

      // Step 1: Save snapshot to history (deep-copied via JSON.stringify inside saveToHistory)
      if (snapshot) {
        saveToHistory(snapshot.events, snapshot.agentSessions, snapshot.streamingTexts, snapshot.sessionOrder, snapshot.sessionCreatedAtEventCount, snapshot.collapsedSections)
      }

      // Step 2: Cancel any active execution (mutates store — safe because snapshot already taken)
      const activeSessions = ExecutionSessionManager.getInstance().getActiveSessions()
      for (const s of activeSessions) {
        ExecutionSessionManager.getInstance().cancel(s.id)
      }

      // Step 3: Clear volatile UI state (ensures fresh chat on next launch)
      timeline.clear()
      // Graceful shutdown: clean all runtime resources (streams, tasks, sessions, event listeners)
      RuntimeCleanupManager.getInstance().shutdown().catch((err) => {
        console.error('[Cleanup] Shutdown error:', err)
      })
      shutdownRuntime()
    }
  }, [])

  if (!ready) return null

  return <App />
}

const rootEl = document.getElementById('root')
createRoot(rootEl!).render(
  <StrictMode>
    <HashRouter>
      <SafeErrorBoundary name="Root">
        <Root />
      </SafeErrorBoundary>
    </HashRouter>
  </StrictMode>,
)
