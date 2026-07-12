import { type ReactNode, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { DURATION, EASING } from "@/lib/motion"

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  className?: string
  width?: string
}

export function Dialog({ open, onClose, title, children, className, width = "min(640px, 90vw)" }: DialogProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, handleKeyDown])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fast, ease: EASING.default }}
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: DURATION.modal, ease: EASING.default }}
            className={cn(
              "relative rounded-xl border overflow-hidden shadow-2xl max-h-[85vh] flex flex-col",
              className,
            )}
            style={{
              width,
              backgroundColor: "var(--surface-overlay)",
              borderColor: "var(--border-default)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            {title && (
              <div
                className="flex items-center gap-2 px-4 py-3 border-b shrink-0"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <span className="text-[13px] font-medium flex-1" style={{ color: "var(--text-primary)" }}>
                  {title}
                </span>
                <button
                  onClick={onClose}
                  className="flex items-center justify-center h-6 w-6 rounded-md transition-colors"
                  style={{ color: "var(--text-quaternary)" }}
                  aria-label="Close dialog"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
