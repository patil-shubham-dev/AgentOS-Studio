import { cn } from "@/lib/utils"
import type { ValidationResult } from "@/types"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, Loader2, XCircle, AlertTriangle, RefreshCw, Wifi, WifiOff, Clock, Server } from "lucide-react"

interface ValidationStatusProps {
  state: "idle" | "validating" | "connected" | "failed" | "timeout"
  result: ValidationResult | null
  onRetry?: () => void
  className?: string
}

const ERROR_MESSAGES: Record<string, { message: string; fix: string }> = {
  "Invalid API key": { message: "Invalid API key", fix: "Check your API key and try again" },
  "Endpoint not found": { message: "Endpoint not found", fix: "Verify the base URL is correct" },
  "Connection timed out": { message: "Connection timed out", fix: "Check your internet connection or firewall" },
  "Connection refused": { message: "Connection refused", fix: "Ensure the provider service is running" },
  "No models discovered": { message: "No models returned", fix: "The endpoint is reachable but returned no models" },
  "TIMEOUT_EXCEEDED": { message: "Server not responding", fix: "The provider took too long to respond" },
}

function parseError(error: string): { message: string; fix: string } {
  for (const [key, val] of Object.entries(ERROR_MESSAGES)) {
    if (error.includes(key)) return val
  }
  if (error.toLowerCase().includes("cors")) {
    return { message: "CORS blocked", fix: "This endpoint cannot be accessed from the current environment" }
  }
  if (error.toLowerCase().includes("timeout") || error.toLowerCase().includes("timed out")) {
    return { message: "Request timed out", fix: "Server may be slow or unreachable" }
  }
  if (error.toLowerCase().includes("401") || error.toLowerCase().includes("unauthorized")) {
    return { message: "Unauthorized", fix: "Your API key is invalid or expired" }
  }
  if (error.toLowerCase().includes("404")) {
    return { message: "API endpoint not found", fix: "The URL path may be incorrect" }
  }
  if (error.toLowerCase().includes("500") || error.toLowerCase().includes("internal server")) {
    return { message: "Server error", fix: "The provider's server encountered an error" }
  }
  if (error.toLowerCase().includes("dns")) {
    return { message: "DNS resolution failed", fix: "The hostname could not be resolved" }
  }
  return { message: error.length > 60 ? error.slice(0, 60) + "..." : error, fix: "Check your configuration and try again" }
}

function StatusCard({
  icon: Icon,
  iconClass,
  title,
  subtitle,
  extra,
  action,
  borderClass,
}: {
  icon: React.ElementType
  iconClass: string
  title: string
  subtitle: string
  extra?: React.ReactNode
  action?: React.ReactNode
  borderClass: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-xl border p-3 space-y-2", borderClass)}
    >
      <div className="flex items-start gap-3">
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", iconClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-white/40">{subtitle}</p>
        </div>
        {action}
      </div>
      {extra}
    </motion.div>
  )
}

export function ValidationStatus({ state, result, onRetry, className }: ValidationStatusProps) {
  if (state === "idle" || !result) return null

  if (state === "validating") {
    return (
      <StatusCard
        icon={Loader2}
        iconClass="bg-blue-500/10 text-blue-400"
        title="Validating connection..."
        subtitle="Testing endpoint and API key"
        borderClass="border-blue-500/20 bg-blue-500/[0.03]"
      />
    )
  }

  if (state === "timeout") {
    const parsed = parseError(result.error || "TIMEOUT_EXCEEDED")
    return (
      <StatusCard
        icon={AlertTriangle}
        iconClass="bg-amber-500/10 text-amber-400"
        title={parsed.message}
        subtitle={parsed.fix}
        borderClass="border-amber-500/20 bg-amber-500/[0.03]"
        action={onRetry ? (
          <button
            onClick={onRetry}
            className="shrink-0 h-7 px-3 rounded-lg border border-amber-500/20 text-[10px] text-amber-400 hover:bg-amber-500/10 transition-all flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        ) : undefined}
      />
    )
  }

  if (state === "connected" && result.success) {
    return (
      <StatusCard
        icon={Wifi}
        iconClass="bg-green-500/10 text-green-400"
        title="Connected"
        subtitle={`${result.latencyMs}ms response time`}
        borderClass="border-green-500/20 bg-green-500/[0.03]"
        extra={
          <div className="flex items-center gap-3 text-xs">
            {result.runtime && (
              <span className="flex items-center gap-1 text-green-400/60">
                <Server className="h-3 w-3" />
                {result.runtime}
              </span>
            )}
            <span className="flex items-center gap-1 text-green-400/60">
              <Clock className="h-3 w-3" />
              {result.latencyMs}ms
            </span>
          </div>
        }
      />
    )
  }

  const parsed = parseError(result.error || "Connection failed")
  return (
    <StatusCard
      icon={XCircle}
      iconClass="bg-red-500/10 text-red-400"
      title={parsed.message}
      subtitle={parsed.fix}
      borderClass="border-red-500/20 bg-red-500/[0.03]"
      action={onRetry ? (
        <button
          onClick={onRetry}
          className="shrink-0 h-7 px-3 rounded-lg border border-red-500/20 text-[10px] text-red-400 hover:bg-red-500/10 transition-all flex items-center gap-1"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      ) : undefined}
    />
  )
}
