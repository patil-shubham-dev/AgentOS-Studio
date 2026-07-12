import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, ExternalLink, BookOpen } from "lucide-react"
import logoSvg from "@/assets/branding/logo.svg"
import wordmarkSvg from "@/assets/branding/wordmark.svg"

interface AppInfo {
  version: string
  name: string
  platform: string
  arch: string
  electron: string
  chrome?: string
  node?: string
}

interface InstallInfo {
  build_date: string
  git_commit: string
}

export function AboutDialog() {
  const [open, setOpen] = useState(false)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [installInfo, setInstallInfo] = useState<InstallInfo | null>(null)

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api) return

    const loadInfo = async () => {
      try {
        const info = await api.getAppInfo()
        setAppInfo(info)
      } catch { /* ignore */ }
      try {
        const info = await api.getInstallInfo()
        setInstallInfo(info)
      } catch { /* ignore */ }
    }

    const unsubscribe = api.on("show-about", () => {
      loadInfo()
      setOpen(true)
    })

    return unsubscribe
  }, [])

  const handleClose = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open, handleClose])

  const chromeVer = appInfo?.electron
    ? process.versions?.chrome || "?"
    : "?"
  const nodeVer = appInfo?.electron
    ? process.versions?.node || "?"
    : "?"

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm mx-4 rounded-2xl border border-[var(--border-default)] bg-[#0c0c0d] shadow-2xl overflow-hidden"
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 z-10 flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-default)] transition-all"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Logo */}
            <div className="flex justify-center pt-8 pb-2">
              <img src={logoSvg} alt="" width={72} height={72} />
            </div>

            {/* Wordmark */}
            <div className="flex justify-center px-8">
              <img src={wordmarkSvg} alt="AgenticOS" className="h-8 w-auto" />
            </div>

            {/* Tagline */}
            <p className="text-center text-xs text-[var(--text-tertiary)] mt-2 mb-6 px-8">
              Multi-Agent AI Workspace
            </p>

            <div className="border-t border-[var(--border-default)]" />

            {/* Info rows */}
            <div className="px-6 py-4 space-y-2.5">
              <InfoRow label="Version" value={appInfo?.version || "—"} />
              <InfoRow
                label="Build"
                value={installInfo?.build_date
                  ? `${installInfo.build_date} (${(installInfo.git_commit || "unknown").slice(0, 7)})`
                  : "—"}
              />
              <InfoRow label="Platform" value={`${appInfo?.platform || "?"} ${appInfo?.arch || ""}`} />
              <InfoRow label="Electron" value={appInfo?.electron || "—"} />
              <InfoRow label="Chromium" value={chromeVer} />
              <InfoRow label="Node.js" value={nodeVer} />
            </div>

            <div className="border-t border-[var(--border-default)]" />

            {/* License & links */}
            <div className="px-6 py-4 flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-quaternary)]">
                License: Proprietary
              </span>
              <div className="flex items-center gap-3">
                <a
                  href="https://agenticos.ai/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  <BookOpen className="h-3 w-3" />
                  Docs
                </a>
                <a
                  href="https://github.com/agenticos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  GitHub
                </a>
              </div>
            </div>

            {/* Copyright */}
            <div className="px-6 pb-5 text-center">
              <p className="text-[9px] text-[var(--text-quaternary)]">
                &copy; {new Date().getFullYear()} AgenticOS. All rights reserved.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[var(--text-tertiary)]">{label}</span>
      <span className="text-[11px] text-[var(--text-primary)] font-mono">{value}</span>
    </div>
  )
}
