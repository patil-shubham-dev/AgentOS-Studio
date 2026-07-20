import { getSpringConfig } from "@/lib/motion"
import type { Transition } from "framer-motion"

export const ANIM = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.15, ease: "easeOut" },
  },
  slideUp: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
    transition: getSpringConfig("gentle"),
  },
  slideDown: {
    initial: { opacity: 0, y: -4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
    transition: getSpringConfig("fast"),
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.96 },
    transition: getSpringConfig("default"),
  },
  expandCollapse: {
    initial: { opacity: 0, height: 0 },
    animate: { opacity: 1, height: "auto" },
    exit: { opacity: 0, height: 0 },
    transition: getSpringConfig("fast"),
  },
  springUp: {
    initial: { opacity: 0, y: 8, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 8, scale: 0.95 },
    transition: getSpringConfig("default"),
  },
  pulseRing: {
    initial: { scale: 1, opacity: 0.6 },
    animate: { scale: 2, opacity: 0 },
    transition: { duration: 1.2, repeat: Infinity, ease: "easeOut" },
  },
  slideRight: {
    initial: { opacity: 0, x: -6 },
    animate: { opacity: 1, x: 0 },
    transition: getSpringConfig("gentle"),
  },
}

export const CARD = {
  mount: {
    initial: { opacity: 0, y: -6, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -4, scale: 0.98 },
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } as Transition,
  },
  chevronHover: {
    scale: [1, 1.15, 1],
    transition: { duration: 0.25, ease: [0.34, 1.56, 0.64, 1] } as Transition,
  },
  reasoningReveal: {
    initial: { opacity: 0, y: 2 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, ease: [0.23, 1, 0.32, 1] } as Transition,
  },
  iconExplode: {
    animate: {
      scale: [1, 1.12, 1.12, 1],
      opacity: [1, 0.7, 0.7, 1],
    },
    transition: { duration: 2.4, repeat: Infinity, ease: [0.65, 0, 0.35, 1] } as Transition,
  },
}
