import { useState } from "react"
import { motion } from "framer-motion"
import { X, Palette } from "lucide-react"
import { cn } from "@/lib/utils"

interface AnnotationCardProps {
  id: string
  x: number
  y: number
  selector: string
  text: string
  color: string
  onUpdate: (id: string, updates: { text?: string; color?: string }) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const COLORS = [
  { label: "Amber", value: "#f59e0b" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Green", value: "#10b981" },
  { label: "Purple", value: "#8b5cf6" },
  { label: "Red", value: "#ef4444" },
  { label: "Pink", value: "#ec4899" },
]

export function AnnotationCard({ id, x, y, selector, text: initialText, color: initialColor, onUpdate, onDelete, onClose }: AnnotationCardProps) {
  const [text, setText] = useState(initialText)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [color, setColor] = useState(initialColor || COLORS[0].value)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -8 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="absolute z-30 w-56"
      style={{ left: x, top: y + 12 }}
    >
      <div className="bg-[#121214] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-[9px] text-white/40 font-mono truncate max-w-[120px]">{selector}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="rounded p-0.5 text-white/30 hover:text-white/60 transition-colors"
              title="Change color"
            >
              <Palette className="h-3 w-3" />
            </button>
            <button
              onClick={() => { onDelete(id); onClose() }}
              className="rounded p-0.5 text-white/30 hover:text-red-400 transition-colors"
              title="Delete annotation"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Color picker */}
        {showColorPicker && (
          <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-white/[0.06] bg-black/20">
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => { setColor(c.value); setShowColorPicker(false); onUpdate(id, { color: c.value }) }}
                className={cn(
                  "h-3.5 w-3.5 rounded-full transition-all",
                  color === c.value ? "ring-1 ring-white/50 ring-offset-1 ring-offset-[#121214]" : "hover:scale-110",
                )}
                style={{ backgroundColor: c.value }}
                title={c.label}
              />
            ))}
          </div>
        )}

        {/* Text input */}
        <div className="px-2.5 py-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              if (text !== initialText) onUpdate(id, { text })
            }}
            placeholder="Add a comment..."
            className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 py-1.5 text-[10px] text-white/70 placeholder:text-white/20 outline-none resize-none min-h-[48px] focus:border-blue-500/30 focus:bg-blue-500/[0.03] transition-colors"
            rows={2}
          />
        </div>
      </div>
    </motion.div>
  )
}
