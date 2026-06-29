import { Component, useState, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppShell, RouteContainer } from '@/core/routing'
import { SafeErrorBoundary } from '@/core/error-boundaries'
import { ControlCenterPage } from '@/pages/control-center'
import { CodeCanvasPage } from '@/pages/code-canvas'
import { SettingsPage } from '@/pages/settings'
import { GitPage } from '@/pages/git'
import { RuntimeHealthPanel } from '@/components/runtime/RuntimeHealthPanel'
import { StressTestPage } from '@/pages/__stress-test'
import { useLeakTracker } from '@/performance/leak-detector'
import { ReducedMotionProvider } from '@/lib/reduced-motion'
import { WelcomeWizard } from '@/components/workspace/WelcomeWizard'
import { AboutDialog } from '@/components/AboutDialog'
import { StartupTiming } from '@/lib/startup-timing'
import { StartupStore, type StartupPhase } from '@/lib/startup-store'
import logoSvg from '@/assets/branding/logo.svg'

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
      fontFamily: 'Inter Variable, Inter, system-ui, sans-serif',
      gap: '20px', userSelect: 'none', padding: '40px',
    }}>
      <img src={logoSvg} alt="AgenticOS" width={64} height={64} />
      <div style={{ fontSize: 'var(--font-size-heading-s)', fontWeight: 600, color: '#e2e8f0', letterSpacing: '-0.2px' }}>
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
      <AboutDialog />
      <WelcomeWizard open={showWelcome} onClose={() => setShowWelcome(false)} />
      <Routes>
        <Route element={<AppShell />}>
          {/* Workspace is the default landing page */}
          <Route path="/" element={
            startupPhase === 'booting'
              ? <AppLoadingOverlay />
              : <SafeErrorBoundary name="CodeCanvas"><RouteContainer><CodeCanvasPage /></RouteContainer></SafeErrorBoundary>
          } />
          <Route path="/code-canvas" element={
            startupPhase === 'booting'
              ? <AppLoadingOverlay />
              : <SafeErrorBoundary name="CodeCanvas"><RouteContainer><CodeCanvasPage /></RouteContainer></SafeErrorBoundary>
          } />
          {/* Dashboard moved to /dashboard */}
          <Route path="/dashboard" element={
            startupPhase === 'booting'
              ? <AppLoadingOverlay />
              : <SafeErrorBoundary name="Route"><RouteContainer><ControlCenterPage /></RouteContainer></SafeErrorBoundary>
          } />
          <Route path="/settings" element={<SafeErrorBoundary name="Settings"><RouteContainer><SettingsPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/git" element={<SafeErrorBoundary name="Git"><RouteContainer><GitPage /></RouteContainer></SafeErrorBoundary>} />
          {import.meta.env.DEV && (
            <>
              <Route path="/__health" element={<SafeErrorBoundary name="Health"><RuntimeHealthPanel /></SafeErrorBoundary>} />
              <Route path="/__stress" element={<SafeErrorBoundary name="StressTest"><StressTestPage /></SafeErrorBoundary>} />
            </>
          )}
          <Route path="*" element={
            startupPhase === 'booting'
              ? <AppLoadingOverlay />
              : <SafeErrorBoundary name="CodeCanvas"><RouteContainer><CodeCanvasPage /></RouteContainer></SafeErrorBoundary>
          } />
        </Route>
      </Routes>
    </SafeErrorBoundary>
    </ReducedMotionProvider>
    </RootErrorBoundary>
  )
}
