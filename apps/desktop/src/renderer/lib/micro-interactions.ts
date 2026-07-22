import { DURATION, EASING, springTransition } from "./motion"
import type { Transition, Variants } from "framer-motion"

export const MICRO = {
  tap: { whileTap: { scale: 0.97 } },
  tapLight: { whileTap: { scale: 0.985 } },
  hover: { whileHover: { scale: 1.03 } },
  hoverLift: { whileHover: { y: -1, scale: 1.02 } },
  hoverGlow: { whileHover: { boxShadow: "0 0 20px rgba(59,130,246,0.15)" } },
  hoverBrighten: { whileHover: { filter: "brightness(1.15)" } },
}

export const springPreset = {
  gentle: { type: "spring", stiffness: 300, damping: 25, mass: 0.8 } as Transition,
  default: { type: "spring", stiffness: 400, damping: 30 } as Transition,
  bouncy: { type: "spring", stiffness: 500, damping: 15 } as Transition,
  snappy: { type: "spring", stiffness: 600, damping: 28 } as Transition,
  stiff: { type: "spring", stiffness: 600, damping: 40 } as Transition,
}

export function springConfig(name: keyof typeof springPreset = "default"): Transition {
  return springPreset[name]
}

export const fadeScaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: { duration: DURATION.card, ease: EASING.entrance } },
  exit: { opacity: 0, scale: 0.92, transition: { duration: DURATION.fast, ease: EASING.exit } },
}

export const slideFadeIn: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { ...springTransition, damping: 25 } },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION.fast, ease: EASING.exit } },
}

export const scaleFadeIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: DURATION.card, ease: EASING.entrance } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: DURATION.fast } },
}

export const cardEntrance: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: EASING.entrance } },
  exit: { opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.2, ease: EASING.exit } },
}

export const listItem: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1, x: 0,
    transition: { delay: i * 0.03, duration: DURATION.normal, ease: EASING.entrance },
  }),
  exit: { opacity: 0, x: -8, transition: { duration: DURATION.fast } },
}

export function useMicroInteractions() {
  return { MICRO, springPreset, springConfig }
}
