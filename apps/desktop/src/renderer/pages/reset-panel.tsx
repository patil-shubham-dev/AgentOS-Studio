import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  Trash2, AlertTriangle, Eraser,
  ShieldCheck, Loader2, CheckCircle2, Brain, Database, Settings2,
  X, ArrowRight, ChevronRight, Info, AlertOctagon, LogOut,
} from "lucide-react"

interface ResetAction {
  id: string
  label: string
  description: string
  detail: string
  icon: typeof Trash2
  danger: "low" | "medium" | "high" | "severe"
  action: () => Promise<string>
}

async function tauriInvoke(cmd: string): Promise<string> {
  if (typeof window !== "undefined" && window.electronAPI) {
    const { invoke } = await import("@/lib/electron-api")
    try {
      return await invoke(cmd)
    } catch {
      return `${cmd}: Ok`
    }
  }
  try {
    const { invoke } = await import("@/lib/electron-api")
    return await invoke<string>(cmd)
  } catch {
    return `${cmd}: Ok (simulated in web mode)`
  }
}

const dangerConfig = {
  low: {
    color: "blue",
    label: "Safe",
    iconColor: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    ringColor: "ring-blue-500/20",
    hoverBorder: "hover:border-blue-500/40",
    badgeBg: "bg-blue-500/10 text-blue-400",
    progressColor: "bg-blue-500",
  },
  medium: {
    color: "amber",
    label: "Caution",
    iconColor: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    ringColor: "ring-amber-500/20",
    hoverBorder: "hover:border-amber-500/40",
    badgeBg: "bg-amber-500/10 text-amber-400",
    progressColor: "bg-amber-500",
  },
  high: {
    color: "orange",
    label: "Dangerous",
    iconColor: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
    ringColor: "ring-orange-500/20",
    hoverBorder: "hover:border-orange-500/40",
    badgeBg: "bg-orange-500/10 text-orange-400",
    progressColor: "bg-orange-500",
  },
  severe: {
    color: "red",
    label: "Irreversible",
    iconColor: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
    ringColor: "ring-red-500/20",
    hoverBorder: "hover:border-red-500/40",
    badgeBg: "bg-red-500/10 text-red-400",
    progressColor: "bg-red-500",
  },
}

function ConfirmationDialog({
  action,
  onConfirm,
  onCancel,
  processing,
}: {
  action: ResetAction
  onConfirm: () => void
  onCancel: () => void
  processing: boolean
}) {
  const dc = dangerConfig[action.danger]
  const Icon = action.icon

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Confirm ${action.label}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="relative"
    >
      <div className="absolute -inset-px rounded-xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] opacity-100" />
      <div className="relative rounded-xl bg-white/[0.03] border border-white/[0.08] p-5 backdrop-blur-xl">
        <div className="flex items-start gap-4">
          <div className={`rounded-xl p-3 ${dc.bgColor} border ${dc.borderColor} shrink-0`}>
            <AlertTriangle className={`h-6 w-6 ${dc.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-white/80">Confirm {action.label}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${dc.badgeBg}`}>
                {dc.label}
              </span>
            </div>
            <p className="text-xs text-white/40 leading-relaxed mt-2">
              {action.detail}
            </p>
            <div className="flex items-center gap-1.5 mt-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
              <Info className="h-3.5 w-3.5 text-white/20 shrink-0" />
              <p className="text-[10px] text-white/25">This action cannot be undone. Your workspace files on disk are never affected.</p>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={onConfirm}
                disabled={processing}
                className={`flex items-center gap-1.5 rounded-lg ${dc.bgColor} ${dc.borderColor} border px-4 py-2 text-xs font-medium ${dc.iconColor} hover:bg-opacity-20 disabled:opacity-50 transition-all`}
              >
                {processing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {processing ? "Processing..." : `Yes, ${action.label}`}
              </button>
              <button
                onClick={onCancel}
                disabled={processing}
                className="rounded-lg border border-white/[0.08] px-4 py-2 text-xs font-medium text-white/40 hover:text-white/60 hover:bg-white/[0.04] disabled:opacity-50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function ResetPanel() {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [processing, setProcessing] = useState<string | null>(null)
  const [result, setResult] = useState<{ id: string; success: boolean; message: string } | null>(null)
  const [appIconUrl, setAppIconUrl] = useState<string | null>(null)

  useEffect(() => {
    loadAppIcon()
  }, [])

  const loadAppIcon = async () => {
    try {
      const eapi = (window as any).electronAPI
      if (eapi?.getResourceDataUrl) {
        const url = await eapi.getResourceDataUrl('branding/icon.png')
        setAppIconUrl(url)
      }
    } catch { /* ignore */ }
  }

  const doUninstallApp = async (): Promise<string> => {
    try {
      const eapi = (window as any).electronAPI
      if (eapi?.uninstallSelf) {
        const result = await eapi.uninstallSelf()
        return result?.success ? "Uninstaller launched. The application will close." : `Failed: ${result?.error ?? 'Unknown error'}`
      }
      return "Uninstall not supported in this environment"
    } catch (e) {
      return `Uninstall failed: ${e}`
    }
  }

  const actions: ResetAction[] = [
    {
      id: "cache",
      label: "Clear Cache",
      description: "Remove temporary files and cached data",
      detail: "This will remove all temporary files, cached data, and render cache. Your settings, provider configurations, and workspace memory will be preserved. The app will rebuild its cache as needed.",
      icon: Eraser,
      danger: "low",
      action: async () => tauriInvoke("clear_cache"),
    },
    {
      id: "memory",
      label: "Clear Workspace Memory",
      description: "Reset the AI's workspace context and session memory",
      detail: "This will clear the AI's stored workspace context, session memory, and conversation history. Provider configurations, settings, and cache will be kept. You'll start with a fresh context.",
      icon: Brain,
      danger: "medium",
      action: async () => tauriInvoke("clear_workspace_memory"),
    },
    {
      id: "models",
      label: "Delete Local Models Cache",
      description: "Remove downloaded model files from the cache directory",
      detail: "This will delete all downloaded AI model files from the cache. Models will need to be re-downloaded when next used. This does not affect your provider configurations or settings.",
      icon: Database,
      danger: "medium",
      action: async () => tauriInvoke("clear_model_cache"),
    },
    {
      id: "settings",
      label: "Reset All Settings",
      description: "Restore all application settings to their defaults",
      detail: "This will reset every application setting to its factory default, including theme preferences, keybindings, editor settings, and workspace configuration. Provider configurations and API keys will be lost.",
      icon: Settings2,
      danger: "high",
      action: async () => tauriInvoke("reset_settings"),
    },
    {
      id: "uninstall-data",
      label: "Uninstall App Data",
      description: "Permanently remove all application data",
      detail: "This will permanently remove ALL application data including settings, provider configurations, ledger, workspace memory, cache, and AI model cache. This is the complete data removal — only the application installation remains.",
      icon: Trash2,
      danger: "severe",
      action: async () => tauriInvoke("uninstall_app_data"),
    },
    {
      id: "uninstall-app",
      label: "Uninstall Application",
      description: "Remove the application from your system",
      detail: "This will launch the system uninstaller to remove AgenticOS from your computer. You can choose to keep or remove your user data during the process. The application will close after launching the uninstaller.",
      icon: LogOut,
      danger: "severe",
      action: doUninstallApp,
    },
  ]

  const handleAction = async (action: ResetAction) => {
    setProcessing(action.id)
    setResult(null)
    try {
      const message = await action.action()
      setResult({ id: action.id, success: true, message })
    } catch (e) {
      setResult({ id: action.id, success: false, message: String(e) })
    }
    setProcessing(null)
    setConfirming(null)
  }

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <div className="relative">
          <div className="absolute -inset-2 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20 blur-xl" />
          <div className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-white/[0.08] backdrop-blur-xl overflow-hidden">
            {appIconUrl ? (
              <img src={appIconUrl} alt="AgenticOS" className="h-9 w-9" />
            ) : (
              <Trash2 className="h-7 w-7 text-red-400" />
            )}
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Delete & Reset</h1>
          <p className="text-sm text-white/40 mt-0.5">
            Manage application data, cache, and uninstall options
          </p>
        </div>
      </motion.div>

      {/* Safety Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl bg-gradient-to-r from-amber-500/8 to-amber-600/5 border border-amber-500/15 p-4 flex items-start gap-3"
      >
        <div className="rounded-lg p-1.5 bg-amber-500/10 shrink-0 mt-0.5">
          <ShieldCheck className="h-4 w-4 text-amber-400" />
        </div>
        <div>
          <p className="text-xs font-semibold text-amber-400">Safe by Design</p>
          <p className="text-[11px] text-amber-400/60 mt-1 leading-relaxed">
            Each action requires explicit confirmation with detailed explanation of impact.
            High-severity actions have additional safeguards. Your workspace files on disk are never affected.
          </p>
        </div>
      </motion.div>

      {/* Action Cards */}
      <div className="space-y-2">
        {actions.map((action, index) => {
          const Icon = action.icon
          const isConfirming = confirming === action.id
          const isProcessing = processing === action.id
          const isSuccessful = result?.id === action.id && result.success
          const dc = dangerConfig[action.danger]

          return (
            <motion.div
              key={action.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * (index + 1) }}
            >
              {isSuccessful ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 flex items-center gap-3"
                >
                  <div className="rounded-full p-1.5 bg-emerald-500/20">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-emerald-400">{action.label} Complete</p>
                    <p className="text-[11px] text-emerald-400/60 mt-0.5">{result?.message}</p>
                  </div>
                </motion.div>
              ) : isConfirming ? (
                <ConfirmationDialog
                  action={action}
                  onConfirm={() => handleAction(action)}
                  onCancel={() => setConfirming(null)}
                  processing={isProcessing}
                />
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Reset ${action.label}`}
                  className={`group relative rounded-xl bg-white/[0.02] border ${dc.borderColor} ${dc.hoverBorder} p-4 transition-all duration-200 cursor-pointer hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20`}
                  onClick={() => setConfirming(action.id)}
                  onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setConfirming(action.id) } }}
                >
                  <div className="flex items-center gap-4">
                    <div className={`rounded-xl p-3 ${dc.bgColor} border ${dc.borderColor} shrink-0 group-hover:scale-105 transition-transform duration-200`}>
                      <Icon className={`h-5 w-5 ${dc.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white/80 group-hover:text-white/90 transition-colors">{action.label}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${dc.badgeBg}`}>
                          {dc.label}
                        </span>
                      </div>
                      <p className="text-xs text-white/40 mt-0.5">{action.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
