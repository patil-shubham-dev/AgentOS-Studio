import type { Transition, Variants } from "framer-motion"

// ── Duration tokens ──
export const DURATION = {
  instant: 0.08,
  fast: 0.12,
  normal: 0.2,
  slow: 0.35,
  expressive: 0.5,
} as const

// ── Easing tokens ──
export const EASING = {
  default: [0.25, 0.1, 0.25, 1] as const,
  entrance: [0.16, 1, 0.3, 1] as const,
  exit: [0.3, 0, 0.7, 0.3] as const,
  spring: { type: "spring" as const, stiffness: 400, damping: 30 },
  springGentle: { type: "spring" as const, stiffness: 200, damping: 20 },
  springBouncy: { type: "spring" as const, stiffness: 500, damping: 15 },
}

// ── Transition presets ──
export function getTransition(duration: keyof typeof DURATION = "normal", easing?: keyof typeof EASING): Transition {
  return {
    duration: DURATION[duration],
    ease: easing ? EASING[easing] as [number, number, number, number] : EASING.default as [number, number, number, number],
  }
}

export const springTransition: Transition = { type: "spring", stiffness: 400, damping: 30 }

// ── Common animation variants ──
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: getTransition("normal") },
  exit: { opacity: 0, transition: getTransition("fast") },
}

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: getTransition("normal", "entrance") },
  exit: { opacity: 0, y: -4, transition: getTransition("fast", "exit") },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: springTransition },
  exit: { opacity: 0, scale: 0.95, transition: getTransition("fast") },
}

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: getTransition("normal", "entrance") },
  exit: { opacity: 0, x: -12, transition: getTransition("fast", "exit") },
}

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 12 },
  visible: { opacity: 1, x: 0, transition: getTransition("normal", "entrance") },
  exit: { opacity: 0, x: 12, transition: getTransition("fast", "exit") },
}

export const slideInUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: getTransition("normal", "entrance") },
  exit: { opacity: 0, y: 8, transition: getTransition("fast", "exit") },
}

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.08,
    },
  },
}

export const heightCollapse: Variants = {
  hidden: { height: 0, opacity: 0 },
  visible: { height: "auto", opacity: 1, transition: getTransition("slow", "entrance") },
  exit: { height: 0, opacity: 0, transition: getTransition("normal", "exit") },
}

// ── Spring config getter (used by ProjectMapPanel et al.) ──
export function getSpringConfig(name: "default" | "gentle" | "bouncy" | "stiff" = "default"): Transition {
  switch (name) {
    case "gentle": return EASING.springGentle as unknown as Transition
    case "bouncy": return EASING.springBouncy as unknown as Transition
    case "stiff": return { type: "spring" as const, stiffness: 600, damping: 40 } as unknown as Transition
    default: return EASING.spring as unknown as Transition
  }
}

// ── Simple tap/hover scale helpers ──
export const tapScale = { whileTap: { scale: 0.96 } }
export const hoverScale = { whileHover: { scale: 1.04 } }
export const hoverLift = { whileHover: { y: -1 } }
