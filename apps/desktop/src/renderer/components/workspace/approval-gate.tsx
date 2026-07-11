import { useState, useEffect, useCallback, useRef, memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useApprovalStore } from "@/runtime/approval-gate"
import {
  Shield, ShieldCheck, ShieldAlert, Check, X,
  Terminal,
} from "lucide-react"

export const ApprovalGate = memo(function ApprovalGate() {
  const current = useApprovalStore((s) => s.current)
  const queueSize = useApprovalStore((s) => s.queue.length)
  const expiredMessage = useApprovalStore((s) => s.expiredMessage)
  const approve = useApprovalStore((s) => s.approve)
  const reject = useApprovalStore((s) => s.reject)
  const alwaysAllow = useApprovalStore((s) => s.alwaysAllow)
  const setAlwaysAllow = useApprovalStore((s) => s.setAlwaysAllow)
  const clearExpired = useApprovalStore((s) => s.clearExpired)

  const [countdown, setCountdown] = useState(60)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const needsApproval = current !== null
  const hasExpired = expiredMessage !== null

  // Countdown timer (60s timeout = auto-reject)
  useEffect(() => {
    if (!needsApproval) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      setCountdown(60)
      return
    }

    setCountdown(60)
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          reject()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [needsApproval, reject])

  const handleApprove = useCallback(() => {
    approve()
  }, [approve])

  const handleReject = useCallback(() => {
    reject()
  }, [reject])

  // Keyboard shortcuts: Enter = Approve, Tab = focus Approve, Escape = Reject
  const approveRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!needsApproval) return
    approveRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        approveRef.current?.focus()
        return
      }
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (e.key === 'Enter') handleApprove()
        else handleReject()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [needsApproval, handleApprove, handleReject])

  const countdownPercent = (countdown / 60) * 100
  const isUrgent = countdown <= 15

  // Show expired message after timeout
  if (hasExpired) {
    return (
      <div className="rounded-xl border border-[var(--color-accent-amber)]/25 bg-gradient-to-r from-[var(--color-accent-amber)]/8 to-[var(--color-accent-amber)]/3 shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-[var(--color-accent-amber)]/15 border border-[var(--color-accent-amber)]/20">
              <ShieldAlert className="h-3.5 w-3.5 text-[var(--color-accent-amber)]" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--color-accent-amber)]/80">Approval Request Expired</p>
              <p className="text-[10px] text-[var(--color-accent-amber)]/40 mt-0.5 max-w-sm truncate">{expiredMessage}</p>
            </div>
          </div>
          <button
            onClick={clearExpired}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--border-subtle)] px-2.5 py-1.5 text-[9px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
          >
            <X className="h-2.5 w-2.5" />
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  if (!needsApproval) return null

  // Extract details from the pending command
  const pendingCommand = current?.command ?? ""
  const isDangerous = pendingCommand.includes("rm -") || pendingCommand.includes("sudo") || pendingCommand.includes("git push --force")

  return (
    <AnimatePresence>
      {needsApproval && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className={cn(
            "rounded-xl border overflow-hidden shadow-2xl",
            isDangerous
              ? "border-[var(--color-accent-red)]/30 shadow-[var(--color-accent-red)]/10"
              : "border-[var(--accent-preview)]/25 shadow-[var(--accent-preview)]/5",
          )}
          role="dialog"
          aria-label="Approval required"
          aria-modal="true"
        >
          {/* Header */}
          <div className={cn(
            "flex items-center gap-2.5 px-4 py-3 border-b",
            isDangerous
              ? "bg-gradient-to-r from-[var(--color-accent-red)]/10 to-[var(--color-accent-red)]/5 border-[var(--color-accent-red)]/20"
              : "bg-gradient-to-r from-[var(--accent-code)]/8 to-[var(--accent-design)]/5 border-[var(--border-default)]",
          )}>
            {isDangerous ? (
              <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-[var(--color-accent-red)]/15 border border-[var(--color-accent-red)]/20 shrink-0">
                <ShieldAlert className="h-3.5 w-3.5 text-[var(--color-accent-red)]" />
              </div>
            ) : (
              <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-[var(--accent-preview)]/15 border border-[var(--accent-preview)]/20 shrink-0">
                <Shield className="h-3.5 w-3.5 text-[var(--accent-preview)]" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  {isDangerous ? "⚠️ Dangerous Operation" : "Approval Required"}
                </span>
              <span className="text-[9px] text-[var(--text-tertiary)] bg-[var(--border-subtle)] px-1.5 py-0.5 rounded-md font-mono">
                {current?.operationType?.replace(/_/g, " ") || "tool execution"}
              </span>
              {queueSize > 0 && (
                <span className="text-[9px] text-[var(--accent-preview)]/60 bg-[var(--accent-preview)]/10 px-1.5 py-0.5 rounded-md font-mono">
                  +{queueSize} queued
                </span>
              )}
              </div>
              <p className={cn(
                "text-[10px] mt-0.5",
                isDangerous ? "text-[var(--color-accent-red)]/60" : "text-[var(--text-tertiary)]",
              )}>
                {isDangerous
                  ? "This operation has the potential to cause data loss"
                  : `Review the operation details below (auto-rejects in ${countdown}s)`}
              </p>
            </div>
          </div>

          {/* Countdown progress bar */}
          {needsApproval && (
            <div className="h-0.5 bg-[var(--border-subtle)] overflow-hidden">
              <motion.div
                className={cn(
                  "h-full rounded-full transition-colors duration-300",
                  isUrgent ? "bg-[var(--color-accent-red)]" : "bg-[var(--accent-code)]/40",
                )}
                initial={{ width: "100%" }}
                animate={{ width: `${countdownPercent}%` }}
                transition={{ duration: 1, ease: "linear" }}
              />
            </div>
          )}

          {/* Command preview */}
          {pendingCommand && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Terminal className="h-2.5 w-2.5 text-[var(--text-tertiary)]" />
                <span className="text-[9px] text-[var(--text-tertiary)] font-medium uppercase tracking-wider">
                  Proposed Operation
                </span>
              </div>
              <div className={cn(
                "rounded-lg border p-2.5 font-mono text-[10px] leading-relaxed",
                isDangerous
                  ? "bg-[var(--color-accent-red)]/5 border-[var(--color-accent-red)]/15 text-[var(--color-accent-red)]/80"
                  : "bg-[var(--surface-overlay)]/50 border-[var(--border-subtle)] text-[var(--text-secondary)]",
              )}>
                <pre className="whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                  {pendingCommand.length > 500
                    ? pendingCommand.slice(0, 500) + "\n..."
                    : pendingCommand}
                </pre>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--border-default)]">
            {/* Always allow toggle — persists to store */}
            {!isDangerous && (
              <button
                onClick={() => setAlwaysAllow(!alwaysAllow)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] transition-all",
                  alwaysAllow
                    ? "bg-[var(--accent-code)]/10 text-[var(--accent-code)] border border-[var(--accent-code)]/20"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
                )}
              >
                <ShieldCheck className={cn(
                  "h-2.5 w-2.5",
                  alwaysAllow ? "text-[var(--accent-code)]" : "text-[var(--text-quaternary)]",
                )} />
                Always allow{alwaysAllow ? "d" : ""}
              </button>
            )}

            <div className="flex-1" />

            {/* Countdown indicator */}
            {isUrgent && (
              <motion.span
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="text-[9px] text-[var(--color-accent-red)] font-mono"
              >
                {countdown}s
              </motion.span>
            )}

            {/* Reject button */}
            <button
              onClick={handleReject}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-accent-red)]/20 bg-[var(--color-accent-red)]/10 px-3 py-1.5 text-[10px] font-medium text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/20 transition-all"
            >
              <X className="h-3 w-3" />
              Reject
              <span className="text-[7px] text-[var(--color-accent-red)]/40 font-mono ml-0.5">⎋</span>
            </button>

            {/* Approve button */}
            <button
              ref={approveRef}
              onClick={handleApprove}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[var(--accent-code)] to-[var(--accent-design)] px-3 py-1.5 text-[10px] font-medium text-white shadow-lg shadow-[var(--accent-code)]/20 hover:from-[var(--color-accent-blue)] hover:to-[var(--accent-design)] transition-all"
            >
              <Check className="h-3 w-3" />
              Approve
              <span className="text-[7px] text-white/40 font-mono ml-0.5">↩</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
})
