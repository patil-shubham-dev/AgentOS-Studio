import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import type { ElementType } from "react"
import {
  Sparkles, Cpu, HardDrive, Wifi, Shield, Package, FolderOpen,
  Check, CheckCircle2, XCircle, AlertTriangle, Loader2, ArrowRight, ArrowLeft,
  Monitor, Server, Globe, MousePointerClick, Link, RefreshCw, Download,
  Rocket, BookOpen, MessageCircle, ExternalLink, ChevronRight, Bot,
  Layers, Terminal, GitBranch, AppWindow, Clock, Settings2, Sliders,
  ChevronDown, ChevronUp, Info, Zap, FileCode, BarChart3, Diamond,
} from "lucide-react"
import { ImportSettingsDialog } from "@/components/install/ImportSettingsDialog"

// ─── Types ──────────────────────────────────────────────────────────────────

type InstallStep =
  | "welcome"
  | "system-check"
  | "install-type"
  | "components"
  | "location"
  | "summary"
  | "installing"
  | "complete"

interface SystemCheckResult {
  id: string
  label: string
  status: "pass" | "warn" | "fail" | "pending" | "checking"
  detail: string
  icon: ElementType
  action?: string
}

interface InstallComponent {
  id: string
  label: string
  description: string
  size: string
  icon: ElementType
  recommended: boolean
  defaultOn: boolean
}

interface InstallStage {
  id: string
  label: string
  icon: ElementType
  status: "pending" | "active" | "done" | "error"
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VERSION = "3.0.0"

const INSTALL_COMPONENTS: InstallComponent[] = [
  { id: "core", label: "Core Application", description: "Application binaries, runtime, and core libraries", size: "~450 MB", icon: Package, recommended: true, defaultOn: true },
  { id: "ai-runtime", label: "AI Runtime", description: "On-device AI inference engine and model runner", size: "~180 MB", icon: Cpu, recommended: true, defaultOn: true },
  { id: "browser", label: "Browser Automation", description: "Playwright-based browser automation engine", size: "~320 MB", icon: Globe, recommended: true, defaultOn: true },
  { id: "context-menu", label: "Context Menu Integration", description: "\"Open with AgenticOS\" right-click menu in File Explorer", size: "< 1 MB", icon: MousePointerClick, recommended: true, defaultOn: true },
  { id: "file-assocs", label: "File Associations", description: "Associate .agenticos project files with AgenticOS", size: "< 1 MB", icon: FileCode, recommended: false, defaultOn: false },
  { id: "shortcut-desktop", label: "Desktop Shortcut", description: "Add AgenticOS icon to your desktop", size: "< 1 MB", icon: Monitor, recommended: true, defaultOn: true },
  { id: "shortcut-start", label: "Start Menu Shortcut", description: "Add AgenticOS to the Start Menu", size: "< 1 MB", icon: AppWindow, recommended: true, defaultOn: true },
  { id: "protocol", label: "Deep Link Protocol", description: "Register agenticos:// for deep linking from browsers", size: "< 1 MB", icon: Link, recommended: true, defaultOn: true },
  { id: "auto-update", label: "Auto Updates", description: "Background automatic updates with user notifications", size: "< 1 MB", icon: RefreshCw, recommended: true, defaultOn: true },
  { id: "telemetry", label: "Telemetry (Anonymous)", description: "Send anonymous usage data to help improve AgenticOS", size: "< 1 MB", icon: BarChart3, recommended: false, defaultOn: false },
]

const INSTALL_STAGES: InstallStage[] = [
  { id: "preparing", label: "Preparing installation environment", icon: Loader2, status: "pending" },
  { id: "extracting", label: "Extracting application files", icon: Package, status: "pending" },
  { id: "installing-components", label: "Installing selected components", icon: Layers, status: "pending" },
  { id: "configuring-integrations", label: "Configuring system integrations", icon: Settings2, status: "pending" },
  { id: "registering-protocols", label: "Registering protocols & associations", icon: Link, status: "pending" },
  { id: "creating-shortcuts", label: "Creating shortcuts", icon: Monitor, status: "pending" },
  { id: "finalizing", label: "Finalizing installation", icon: Zap, status: "pending" },
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

function StepIndicator({ steps, current }: { steps: InstallStep[]; current: InstallStep }) {
  const labels: Record<InstallStep, string> = {
    welcome: "Welcome",
    "system-check": "System Check",
    "install-type": "Type",
    components: "Components",
    location: "Location",
    summary: "Summary",
    installing: "Installing",
    complete: "Complete",
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
                  ? "bg-blue-500 text-white"
                  : i === currentIdx
                    ? "bg-blue-500/20 border border-blue-500/40 text-blue-400"
                    : "bg-white/5 border border-white/10 text-white/30",
              )}
            >
              {i < currentIdx ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span
              className={cn(
                "text-[8px] font-medium whitespace-nowrap transition-colors",
                i === currentIdx ? "text-blue-400" : i < currentIdx ? "text-white/40" : "text-white/20",
              )}
            >
              {labels[step]}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn("h-px flex-1 mx-1 transition-colors", i < currentIdx ? "bg-blue-500/40" : "bg-white/5")} />
          )}
        </div>
      ))}
    </div>
  )
}

function SystemCheckItem({ check, index }: { check: SystemCheckResult; index: number }) {
  const statusConfig = {
    pass: { icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20", glow: "from-green-500/10" },
    warn: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", glow: "from-amber-500/10" },
    fail: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", glow: "from-red-500/10" },
    pending: { icon: Loader2, color: "text-white/20", bg: "bg-white/[0.02]", border: "border-white/5", glow: "from-white/5" },
    checking: { icon: Loader2, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", glow: "from-blue-500/10" },
  }

  const cfg = statusConfig[check.status]
  const Icon = check.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={cn(
        "relative group rounded-xl border p-3 transition-all duration-300",
        cfg.border,
        cfg.bg,
      )}
    >
      <div className={cn("absolute -inset-px rounded-xl bg-gradient-to-br to-transparent opacity-0 group-hover:opacity-100 blur-sm transition-opacity", cfg.glow)} />
      <div className="relative flex items-center gap-3">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", cfg.bg, cfg.border)}>
          <Icon className={cn("h-4 w-4", cfg.color, (check.status === "pending" || check.status === "checking") && "animate-spin")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white/80">{check.label}</span>
            <span className={cn("text-[10px] font-medium capitalize", cfg.color)}>{check.status === "pass" ? "Passed" : check.status === "warn" ? "Warning" : check.status === "fail" ? "Failed" : check.status === "checking" ? "Checking..." : "Pending"}</span>
          </div>
          <p className="text-[10px] text-white/40 mt-0.5">{check.detail}</p>
        </div>
        {check.action && check.status !== "pass" && (
          <button className="shrink-0 rounded-lg bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 text-[9px] font-medium text-blue-400 hover:bg-blue-500/20 transition-all whitespace-nowrap">
            {check.action}
          </button>
        )}
      </div>
    </motion.div>
  )
}

function ComponentCard({ component, selected, onToggle, disabled }: {
  component: InstallComponent
  selected: boolean
  onToggle: (id: string) => void
  disabled: boolean
}) {
  const Icon = component.icon

  return (
    <motion.div
      layout
      className={cn(
        "relative rounded-xl border p-3 transition-all duration-200 cursor-pointer",
        disabled
          ? "opacity-50 cursor-not-allowed border-white/5"
          : selected
            ? "border-blue-500/30 bg-blue-500/[0.04]"
            : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]",
      )}
      onClick={() => !disabled && onToggle(component.id)}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
            selected ? "bg-blue-500/10 border border-blue-500/20" : "bg-white/[0.04] border border-white/[0.06]",
          )}
        >
          <Icon className={cn("h-4 w-4", selected ? "text-blue-400" : "text-white/40")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-medium", selected ? "text-white/90" : "text-white/60")}>{component.label}</span>
            {component.recommended && (
              <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[8px] font-medium text-blue-400">Recommended</span>
            )}
            <span className="ml-auto text-[9px] text-white/30 font-mono">{component.size}</span>
          </div>
          <p className="text-[10px] text-white/40 mt-0.5">{component.description}</p>
        </div>
        <div
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded border transition-all shrink-0 mt-1",
            selected ? "border-blue-500 bg-blue-500" : "border-white/20",
          )}
        >
          {selected && <Check className="h-3 w-3 text-white" />}
        </div>
      </div>
    </motion.div>
  )
}

function ProgressStage({ stage, index }: { stage: InstallStage; index: number }) {
  const statusStyles = {
    pending: { icon: Loader2, color: "text-white/20", bg: "bg-white/[0.02]", border: "border-white/5", pulse: false, spin: false },
    active: { icon: Loader2, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", pulse: true, spin: true },
    done: { icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20", pulse: false, spin: false },
    error: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", pulse: false, spin: false },
  }

  const st = statusStyles[stage.status]
  const Icon = st.icon

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.15 }}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-500",
        st.border,
        st.bg,
        stage.status === "active" && "animate-pulse",
      )}
    >
      <div className={cn("flex h-6 w-6 items-center justify-center shrink-0")}>
        <Icon className={cn("h-3.5 w-3.5", st.color, st.spin && "animate-spin")} />
      </div>
      <span className={cn("text-[11px] font-medium", st.color)}>{stage.label}</span>
      {stage.status === "active" && (
        <span className="ml-auto flex gap-0.5">
          <span className="h-1 w-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="h-1 w-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="h-1 w-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
        </span>
      )}
      {stage.status === "done" && (
        <Check className="ml-auto h-3 w-3 text-green-400" />
      )}
    </motion.div>
  )
}

// ─── Main Install Wizard Component ──────────────────────────────────────────

export function InstallWizard() {
  const [step, setStep] = useState<InstallStep>("welcome")
  const [direction, setDirection] = useState(0) // 1 = forward, -1 = back
  const [installType, setInstallType] = useState<"recommended" | "advanced">("recommended")
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set(INSTALL_COMPONENTS.filter((c) => c.defaultOn).map((c) => c.id)))
  const [installPath, setInstallPath] = useState("")
  const [systemChecks, setSystemChecks] = useState<SystemCheckResult[]>([])
  const [installStages, setInstallStages] = useState<InstallStage[]>(INSTALL_STAGES)
  const [progress, setProgress] = useState(0)
  const [currentFile, setCurrentFile] = useState("")
  const [elapsed, setElapsed] = useState(0)
  const [allChecksPassed, setAllChecksPassed] = useState(false)
  const [postInstallActions, setPostInstallActions] = useState({
    launch: true,
    docs: false,
    community: false,
    releaseNotes: false,
  })
  const [showImportDialog, setShowImportDialog] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const STEPS: InstallStep[] = ["welcome", "system-check", "install-type", "components", "location", "summary", "installing", "complete"]

  // Simulate system checks
  const runSystemChecks = useCallback(async () => {
    const checks: SystemCheckResult[] = [
      { id: "os", label: "Windows Version", status: "pending", detail: "Checking operating system version...", icon: Monitor },
      { id: "ram", label: "System RAM", status: "pending", detail: "Checking available memory...", icon: Cpu },
      { id: "disk", label: "Disk Space", status: "pending", detail: "Checking available storage...", icon: HardDrive },
      { id: "arch", label: "System Architecture", status: "pending", detail: "Checking CPU architecture...", icon: Cpu },
      { id: "permissions", label: "Install Permissions", status: "pending", detail: "Checking write permissions...", icon: Shield },
      { id: "existing", label: "Existing Installation", status: "pending", detail: "Checking for previous install...", icon: Package },
      { id: "network", label: "Network Connectivity", status: "pending", detail: "Checking network access...", icon: Wifi },
    ]
    setSystemChecks(checks)

    // Simulate running checks sequentially
    for (let i = 0; i < checks.length; i++) {
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 400))

      setSystemChecks((prev) =>
        prev.map((c, idx) =>
          idx === i ? { ...c, status: "checking" as const, detail: `Checking ${c.label.toLowerCase()}...` } : c,
        ),
      )

      await new Promise((r) => setTimeout(r, 400 + Math.random() * 600))

      // Simulate results (all pass in the wizard UI)
      setSystemChecks((prev) =>
        prev.map((c, idx) => {
          if (idx !== i) return c
          // Simulate realistic warnings
          if (c.id === "ram") {
            return {
              ...c,
              status: "warn" as const,
              detail: "8.0 GB detected — 16 GB recommended for heavy AI workloads",
              action: "Learn more",
            }
          }
          return { ...c, status: "pass" as const, detail: `${c.label} check passed` }
        }),
      )
    }

    setAllChecksPassed(true)
  }, [])

  // Simulate installation progress
  const runInstallation = useCallback(async () => {
    setProgress(0)
    setElapsed(0)

    // Start timer
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)

    // Simulate stages
    const stageDurations = [800, 1200, 1000, 900, 700, 600, 1000]
    let totalProgress = 0

    for (let i = 0; i < INSTALL_STAGES.length; i++) {
      setInstallStages((prev) =>
        prev.map((s, idx) => (idx === i ? { ...s, status: "active" as const } : idx < i ? { ...s, status: "done" as const } : s)),
      )

      const filesPerStage = Math.floor(20 + Math.random() * 40)
      const stageProgress = stageDurations[i] / 100
      const stepSize = 100 / stageProgress / filesPerStage

      for (let f = 0; f < filesPerStage; f++) {
        const fileNames = ["agentic-core.dll", "runtime.bin", "config.json", "ui-bundle.js", "agent-models.bin", "terminal.asar", "browser-engine.exe", "protocol-handler.dll", "context-menu.dll", "assets.bin", "locales.dat", "updater.exe"]
        setCurrentFile(fileNames[f % fileNames.length])
        totalProgress += stepSize
        setProgress(Math.min(totalProgress, 99))
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 60))
      }
    }

    setInstallStages((prev) => prev.map((s) => ({ ...s, status: "done" as const })))
    setProgress(100)
    setCurrentFile("")

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // Move to complete step after short delay
    await new Promise((r) => setTimeout(r, 500))
    setDirection(1)
    setStep("complete")
  }, [])

  const navigateTo = useCallback(
    (target: InstallStep) => {
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
      // Trigger actions when navigating to specific steps
      if (STEPS[currentIdx + 1] === "system-check") {
        runSystemChecks()
      }
      if (STEPS[currentIdx + 1] === "installing") {
        runInstallation()
      }
      setDirection(1)
      setStep(STEPS[currentIdx + 1])
    }
  }, [step, runSystemChecks, runInstallation])

  const prevStep = useCallback(() => {
    const currentIdx = STEPS.indexOf(step)
    if (currentIdx > 0) {
      setDirection(-1)
      setStep(STEPS[currentIdx - 1])
    }
  }, [step])

  const toggleComponent = useCallback((id: string) => {
    if (id === "core") return // Core is always required
    setSelectedComponents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectInstallType = useCallback((type: "recommended" | "advanced") => {
    setInstallType(type)
    if (type === "recommended") {
      setSelectedComponents(new Set(INSTALL_COMPONENTS.filter((c) => c.defaultOn).map((c) => c.id)))
    }
  }, [])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  const selectedCount = selectedComponents.size
  const totalSize = INSTALL_COMPONENTS.filter((c) => selectedComponents.has(c.id)).length * 180 + 150

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
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10">
            <Bot className="h-4 w-4 text-blue-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-semibold text-white/90">Installation Wizard</h1>
            <p className="text-[10px] text-white/30">Set up AgenticOS on your system</p>
          </div>
          {step !== "complete" && step !== "installing" && (
            <span className="text-[10px] text-white/20 font-mono">v{VERSION}</span>
          )}
        </div>
      </div>

      {/* Step Indicator */}
      {step !== "installing" && step !== "complete" && (
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
              {/* Step: Welcome */}
              {step === "welcome" && (
                <div className="space-y-6">
                  <div className="text-center py-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", damping: 15, stiffness: 200 }}
                      className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/15 via-purple-500/10 to-indigo-500/15 border border-white/10"
                    >
                      <Sparkles className="h-10 w-10 text-blue-400" />
                    </motion.div>
                    <motion.h1
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-3xl font-bold tracking-tight text-white"
                    >
                      AgenticOS
                    </motion.h1>
                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="text-sm text-white/40 mt-1"
                    >
                      Autonomous AI Workspace
                    </motion.p>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="grid grid-cols-2 gap-2"
                  >
                    {[
                      { icon: Bot, text: "Multi-agent coding" },
                      { icon: Zap, text: "Autonomous execution" },
                      { icon: Globe, text: "Browser automation" },
                      { icon: BarChart3, text: "Workspace intelligence" },
                      { icon: Shield, text: "Local-first architecture" },
                      { icon: Layers, text: "Advanced AI orchestration" },
                    ].map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5"
                      >
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/10">
                          <item.icon className="h-3 w-3 text-blue-400" />
                        </div>
                        <span className="text-[11px] text-white/60">{item.text}</span>
                      </div>
                    ))}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="rounded-xl bg-gradient-to-r from-blue-500/5 to-purple-500/5 border border-white/5 p-4 text-center"
                  >
                    <p className="text-xs text-white/40 leading-relaxed">
                      This wizard will guide you through installing AgenticOS on your system.
                      The process takes about 2-3 minutes.
                    </p>
                  </motion.div>
                </div>
              )}

              {/* Step: System Check */}
              {step === "system-check" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white/90">System Check</h2>
                    <p className="text-xs text-white/40 mt-1">Verifying that your system meets the requirements</p>
                  </div>

                  <div className="space-y-2">
                    {systemChecks.map((check, i) => (
                      <SystemCheckItem key={check.id} check={check} index={i} />
                    ))}
                  </div>

                  {allChecksPassed && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl bg-green-500/5 border border-green-500/15 p-3 flex items-center gap-3"
                    >
                      <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-green-400">All checks passed</p>
                        <p className="text-[10px] text-green-400/60">Your system is ready for AgenticOS</p>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {/* Step: Install Type */}
              {step === "install-type" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white/90">Installation Type</h2>
                    <p className="text-xs text-white/40 mt-1">Choose how you want to install AgenticOS</p>
                  </div>

                  <div className="space-y-3">
                    <motion.div
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className={cn(
                        "relative rounded-xl border-2 p-4 cursor-pointer transition-all",
                        installType === "recommended"
                          ? "border-blue-500/40 bg-blue-500/[0.04]"
                          : "border-white/5 bg-white/[0.02] hover:border-white/15",
                      )}
                      onClick={() => selectInstallType("recommended")}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-xl",
                            installType === "recommended" ? "bg-blue-500/10" : "bg-white/[0.04]",
                          )}
                        >
                          <Diamond className={cn("h-5 w-5", installType === "recommended" ? "text-blue-400" : "text-white/30")} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-white/80">Recommended</h3>
                            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[9px] font-medium text-blue-400">Best for most users</span>
                          </div>
                          <p className="text-xs text-white/40 mt-1">
                            Installs with desktop shortcut, context menu, deep links, and auto-updates enabled.
                            Everything you need to get started immediately.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {["Core App", "AI Runtime", "Browser Automation", "Context Menu", "Desktop Shortcut", "Deep Links", "Auto Updates"].map((tag) => (
                              <span key={tag} className="rounded-md bg-white/[0.04] border border-white/5 px-2 py-0.5 text-[9px] text-white/40">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full border-2 shrink-0 mt-1",
                            installType === "recommended" ? "border-blue-500 bg-blue-500" : "border-white/30",
                          )}
                        >
                          {installType === "recommended" && <div className="h-2 w-2 rounded-full bg-white" />}
                        </div>
                      </div>
                    </motion.div>

                    <motion.div
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className={cn(
                        "relative rounded-xl border-2 p-4 cursor-pointer transition-all",
                        installType === "advanced"
                          ? "border-purple-500/40 bg-purple-500/[0.04]"
                          : "border-white/5 bg-white/[0.02] hover:border-white/15",
                      )}
                      onClick={() => selectInstallType("advanced")}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-xl",
                            installType === "advanced" ? "bg-purple-500/10" : "bg-white/[0.04]",
                          )}
                        >
                          <Sliders className={cn("h-5 w-5", installType === "advanced" ? "text-purple-400" : "text-white/30")} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-white/80">Advanced</h3>
                            <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[9px] font-medium text-purple-400">Full control</span>
                          </div>
                          <p className="text-xs text-white/40 mt-1">
                            Full customization of all components, shortcuts, file associations, and integrations.
                            Choose exactly what to install.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {["All components", "Custom selection", "Manual config"].map((tag) => (
                              <span key={tag} className="rounded-md bg-white/[0.04] border border-white/5 px-2 py-0.5 text-[9px] text-white/40">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full border-2 shrink-0 mt-1",
                            installType === "advanced" ? "border-purple-500 bg-purple-500" : "border-white/30",
                          )}
                        >
                          {installType === "advanced" && <div className="h-2 w-2 rounded-full bg-white" />}
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </div>
              )}

              {/* Step: Components (only for Advanced) */}
              {step === "components" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-white/90">Components</h2>
                      <p className="text-xs text-white/40 mt-1">Select which components to install</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-white/70">{selectedCount} of {INSTALL_COMPONENTS.length} selected</p>
                      <p className="text-[9px] text-white/30">~{totalSize} MB total</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {INSTALL_COMPONENTS.map((component) => (
                      <ComponentCard
                        key={component.id}
                        component={component}
                        selected={selectedComponents.has(component.id)}
                        onToggle={toggleComponent}
                        disabled={component.id === "core"}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Step: Location */}
              {step === "location" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white/90">Install Location</h2>
                    <p className="text-xs text-white/40 mt-1">Choose where to install AgenticOS</p>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <FolderOpen className="h-5 w-5 text-blue-400" />
                      <span className="text-xs font-medium text-white/70">Install Path</span>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        value={installPath || "%LOCALAPPDATA%\\AgenticOS"}
                        onChange={(e) => setInstallPath(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-xs font-mono text-white/60 placeholder:text-white/20 outline-none focus:border-blue-500/40 transition-colors"
                        placeholder="Select installation directory..."
                      />
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                        <span className="text-[11px] text-white/40">Required Space</span>
                        <span className="text-[11px] font-mono text-white/60">~{totalSize} MB</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                        <span className="text-[11px] text-white/40">Available Space</span>
                        <span className="text-[11px] font-mono text-green-400">~50 GB</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-[11px] text-white/40">Expected Usage</span>
                        <span className="text-[11px] font-mono text-white/60">~{Math.round(totalSize * 1.3)} MB (with runtime data)</span>
                      </div>
                    </div>
                  </div>

                  {/* Space bar */}
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-white/30">Disk Usage</span>
                      <span className="text-[10px] text-white/30">{(totalSize / 50000 * 100).toFixed(1)}% of available</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                        style={{ width: `${Math.min((totalSize / 50000) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step: Summary */}
              {step === "summary" && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white/90">Installation Summary</h2>
                    <p className="text-xs text-white/40 mt-1">Review your selections before installing</p>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Sliders className="h-4 w-4 text-blue-400" />
                        <span className="text-xs font-semibold text-white/70">Installation Type</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02]">
                        <span className="text-[11px] text-white/60 capitalize">{installType}</span>
                        {installType === "recommended" && <span className="text-[9px] text-blue-400">Best for most users</span>}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Package className="h-4 w-4 text-emerald-400" />
                        <span className="text-xs font-semibold text-white/70">Components ({selectedCount})</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {INSTALL_COMPONENTS.filter((c) => selectedComponents.has(c.id)).map((c) => (
                          <div key={c.id} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5">
                            <Check className="h-3 w-3 text-green-400 shrink-0" />
                            <span className="text-[10px] text-white/60">{c.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <HardDrive className="h-4 w-4 text-amber-400" />
                        <span className="text-xs font-semibold text-white/70">Disk Usage</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                        <span className="text-[11px] text-white/40">Install Size</span>
                        <span className="text-[11px] font-mono text-white/60">~{totalSize} MB</span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="text-[11px] text-white/40">Location</span>
                        <span className="text-[11px] font-mono text-white/50 truncate ml-4 max-w-[200px]">{installPath || "%LOCALAPPDATA%\\AgenticOS"}</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Link className="h-4 w-4 text-purple-400" />
                        <span className="text-xs font-semibold text-white/70">Integrations</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { icon: MousePointerClick, label: "Context Menu", on: selectedComponents.has("context-menu") },
                          { icon: Monitor, label: "Desktop Shortcut", on: selectedComponents.has("shortcut-desktop") },
                          { icon: AppWindow, label: "Start Menu", on: selectedComponents.has("shortcut-start") },
                          { icon: Link, label: "Deep Links", on: selectedComponents.has("protocol") },
                          { icon: RefreshCw, label: "Auto Updates", on: selectedComponents.has("auto-update") },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className={cn(
                              "flex items-center gap-1.5 rounded-md px-2 py-1 border",
                              item.on ? "bg-green-500/10 border-green-500/20" : "bg-white/[0.02] border-white/5 opacity-40",
                            )}
                          >
                            <item.icon className="h-3 w-3 text-white/50" />
                            <span className={cn("text-[9px]", item.on ? "text-green-400" : "text-white/30")}>
                              {item.on ? "✓" : "○"} {item.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step: Installing */}
              {step === "installing" && (
                <div className="space-y-6 py-4">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/10 border border-blue-500/20">
                      <Loader2 className="h-7 w-7 text-blue-400 animate-spin" />
                    </div>
                    <h2 className="text-lg font-semibold text-white/90">Installing AgenticOS</h2>
                    <p className="text-xs text-white/40 mt-1">Please wait while we set up your system</p>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-white/40">{currentFile || "Preparing..."}</span>
                      <span className="font-mono text-white/60">{progress.toFixed(0)}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-400"
                        style={{ width: `${progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-white/20">
                      <span>Time elapsed: {formatTime(elapsed)}</span>
                      <span>Estimated: ~01:30</span>
                    </div>
                  </div>

                  {/* Stage timeline */}
                  <div className="space-y-1.5">
                    {installStages.map((stage, i) => (
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
                    <h2 className="text-2xl font-bold text-white">Installation Complete</h2>
                    <p className="text-sm text-white/40 mt-1">AgenticOS v{VERSION} is ready to use</p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3"
                  >
                    <h3 className="text-xs font-semibold text-white/70">What would you like to do next?</h3>
                    <div className="space-y-2">
                      {[
                        { id: "launch" as const, icon: Rocket, label: "Launch AgenticOS", desc: "Start using AgenticOS right away" },
                        { id: "docs" as const, icon: BookOpen, label: "Open Documentation", desc: "Learn how to use AgenticOS with the getting started guide" },
                        { id: "community" as const, icon: MessageCircle, label: "Join Community", desc: "Connect with other AgenticOS users and the development team" },
                        { id: "releaseNotes" as const, icon: ExternalLink, label: "View Release Notes", desc: "See what's new in v{VERSION}" },
                      ].map((action) => {
                        const isOn = postInstallActions[action.id]
                        const Icon = action.icon
                        return (
                          <div
                            key={action.id}
                            className={cn(
                              "flex items-center gap-3 rounded-lg border p-3 transition-all cursor-pointer",
                              isOn
                                ? "border-blue-500/20 bg-blue-500/[0.04]"
                                : "border-white/5 bg-white/[0.02] hover:border-white/10",
                            )}
                            onClick={() => setPostInstallActions((prev) => ({ ...prev, [action.id]: !prev[action.id] }))}
                          >
                            <div
                              className={cn(
                                "flex h-4 w-4 items-center justify-center rounded border shrink-0",
                                isOn ? "border-blue-500 bg-blue-500" : "border-white/20",
                              )}
                            >
                              {isOn && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <Icon className={cn("h-4 w-4 shrink-0", isOn ? "text-blue-400" : "text-white/30")} />
                            <div className="flex-1 min-w-0">
                              <span className={cn("text-xs font-medium", isOn ? "text-white/80" : "text-white/50")}>{action.label}</span>
                              <p className="text-[10px] text-white/30">{action.desc}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </motion.div>

                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    onClick={() => setShowImportDialog(true)}
                    className="w-full rounded-xl bg-gradient-to-r from-blue-500/5 to-purple-500/5 border border-white/5 p-4 hover:from-blue-500/10 hover:to-purple-500/10 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg p-1.5 bg-blue-500/10 border border-blue-500/20 group-hover:bg-blue-500/15 transition-all">
                        <Download className="h-4 w-4 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white/70 group-hover:text-white/90 transition-colors">Import Settings</p>
                        <p className="text-[10px] text-white/40">Import providers, API keys & preferences from VS Code, Cursor, or Claude Desktop</p>
                      </div>
                      <div className="shrink-0 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 text-[10px] font-medium text-blue-400 group-hover:bg-blue-500/20 transition-all flex items-center gap-1">
                        Import
                        <ArrowRight className="h-3 w-3" />
                      </div>
                    </div>
                  </motion.button>

                  {/* Import Settings Dialog */}
                  <ImportSettingsDialog
                    open={showImportDialog}
                    onClose={() => setShowImportDialog(false)}
                  />
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
            onClick={step === "welcome" ? undefined : prevStep}
            disabled={step === "welcome" || step === "installing" || step === "complete"}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all",
              step === "welcome" || step === "installing" || step === "complete"
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
                  onClick={() => setStep("welcome")}
                  className="rounded-lg border border-white/5 px-3 py-2 text-xs text-white/40 hover:text-white/60 hover:bg-white/[0.04] transition-all"
                >
                  Start Over
                </button>
                <button
                  onClick={() => {
                    // Trigger post-install actions
                    if (postInstallActions.launch) {
                      window.electronAPI?.restart?.()
                    }
                    if (postInstallActions.docs) {
                      window.electronAPI?.openExternal?.("https://agenticos.ai/docs")
                    }
                    if (postInstallActions.community) {
                      window.electronAPI?.openExternal?.("https://agenticos.ai/community")
                    }
                    if (postInstallActions.releaseNotes) {
                      window.electronAPI?.openExternal?.("https://agenticos.ai/releases")
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-xs font-semibold text-white hover:from-blue-500 hover:to-purple-500 transition-all"
                >
                  <Rocket className="h-3.5 w-3.5" />
                  Finish
                </button>
              </>
            )}

            {step !== "complete" && step !== "installing" && (
              <button
                onClick={nextStep}
                disabled={step === "system-check" && !allChecksPassed}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-all",
                  step === "system-check" && !allChecksPassed
                    ? "bg-white/5 text-white/30 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500",
                )}
              >
                {step === "summary" ? (
                  <>
                    <Package className="h-3.5 w-3.5" />
                    Install Now
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

export default InstallWizard
