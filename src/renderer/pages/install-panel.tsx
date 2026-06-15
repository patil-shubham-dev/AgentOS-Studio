import { useState, useEffect } from "react"
import { Card } from "@agentic-os/ui"
import {
  Package, FolderOpen, HardDrive, Activity, CheckCircle2,
  Loader2, ExternalLink, Server, MousePointerClick,
  Plus, Trash2, Cpu, Clock, Shield, Globe,
  ChevronRight, GitBranch, Terminal, AppWindow, AlertTriangle,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

interface InstallInfo {
  version: string
  install_path: string
  data_path: string
  storage_bytes: number
  runtime_status: string
  first_launch: boolean
  build_date: string
}

interface SystemInfo {
  os: string
  arch: string
  cpu_cores: number
  memory_gb: number
  electron_version: string
  node_version: string
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
      <span className="text-xs text-white/40">{label}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""} text-white/70`}>{value}</span>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="relative group">
      <div className={`absolute -inset-px rounded-xl bg-gradient-to-br ${color} opacity-0 group-hover:opacity-100 blur-sm transition-opacity duration-500`} />
      <div className="relative rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 backdrop-blur-xl">
        <div className="flex items-start justify-between mb-3">
          <div className={`rounded-lg p-2 bg-white/[0.04] border border-white/[0.06]`}>
            <Icon className="h-4 w-4 text-white/60" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-2xl font-semibold tracking-tight text-white/90">{value}</p>
          <p className="text-[11px] text-white/40">{label}</p>
          {sub && <p className="text-[10px] text-white/20">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

export function InstallPanel() {
  const [info, setInfo] = useState<InstallInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [contextMenuRegistered, setContextMenuRegistered] = useState<boolean | null>(null)
  const [contextMenuLoading, setContextMenuLoading] = useState(false)
  const [contextMenuAction, setContextMenuAction] = useState<"register" | "unregister" | null>(null)
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [appIconUrl, setAppIconUrl] = useState<string | null>(null)

  useEffect(() => {
    loadInfo()
    checkContextMenu()
    loadSystemInfo()
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

  const checkContextMenu = async () => {
    try {
      const { invoke } = await import("@/lib/electron-api")
      const result = await invoke<boolean>("is_context_menu_registered")
      setContextMenuRegistered(result)
    } catch {
      setContextMenuRegistered(null)
    }
  }

  const handleRegisterContextMenu = async () => {
    setContextMenuAction("register")
    setContextMenuLoading(true)
    try {
      const { invoke } = await import("@/lib/electron-api")
      await invoke("register_context_menu")
      setContextMenuRegistered(true)
    } catch (err) {
      console.error("Failed to register context menu:", err)
    }
    setContextMenuLoading(false)
    setContextMenuAction(null)
  }

  const handleUnregisterContextMenu = async () => {
    setContextMenuAction("unregister")
    setContextMenuLoading(true)
    try {
      const { invoke } = await import("@/lib/electron-api")
      await invoke("unregister_context_menu")
      setContextMenuRegistered(false)
    } catch (err) {
      console.error("Failed to unregister context menu:", err)
    }
    setContextMenuLoading(false)
    setContextMenuAction(null)
  }

  const [loadError, setLoadError] = useState<string | null>(null)

  const loadInfo = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { invoke } = await import("@/lib/electron-api")
      const result = await invoke<InstallInfo>("get_install_info")
      setInfo(result)
    } catch (err) {
      setLoadError(`Could not retrieve install info: ${err instanceof Error ? err.message : 'Unknown'}. Showing fallback data.`)
      setInfo({
        version: "1.0.0 (web)",
        install_path: "N/A (browser)",
        data_path: "localStorage",
        storage_bytes: 0,
        runtime_status: "web",
        first_launch: false,
        build_date: new Date().toISOString().split("T")[0],
      })
    }
    setLoading(false)
  }

  const loadSystemInfo = async () => {
    setLoadError(null)
    try {
      const { invoke } = await import("@/lib/electron-api")
      const result = await invoke<SystemInfo>("get_system_info")
      setSystemInfo(result)
    } catch (err) {
      setLoadError(`Could not retrieve system info: ${err instanceof Error ? err.message : 'Unknown'}. Showing fallback data.`)
      setSystemInfo({
        os: navigator.platform,
        arch: "unknown",
        cpu_cores: navigator.hardwareConcurrency || 0,
        memory_gb: 0,
        electron_version: "-",
        node_version: "-",
      })
    }
  }

  const openLocation = async (path: string) => {
    try {
      const { invoke } = await import("@/lib/electron-api")
      await invoke("open_install_location")
    } catch {
      try {
        const { shellOpen } = await import("@/lib/electron-api")
        await shellOpen(path)
      } catch { }
    }
  }

  if (loading || !info) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-3">
        <div className="relative">
          <div className="absolute -inset-4 rounded-full bg-blue-500/10 blur-xl animate-glow-pulse" />
          <Loader2 className="h-8 w-8 text-blue-400 animate-spin relative" />
        </div>
        <p className="text-sm text-white/30">Loading installation info...</p>
      </div>
    )
  }

  const storagePercent = systemInfo && systemInfo.memory_gb > 0
    ? Math.min(100, (info.storage_bytes / (systemInfo.memory_gb * 1024 * 1024 * 1024)) * 100)
    : 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 p-6 max-w-5xl mx-auto"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="flex items-center gap-4"
      >
        <div className="relative">
          <div className="absolute -inset-2 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 blur-xl" />
          <div className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-white/[0.08] backdrop-blur-xl overflow-hidden">
            {appIconUrl ? (
              <img src={appIconUrl} alt="AgenticOS" className="h-9 w-9" />
            ) : (
              <Package className="h-7 w-7 text-blue-400" />
            )}
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Installation</h1>
          <p className="text-sm text-white/40 mt-0.5">
            Application information, storage, and system integration
          </p>
        </div>
        {loadError && (
          <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[10px] text-amber-300/80 max-w-[200px] truncate" title={loadError}>{loadError}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[11px] font-medium text-green-400 capitalize">{info.runtime_status}</span>
        </div>
      </motion.div>

      {/* Stats Row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <StatCard icon={() => appIconUrl ? <img src={appIconUrl} alt="" className="h-4 w-4" /> : <Package className="h-4 w-4 text-white/60" />} label="Version" value={info.version} color="from-blue-500/20 to-blue-600/10" sub={`Build ${info.build_date}`} />
        <StatCard icon={HardDrive} label="Storage Used" value={formatBytes(info.storage_bytes)} color="from-emerald-500/20 to-emerald-600/10" sub={info.data_path} />
        <StatCard icon={Server} label="Runtime" value={info.runtime_status} color="from-purple-500/20 to-purple-600/10" sub={info.first_launch ? "First launch" : "Previously launched"} />
        <StatCard icon={Shield} label="Status" value="Installed" color="from-green-500/20 to-green-600/10" sub="All systems operational" />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Application Details */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="lg:col-span-2 space-y-4"
        >
          {/* Application Card */}
          <Card className="border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="rounded-lg p-1.5 bg-blue-500/10 border border-blue-500/20 overflow-hidden">
                  {appIconUrl ? (
                    <img src={appIconUrl} alt="" className="h-4 w-4" />
                  ) : (
                    <Package className="h-3.5 w-3.5 text-blue-400" />
                  )}
                </div>
                <h2 className="text-sm font-semibold text-white/80">Application Details</h2>
              </div>
              <div className="space-y-0">
                <InfoRow label="Version" value={info.version} mono />
                <InfoRow label="Build Date" value={info.build_date} />
                <InfoRow label="First Launch" value={info.first_launch ? "Yes" : "No"} />
                <InfoRow label="Application ID" value="com.agenticos.studio" mono />
              </div>
            </div>
          </Card>

          {/* System Information */}
          <Card className="border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="rounded-lg p-1.5 bg-purple-500/10 border border-purple-500/20">
                  <Cpu className="h-3.5 w-3.5 text-purple-400" />
                </div>
                <h2 className="text-sm font-semibold text-white/80">System Information</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-0">
                  <InfoRow label="Operating System" value={systemInfo?.os || "-"} />
                  <InfoRow label="Architecture" value={systemInfo?.arch || "-"} />
                  <InfoRow label="CPU Cores" value={String(systemInfo?.cpu_cores || "-")} />
                </div>
                <div className="space-y-0">
                  <InfoRow label="Memory" value={systemInfo ? `${systemInfo.memory_gb} GB` : "-"} />
                  <InfoRow label="Electron" value={systemInfo?.electron_version || "-"} />
                  <InfoRow label="Node.js" value={systemInfo?.node_version || "-"} />
                </div>
              </div>
            </div>
          </Card>

          {/* Storage Details */}
          <Card className="border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="rounded-lg p-1.5 bg-amber-500/10 border border-amber-500/20">
                  <HardDrive className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <h2 className="text-sm font-semibold text-white/80">Storage Details</h2>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                  <div className="flex items-center gap-3">
                    <Activity className="h-4 w-4 text-blue-400" />
                    <div>
                      <p className="text-xs font-medium text-white/70">App Data</p>
                      <p className="text-[10px] text-white/30">Settings, ledger, workspace memory</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-white/60">{formatBytes(info.storage_bytes)}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-4 w-4 text-purple-400" />
                    <div>
                      <p className="text-xs font-medium text-white/70">Install Directory</p>
                      <p className="text-[10px] text-white/30">Application binaries and resources</p>
                    </div>
                  </div>
                  <button
                    onClick={() => openLocation(info.install_path)}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-4 w-4 text-emerald-400" />
                    <div>
                      <p className="text-xs font-medium text-white/70">Data Directory</p>
                      <p className="text-[10px] text-white/30">User settings, cache, logs</p>
                    </div>
                  </div>
                  <button
                    onClick={() => openLocation(info.data_path)}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Right column: Integration & System */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="space-y-4"
        >
          {/* Shell Integration */}
          <Card className="border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="rounded-lg p-1.5 bg-green-500/10 border border-green-500/20">
                  <MousePointerClick className="h-3.5 w-3.5 text-green-400" />
                </div>
                <h2 className="text-sm font-semibold text-white/80">Shell Integration</h2>
              </div>
              <p className="text-[11px] text-white/30 mb-4 leading-relaxed">
                Add or remove the "Open with AgenticOS" shortcut from the right-click context menu in File Explorer.
              </p>
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`rounded-full p-1.5 ${contextMenuRegistered ? "bg-green-500/20" : "bg-white/[0.04]"}`}>
                    <MousePointerClick className={`h-3.5 w-3.5 ${contextMenuRegistered ? "text-green-400" : "text-white/30"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white/70">Context Menu Entry</p>
                    <p className="text-[10px] text-white/30 truncate">
                      {contextMenuRegistered === null
                        ? "Status unknown"
                        : contextMenuRegistered
                          ? "Active — right-click any folder"
                          : "Not registered"}
                    </p>
                  </div>
                  <AnimatePresence mode="wait">
                    {!contextMenuRegistered ? (
                      <motion.button
                        key="register"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        onClick={handleRegisterContextMenu}
                        disabled={contextMenuLoading}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 text-[11px] font-medium text-blue-400 hover:bg-blue-500/20 disabled:opacity-50 transition-all"
                      >
                        {contextMenuLoading && contextMenuAction === "register" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                        Register
                      </motion.button>
                    ) : (
                      <motion.button
                        key="unregister"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        onClick={handleUnregisterContextMenu}
                        disabled={contextMenuLoading}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 px-3 py-1.5 text-[11px] font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-all"
                      >
                        {contextMenuLoading && contextMenuAction === "unregister" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Remove
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </Card>

          {/* Quick Info */}
          <Card className="border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="rounded-lg p-1.5 bg-cyan-500/10 border border-cyan-500/20">
                  <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                </div>
                <h2 className="text-sm font-semibold text-white/80">Quick Info</h2>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02]">
                  <Globe className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  <span className="text-[11px] text-white/50">Protocol: <code className="text-blue-300 font-mono text-[10px]">agenticos://</code></span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02]">
                  <GitBranch className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[11px] text-white/50">Associations: <code className="text-white/40 font-mono text-[10px]">.md .ts .js .py .rs ...</code></span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02]">
                  <AppWindow className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                  <span className="text-[11px] text-white/50">Shortcuts: Desktop + Start Menu</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02]">
                  <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="text-[11px] text-white/50">Build: <code className="text-white/40 font-mono text-[10px]">{info.build_date}</code></span>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-4 w-4 text-white/20" />
            <p className="text-[11px] text-white/20">
              Application ID: <code className="text-white/30 font-mono">com.agenticos.studio</code>
            </p>
          </div>
          <p className="text-[11px] text-white/20">
            Data: <code className="text-white/30 font-mono text-[10px]">{info.data_path}</code>
          </p>
        </div>
      </motion.div>
    </motion.div>
  )
}
