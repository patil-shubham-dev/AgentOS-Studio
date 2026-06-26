import { Component, useState, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppShell, RouteContainer } from '@/core/routing'
import { SafeErrorBoundary } from '@/core/error-boundaries'
import { ControlCenterPage } from '@/pages/control-center'
import { CodeCanvasPage } from '@/pages/code-canvas'
import { SettingsPage } from '@/pages/settings'
import { InstallPanel } from '@/pages/install-panel'
import { InstallWizard } from '@/pages/install-wizard'
import { UninstallWizard } from '@/pages/uninstall-wizard'
import { UpdatePanel } from '@/pages/update-panel'
import { ResetPanel } from '@/pages/reset-panel'
import { AgentsPage } from '@/pages/agents'
import { LogsPage } from '@/pages/logs'
import { GitPage } from '@/pages/git'
import { MemoryPage } from '@/pages/memory'
import { PersonasPage } from '@/pages/personas'
import { ContextDashboardPage } from '@/pages/context-dashboard'
import { PerformanceDashboardPage } from '@/pages/performance-dashboard'
import { OrchestrationDashboardPage } from '@/pages/orchestration-dashboard'
import { PluginsPage } from '@/pages/plugins'
import { AuditPage } from '@/pages/audit'
import { RuntimeHealthPanel } from '@/components/runtime/RuntimeHealthPanel'
import { StressTestPage } from '@/pages/__stress-test'
import { useLeakTracker } from '@/performance/leak-detector'
import { ReducedMotionProvider } from '@/lib/reduced-motion'
import { WelcomeWizard } from '@/components/workspace/WelcomeWizard'
import { StartupTiming } from '@/lib/startup-timing'
import { StartupStore, type StartupPhase } from '@/lib/startup-store'
import { StartupDiagnosticsPage } from '@/pages/startup-diagnostics'

export function AppLoadingOverlay() {
  const [services, setServices] = useState(StartupStore.getServices())

  useEffect(() => {
    const unsub = StartupStore.subscribe(() => {
      setServices([...StartupStore.getServices()])
    })
    return unsub
  }, [])

  const readyCount = services.filter(s => s.status === 'ready' || s.status === 'loading').length
  const totalCount = services.length || 1
  const progress = totalCount > 0 ? Math.min(readyCount / totalCount, 0.95) : 0.3

  const currentService = services.find(s => s.status === 'loading')
  const failedService = services.find(s => s.status === 'failed')

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', width: '100%', background: '#0d0d10',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      gap: '20px', userSelect: 'none', padding: '40px',
    }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '12px',
        background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '22px', fontWeight: 700, color: '#fff',
      }}>
        A
      </div>
      <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', letterSpacing: '-0.2px' }}>
        {currentService
          ? `Loading ${currentService.name}...`
          : failedService
            ? `${failedService.name} failed — continuing...`
            : 'Starting up...'}
      </div>
      <div style={{
        width: '200px', height: '3px', background: '#1e1e24', borderRadius: '2px',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
          borderRadius: '2px', transition: 'width 0.5s ease',
          width: `${progress * 100}%`,
        }} />
      </div>
      {services.length > 0 && (
        <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
          {services.map(s => {
            const color = s.status === 'ready' ? '#22c55e' : s.status === 'failed' ? '#ef4444' : s.status === 'loading' ? '#f59e0b' : '#6b7280'
            return (
              <span key={s.name} style={{ color }}>
                {s.status === 'loading' && `→ `}{s.status === 'ready' && `✓ `}{s.status === 'failed' && `✗ `}{s.name}
                {s.duration ? ` (${s.duration}ms)` : ''}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RootErrorBoundary] Fatal crash:', error.message, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', width: '100vw', background: '#09090b', color: '#e2e8f0',
          fontFamily: 'inherit', padding: '24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>!</div>
          <h1 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '13px', color: '#888', maxWidth: '400px', marginBottom: '24px', lineHeight: 1.5 }}>
            A critical error occurred. Try reloading the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px', background: '#2563eb', color: '#fff',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontWeight: 600, fontSize: '13px',
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

interface AppProps {
  startupPhase: StartupPhase
}

export default function App({ startupPhase }: AppProps) {
  useLeakTracker("App")
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    StartupTiming.mark('app:mounted')
    const isFirstLaunch = sessionStorage.getItem("first-launch") === "true"
    if (isFirstLaunch) {
      setShowWelcome(true)
    }
    if (startupPhase === 'booting') {
      StartupTiming.mark('app:shell-rendered')
    }
  }, [startupPhase])

  return (
    <RootErrorBoundary>
    <ReducedMotionProvider>
    <SafeErrorBoundary name="Application">
      <WelcomeWizard open={showWelcome} onClose={() => setShowWelcome(false)} />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={
            startupPhase === 'booting'
              ? <AppLoadingOverlay />
              : <SafeErrorBoundary name="Route"><RouteContainer><ControlCenterPage /></RouteContainer></SafeErrorBoundary>
          } />
          <Route path="/control-center" element={
            startupPhase === 'booting'
              ? <AppLoadingOverlay />
              : <SafeErrorBoundary name="Route"><RouteContainer><ControlCenterPage /></RouteContainer></SafeErrorBoundary>
          } />
          <Route path="/code-canvas" element={<SafeErrorBoundary name="CodeCanvas"><RouteContainer><CodeCanvasPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/settings" element={<SafeErrorBoundary name="Settings"><RouteContainer><SettingsPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/settings/install" element={<SafeErrorBoundary name="InstallPanel"><RouteContainer><InstallPanel /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/settings/install-wizard" element={<SafeErrorBoundary name="InstallWizard"><InstallWizard /></SafeErrorBoundary>} />
          <Route path="/settings/uninstall-wizard" element={<SafeErrorBoundary name="UninstallWizard"><UninstallWizard /></SafeErrorBoundary>} />
          <Route path="/settings/update" element={<SafeErrorBoundary name="UpdatePanel"><RouteContainer><UpdatePanel /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/settings/reset" element={<SafeErrorBoundary name="ResetPanel"><RouteContainer><ResetPanel /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/settings/startup-diagnostics" element={<SafeErrorBoundary name="StartupDiagnostics"><RouteContainer><StartupDiagnosticsPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/agents" element={<SafeErrorBoundary name="Agents"><RouteContainer><AgentsPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/logs" element={<SafeErrorBoundary name="Logs"><RouteContainer><LogsPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/git" element={<SafeErrorBoundary name="Git"><RouteContainer><GitPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/memory" element={<SafeErrorBoundary name="Memory"><RouteContainer><MemoryPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/personas" element={<SafeErrorBoundary name="Personas"><RouteContainer><PersonasPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/context" element={<SafeErrorBoundary name="ContextDashboard"><RouteContainer><ContextDashboardPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/performance" element={<SafeErrorBoundary name="PerformanceDashboard"><RouteContainer><PerformanceDashboardPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/orchestration" element={<SafeErrorBoundary name="OrchestrationDashboard"><RouteContainer><OrchestrationDashboardPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/plugins" element={<SafeErrorBoundary name="Plugins"><RouteContainer><PluginsPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/audit" element={<SafeErrorBoundary name="Audit"><RouteContainer><AuditPage /></RouteContainer></SafeErrorBoundary>} />
          {import.meta.env.DEV && (
            <>
              <Route path="/__health" element={<SafeErrorBoundary name="Health"><RuntimeHealthPanel /></SafeErrorBoundary>} />
              <Route path="/__stress" element={<SafeErrorBoundary name="StressTest"><StressTestPage /></SafeErrorBoundary>} />
            </>
          )}
          <Route path="*" element={
            startupPhase === 'booting'
              ? <AppLoadingOverlay />
              : <SafeErrorBoundary name="Fallback"><RouteContainer><ControlCenterPage /></RouteContainer></SafeErrorBoundary>
          } />
        </Route>
      </Routes>
    </SafeErrorBoundary>
    </ReducedMotionProvider>
    </RootErrorBoundary>
  )
}
