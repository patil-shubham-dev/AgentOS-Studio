import { type ReactNode, useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion as _motion, AnimatePresence } from 'framer-motion'
const motion = _motion
export { motion }
import { NavigationRail } from '@/components/layout/navigation-rail'
import { Toasts } from '@/components/ui/Toasts'
import { Button } from '@/components/ui/Button'
import { SafeErrorBoundary, SidebarBoundary, WorkspaceBoundary } from '../error-boundaries'
import { SandboxStatusIndicator } from '@/components/workspace/sandbox/SandboxStatusIndicator'
import { useApprovalStore } from '../../runtime/approval-gate'
import { useAgentStore } from '../../stores/agent-store'
import { useAppStore } from '@/stores/settings/app-store'
import { useLeakTracker } from '@/performance/leak-detector'
import { fadeInUp } from '@/lib/motion'
import { useReducedMotion } from '@/lib/reduced-motion'
import { QuickStartWizard } from '@/components/workspace/QuickStartWizard'

function ApprovalToast() {
  const { current: pending, queue, approve, reject } = useApprovalStore()
  if (!pending) return null

  return (
    <div
      className="fixed bottom-20 right-6 z-[9999] w-[420px] rounded-xl p-4 shadow-2xl"
      style={{
        backgroundColor: "var(--surface-overlay)",
        border: "1px solid #f59e0b",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-semibold" style={{ color: "#f59e0b" }}>
          Agent needs approval
        </span>
        <button
          onClick={() => reject()}
          className="flex items-center justify-center h-5 w-5 rounded transition-colors"
          style={{ color: "var(--text-quaternary)" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)" }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-quaternary)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div
        className="rounded-lg px-3 py-2.5 mb-3 font-mono text-[13px] break-all"
        style={{
          backgroundColor: "var(--surface-elevated)",
          color: "var(--text-primary)",
        }}
      >
        {pending.command}
      </div>
      <p className="text-[12px] mb-3" style={{ color: "var(--text-tertiary)" }}>
        This command requires your approval before execution.
        {queue.length > 0 && (
          <span style={{ color: "#f59e0b", marginLeft: "8px" }}>+{queue.length} queued</span>
        )}
      </p>
      <div className="flex gap-2">
        <Button variant="primary" size="default" onClick={() => approve()} className="flex-1">
          Allow
        </Button>
        <button
          onClick={() => reject()}
          className="flex-1 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all"
          style={{
            borderColor: "var(--border-default)",
            color: "var(--text-secondary)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--text-quaternary)"; e.currentTarget.style.color = "var(--text-primary)" }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-secondary)" }}
        >
          Deny
        </button>
      </div>
    </div>
  )
}

function AgentActivityBadge() {
  const isProcessing = useAgentStore(s => s.isProcessing)
  if (!isProcessing) return null

  return (
    <div
      className="fixed bottom-6 right-6 z-[9998] flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] shadow-lg select-none"
      style={{
        backgroundColor: "var(--surface-overlay)",
        border: "1px solid var(--color-accent-brand-border)",
        color: "var(--text-primary)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{
          backgroundColor: "var(--color-accent-brand)",
          animation: "pulse 1.5s infinite",
        }}
      />
      <span>Agent working...</span>
      <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: "var(--border-default)", color: "var(--text-quaternary)" }}>
        Cancel
      </span>
    </div>
  )
}

export function AppShell() {
  useLeakTracker("AppShell")
  const providers = useAppStore((s) => s.providers)
  const mockMode = useAppStore((s) => s.mockMode)
  const hasProvider = providers.length > 0 && providers.some((p) => p.apiKey)
  const [showQuickStart, setShowQuickStart] = useState(false)

  useEffect(() => {
    if (!hasProvider && !mockMode) {
      const dismissed = localStorage.getItem("agenticOS.quickStart.dismissed")
      if (!dismissed) {
        setShowQuickStart(true)
      }
    }
  }, [hasProvider, mockMode])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <SidebarBoundary>
        <NavigationRail />
      </SidebarBoundary>
      <WorkspaceBoundary>
        <main className="flex-1 overflow-hidden min-h-0 min-w-0">
          <AnimatePresence mode="wait">
            <Outlet />
          </AnimatePresence>
        </main>
      </WorkspaceBoundary>
      <Toasts />
      <ApprovalToast />
      <AgentActivityBadge />
      <SandboxStatusIndicator />
      <QuickStartWizard
        open={showQuickStart}
        onComplete={() => { setShowQuickStart(false); localStorage.removeItem("agenticOS.quickStart.dismissed") }}
        onDismiss={() => { setShowQuickStart(false); localStorage.setItem("agenticOS.quickStart.dismissed", "true") }}
      />
    </div>
  )
}

export function RouteContainer({ children }: { children: ReactNode }) {
  useLeakTracker("RouteContainer")
  const location = useLocation()
  const { reducedMotion } = useReducedMotion()
  return (
    <SafeErrorBoundary name="Route">
      {reducedMotion ? (
        <div className="h-full">{children}</div>
      ) : (
        <motion.div
          key={location.pathname}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="h-full"
        >
          {children}
        </motion.div>
      )}
    </SafeErrorBoundary>
  )
}

export { SafeErrorBoundary }
