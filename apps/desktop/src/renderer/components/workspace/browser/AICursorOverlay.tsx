import { useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useAICursorStore, type CursorType } from "@/stores/ai-cursor-store"
import { getSpringConfig } from "@/lib/motion"

const CURSOR_SVG = (
  <svg width="18" height="22" viewBox="0 0 18 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M2 2L7.5 19L10.5 13.5L16.5 16.5L2 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      fill="currentColor"
      fillOpacity="0.15"
    />
  </svg>
)

const TYPE_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="0.5" y="0.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.1"/>
    <text x="7" y="10.5" textAnchor="middle" fill="currentColor" fontSize="9" fontWeight="700" fontFamily="monospace">T</text>
  </svg>
)

const NAV_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.1"/>
    <path d="M4 7L10 7M7 4L10 7L7 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const WAIT_ICON = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" fill="currentColor" fillOpacity="0.05"/>
    <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.15"/>
  </svg>
)

const TYPE_TO_ICON: Record<CursorType, JSX.Element> = {
  click: CURSOR_SVG,
  type: TYPE_ICON,
  navigate: NAV_ICON,
  wait: WAIT_ICON,
  scroll: CURSOR_SVG,
}

const TYPE_TO_COLOR: Record<CursorType, string> = {
  click: "text-cyan-400",
  type: "text-violet-400",
  navigate: "text-blue-400",
  wait: "text-amber-400",
  scroll: "text-cyan-400",
}

const TYPE_TO_LABEL_COLOR: Record<CursorType, string> = {
  click: "text-cyan-300",
  type: "text-violet-300",
  navigate: "text-blue-300",
  wait: "text-amber-300",
  scroll: "text-cyan-300",
}

const TYPE_TO_SHADOW: Record<CursorType, string> = {
  click: "drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]",
  type: "drop-shadow-[0_0_6px_rgba(167,139,250,0.4)]",
  navigate: "drop-shadow-[0_0_6px_rgba(96,165,250,0.4)]",
  wait: "drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]",
  scroll: "drop-shadow-[0_0_6px_rgba(34,211,238,0.4)]",
}

interface AICursorOverlayProps {
  containerRef?: React.RefObject<HTMLDivElement | null>
}

export function AICursorOverlay({ containerRef: _containerRef }: AICursorOverlayProps) {
  const { position, type, label, visible, hideCursor } = useAICursorStore()
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const prevVisibleRef = useRef(false)

  const scheduleHide = useCallback(() => {
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(hideCursor, 1600)
  }, [hideCursor])

  useEffect(() => {
    if (visible) {
      if (!prevVisibleRef.current) {
        scheduleHide()
      } else {
        scheduleHide()
      }
      prevVisibleRef.current = true
    } else {
      prevVisibleRef.current = false
    }
    return () => clearTimeout(timeoutRef.current)
  }, [visible, position.x, position.y, scheduleHide])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`cursor-${position.x}-${position.y}-${type}`}
          className="absolute inset-0 z-50 pointer-events-none overflow-hidden"
        >
          <motion.div
            className="absolute"
            style={{ left: position.x, top: position.y }}
            initial={{ opacity: 0, scale: 0.8, x: -4, y: -4 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: -4, y: -4 }}
            transition={getSpringConfig("snappy")}
          >
            {/* Ripple effect for clicks */}
            {type === "click" && (
              <motion.div
                key={`ripple-${Date.now()}`}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: 4, top: 4 }}
              >
                <motion.div
                  initial={{ scale: 0, opacity: 0.5 }}
                  animate={{ scale: 4, opacity: 0 }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  className="h-3 w-3 rounded-full border-2 border-cyan-400/60"
                />
              </motion.div>
            )}

            {/* Ghost cursor */}
            <div className="relative">
              <div className={cn(TYPE_TO_COLOR[type], TYPE_TO_SHADOW[type])}>
                {TYPE_TO_ICON[type]}
              </div>

              {/* Glow dot behind cursor */}
              <motion.div
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 0.8 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-full blur-sm opacity-30",
                  type === "click" && "bg-cyan-400",
                  type === "type" && "bg-violet-400",
                  type === "navigate" && "bg-blue-400",
                  type === "wait" && "bg-amber-400",
                  type === "scroll" && "bg-cyan-400",
                )}
                style={{ left: 4, top: 4 }}
              />

              {/* Action label */}
              {label && (
                <motion.div
                  initial={{ opacity: 0, y: 6, x: 4 }}
                  animate={{ opacity: 1, y: 0, x: 4 }}
                  transition={{ delay: 0.08, duration: 0.15, ease: "easeOut" }}
                  className="absolute left-full top-0 whitespace-nowrap ml-1"
                >
                  <div className={cn(
                    "px-1.5 py-0.5 rounded-md text-[9px] font-mono border shadow-xl backdrop-blur-sm",
                    "bg-[#0d0d0e]/90 border-white/[0.08]",
                    TYPE_TO_LABEL_COLOR[type],
                  )}>
                    {label}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
