import { memo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Shield, ShieldCheck, ShieldAlert, Wrench, FileSearch, ChevronDown } from "lucide-react"
import { usePermissionModeStore, type PermissionMode } from "@/stores/chat/permission-mode-store"
import { usePlanStore } from "@/stores/plan-store"
import { useAppStore } from "@/stores/settings/app-store"
import { cn } from "@/lib/utils"
import { useState, useRef, useEffect } from "react"

const modes: { value: PermissionMode; label: string; description: string; icon: typeof Shield }[] = [
  { value: "automatic", label: "Automatic", description: "AI runs commands and edits without approval", icon: ShieldCheck },
  { value: "prompt", label: "Prompt", description: "AI suggests actions, you approve each one", icon: ShieldAlert },
  { value: "manual", label: "Manual", description: "AI plans only, you execute manually", icon: Wrench },
  { value: "plan", label: "Plan", description: "AI explores and proposes a plan before executing", icon: FileSearch },
]

export const PermissionModeSelector = memo(function PermissionModeSelector({
  onPlanModeChange,
}: {
  onPlanModeChange?: (enteringPlan: boolean) => void
}) {
  const mode = usePermissionModeStore((s) => s.mode)
  const setMode = usePermissionModeStore((s) => s.setMode)
  const setPlanMode = useAppStore((s) => s.setPlanMode)
  const { setPlanningPhase, clearPlan } = usePlanStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const current = modes.find((m) => m.value === mode) ?? modes[1]
  const Icon = current.icon

  const handleSelect = useCallback((value: PermissionMode) => {
    const prevMode = usePermissionModeStore.getState().mode
    const enteringPlan = value === "plan"
    const leavingPlan = prevMode === "plan" && !enteringPlan

    if (enteringPlan) {
      clearPlan()
      setPlanningPhase(true)
      setPlanMode("always")
    } else if (leavingPlan) {
      setPlanningPhase(false)
      setPlanMode("auto")
    }

    setMode(value)
    setOpen(false)
    onPlanModeChange?.(enteringPlan)
  }, [setMode, setPlanMode, setPlanningPhase, clearPlan, onPlanModeChange])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium transition-all",
          "hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20",
        )}
        style={{
          color: "var(--text-tertiary)",
          ...(mode === "plan" ? { backgroundColor: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" } : {}),
        }}
      >
        <Icon className={cn("h-3 w-3", mode === "plan" && "text-purple-400")} />
        <span className={cn(mode === "plan" && "text-purple-400")}>{current.label}</span>
        <ChevronDown className="h-2.5 w-2.5" style={{ color: "var(--text-quaternary)" }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute left-0 top-full mt-1 z-50 min-w-[200px] rounded-xl border shadow-2xl py-1 overflow-hidden"
            style={{
              backgroundColor: "var(--surface-panel)",
              borderColor: "var(--border-default)",
            }}
          >
            <div className="px-3 py-1.5 text-[8px] font-medium uppercase tracking-wider" style={{ color: "var(--text-quaternary)" }}>
              Execution mode
            </div>
            {modes.slice(0, 3).map((m) => {
              const MIcon = m.icon
              const isActive = mode === m.value
              return (
                <button
                  key={m.value}
                  onClick={() => handleSelect(m.value)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors",
                    "hover:bg-white/[0.04]",
                  )}
                  style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}
                >
                  <MIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{
                    color: isActive ? "var(--color-accent-brand)" : "var(--text-quaternary)",
                  }} />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium">{m.label}</span>
                    <span className="text-[8px]" style={{ color: "var(--text-quaternary)" }}>
                      {m.description}
                    </span>
                  </div>
                </button>
              )
            })}
            <div className="border-t my-1 mx-2" style={{ borderColor: "var(--border-subtle)" }} />
            <div className="px-3 py-1.5 text-[8px] font-medium uppercase tracking-wider" style={{ color: "var(--text-quaternary)" }}>
              Discovery
            </div>
            {modes.slice(3).map((m) => {
              const MIcon = m.icon
              const isActive = mode === m.value
              return (
                <button
                  key={m.value}
                  onClick={() => handleSelect(m.value)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors",
                    "hover:bg-white/[0.04]",
                    m.value === "plan" && "rounded-b-lg",
                  )}
                  style={{
                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                    ...(isActive ? {} : {}),
                  }}
                >
                  <MIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{
                    color: isActive ? "#a78bfa" : "var(--text-quaternary)",
                  }} />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium">{m.label}</span>
                    <span className="text-[8px]" style={{ color: "var(--text-quaternary)" }}>
                      {m.description}
                    </span>
                  </div>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
