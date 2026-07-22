import { useState } from "react"
import { motion } from "framer-motion"
import { usePaneStore, type LayoutPreset } from "@/stores/workspace/pane-store"
import { LayoutDashboard, PanelRightClose, PanelBottomClose, Minimize2, Maximize2 } from "lucide-react"

const PRESETS: { id: LayoutPreset; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "default", label: "Default", icon: LayoutDashboard },
  { id: "terminal-right", label: "Terminal → Right", icon: PanelRightClose },
  { id: "terminal-bottom", label: "Terminal → Bottom", icon: PanelBottomClose },
  { id: "minimal", label: "Minimal", icon: Minimize2 },
  { id: "wide-editor", label: "Wide Editor", icon: Maximize2 },
]

export function LayoutPresetSelector() {
  const layoutPreset = usePaneStore((s) => s.layoutPreset)
  const applyLayoutPreset = usePaneStore((s) => s.applyLayoutPreset)
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors hover:bg-white/5"
        style={{ color: "var(--text-secondary)" }}
      >
        <LayoutDashboard className="h-3.5 w-3.5" />
        Layout
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <motion.div
            className="absolute left-0 top-full z-50 mt-1 w-44 rounded-lg border p-1 shadow-lg backdrop-blur-xl"
            style={{
              background: "var(--surface-overlay)",
              borderColor: "var(--border-default)",
            }}
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
          >
            {PRESETS.map((preset) => {
              const Icon = preset.icon
              const isActive = layoutPreset === preset.id
              return (
                <button
                  key={preset.id}
                  onClick={() => {
                    applyLayoutPreset(preset.id)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
                  style={{
                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                    background: isActive ? "var(--accent-code)/10" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "var(--surface-hover)"
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent"
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {preset.label}
                  {isActive && (
                    <span className="ml-auto text-[9px]" style={{ color: "var(--accent-code)" }}>
                      Active
                    </span>
                  )}
                </button>
              )
            })}
          </motion.div>
        </>
      )}
    </div>
  )
}
