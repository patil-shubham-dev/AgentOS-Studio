import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, Button } from "@agentic-os/ui"
import {
  RefreshCw, Download, RotateCcw, CheckCircle2,
  AlertTriangle, Loader2, ArrowUpCircle, Clock,
} from "lucide-react"

interface UpdateStatus {
  status: string
  version?: string
  releaseDate?: string
  releaseNotes?: string
  percent?: number
  bytesPerSecond?: number
  total?: number
  transferred?: number
  error?: string
}

const eapi = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null

export function UpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [autoUpdate, setAutoUpdate] = useState(() => {
    if (eapi) {
      return localStorage.getItem("auto-update") !== "false"
    }
    return true
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eapi) {
      setError("Update service only available in desktop app")
      setStatus({ status: "error" })
      return
    }
    checkForUpdates()
  }, [])

  useEffect(() => {
    localStorage.setItem("auto-update", String(autoUpdate))
  }, [autoUpdate])

  useEffect(() => {
    if (!eapi) return
    const unsub = eapi.on('update-status', (updateStatus: UpdateStatus) => {
      setStatus(updateStatus)
      if (updateStatus.status === 'downloading') {
        setUpdating(true)
      }
      if (updateStatus.status === 'downloaded' || updateStatus.status === 'error' || updateStatus.status === 'not-available') {
        setUpdating(false)
        setChecking(false)
      }
    })
    return () => { if (unsub) unsub() }
  }, [])

  const checkForUpdates = useCallback(async () => {
    if (!eapi) return
    setChecking(true)
    setError(null)
    try {
      await eapi.checkForUpdates()
      setStatus((prev) => prev || { status: 'checking' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setChecking(false)
    }
  }, [])

  const performUpdate = useCallback(async () => {
    if (!eapi) return
    setUpdating(true)
    setError(null)
    try {
      await eapi.downloadUpdate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setUpdating(false)
    }
  }, [])

  const installUpdate = useCallback(async () => {
    if (!eapi) return
    try {
      await eapi.installUpdate()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    }
  }, [])

  const getStatusBadge = () => {
    if (!status) return { label: "Unknown", color: "text-muted-foreground" }
    switch (status.status) {
      case "checking":
        return { label: "Checking...", color: "text-blue-500" }
      case "available":
        return { label: "Update Available", color: "text-blue-500" }
      case "downloading":
        return { label: "Downloading...", color: "text-amber-500" }
      case "downloaded":
        return { label: "Ready to Install", color: "text-green-500" }
      case "not-available":
        return { label: "Up to Date", color: "text-green-500" }
      case "error":
        return { label: "Check Failed", color: "text-red-500" }
      default:
        return { label: status.status, color: "text-muted-foreground" }
    }
  }

  const badge = getStatusBadge()

  if (!eapi) {
    return (
      <div className="space-y-6 p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Updates</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage application updates and releases
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertTriangle className="h-5 w-5" />
              <p className="text-sm">Update service only available in desktop app</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Updates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage application updates and releases
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={checkForUpdates}
          disabled={checking || updating}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${checking ? "animate-spin" : ""}`} />
          {checking ? "Checking..." : "Check for Updates"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4 text-blue-500" /> Update Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className={`text-sm font-medium ${badge.color}`}>
                {badge.label}
              </span>
            </div>
            {status?.version && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Version</span>
                <span className="text-sm font-mono">{status.version}</span>
              </div>
            )}
            {status?.status === "downloading" && status?.percent !== undefined && (
              <div className="space-y-2">
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${status.percent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {status.percent.toFixed(0)}%
                  {status.bytesPerSecond ? ` — ${formatBytes(status.bytesPerSecond)}/s` : ""}
                </p>
              </div>
            )}
            {status?.status === "available" && (
              <Button className="w-full mt-2" onClick={performUpdate} disabled={updating}>
                {updating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {updating ? "Downloading..." : "Download & Install Update"}
              </Button>
            )}
            {status?.status === "downloaded" && (
              <Button className="w-full mt-2" onClick={installUpdate}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Restart & Install
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-500" /> Auto-Update
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Automatic Updates</p>
                <p className="text-xs text-muted-foreground">
                  Download and install updates automatically in the background
                </p>
              </div>
              <button
                role="switch"
                aria-checked={autoUpdate}
                aria-label="Toggle automatic updates"
                onClick={() => setAutoUpdate(!autoUpdate)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autoUpdate ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    autoUpdate ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                When enabled, updates will be downloaded in the background and
                installed on application restart. You'll be notified before the
                update is applied.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-500">Update Error</p>
            <p className="text-xs text-red-400/80">{error}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B"
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}
