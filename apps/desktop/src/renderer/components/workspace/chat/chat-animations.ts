import { getSpringConfig } from "@/lib/motion"

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
