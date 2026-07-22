import { memo, useMemo } from "react"
import { motion } from "framer-motion"

type IconVariant = "ring" | "dashed-ring" | "scalloped" | "spiral" | "gear" | "pulse"

const VARIANTS: IconVariant[] = ["ring", "dashed-ring", "scalloped", "spiral", "gear", "pulse"]

function pickVariant(seed: string): IconVariant {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i)
    hash |= 0
  }
  return VARIANTS[Math.abs(hash) % VARIANTS.length]
}

const explodeKeyframes = {
  scale: [1, 1.12, 1.12, 1],
  opacity: [1, 0.7, 0.7, 1],
}
const explodeTransition = {
  duration: 2.4,
  repeat: Infinity,
  ease: [0.65, 0, 0.35, 1],
}

const RAINBOW_STOPS = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#9b59b6", "#ff6b6b"]

interface ThinkingIconProps {
  variant?: IconVariant
  isStreaming: boolean
  visualizationMode: "rainbow" | "classic"
  seed?: string
}

function IconRing({ isStreaming }: { isStreaming: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <motion.circle
        cx="12" cy="12" r="9"
        strokeWidth="2"
        strokeLinecap="round"
        animate={isStreaming ? explodeKeyframes : { scale: 1, opacity: 1 }}
        transition={isStreaming ? explodeTransition : { duration: 0.4 }}
        style={{ stroke: "currentColor" }}
      />
    </svg>
  )
}

function IconDashedRing({ isStreaming }: { isStreaming: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <motion.circle
        cx="12" cy="12" r="9"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="3 4"
        animate={
          isStreaming
            ? { ...explodeKeyframes, rotate: [0, 360] }
            : { scale: 1, opacity: 1, rotate: 0 }
        }
        transition={
          isStreaming
            ? { ...explodeTransition, rotate: { duration: 4, repeat: Infinity, ease: "linear" } }
            : { duration: 0.4 }
        }
        style={{ stroke: "currentColor", transformOrigin: "center" }}
      />
    </svg>
  )
}

function IconScalloped({ isStreaming }: { isStreaming: boolean }) {
  const path = useMemo(() => {
    const cx = 12, cy = 12, rOuter = 10, rInner = 7, petals = 8
    const points: string[] = []
    for (let i = 0; i < petals * 2; i++) {
      const angle = (Math.PI * 2 * i) / (petals * 2) - Math.PI / 2
      const r = i % 2 === 0 ? rOuter : rInner
      points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`)
    }
    return points.join(" ")
  }, [])

  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <motion.polygon
        points={path}
        strokeWidth="1.5"
        strokeLinejoin="round"
        animate={
          isStreaming
            ? { ...explodeKeyframes, rotate: [0, 360] }
            : { scale: 1, opacity: 1, rotate: 0 }
        }
        transition={
          isStreaming
            ? { ...explodeTransition, rotate: { duration: 6, repeat: Infinity, ease: "linear" } }
            : { duration: 0.4 }
        }
        style={{ stroke: "currentColor", fill: "none", transformOrigin: "center" }}
      />
    </svg>
  )
}

function IconSpiral({ isStreaming }: { isStreaming: boolean }) {
  const path = useMemo(() => {
    const cx = 12, cy = 12
    const pts: string[] = []
    for (let t = 0; t < Math.PI * 6; t += 0.15) {
      const r = 1.5 + t * 0.45
      pts.push(`${cx + r * Math.cos(t)},${cy + r * Math.sin(t)}`)
    }
    return `M${pts.join(" L")}`
  }, [])

  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <motion.path
        d={path}
        strokeWidth="1.5"
        strokeLinecap="round"
        animate={
          isStreaming
            ? { ...explodeKeyframes, rotate: [0, -360] }
            : { scale: 1, opacity: 1, rotate: 0 }
        }
        transition={
          isStreaming
            ? { ...explodeTransition, rotate: { duration: 5, repeat: Infinity, ease: "linear" } }
            : { duration: 0.4 }
        }
        style={{ stroke: "currentColor", transformOrigin: "center" }}
      />
    </svg>
  )
}

function IconGear({ isStreaming }: { isStreaming: boolean }) {
  const path = useMemo(() => {
    const cx = 12, cy = 12, rOuter = 10, rInner = 7.5, teeth = 10
    const pts: string[] = []
    for (let i = 0; i < teeth * 2; i++) {
      const angle = (Math.PI * 2 * i) / (teeth * 2) - Math.PI / 2
      const r = i % 2 === 0 ? rOuter : rInner
      pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`)
    }
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p}`).join(" ") + " Z"
    return d
  }, [])

  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <motion.path
        d={path}
        strokeWidth="1.5"
        strokeLinejoin="round"
        animate={
          isStreaming
            ? { ...explodeKeyframes, rotate: [0, 360] }
            : { scale: 1, opacity: 1, rotate: 0 }
        }
        transition={
          isStreaming
            ? { ...explodeTransition, rotate: { duration: 4, repeat: Infinity, ease: "linear" } }
            : { duration: 0.4 }
        }
        style={{ stroke: "currentColor", fill: "none", transformOrigin: "center" }}
      />
    </svg>
  )
}

function IconPulse({ isStreaming }: { isStreaming: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <motion.circle
        cx="12" cy="12" r="9"
        strokeWidth="1.5"
        strokeLinecap="round"
        animate={
          isStreaming
            ? { scale: [1, 1.15, 1.15, 1], opacity: [0.6, 0.2, 0.2, 0.6] }
            : { scale: 1, opacity: 0.5 }
        }
        transition={isStreaming ? { duration: 2, repeat: Infinity, ease: [0.65, 0, 0.35, 1] } : { duration: 0.4 }}
        style={{ stroke: "currentColor" }}
      />
      <motion.circle
        cx="12" cy="12" r="5"
        strokeWidth="1.5"
        strokeLinecap="round"
        animate={
          isStreaming
            ? { scale: [1, 1.08, 1.08, 1], opacity: [0.8, 0.4, 0.4, 0.8] }
            : { scale: 1, opacity: 0.3 }
        }
        transition={isStreaming ? { duration: 2, repeat: Infinity, ease: [0.65, 0, 0.35, 1], delay: 0.3 } : { duration: 0.4 }}
        style={{ stroke: "currentColor" }}
      />
    </svg>
  )
}

function RainbowGlow({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: "conic-gradient(from var(--thinking-angle, 0deg), #ff6b6b, #ffd93d, #6bcb77, #4d96ff, #9b59b6, #ff6b6b)",
          filter: "blur(6px)",
          opacity: 0.35,
        }}
        animate={{ "--thinking-angle": ["0deg", "360deg"] } as any}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}

const ICON_MAP: Record<IconVariant, typeof IconRing> = {
  ring: IconRing,
  "dashed-ring": IconDashedRing,
  scalloped: IconScalloped,
  spiral: IconSpiral,
  gear: IconGear,
  pulse: IconPulse,
}

export const ThinkingIcon = memo(function ThinkingIcon({
  variant: explicitVariant,
  isStreaming,
  visualizationMode,
  seed = "thinking",
}: ThinkingIconProps) {
  const variant = explicitVariant ?? pickVariant(seed)
  const IconComponent = ICON_MAP[variant]
  const isRainbow = isStreaming && visualizationMode === "rainbow"

  const iconEl = (
    <div className="flex items-center justify-center h-full w-full">
      {isRainbow ? (
        <div style={{ color: "var(--color-accent-brand)" }}>
          <IconComponent isStreaming={true} />
        </div>
      ) : (
        <div style={{ color: isStreaming ? "var(--color-accent-brand-text)" : "var(--text-tertiary)" }}>
          <IconComponent isStreaming={isStreaming} />
        </div>
      )}
    </div>
  )

  if (isRainbow) {
    return (
      <RainbowGlow>
        {iconEl}
      </RainbowGlow>
    )
  }

  return iconEl
})
