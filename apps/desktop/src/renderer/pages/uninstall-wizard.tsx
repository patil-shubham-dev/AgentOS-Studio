import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import type { ElementType } from "react"
import {
  Trash2, AlertTriangle, ShieldCheck, Loader2, CheckCircle2, XCircle,
  ArrowRight, ArrowLeft, Download, Info, ChevronRight,
  HardDrive, FileText, Terminal, Database, Brain, Clock,
  ExternalLink, Search, FolderOpen, Settings2, LogOut,
  Save, Package, Check, GitBranch, MessageSquare,
} from "lucide-react"

// ─── Types ──────────────────────────────────────────────────────────────────

type UninstallStep =
  | "analyze"
  | "options"
  | "safety"
  | "backup"
  | "progress"
  | "complete"

interface DataCategory {
  id: string
  label: string
  description: string
  icon: ElementType
  size: string
  sizeBytes: number
  removeByDefault: boolean
}

interface UninstallStage {
  id: string
  label: string
  icon: ElementType
  status: "pending" | "active" | "done" | "error"
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VERSION = "3.0.0"

const DATA_CATEGORIES: DataCategory[] = [
  { id: "app", label: "Application Files", description: "Application binaries, runtime files, and resources", icon: Package, size: "~450 MB", sizeBytes: 450 * 1024 * 1024, removeByDefault: true },
  { id: "settings", label: "Settings & Configuration", description: "API keys, preferences, layout, and user config", icon: Settings2, size: "~12 MB", sizeBytes: 12 * 1024 * 1024, removeByDefault: true },
  { id: "cache", label: "Cache", description: "Temporary files, render cache, and downloaded models", icon: Database, size: "~180 MB", sizeBytes: 180 * 1024 * 1024, removeByDefault: true },
  { id: "logs", label: "Logs", description: "Application logs, session logs, and error reports", icon: FileText, size: "~45 MB", sizeBytes: 45 * 1024 * 1024, removeByDefault: true },
  { id: "memory", label: "Workspace Memory", description: "AI context memory, session history, and agent state", icon: Brain, size: "~8 MB", sizeBytes: 8 * 1024 * 1024, removeByDefault: true },
  { id: "terminal", label: "Terminal History", description: "Shell history and command logs", icon: Terminal, size: "~2 MB", sizeBytes: 2 * 1024 * 1024, removeByDefault: false },
  { id: "snapshots", label: "Workspace Snapshots", description: "Session saves, state backups, and replay data", icon: Save, size: "~25 MB", sizeBytes: 25 * 1024 * 1024, removeByDefault: false },
  { id: "local-ai", label: "Local AI Models", description: "Downloaded on-device AI models", icon: Brain, size: "~2 GB", sizeBytes: 2 * 1024 * 1024 * 1024, removeByDefault: false },
]

const UNINSTALL_STAGES: UninstallStage[] = [
  { id: "stopping", label: "Stopping running services", icon: Loader2, status: "pending" },
  { id: "removing-integrations", label: "Removing system integrations", icon: Settings2, status: "pending" },
  { id: "removing-files", label: "Removing application files", icon: Package, status: "pending" },
  { id: "cleaning-registry", label: "Cleaning registry entries", icon: Database, status: "pending" },
  { id: "removing-shortcuts", label: "Removing shortcuts", icon: FolderOpen, status: "pending" },
  { id: "cleaning-cache", label: "Cleaning cache and logs", icon: Trash2, status: "pending" },
  { id: "final-cleanup", label: "Final cleanup", icon: Loader2, status: "pending" },
]

// ─── Utility ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function StepIndicator({ steps, current }: { steps: UninstallStep[]; current: UninstallStep }) {
  const labels: Record<UninstallStep, string> = {
    analyze: "Analysis",
    options: "Options",
    safety: "Safety",
    backup: "Backup",
    progress: "Removing",
    complete: "Done",
  }

  const currentIdx = steps.indexOf(current)

  return (
    <div className="flex items-center gap-1 px-1">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center gap-1 flex-1">
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold transition-all duration-300",
                i < currentIdx
                  ? "bg-red-500 text-white"
                  : i === currentIdx
                    ? "bg-red-500/20 border border-red-500/40 text-red-400"
                    : "bg-white/5 border border-white/10 text-white/30",
              )}
            >
              {i < currentIdx ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span
              className={cn(
                "text-[8px] font-medium whitespace-nowrap transition-colors",
                i === currentIdx ? "text-red-400" : i < currentIdx ? "text-white/40" : "text-white/20",
              )}
            >
              {labels[step]}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn("h-px flex-1 mx-1 transition-colors", i < currentIdx ? "bg-red-500/40" : "bg-white/5")} />
          )}
        </div>
      ))}
    </div>
  )
}

function DataCategoryCard({ category, selected, onToggle, index }: {
  category: DataCategory
  selected: boolean
  onToggle: (id: string) => void
  index: number
}) {
  const Icon = category.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "relative rounded-xl border p-3 transition-all duration-200 cursor-pointer",
        selected
          ? "border-red-500/30 bg-red-500/[0.04]"
          : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]",
      )}
      onClick={() => category.id !== "app" && onToggle(category.id)}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
            selected ? "bg-red-500/10 border border-red-500/20" : "bg-white/[0.04] border border-white/[0.06]",
          )}
        >
          <Icon className={cn("h-4 w-4", selected ? "text-red-400" : "text-white/40")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-medium", selected ? "text-white/90" : "text-white/60")}>{category.label}</span>
            <span className="ml-auto text-[9px] text-white/30 font-mono">{category.size}</span>
          </div>
          <p className="text-[10px] text-white/40 mt-0.5">{category.description}</p>
        </div>
        <div
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded border transition-all shrink-0 mt-1",
            selected ? "border-red-500 bg-red-500" : "border-white/20",
          )}
        >
          {selected && <Check className="h-3 w-3 text-white" />}
        </div>
      </div>
    </motion.div>
  )
}

function ProgressStage({ stage, index }: { stage: UninstallStage; index: number }) {
  const statusStyles = {
    pending: { icon: Loader2, color: "text-white/20", bg: "bg-white/[0.02]", border: "border-white/5", spin: false },
    active: { icon: Loader2, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", spin: true },
    done: { icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20", spin: false },
    error: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", spin: false },
  }

  const st = statusStyles[stage.status]
  const Icon = st.icon

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.12 }}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-500",
        st.border,
        st.bg,
      )}
    >
      <div className="flex h-6 w-6 items-center justify-center shrink-0">
        <Icon className={cn("h-3.5 w-3.5", st.color, st.spin && "animate-spin")} />
      </div>
      <span className={cn("text-[11px] font-medium", st.color)}>{stage.label}</span>
      {stage.status === "active" && (
        <span className="ml-auto flex gap-0.5">
          <span className="h-1 w-1 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="h-1 w-1 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="h-1 w-1 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: "300ms" }} />
        </span>
      )}
      {stage.status === "done" && <Check className="ml-auto h-3 w-3 text-green-400" />}
    </motion.div>
  )
}

// ─── Main Uninstall Wizard Component ─────────────────────────────────────────

export function UninstallWizard() {
  const [step, setStep] = useState<UninstallStep>("analyze")
  const [direction, setDirection] = useState(0)
  const [dataScanning, setDataScanning] = useState(true)
  const [dataCategories, setDataCategories] = useState<DataCategory[]>(DATA_CATEGORIES)
  const [selectedData, setSelectedData] = useState<Set<string>>(new Set(DATA_CATEGORIES.filter((c) => c.removeByDefault).map((c) => c.id)))
  const [backupSettings, setBackupSettings] = useState(true)
  const [exportConfigs, setExportConfigs] = useState(false)
  const [uninstallStages, setUninstallStages] = useState<UninstallStage[]>(UNINSTALL_STAGES)
  const [progress, setProgress] = useState(0)
  const [currentFile, setCurrentFile] = useState("")
  const [elapsed, setElapsed] = useState(0)
  const [feedbackReason, setFeedbackReason] = useState("")
  const [completed, setCompleted] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const STEPS: UninstallStep[] = ["analyze", "options", "safety", "backup", "progress", "complete"]

  const selectedTotalBytes = dataCategories
    .filter((c) => selectedData.has(c.id))
    .reduce((sum, c) => sum + c.sizeBytes, 0)

  const selectedTotalFormatted = formatBytes(selectedTotalBytes)

  // Simulate data scanning
  useEffect(() => {
    if (step === "analyze" && dataScanning) {
      const timer = setTimeout(() => {
        setDataScanning(false)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [step, dataScanning])

  const toggleDataCategory = useCallback((id: string) => {
    setSelectedData((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (selectedData.size === dataCategories.length) {
      setSelectedData(new Set(["app"])) // Keep at least app
    } else {
      setSelectedData(new Set(dataCategories.map((c) => c.id)))
    }
  }, [selectedData, dataCategories])

  // Simulate uninstall progress
  const runUninstall = useCallback(async () => {
    setProgress(0)
    setElapsed(0)

    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)

    const stageDurations = [600, 800, 1200, 500, 400, 700, 500]
    let totalProgress = 0

    for (let i = 0; i < UNINSTALL_STAGES.length; i++) {
      setUninstallStages((prev) =>
        prev.map((s, idx) => (idx === i ? { ...s, status: "active" as const } : idx < i ? { ...s, status: "done" as const } : s)),
      )

      const filesPerStage = Math.floor(10 + Math.random() * 20)
      const stepSize = 100 / stageDurations[i] / filesPerStage

      for (let f = 0; f < filesPerStage; f++) {
        const fileNames = ["agentic-core.dll", "runtime.bin", "config.json", "ui-bundle.js", "terminal.asar", "browser-engine.exe", "protocol-handler.dll", "shortcut.lnk", "registry.reg", "cache.db", "logs.txt", "session.dat"]
        setCurrentFile(fileNames[f % fileNames.length])
        totalProgress += stepSize
        setProgress(Math.min(totalProgress, 99))
        await new Promise((r) => setTimeout(r, 30 + Math.random() * 80))
      }
    }

    setUninstallStages((prev) => prev.map((s) => ({ ...s, status: "done" as const })))
    setProgress(100)
    setCurrentFile("")

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    setCompleted(true)
    await new Promise((r) => setTimeout(r, 600))
    setDirection(1)
    setStep("complete")
  }, [])

  const navigate = useCallback(
    (target: UninstallStep) => {
      const currentIdx = STEPS.indexOf(step)
      const targetIdx = STEPS.indexOf(target)
      setDirection(targetIdx > currentIdx ? 1 : -1)
      setStep(target)
    },
    [step],
  )

  const nextStep = useCallback(() => {
    const currentIdx = STEPS.indexOf(step)
    if (currentIdx < STEPS.length - 1) {
      if (STEPS[currentIdx + 1] === "progress") {
        runUninstall()
      }
      setDirection(1)
      setStep(STEPS[currentIdx + 1])
    }
  }, [step, runUninstall])

  const prevStep = useCallback(() => {
    const currentIdx = STEPS.indexOf(step)
    if (currentIdx > 0 && step !== "progress") {
      setDirection(-1)
      setStep(STEPS[currentIdx - 1])
    }
  }, [step])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  const safeItems = [
    { icon: FolderOpen, label: "Your project files and source code" },
    { icon: Terminal, label: "Git repositories and version history" },
    { icon: FileText, label: "Documents and personal files" },
    { icon: GitBranch, label: "Any files outside the app data directory" },
  ]

  const pageVariants = {
    enter: (d: number) => ({ opacity: 0, x: d * 30 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d * -30 }),
  }

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-[#0a0a0b] via-[#0d0d12] to-[#09090a]">
      {/* Header */}
      <div className="border-b border-white/[0.04] bg-black/20 backdrop-blur-xl px-6 py-3">
        <div className="flex items-center gap-4 max-w-4xl mx-auto">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-white/10">
            <Trash2 className="h-4 w-4 text-red-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-semibold text-white/90">Uninstall Wizard</h1>
            <p className="text-[10px] text-white/30">Remove AgenticOS from your system</p>
          </div>
          {step !== "complete" && step !== "progress" && (
            <span className="text-[10px] text-white/20 font-mono">v{VERSION}</span>
          )}
        </div>
      </div>

      {/* Step indicator */}
      {step !== "progress" && step !== "complete" && (
        <div className="border-b border-white/[0.04] bg-black/10 px-6 py-3">
          <div className="max-w-4xl mx-auto">
            <StepIndicator steps={STEPS.slice(0, -1)} current={step} />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              {/* Step: Analyze */}
              {step === "analyze" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white/90">Analyzing Installation</h2>
                    <p className="text-xs text-white/40 mt-1">Scanning your system for AgenticOS data</p>
                  </div>

                  {dataScanning ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.2 }}
                          className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4"
                        >
                          <div className="h-8 w-8 rounded-lg bg-white/[0.04] animate-pulse" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 w-32 rounded bg-white/[0.06] animate-pulse" />
                            <div className="h-2 w-48 rounded bg-white/[0.03] animate-pulse" />
                          </div>
                          <div className="h-4 w-16 rounded bg-white/[0.04] animate-pulse" />
                        </motion.div>
                      ))}
                      <div className="flex items-center justify-center gap-2 py-4">
                        <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                        <span className="text-xs text-white/30">Scanning directories...</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-xl bg-gradient-to-r from-red-500/5 to-orange-500/5 border border-white/5 p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white/70">Data Found</span>
                          <span className="text-xs font-mono text-white/50">{dataCategories.length} categories</span>
                        </div>
                        {dataCategories.map((cat, i) => (
                          <div key={cat.id} className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0">
                            <div className="flex items-center gap-2">
                              <cat.icon className="h-3.5 w-3.5 text-white/40" />
                              <span className="text-[11px] text-white/60">{cat.label}</span>
                            </div>
                            <span className="text-[11px] font-mono text-white/40">{cat.size}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-2 border-t border-white/10">
                          <span className="text-xs font-semibold text-white/70">Estimated Recoverable Space</span>
                          <span className="text-xs font-mono text-green-400 font-semibold">~{dataCategories.reduce((sum, c) => sum + c.sizeBytes, 0) / (1024 * 1024 * 1024) > 1 ? `${(dataCategories.reduce((sum, c) => sum + c.sizeBytes, 0) / (1024 * 1024 * 1024)).toFixed(1)} GB` : `${(dataCategories.reduce((sum, c) => sum + c.sizeBytes, 0) / (1024 * 1024)).toFixed(0)} MB`}</span>
                        </div>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="rounded-xl bg-blue-500/5 border border-blue-500/15 p-3 flex items-start gap-3"
                      >
                        <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-blue-400/70 leading-relaxed">
                          Your project files, source code, and Git repositories are stored outside the app data directory and will NOT be affected.
                        </p>
                      </motion.div>
                    </>
                  )}
                </div>
              )}

              {/* Step: Options */}
              {step === "options" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-white/90">Removal Options</h2>
                      <p className="text-xs text-white/40 mt-1">Choose which data to remove</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-white/70">{selectedData.size} of {dataCategories.length} selected</p>
                      <p className="text-[9px] text-white/30">{selectedTotalFormatted}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleAll}
                      className="rounded-lg border border-white/5 px-2.5 py-1 text-[10px] text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-all"
                    >
                      {selectedData.size === dataCategories.length ? "Deselect All" : "Select All"}
                    </button>
                    <span className="text-[10px] text-white/20">Application files are required</span>
                  </div>

                  <div className="space-y-1.5">
                    {dataCategories.map((cat, i) => (
                      <DataCategoryCard
                        key={cat.id}
                        category={cat}
                        selected={selectedData.has(cat.id)}
                        onToggle={toggleDataCategory}
                        index={i}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Step: Safety Review */}
              {step === "safety" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white/90">Safety Review</h2>
                    <p className="text-xs text-white/40 mt-1">Review what will be affected before proceeding</p>
                  </div>

                  <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4 space-y-3">
                    <div className="flex items-center gap-2 text-red-400">
                      <Trash2 className="h-4 w-4" />
                      <span className="text-xs font-semibold">Will be removed</span>
                    </div>
                    <div className="space-y-2">
                      {dataCategories.filter((c) => selectedData.has(c.id)).map((cat) => (
                        <div key={cat.id} className="flex items-center gap-2 rounded-lg bg-red-500/[0.04] px-3 py-1.5">
                          <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                          <span className="text-[10px] text-white/60">{cat.label}</span>
                          <span className="ml-auto text-[9px] text-white/30 font-mono">{cat.size}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-green-500/20 bg-green-500/[0.04] p-4 space-y-3">
                    <div className="flex items-center gap-2 text-green-400">
                      <ShieldCheck className="h-4 w-4" />
                      <span className="text-xs font-semibold">Will NOT be removed</span>
                    </div>
                    <div className="space-y-2">
                      {safeItems.map((item) => (
                        <div key={item.label} className="flex items-center gap-2 rounded-lg bg-green-500/[0.04] px-3 py-1.5">
                          <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                          <span className="text-[10px] text-white/60">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step: Backup */}
              {step === "backup" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white/90">Backup Options</h2>
                    <p className="text-xs text-white/40 mt-1">Keep your data safe for future use</p>
                  </div>

                  <div className="space-y-3">
                    <div
                      className={cn(
                        "rounded-xl border p-4 cursor-pointer transition-all",
                        backupSettings
                          ? "border-blue-500/30 bg-blue-500/[0.04]"
                          : "border-white/5 bg-white/[0.02] hover:border-white/15",
                      )}
                      onClick={() => setBackupSettings(!backupSettings)}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded border shrink-0 mt-0.5",
                            backupSettings ? "border-blue-500 bg-blue-500" : "border-white/20",
                          )}
                        >
                          {backupSettings && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <Download className="h-5 w-5 text-blue-400 shrink-0" />
                        <div>
                          <span className={cn("text-xs font-medium", backupSettings ? "text-white/80" : "text-white/50")}>
                            Export Settings & Configuration
                          </span>
                          <p className="text-[10px] text-white/40 mt-0.5">
                            Save your API keys, preferences, and layout settings to a backup file that can be imported later.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "rounded-xl border p-4 cursor-pointer transition-all",
                        exportConfigs
                          ? "border-purple-500/30 bg-purple-500/[0.04]"
                          : "border-white/5 bg-white/[0.02] hover:border-white/15",
                      )}
                      onClick={() => setExportConfigs(!exportConfigs)}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded border shrink-0 mt-0.5",
                            exportConfigs ? "border-purple-500 bg-purple-500" : "border-white/20",
                          )}
                        >
                          {exportConfigs && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <FileText className="h-5 w-5 text-purple-400 shrink-0" />
                        <div>
                          <span className={cn("text-xs font-medium", exportConfigs ? "text-white/80" : "text-white/50")}>
                            Backup AGENTIC.md Configurations
                          </span>
                          <p className="text-[10px] text-white/40 mt-0.5">
                            Save all project-level AGENTIC.md configuration files for future use in your backup directory.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {backupSettings && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl bg-white/[0.02] border border-white/5 p-4"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Info className="h-3.5 w-3.5 text-blue-400" />
                        <span className="text-[10px] text-white/40">Backup location:</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-black/30 px-3 py-2">
                        <FolderOpen className="h-3.5 w-3.5 text-white/30" />
                        <code className="text-[10px] text-white/40 font-mono truncate">
                          %TEMP%\AgenticOS-backup\{new Date().toISOString().split("T")[0]}
                        </code>
                      </div>
                    </motion.div>
                  )}

                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/15">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-400/70 leading-relaxed">
                      Backups are stored in your system's temporary directory. They may be deleted by system cleanup tools.
                      Save important backups to a permanent location.
                    </p>
                  </div>
                </div>
              )}

              {/* Step: Progress */}
              {step === "progress" && (
                <div className="space-y-6 py-4">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
                      <Loader2 className="h-7 w-7 text-red-400 animate-spin" />
                    </div>
                    <h2 className="text-lg font-semibold text-white/90">Removing AgenticOS</h2>
                    <p className="text-xs text-white/40 mt-1">Please wait while we remove AgenticOS from your system</p>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-white/40">{currentFile || "Preparing..."}</span>
                      <span className="font-mono text-white/60">{progress.toFixed(0)}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-red-500 via-orange-500 to-red-400"
                        style={{ width: `${progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-white/20">
                      <span>Time elapsed: {formatTime(elapsed)}</span>
                      <span>Estimated: ~00:45</span>
                    </div>
                  </div>

                  {/* Stage timeline */}
                  <div className="space-y-1.5">
                    {uninstallStages.map((stage, i) => (
                      <ProgressStage key={stage.id} stage={stage} index={i} />
                    ))}
                  </div>
                </div>
              )}

              {/* Step: Complete */}
              {step === "complete" && (
                <div className="space-y-6 py-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 15, stiffness: 200 }}
                    className="text-center"
                  >
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30">
                      <CheckCircle2 className="h-10 w-10 text-green-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">AgenticOS Removed</h2>
                    <p className="text-sm text-white/40 mt-1">v{VERSION} has been successfully removed</p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3"
                  >
                    <h3 className="text-xs font-semibold text-white/70">Removal Summary</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                        <span className="text-[11px] text-white/40">Categories removed</span>
                        <span className="text-[11px] text-white/60">{selectedData.size}</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                        <span className="text-[11px] text-white/40">Disk space recovered</span>
                        <span className="text-[11px] font-mono text-green-400">{selectedTotalFormatted}</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-[11px] text-white/40">Settings preserved</span>
                        <span className="text-[11px] text-white/60">{!selectedData.has("settings") ? "Yes" : "No"}</span>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="space-y-2"
                  >
                    {[
                      { icon: Download, label: "Reinstall AgenticOS", desc: "Download and install the latest version", action: () => window.electronAPI?.openExternal?.("https://agenticos.ai/download") },
                      { icon: MessageSquare, label: "Send Feedback", desc: "Help us improve by sharing your experience", action: () => window.electronAPI?.openExternal?.("https://agenticos.ai/feedback") },
                      { icon: ExternalLink, label: "View Removal Report", desc: "See detailed log of what was removed", action: () => {} },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 hover:border-white/10 transition-all cursor-pointer"
                        onClick={item.action}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20">
                          <item.icon className="h-4 w-4 text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-white/70">{item.label}</span>
                          <p className="text-[10px] text-white/30">{item.desc}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-white/20 shrink-0" />
                      </div>
                    ))}
                  </motion.div>

                  {backupSettings && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="rounded-xl bg-blue-500/5 border border-blue-500/15 p-3 flex items-start gap-3"
                    >
                      <Save className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-medium text-blue-400">Settings Backup Available</p>
                        <p className="text-[9px] text-blue-400/60 mt-0.5">
                          Your settings were backed up. To restore, install AgenticOS and import the backup from <code className="text-blue-300">%TEMP%\AgenticOS-backup\</code>
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="border-t border-white/[0.04] bg-black/20 backdrop-blur-xl px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={step === "analyze" ? undefined : prevStep}
            disabled={step === "analyze" || step === "progress" || step === "complete"}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all",
              step === "analyze" || step === "progress" || step === "complete"
                ? "text-white/20 cursor-not-allowed"
                : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]",
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>

          <div className="flex items-center gap-2">
            {step === "complete" && (
              <>
                <button
                  onClick={() => navigate("analyze")}
                  className="rounded-lg border border-white/5 px-3 py-2 text-xs text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-all"
                >
                  Start Over
                </button>
                <button
                  onClick={() => {
                    // Navigate away or close
                    window.close?.()
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-red-600 to-orange-600 px-4 py-2 text-xs font-semibold text-white hover:from-red-500 hover:to-orange-500 transition-all"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Close
                </button>
              </>
            )}

            {step !== "complete" && step !== "progress" && (
              <button
                onClick={nextStep}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-all",
                  step === "options" && selectedData.size === 0
                    ? "bg-white/5 text-white/30 cursor-not-allowed"
                    : step === "safety"
                      ? "bg-gradient-to-r from-red-600 to-orange-600 text-white hover:from-red-500 hover:to-orange-500"
                      : "bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500",
                )}
              >
                {step === "safety" ? (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove Now
                  </>
                ) : step === "backup" ? (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    Proceed to Uninstall
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default UninstallWizard
