import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Smartphone, Tablet, Monitor, RotateCcw, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface DevicePreset {
  name: string
  width: number
  height: number
  icon: React.ReactNode
  platform?: "mobile" | "tablet" | "desktop"
}

const PRESETS: DevicePreset[] = [
  { name: "iPhone 14 Pro", width: 390, height: 844, icon: <Smartphone className="h-3 w-3" />, platform: "mobile" },
  { name: "iPhone 14 Pro Max", width: 430, height: 932, icon: <Smartphone className="h-3 w-3" />, platform: "mobile" },
  { name: "Pixel 7", width: 412, height: 915, icon: <Smartphone className="h-3 w-3" />, platform: "mobile" },
  { name: "iPad Air", width: 820, height: 1180, icon: <Tablet className="h-3 w-3" />, platform: "tablet" },
  { name: "iPad Pro 12.9\"", width: 1024, height: 1366, icon: <Tablet className="h-3 w-3" />, platform: "tablet" },
  { name: "Desktop (1280)", width: 1280, height: 800, icon: <Monitor className="h-3 w-3" />, platform: "desktop" },
  { name: "Desktop (1440)", width: 1440, height: 900, icon: <Monitor className="h-3 w-3" />, platform: "desktop" },
]

const PLATFORM_COLORS: Record<string, string> = {
  mobile: "text-purple-400 bg-purple-500/10",
  tablet: "text-blue-400 bg-blue-500/10",
  desktop: "text-emerald-400 bg-emerald-500/10",
}

interface DeviceToolbarProps {
  onResize: (width: number, height: number) => void
  onReset: () => void
  isActive: boolean
}

export function DeviceToolbar({ onResize, onReset, isActive }: DeviceToolbarProps) {
  const [customW, setCustomW] = useState("")
  const [customH, setCustomH] = useState("")
  const [showCustom, setShowCustom] = useState(false)
  const [activePreset, setActivePreset] = useState<string | null>(null)

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: isActive ? "auto" : 0, opacity: isActive ? 1 : 0 }}
      className="border-t border-white/[0.06] bg-[#0c0c0d] overflow-hidden shrink-0"
    >
      <div className="px-2 py-1.5">
        {/* Preset chips */}
        <div className="flex items-center gap-1 flex-wrap">
          {PRESETS.map((p, i) => (
            <motion.button
              key={p.name}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.15 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setActivePreset(activePreset === p.name ? null : p.name)
                if (activePreset !== p.name) onResize(p.width, p.height)
                else onReset()
              }}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors",
                activePreset === p.name
                  ? PLATFORM_COLORS[p.platform ?? "desktop"] + " border border-white/[0.08] shadow-sm"
                  : "text-white/30 hover:text-white/60 hover:bg-white/[0.06]",
              )}
            >
              {p.icon}
              <span>{p.name}</span>
              <span className="text-[8px] text-white/20 ml-0.5">{p.width}×{p.height}</span>
            </motion.button>
          ))}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowCustom(!showCustom)}
            className={cn(
              "rounded-md px-2 py-1 text-[10px] transition-colors",
              showCustom ? "text-blue-400 bg-blue-500/10 border border-blue-500/20" : "text-white/30 hover:text-white/60 hover:bg-white/[0.06]",
            )}
          >
            Custom
          </motion.button>
          {activePreset && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => { setActivePreset(null); onReset() }}
              className="ml-auto rounded p-1 text-white/30 hover:text-white/60 transition-colors"
              title="Reset viewport"
            >
              <RotateCcw className="h-3 w-3" />
            </motion.button>
          )}
        </div>

        {/* Custom size input */}
        <AnimatePresence>
          {showCustom && (
            <motion.div
              initial={{ height: 0, opacity: 0, y: -4 }}
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -4 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="flex items-center gap-2 mt-1.5 overflow-hidden"
            >
              <input
                value={customW}
                onChange={(e) => setCustomW(e.target.value.replace(/\D/g, ""))}
                placeholder="Width"
                className="w-16 h-6 rounded-md bg-white/[0.04] border border-white/[0.06] px-2 text-[10px] font-mono text-white/60 outline-none focus:border-blue-500/30 placeholder:text-white/15 transition-all"
              />
              <span className="text-white/20 text-[10px]">×</span>
              <input
                value={customH}
                onChange={(e) => setCustomH(e.target.value.replace(/\D/g, ""))}
                placeholder="Height"
                className="w-16 h-6 rounded-md bg-white/[0.04] border border-white/[0.06] px-2 text-[10px] font-mono text-white/60 outline-none focus:border-blue-500/30 placeholder:text-white/15 transition-all"
              />
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  const w = parseInt(customW); const h = parseInt(customH)
                  if (w > 0 && h > 0) { onResize(w, h); setActivePreset("custom") }
                }}
                className="rounded-md px-2 py-1 text-[9px] text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
              >
                Apply
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowCustom(false)}
                className="rounded p-1 text-white/30 hover:text-white/60 transition-colors"
              >
                <X className="h-3 w-3" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
