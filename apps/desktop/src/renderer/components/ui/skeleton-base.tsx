import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { fadeInUp, staggerContainer } from "@/lib/motion"

export interface SkeletonBaseProps {
  className?: string
  width?: string | number
  height?: string | number
  rounded?: boolean | "sm" | "md" | "lg" | "xl" | "full"
}

function resolveRounded(rounded: SkeletonBaseProps["rounded"]): string {
  if (rounded === false || rounded === undefined) return ""
  if (rounded === true) return "rounded-md"
  return `rounded-${rounded}`
}

export function SkeletonBlock({ className, width, height, rounded = "md" }: SkeletonBaseProps) {
  return (
    <div
      className={cn("animate-shimmer bg-muted/50", resolveRounded(rounded), className)}
      style={{ width, height }}
    />
  )
}

interface SkeletonTextProps {
  lines?: number
  lastLineWidth?: string
  lineHeight?: string
  gap?: string
  className?: string
}

export function SkeletonText({
  lines = 3,
  lastLineWidth = "60%",
  lineHeight = "12px",
  gap = "8px",
  className,
}: SkeletonTextProps) {
  return (
    <div className={cn("flex flex-col", className)} style={{ gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBlock
          key={i}
          height={lineHeight}
          width={i === lines - 1 ? lastLineWidth : "100%"}
          rounded="sm"
        />
      ))}
    </div>
  )
}

interface SkeletonCircleProps {
  size?: string | number
  className?: string
}

export function SkeletonCircle({ className, size = 32 }: SkeletonCircleProps) {
  return (
    <SkeletonBlock
      className={cn("rounded-full shrink-0", className)}
      width={size}
      height={size}
      rounded="full"
    />
  )
}

interface SkeletonCardProps {
  className?: string
  padded?: boolean
  children?: React.ReactNode
}

export function SkeletonCard({ className, padded = true, children }: SkeletonCardProps) {
  return (
    <motion.div
      variants={fadeInUp}
      className={cn(
        "rounded-xl border border-white/[0.04] bg-white/[0.02]",
        padded && "p-3",
        className,
      )}
    >
      {children}
    </motion.div>
  )
}

export function SkeletonItemRow({
  className,
  iconSize = 12,
  textWidth,
  textHeight = 10,
}: {
  className?: string
  iconSize?: number
  textWidth?: string
  textHeight?: string | number
}) {
  return (
    <div className={cn("flex items-center gap-2 px-1", className)}>
      <SkeletonBlock width={iconSize} height={iconSize} rounded="sm" className="shrink-0" />
      <SkeletonBlock height={textHeight} width={textWidth ?? `${60 + Math.random() * 30}%`} rounded="sm" />
    </div>
  )
}

export function SkeletonGroup({
  count = 3,
  className,
  itemClassName,
}: {
  count?: number
  className?: string
  itemClassName?: string
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className={cn("space-y-2", className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} className={itemClassName} padded />
      ))}
    </motion.div>
  )
}
