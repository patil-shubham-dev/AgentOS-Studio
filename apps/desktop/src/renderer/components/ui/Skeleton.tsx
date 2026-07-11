import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface SkeletonProps {
  className?: string
  variant?: "text" | "circular" | "rectangular"
  width?: string | number
  height?: string | number
}

export function Skeleton({ className, variant = "text", width, height }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded",
        variant === "circular" && "rounded-full",
        variant === "text" && "h-3 rounded",
        variant === "rectangular" && "rounded-lg",
        className,
      )}
      style={{ width, height }}
    />
  )
}

export function BrowserViewportSkeleton() {
  return (
    <div className="flex flex-col h-full bg-white/5">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04]">
        <Skeleton className="h-2 w-2 rounded-full" />
        <Skeleton className="h-2 rounded-full" width={120} />
        <Skeleton className="h-2 rounded-full ml-auto" width={60} />
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Skeleton variant="rectangular" width={64} height={64} className="rounded-2xl" />
          </div>
          <Skeleton className="h-3 mx-auto mb-2" width={160} />
          <Skeleton className="h-2 mx-auto" width={100} />
        </div>
      </div>
    </div>
  )
}

export function DesignPreviewSkeleton() {
  return (
    <div className="flex flex-col h-full bg-white/[0.02] p-4 gap-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-2.5" width={80} />
        <Skeleton className="h-2.5 ml-auto" width={40} />
      </div>
      <Skeleton variant="rectangular" className="flex-1" />
      <div className="flex gap-2">
        <Skeleton className="h-2" width="30%" />
        <Skeleton className="h-2" width="20%" />
        <Skeleton className="h-2" width="25%" />
      </div>
    </div>
  )
}

function SkeletonCard({ variant, delay }: { variant: "tool" | "thinking" | "message"; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: [0.16, 1, 0.32, 1] }}
    >
      {variant === "thinking" && (
        <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-2" width={80} />
          </div>
          <div className="flex gap-2 pl-5">
            <Skeleton className="h-2 flex-1" />
            <Skeleton className="h-2" width={60} />
          </div>
          <div className="flex gap-2 pl-5">
            <Skeleton className="h-2" width="40%" />
            <Skeleton className="h-2" width="30%" />
          </div>
        </div>
      )}

      {variant === "tool" && (
        <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-2" width={120} />
              <Skeleton className="h-2" width={80} />
            </div>
            <Skeleton className="h-3 w-12 rounded" />
          </div>
          <Skeleton className="h-1 w-full rounded-full" />
        </div>
      )}

      {variant === "message" && (
        <div className="flex gap-2 px-3 py-2">
          <Skeleton className="h-5 w-5 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-2" width={160} />
            <Skeleton className="h-2" width="80%" />
            <Skeleton className="h-2" width="60%" />
          </div>
        </div>
      )}
    </motion.div>
  )
}

export function ChatTimelineSkeleton({ count = 3 }: { count?: number }) {
  const variants: Array<"tool" | "thinking" | "message"> = ["thinking", "tool", "message", "tool", "thinking", "message"]
  return (
    <div className="px-3 py-2 space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} variant={variants[i % variants.length]} delay={i * 0.08} />
      ))}
    </div>
  )
}



