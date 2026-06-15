export const DURATION = {
  instant: 0,
  quick: 100,
  moderate: 200,
  expressive: 300,
  slow: 400,
} as const

export const EASING = {
  entrance: [0.0, 0, 0.2, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  emphasis: [0.4, 0, 0.6, 1] as const,
} as const

export const SPRING = {
  default: { type: 'spring' as const, damping: 20, stiffness: 300 },
  gentle: { type: 'spring' as const, damping: 25, stiffness: 200 },
  stiff: { type: 'spring' as const, damping: 30, stiffness: 500 },
} as const

export const ANIMATION_VARIANTS = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slideUp: {
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -2 },
  },
  slideDown: {
    initial: { opacity: 0, y: -4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 2 },
  },
  slideRight: {
    initial: { opacity: 0, x: -8 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -4 },
  },
  slideLeft: {
    initial: { opacity: 0, x: 8 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 4 },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
  expandCollapse: {
    initial: { opacity: 0, height: 0, overflow: 'hidden' as const },
    animate: { opacity: 1, height: 'auto' as const },
    exit: { opacity: 0, height: 0, overflow: 'hidden' as const },
  },
}

export function getTransition(duration: keyof typeof DURATION = 'moderate', easing: keyof typeof EASING = 'entrance') {
  return { duration: DURATION[duration] / 1000, ease: EASING[easing] }
}

export function staggerIndex(i: number, baseDelay = 0.03) {
  return {
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0, transition: { delay: i * baseDelay } },
  }
}
