import { type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { NavigationRail } from '@/components/layout/navigation-rail'
import { Toasts } from '@/components/ui/Toasts'
import { SafeErrorBoundary, SidebarBoundary, WorkspaceBoundary } from '../error-boundaries'
import { SandboxStatusIndicator } from '@/components/workspace/sandbox/SandboxStatusIndicator'
import { useApprovalStore } from '../../runtime/approval-gate'
import { useAgentStore } from '../../stores/agent-store'
import { useLeakTracker } from '@/performance/leak-detector'
import { ExecutionSessionManager } from '@/runtime/sessions/ExecutionSessionManager'
import { fadeInUp } from '@/lib/motion'
import { useReducedMotion } from '@/lib/reduced-motion'

function ApprovalToast() {
  const { pending, approve, reject } = useApprovalStore()
  if (!pending) return null

  return (
    <div style={{
      position: 'fixed', bottom: '80px', right: '24px', zIndex: 9999,
      width: '420px', background: '#1a1a1f', border: '1px solid #f59e0b',
      borderRadius: '12px', padding: '16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: '13px' }}>Agent needs approval</span>
        <button onClick={() => reject()} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '18px' }}>x</button>
      </div>
      <div style={{
        background: '#0d0d10', borderRadius: '8px', padding: '10px 12px',
        marginBottom: '14px', fontFamily: 'monospace', fontSize: '13px',
        color: '#e2e8f0', wordBreak: 'break-all',
      }}>{pending.command}</div>
      <p style={{ color: '#888', fontSize: '12px', marginBottom: '14px', margin: '0 0 14px' }}>
        This command requires your approval before execution.
      </p>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => approve()} style={{
          flex: 1, background: '#16a34a', color: '#fff', border: 'none',
          borderRadius: '8px', padding: '8px 0', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
        }}>Allow</button>
        <button onClick={() => reject()} style={{
          flex: 1, background: '#dc2626', color: '#fff', border: 'none',
          borderRadius: '8px', padding: '8px 0', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
        }}>Deny</button>
      </div>
    </div>
  )
}

function AgentActivityBadge() {
  const isProcessing = useAgentStore(s => s.isProcessing)
  if (!isProcessing) return null

  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 9998,
      background: '#1a1a1f', border: '1px solid #3b82f6', borderRadius: '24px',
      padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)', fontSize: '13px',
      color: '#e2e8f0', cursor: 'default', userSelect: 'none',
    }}>
      <span style={{
        width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6',
        display: 'inline-block', animation: 'pulse 1.5s infinite',
      }} />
      <span>
        Agent working...
      </span>
      <button onClick={() => ExecutionSessionManager.cancelCurrent()} style={{
        background: 'none', border: '1px solid #555', borderRadius: '12px',
        color: '#888', cursor: 'pointer', fontSize: '11px', padding: '2px 8px',
      }}>Cancel</button>
    </div>
  )
}

export function AppShell() {
  useLeakTracker("AppShell")
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
