import { memo, useMemo } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { TerminalRecord } from "../timeline/step-card"
import { ClickableTerminalOutput } from "./ClickableTerminalOutput"

interface RetryAttempt {
  index: number
  command: string
  exitCode: number | undefined
  output: string
  durationMs?: number
}

interface TerminalRetryChainProps {
  attempts: RetryAttempt[]
  status: "error" | "success"
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export const TerminalRetryChain = memo(function TerminalRetryChain({
  attempts,
  status,
}: TerminalRetryChainProps) {
  const last = attempts[attempts.length - 1]
  const firstFailed = attempts.find((a) => a.exitCode !== 0)
  const totalTime = attempts.reduce((sum, a) => sum + (a.durationMs ?? 0), 0)

  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: "color-mix(in srgb, var(--color-accent-amber) 20%, transparent)" }}>
      <div
        className="px-3 py-2 flex items-center gap-2"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-accent-amber) 6%, transparent)" }}
      >
        <svg viewBox="0 0 14 14" className="h-[14px] w-[14px] shrink-0" fill="none" stroke="var(--color-accent-amber)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 1.5L13 3.5L11 5.5" />
          <path d="M13 3.5H6" />
          <path d="M3 8.5L1 10.5L3 12.5" />
          <path d="M1 10.5H9" />
        </svg>
        <span className="text-[11px] font-semibold" style={{ color: "var(--color-accent-amber)" }}>
          Retried {attempts.length - 1} time{attempts.length - 1 !== 1 ? "s" : ""}
          {status === "success" ? " — succeeded eventually" : " — all failed"}
        </span>
        {totalTime > 0 && (
          <span className="text-[9px] font-mono ml-auto tabular-nums" style={{ color: "var(--text-quaternary)" }}>
            {formatDuration(totalTime)}
          </span>
        )}
      </div>
      <div className="divide-y" style={{ borderColor: "color-mix(in srgb, var(--color-accent-amber) 12%, transparent)" }}>
        {attempts.map((attempt, i) => {
          const isFailed = attempt.exitCode !== 0
          const isLast = i === attempts.length - 1
          return (
            <div key={i} className="px-3 py-1.5" style={{ backgroundColor: i % 2 === 1 ? "color-mix(in srgb, var(--surface-elevated) 30%, transparent)" : "transparent" }}>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "flex items-center justify-center h-[16px] w-[16px] rounded shrink-0 text-[8px] font-bold",
                  isFailed ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400",
                )}>
                  {isFailed ? "✕" : "✓"}
                </span>
                <span className="text-[10px] font-mono truncate flex-1" style={{ color: isFailed ? "var(--color-accent-red)" : "var(--text-tertiary)" }}>
                  {attempt.command}
                </span>
                <span className="text-[9px] font-mono tabular-nums" style={{ color: "var(--text-quaternary)" }}>
                  {attempt.durationMs ? formatDuration(attempt.durationMs) : ""}
                </span>
                <span className={cn(
                  "text-[9px] font-mono tabular-nums",
                  attempt.exitCode === 0 ? "text-emerald-400" : "text-red-400",
                )}>
                  Exit {attempt.exitCode ?? -1}
                </span>
              </div>
              {attempt.output && (isLast ? true : isFailed) && (
                <div className="mt-1 ml-6 max-h-[100px] overflow-hidden rounded" style={{ backgroundColor: "var(--surface-elevated)" }}>
                  <ClickableTerminalOutput
                    text={attempt.output}
                    maxLength={2000}
                    maxHeight={100}
                    isError={isFailed}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})
