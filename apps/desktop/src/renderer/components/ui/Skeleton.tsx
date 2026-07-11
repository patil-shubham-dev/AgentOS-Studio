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



