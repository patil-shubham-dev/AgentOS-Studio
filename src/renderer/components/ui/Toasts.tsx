import { useState, useRef, useCallback, type PointerEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from "lucide-react"
import { useToastStore, type ToastVariant } from "@/stores/toast-store"
import { cn } from "@/lib/utils"

const VARIANT_CONFIG: Record<ToastVariant, { icon: React.ReactNode; bg: string; border: string; text: string; bar: string }> = {
  success: {
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    bg: "bg-emerald-500/[0.08]",
    border: "border-emerald-500/25",
    text: "text-emerald-400",
    bar: "bg-emerald-500",
  },
  error: {
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    bg: "bg-red-500/[0.08]",
    border: "border-red-500/25",
    text: "text-red-400",
    bar: "bg-red-500",
  },
  info: {
    icon: <Info className="h-3.5 w-3.5" />,
    bg: "bg-blue-500/[0.08]",
    border: "border-blue-500/25",
    text: "text-blue-400",
    bar: "bg-blue-500",
  },
  default: {
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    bg: "bg-amber-500/[0.08]",
    border: "border-amber-500/25",
    text: "text-amber-400",
    bar: "bg-amber-500",
  },
}

function ToastItem({
  id,
  message,
  variant = "info",
  onDismiss,
}: {
  id: string
  message: string
  variant: ToastVariant
  onDismiss: (id: string) => void
}) {
  const [dismissing, setDismissing] = useState(false)
  const [progress, setProgress] = useState(100)
  const progressRef = useRef<number>(100)
  const startTimeRef = useRef<number>(Date.now())
  const pausedRef = useRef(false)
  const dragXRef = useRef(0)

  const cfg = VARIANT_CONFIG[variant] ?? VARIANT_CONFIG.default

  const startProgress = useCallback(() => {
    const duration = 4000
    const step = () => {
      if (pausedRef.current) {
        requestAnimationFrame(step)
        return
      }
      const elapsed = Date.now() - startTimeRef.current
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      progressRef.current = remaining
      setProgress(remaining)
      if (remaining > 0) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [])

  useState(() => { startProgress() })

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{
        opacity: dismissing ? 0 : 1,
        x: dismissing ? 80 : 0,
        scale: dismissing ? 0.95 : 1,
      }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 0.5 }}
      onDrag={(_, info) => { dragXRef.current = info.offset.x }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 80) {
          setDismissing(true)
          setTimeout(() => onDismiss(id), 200)
        }
      }}
      onPointerEnter={() => { pausedRef.current = true }}
      onPointerLeave={() => {
        pausedRef.current = false
        startTimeRef.current = Date.now() - (4000 * (1 - progressRef.current / 100))
        startProgress()
      }}
      className={cn(
        "relative w-full rounded-xl border shadow-xl overflow-hidden cursor-default select-none",
        cfg.bg, cfg.border,
      )}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span className={cn("shrink-0 mt-0.5", cfg.text)}>{cfg.icon}</span>
        <p className={cn("flex-1 text-[11px] leading-relaxed min-w-0", cfg.text)}>{message}</p>
        <button
          onClick={() => { setDismissing(true); setTimeout(() => onDismiss(id), 200) }}
          className="shrink-0 rounded p-0.5 text-white/30 hover:text-white/60 transition-colors -mr-0.5 -mt-0.5"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <motion.div
        className={cn("h-[2px] rounded-full", cfg.bar)}
        style={{ width: `${progress}%` }}
        transition={{ duration: 0.1 }}
      />
    </motion.div>
  )
}

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-[350px] pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem id={t.id} message={t.message} variant={t.variant} onDismiss={removeToast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}
