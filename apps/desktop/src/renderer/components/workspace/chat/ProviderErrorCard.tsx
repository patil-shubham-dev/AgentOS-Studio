import { memo, useCallback, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle,
  KeyRound,
  Gauge,
  FileX,
  PackageOpen,
  Ban,
  Timer,
  WifiOff,
  ServerCrash,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  XCircle,
} from "lucide-react"
import type { ProviderErrorCode, ProviderErrorInfo } from "@/runtime/providers/ProviderError"

interface ProviderErrorCardProps {
  error: string
  errorInfo?: ProviderErrorInfo
  onRetry?: () => void
}

interface ErrorVisual {
  icon: typeof AlertTriangle
  title: string
  description: string
  action: string | null
  color: string
  borderColor: string
  bgColor: string
}

const ERROR_VISUALS: Record<ProviderErrorCode, ErrorVisual> = {
  auth_failed: {
    icon: KeyRound,
    title: "Authentication Failed",
    description: "The API key is invalid or unauthorized.",
    action: "Check your provider settings and update the API key.",
    color: "text-red-400/80",
    borderColor: "border-red-500/15",
    bgColor: "bg-red-500/[0.03]",
  },
  rate_limited: {
    icon: Gauge,
    title: "Rate Limited",
    description: "Too many requests were sent to the provider.",
    action: "Waiting before retrying automatically.",
    color: "text-amber-400/80",
    borderColor: "border-amber-500/15",
    bgColor: "bg-amber-500/[0.03]",
  },
  model_not_found: {
    icon: FileX,
    title: "Model Not Found",
    description: "The selected model is not available.",
    action: "Try selecting a different model in Settings.",
    color: "text-orange-400/80",
    borderColor: "border-orange-500/15",
    bgColor: "bg-orange-500/[0.03]",
  },
  context_too_large: {
    icon: PackageOpen,
    title: "Context Too Large",
    description: "The conversation is too long for this model.",
    action: "Starting a new session or reducing context.",
    color: "text-purple-400/80",
    borderColor: "border-purple-500/15",
    bgColor: "bg-purple-500/[0.03]",
  },
  invalid_request: {
    icon: Ban,
    title: "Invalid Request",
    description: "The request was rejected by the provider.",
    action: null,
    color: "text-red-400/80",
    borderColor: "border-red-500/15",
    bgColor: "bg-red-500/[0.03]",
  },
  timeout: {
    icon: Timer,
    title: "Request Timeout",
    description: "The provider took too long to respond.",
    action: "Retrying with a longer timeout.",
    color: "text-amber-400/80",
    borderColor: "border-amber-500/15",
    bgColor: "bg-amber-500/[0.03]",
  },
  network_error: {
    icon: WifiOff,
    title: "Network Error",
    description: "Could not reach the provider.",
    action: "Check your internet connection.",
    color: "text-rose-400/80",
    borderColor: "border-rose-500/15",
    bgColor: "bg-rose-500/[0.03]",
  },
  server_error: {
    icon: ServerCrash,
    title: "Provider Server Error",
    description: "The provider's server had an error.",
    action: "The provider may be experiencing issues. Retrying...",
    color: "text-orange-400/80",
    borderColor: "border-orange-500/15",
    bgColor: "bg-orange-500/[0.03]",
  },
  stream_error: {
    icon: AlertTriangle,
    title: "Stream Error",
    description: "The response stream was interrupted.",
    action: "Retrying the request.",
    color: "text-amber-400/80",
    borderColor: "border-amber-500/15",
    bgColor: "bg-amber-500/[0.03]",
  },
  not_configured: {
    icon: XCircle,
    title: "Not Configured",
    description: "No provider is configured.",
    action: "Go to Settings to add a provider.",
    color: "text-red-400/80",
    borderColor: "border-red-500/15",
    bgColor: "bg-red-500/[0.03]",
  },
  no_providers: {
    icon: XCircle,
    title: "No Providers",
    description: "There are no providers available.",
    action: "Add a provider in Settings.",
    color: "text-red-400/80",
    borderColor: "border-red-500/15",
    bgColor: "bg-red-500/[0.03]",
  },
  cancelled: {
    icon: Ban,
    title: "Cancelled",
    description: "The request was cancelled.",
    action: null,
    color: "text-white/40",
    borderColor: "border-white/[0.06]",
    bgColor: "bg-white/[0.02]",
  },
  unknown: {
    icon: AlertTriangle,
    title: "Unexpected Error",
    description: "An unexpected error occurred.",
    action: "Try again or check the logs.",
    color: "text-red-400/80",
    borderColor: "border-red-500/15",
    bgColor: "bg-red-500/[0.03]",
  },
}

export const ProviderErrorCard = memo(function ProviderErrorCard({ error, errorInfo, onRetry }: ProviderErrorCardProps) {
  const [showRaw, setShowRaw] = useState(false)
  const code = errorInfo?.code ?? "unknown"
  const visual = ERROR_VISUALS[code] ?? ERROR_VISUALS.unknown
  const Icon = visual.icon

  const handleRetry = useCallback(() => {
    onRetry?.()
  }, [onRetry])

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={`rounded-lg border ${visual.borderColor} ${visual.bgColor} overflow-hidden`}
    >
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex items-start gap-2">
          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${visual.color}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold ${visual.color}`}>{visual.title}</p>
            <p className="text-[11px] text-white/40 leading-relaxed mt-0.5">
              {errorInfo?.userMessage ?? error}
            </p>
            {visual.action && (
              <p className="text-[10px] text-white/25 mt-0.5 italic">{visual.action}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {errorInfo?.retryable && onRetry && (
            <button
              onClick={handleRetry}
              className="flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-foreground/60 hover:text-foreground/80 hover:bg-white/[0.04] transition-all"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              Retry
            </button>
          )}

          {errorInfo?.raw && (
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-white/30 hover:text-white/50 transition-all"
            >
              {showRaw ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
              Details
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showRaw && errorInfo?.raw && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <pre className="px-3 py-2 text-[9px] font-mono text-white/20 whitespace-pre-wrap break-all leading-relaxed bg-black/20 border-t border-white/[0.04] max-h-[120px] overflow-y-auto scrollbar-thin">
              {typeof errorInfo.raw === "string" ? errorInfo.raw : JSON.stringify(errorInfo.raw, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
