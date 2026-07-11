import type { Transition, Variants } from "framer-motion"

// ── Duration tokens ──
export const DURATION = {
  /** 80ms — instant feedback (button press) */
  instant: 0.08,
  /** 100ms — quick transitions */
  quick: 0.1,
  /** 120ms — fast, subtle (tooltip appear) */
  fast: 0.12,
  /** 150ms — dropdowns, menus */
  dropdown: 0.15,
  /** 180ms — standard micro-interaction */
  standard: 0.18,
  /** 200ms — normal UI (thinking step, focus ring) */
  normal: 0.2,
  /** 250ms — modals, page transitions */
  modal: 0.25,
  /** 260ms — deliberate, noticeable */
  deliberate: 0.26,
  /** 300ms — card entry, container collapse */
  card: 0.3,
  /** 350ms — slow, emphasis */
  slow: 0.35,
  /** 400ms — completion ripple, celebrations */
  expressive: 0.4,
  /** 500ms — expressive, celebratory */
  celebratory: 0.5,
} as const

// ── Easing tokens ──
export const EASING = {
  /** cubic-bezier(0.23, 1, 0.32, 1) — strong ease-out for UI */
  default: [0.23, 1, 0.32, 1] as const,
  /** cubic-bezier(0.16, 1, 0.3, 1) — entrance */
  entrance: [0.16, 1, 0.3, 1] as const,
  /** cubic-bezier(0.77, 0, 0.175, 1) — ease-in-out for on-screen movement */
  inOut: [0.77, 0, 0.175, 1] as const,
  /** cubic-bezier(0.3, 0, 0.7, 0.3) — exit */
  exit: [0.3, 0, 0.7, 0.3] as const,
  /** cubic-bezier(0.4, 0, 0.2, 1) — hover color changes */
  hover: [0.4, 0, 0.2, 1] as const,
  /** cubic-bezier(0.34, 1.56, 0.64, 1) — gentle spring for delight moments */
  springGentle: [0.34, 1.56, 0.64, 1] as const,
  spring: { type: "spring" as const, stiffness: 400, damping: 30 },
  springBouncy: { type: "spring" as const, stiffness: 500, damping: 15 },
}

// ── Transition table (duration × easing) ──
export const TRANSITION = {
  instant_fade: { duration: DURATION.instant, ease: EASING.default } as Transition,
  fast_fade: { duration: DURATION.fast, ease: EASING.default } as Transition,
  standard_fade: { duration: DURATION.standard, ease: EASING.default } as Transition,
  standard_entrance: { duration: DURATION.standard, ease: EASING.entrance } as Transition,
  standard_exit: { duration: DURATION.standard, ease: EASING.exit } as Transition,
  deliberate_fade: { duration: DURATION.deliberate, ease: EASING.default } as Transition,
  slow_fade: { duration: DURATION.slow, ease: EASING.default } as Transition,
  slow_entrance: { duration: DURATION.slow, ease: EASING.entrance } as Transition,
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

// ── Stable transition constants ──
const SPRING_STIFF: Transition = { type: "spring", stiffness: 600, damping: 40 } as unknown as Transition
const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 600, damping: 28 } as unknown as Transition

// ── Spring config getter (used by ProjectMapPanel et al.) ──
export function getSpringConfig(name: "default" | "gentle" | "bouncy" | "stiff" | "snappy" = "default"): Transition {
  switch (name) {
    case "gentle": return EASING.springGentle as unknown as Transition
    case "bouncy": return EASING.springBouncy as unknown as Transition
    case "stiff": return SPRING_STIFF
    case "snappy": return SPRING_SNAPPY
    default: return EASING.spring as unknown as Transition
  }
}

// ── Simple tap/hover scale helpers ──
export const tapScale = { whileTap: { scale: 0.96 } }
export const hoverScale = { whileHover: { scale: 1.04 } }
export const hoverLift = { whileHover: { y: -1 } }
