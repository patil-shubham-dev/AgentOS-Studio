import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { DURATION, EASING } from "@/lib/motion"
import { MICRO, springConfig } from "@/lib/micro-interactions"

interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rotation: number
  rotationSpeed: number
  opacity: number
  decay: number
}

const COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#6366f1",
]

type Variant = "confetti" | "sparkle" | "gradient" | "checkmark"

export function useCelebration() {
  const [active, setActive] = useState<Variant | null>(null)
  const trigger = useCallback((variant: Variant = "confetti") => {
    setActive(variant)
    setTimeout(() => setActive(null), 2000)
  }, [])
  return { active, trigger, clear: () => setActive(null) }
}

export function CelebrationOverlay({ variant }: { variant: Variant | null }) {
  return (
    <AnimatePresence>
      {variant && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: DURATION.slow } }}
        >
          {variant === "confetti" && <ConfettiBurst />}
          {variant === "sparkle" && <SparkleBurst />}
          {variant === "gradient" && <GradientBurst />}
          {variant === "checkmark" && <CheckmarkBurst />}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ConfettiBurst() {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    const p: Particle[] = []
    for (let i = 0; i < 60; i++) {
      const angle = (Math.PI * 2 * i) / 60 + (Math.random() - 0.5) * 0.5
      const speed = 120 + Math.random() * 200
      p.push({
        id: i,
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        size: 4 + Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 8,
        opacity: 1,
        decay: 0.01 + Math.random() * 0.015,
      })
    }
    setParticles(p)

    let frame: number
    const animate = () => {
      setParticles((prev) => {
        const next = prev
          .map((pt) => ({
            ...pt,
            x: pt.x + pt.vx * 0.016,
            y: pt.y + pt.vy * 0.016,
            vy: pt.vy + 120 * 0.016,
            rotation: pt.rotation + pt.rotationSpeed,
            opacity: pt.opacity - pt.decay,
          }))
          .filter((pt) => pt.opacity > 0)
        return next.length > 0 ? next : prev
      })
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left: "50%",
            top: "50%",
            width: p.size,
            height: p.size * 1.6,
            backgroundColor: p.color,
            borderRadius: 2,
          }}
          animate={{
            x: p.x,
            y: p.y,
            rotate: p.rotation,
            opacity: p.opacity,
          }}
          transition={{ duration: 0.016, ease: "linear" }}
        />
      ))}
    </div>
  )
}

function SparkleBurst() {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    angle: (Math.PI * 2 * i) / 12,
    delay: i * 0.025,
  }))

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: COLORS[p.id % COLORS.length] }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: [0, Math.cos(p.angle) * 80, Math.cos(p.angle) * 100],
            y: [0, Math.sin(p.angle) * 80, Math.sin(p.angle) * 100],
            opacity: [1, 1, 0],
            scale: [1, 1.5, 0],
          }}
          transition={{
            delay: p.delay,
            duration: 0.8,
            ease: EASING.exit,
          }}
        />
      ))}
    </div>
  )
}

function GradientBurst() {
  return (
    <motion.div
      className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        background: "conic-gradient(from 0deg, #3b82f6, #8b5cf6, #06b6d4, #10b981, #f59e0b, #3b82f6)",
        filter: "blur(40px)",
      }}
      initial={{ opacity: 0, scale: 0.3 }}
      animate={{
        opacity: [0, 0.6, 0],
        scale: [0.3, 1.2, 1.5],
        rotate: [0, 180],
      }}
      transition={{ duration: 1.5, ease: "easeOut" }}
    />
  )
}

function CheckmarkBurst() {
  return (
    <motion.div
      className="flex flex-col items-center gap-3"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={springConfig("bouncy")}
    >
      <motion.div
        className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ ...springConfig("bouncy"), delay: 0.2 }}
      >
        <motion.svg
          className="h-8 w-8 text-emerald-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.4, ease: EASING.entrance }}
        >
          <motion.path d="M5 13l4 4L19 7" />
        </motion.svg>
      </motion.div>
      <motion.p
        className="text-sm font-medium text-emerald-300"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: DURATION.normal }}
      >
        Complete!
      </motion.p>
    </motion.div>
  )
}

export function AchievementNotification({
  title,
  description,
  icon,
  onDismiss,
}: {
  title: string
  description: string
  icon: string
  onDismiss: () => void
}) {
  const [show, setShow] = useState(true)

  const handleDismiss = useCallback(() => {
    setShow(false)
    setTimeout(onDismiss, 300)
  }, [onDismiss])

  useEffect(() => {
    const timer = setTimeout(handleDismiss, 4000)
    return () => clearTimeout(timer)
  }, [handleDismiss])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed right-6 top-6 z-[9998] flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 backdrop-blur-xl"
          initial={{ opacity: 0, x: 80, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 80, scale: 0.9 }}
          transition={springConfig("bouncy")}
          {...MICRO.hover}
        >
          <motion.span
            className="text-2xl"
            initial={{ rotate: -20, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ ...springConfig("bouncy"), delay: 0.15 }}
          >
            {icon}
          </motion.span>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-emerald-300">{title}</p>
            <p className="max-w-[200px] text-xs text-muted-foreground">{description}</p>
          </div>
          <button
            onClick={handleDismiss}
            className="ml-2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Dismiss"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
