import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppShell, RouteContainer } from '@/core/routing'
import { SafeErrorBoundary } from '@/core/error-boundaries'
import { ControlCenterPage } from '@/pages/control-center'
import { CodeCanvasPage } from '@/pages/code-canvas'
import { SettingsPage } from '@/pages/settings'
import { InstallPanel } from '@/pages/install-panel'
import { UpdatePanel } from '@/pages/update-panel'
import { ResetPanel } from '@/pages/reset-panel'
import { AgentsPage } from '@/pages/agents'
import { LogsPage } from '@/pages/logs'
import { GitPage } from '@/pages/git'
import { MemoryPage } from '@/pages/memory'
import { ContextDashboardPage } from '@/pages/context-dashboard'
import { RuntimeHealthPanel } from '@/components/runtime/RuntimeHealthPanel'
import { StressTestPage } from '@/pages/__stress-test'
import { useLeakTracker } from '@/performance/leak-detector'
import { ReducedMotionProvider } from '@/lib/reduced-motion'

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
          <div style={{
            fontSize: '48px', marginBottom: '16px',
          }}>!</div>
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

export default function App() {
  useLeakTracker("App")

  return (
    <RootErrorBoundary>
    <ReducedMotionProvider>
    <SafeErrorBoundary name="Application">
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<SafeErrorBoundary name="Route"><RouteContainer><ControlCenterPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/control-center" element={<SafeErrorBoundary name="Route"><RouteContainer><ControlCenterPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/code-canvas" element={<SafeErrorBoundary name="CodeCanvas"><RouteContainer><CodeCanvasPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/settings" element={<SafeErrorBoundary name="Settings"><RouteContainer><SettingsPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/settings/install" element={<SafeErrorBoundary name="InstallPanel"><RouteContainer><InstallPanel /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/settings/update" element={<SafeErrorBoundary name="UpdatePanel"><RouteContainer><UpdatePanel /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/settings/reset" element={<SafeErrorBoundary name="ResetPanel"><RouteContainer><ResetPanel /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/agents" element={<SafeErrorBoundary name="Agents"><RouteContainer><AgentsPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/logs" element={<SafeErrorBoundary name="Logs"><RouteContainer><LogsPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/git" element={<SafeErrorBoundary name="Git"><RouteContainer><GitPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/memory" element={<SafeErrorBoundary name="Memory"><RouteContainer><MemoryPage /></RouteContainer></SafeErrorBoundary>} />
          <Route path="/context" element={<SafeErrorBoundary name="ContextDashboard"><RouteContainer><ContextDashboardPage /></RouteContainer></SafeErrorBoundary>} />
          {import.meta.env.DEV && (
            <>
              <Route path="/__health" element={<SafeErrorBoundary name="Health"><RuntimeHealthPanel /></SafeErrorBoundary>} />
              <Route path="/__stress" element={<SafeErrorBoundary name="StressTest"><StressTestPage /></SafeErrorBoundary>} />
            </>
          )}
          <Route path="*" element={<SafeErrorBoundary name="Fallback"><RouteContainer><ControlCenterPage /></RouteContainer></SafeErrorBoundary>} />
        </Route>
      </Routes>
    </SafeErrorBoundary>
    </ReducedMotionProvider>
    </RootErrorBoundary>
  )
}
