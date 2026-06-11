import { useState, useEffect, useCallback, useRef, memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useApprovalStore } from "@/runtime/approval-gate"
import {
  Shield, ShieldCheck, ShieldAlert, Check, X,
  Terminal,
} from "lucide-react"

export const ApprovalGate = memo(function ApprovalGate() {
  const pending = useApprovalStore((s) => s.pending)
  const expiredMessage = useApprovalStore((s) => s.expiredMessage)
  const approve = useApprovalStore((s) => s.approve)
  const reject = useApprovalStore((s) => s.reject)
  const alwaysAllow = useApprovalStore((s) => s.alwaysAllow)
  const setAlwaysAllow = useApprovalStore((s) => s.setAlwaysAllow)
  const clearExpired = useApprovalStore((s) => s.clearExpired)

  const [countdown, setCountdown] = useState(60)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const needsApproval = pending !== null
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

  const countdownPercent = (countdown / 60) * 100
  const isUrgent = countdown <= 15

  // Show expired message after timeout
  if (hasExpired) {
    return (
      <div className="rounded-xl border border-orange-500/25 bg-gradient-to-r from-orange-500/8 to-orange-500/3 shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-orange-500/15 border border-orange-500/20">
              <ShieldAlert className="h-3.5 w-3.5 text-orange-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-orange-300/80">Approval Request Expired</p>
              <p className="text-[10px] text-orange-300/40 mt-0.5 max-w-sm truncate">{expiredMessage}</p>
            </div>
          </div>
          <button
            onClick={clearExpired}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[9px] text-white/50 hover:text-white/70 transition-all"
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
  const pendingCommand = pending?.command ?? ""
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
              ? "border-red-500/30 shadow-red-500/10"
              : "border-amber-500/25 shadow-amber-500/5",
          )}
          role="dialog"
          aria-label="Approval required"
          aria-modal="true"
        >
          {/* Header */}
          <div className={cn(
            "flex items-center gap-2.5 px-4 py-3 border-b",
            isDangerous
              ? "bg-gradient-to-r from-red-500/10 to-red-500/5 border-red-500/20"
              : "bg-gradient-to-r from-blue-500/8 to-purple-500/5 border-white/[0.06]",
          )}>
            {isDangerous ? (
              <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-red-500/15 border border-red-500/20 shrink-0">
                <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
              </div>
            ) : (
              <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-amber-500/15 border border-amber-500/20 shrink-0">
                <Shield className="h-3.5 w-3.5 text-amber-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white/80">
                  {isDangerous ? "⚠️ Dangerous Operation" : "Approval Required"}
                </span>
                <span className="text-[9px] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded-md font-mono">
                  {pending?.operationType?.replace(/_/g, " ") || "tool execution"}
                </span>
              </div>
              <p className={cn(
                "text-[10px] mt-0.5",
                isDangerous ? "text-red-300/60" : "text-white/40",
              )}>
                {isDangerous
                  ? "This operation has the potential to cause data loss"
                  : `Review the operation details below (auto-rejects in ${countdown}s)`}
              </p>
            </div>
          </div>

          {/* Countdown progress bar */}
          {needsApproval && (
            <div className="h-0.5 bg-white/5 overflow-hidden">
              <motion.div
                className={cn(
                  "h-full rounded-full transition-colors duration-300",
                  isUrgent ? "bg-red-400" : "bg-blue-400/40",
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
                <Terminal className="h-2.5 w-2.5 text-white/30" />
                <span className="text-[9px] text-white/30 font-medium uppercase tracking-wider">
                  Proposed Operation
                </span>
              </div>
              <div className={cn(
                "rounded-lg border p-2.5 font-mono text-[10px] leading-relaxed",
                isDangerous
                  ? "bg-red-500/5 border-red-500/15 text-red-300/80"
                  : "bg-white/[0.02] border-white/5 text-white/60",
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
          <div className="flex items-center gap-2 px-4 py-3 border-t border-white/[0.06]">
            {/* Always allow toggle — persists to store */}
            {!isDangerous && (
              <button
                onClick={() => setAlwaysAllow(!alwaysAllow)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] transition-all",
                  alwaysAllow
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : "text-white/30 hover:text-white/50",
                )}
              >
                <ShieldCheck className={cn(
                  "h-2.5 w-2.5",
                  alwaysAllow ? "text-blue-400" : "text-white/20",
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
                className="text-[9px] text-red-400 font-mono"
              >
                {countdown}s
              </motion.span>
            )}

            {/* Reject button */}
            <button
              onClick={handleReject}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-[10px] font-medium text-red-400 hover:bg-red-500/20 transition-all"
            >
              <X className="h-3 w-3" />
              Reject
            </button>

            {/* Approve button */}
            <button
              onClick={handleApprove}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-3 py-1.5 text-[10px] font-medium text-white shadow-lg shadow-blue-600/20 hover:from-blue-500 hover:to-purple-500 transition-all"
            >
              <Check className="h-3 w-3" />
              Approve
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
})
