import { Outlet } from "react-router-dom"
import { NavigationRail } from "./navigation-rail"
import { Toasts } from "@agentic-os/ui"
import { useApprovalStore } from "../../runtime/approval-gate"

function ApprovalToast() {
  const { pending, approve, reject } = useApprovalStore()

  if (!pending) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '80px',
        right: '24px',
        zIndex: 9999,
        width: '420px',
        background: '#1a1a1f',
        border: '1px solid #f59e0b',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: '13px' }}>
          ⚡ Agent needs approval
        </span>
        <button
          onClick={() => reject()}
          style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      <div style={{
        background: '#0d0d10',
        borderRadius: '8px',
        padding: '10px 12px',
        marginBottom: '14px',
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#e2e8f0',
        wordBreak: 'break-all',
      }}>
        {pending.command}
      </div>

      <p style={{ color: '#888', fontSize: '12px', marginBottom: '14px', margin: '0 0 14px' }}>
        This command requires your approval before execution.
      </p>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => approve()}
          style={{
            flex: 1,
            background: '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 0',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '13px',
          }}
        >
          ✓ Allow
        </button>
        <button
          onClick={() => reject()}
          style={{
            flex: 1,
            background: '#dc2626',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 0',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '13px',
          }}
        >
          ✗ Deny
        </button>
      </div>
    </div>
  )
}

export function AppLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <NavigationRail />
      <main className="flex-1 overflow-hidden min-h-0 min-w-0">
        <Outlet />
      </main>
      <Toasts />
      <ApprovalToast />
    </div>
  )
}
