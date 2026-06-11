import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { BrowserAutomationStep } from "./browser-automation"
import {
  Globe, MousePointer, Type, Camera, Terminal, Loader2,
  CheckCircle2, XCircle, ExternalLink, Clock,
  Sparkles,
} from "lucide-react"

const ACTION_ICONS: Record<BrowserAutomationStep["action"], typeof Globe> = {
  launch: ExternalLink,
  navigate: Globe,
  click: MousePointer,
  fill: Type,
  screenshot: Camera,
  "execute-js": Terminal,
  wait: Clock,
  close: XCircle,
}

const ACTION_COLORS: Record<BrowserAutomationStep["action"], string> = {
  launch: "text-emerald-400",
  navigate: "text-blue-400",
  click: "text-amber-400",
  fill: "text-violet-400",
  screenshot: "text-cyan-400",
  "execute-js": "text-green-400",
  wait: "text-orange-400",
  close: "text-red-400",
}

const ACTION_BG_COLORS: Record<BrowserAutomationStep["action"], string> = {
  launch: "bg-emerald-500/10",
  navigate: "bg-blue-500/10",
  click: "bg-amber-500/10",
  fill: "bg-violet-500/10",
  screenshot: "bg-cyan-500/10",
  "execute-js": "bg-green-500/10",
  wait: "bg-orange-500/10",
  close: "bg-red-500/10",
}

interface BrowserActivityStreamProps {
  steps: BrowserAutomationStep[]
  onStepClick?: (step: BrowserAutomationStep) => void
  maxVisible?: number
  compact?: boolean
}

export function BrowserActivityStream({
  steps,
  onStepClick,
  maxVisible = 50,
  compact = false,
}: BrowserActivityStreamProps) {
  const visible = steps.slice(0, maxVisible)

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 mb-3">
          <Sparkles className="h-5 w-5 text-white/20" />
        </div>
        <p className="text-xs text-white/40 font-medium">No activity yet</p>
        <p className="text-[10px] text-white/25 mt-1">
          Launch a browser session to see automation steps here
        </p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-1", compact ? "px-2 py-1" : "px-3 py-2")}>
      {visible.map((step) => {
        const Icon = ACTION_ICONS[step.action]
        const color = ACTION_COLORS[step.action]
        const bgColor = ACTION_BG_COLORS[step.action]
        const duration =
          step.completedAt && step.startedAt
            ? step.completedAt - step.startedAt
            : null

        return (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.15 }}
          >
            <button
              onClick={() => onStepClick?.(step)}
              className={cn(
                "w-full flex items-start gap-2.5 rounded-lg p-2 text-left transition-all",
                step.status === "running"
                  ? "bg-blue-500/[0.04] border border-blue-500/10"
                  : step.status === "failed"
                    ? "bg-red-500/[0.03] border border-red-500/10"
                    : "hover:bg-white/[0.02] border border-transparent",
              )}
            >
              {/* Status indicator */}
              <div
                className={cn(
                  "flex items-center justify-center h-6 w-6 rounded-lg shrink-0 mt-0.5",
                  bgColor,
                )}
              >
                {step.status === "running" ? (
                  <Loader2 className={cn("h-3 w-3 animate-spin", color)} />
                ) : step.status === "done" ? (
                  <CheckCircle2 className="h-3 w-3 text-green-400" />
                ) : step.status === "failed" ? (
                  <XCircle className="h-3 w-3 text-red-400" />
                ) : (
                  <Icon className={cn("h-3 w-3", color)} />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "text-[10px] font-medium",
                      step.status === "failed"
                        ? "text-red-400"
                        : step.status === "running"
                          ? "text-blue-400"
                          : "text-white/70",
                    )}
                  >
                    {step.label}
                  </span>
                  {duration !== null && step.status === "done" && (
                    <span className="text-[8px] text-white/20 font-mono">
                      {duration}ms
                    </span>
                  )}
                </div>

                {step.selector && !compact && (
                  <p className="text-[9px] text-white/30 font-mono mt-0.5 truncate">
                    {step.selector}
                  </p>
                )}

                {step.result && !compact && (
                  <p className="text-[9px] text-green-400/60 mt-0.5 truncate">
                    {step.result}
                  </p>
                )}

                {step.error && (
                  <p className="text-[9px] text-red-400/60 mt-0.5 truncate">
                    {step.error.length > 80
                      ? step.error.slice(0, 80) + "..."
                      : step.error}
                  </p>
                )}

                {step.status === "running" && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="relative inline-flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                    </span>
                    <span className="text-[8px] text-blue-400/60 font-medium">
                      In progress...
                    </span>
                  </div>
                )}
              </div>

              {/* Timestamp */}
              {!compact && (
                <span className="text-[8px] text-white/15 font-mono shrink-0 mt-0.5">
                  {new Date(step.startedAt).toLocaleTimeString([], {
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              )}
            </button>
          </motion.div>
        )
      })}

      {steps.length > maxVisible && (
        <div className="text-center py-1">
          <span className="text-[9px] text-white/25">
            +{steps.length - maxVisible} more steps
          </span>
        </div>
      )}
    </div>
  )
}
