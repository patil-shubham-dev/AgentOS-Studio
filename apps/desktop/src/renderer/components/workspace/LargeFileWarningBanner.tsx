import { AlertTriangle } from "lucide-react"

interface LargeFileWarningBannerProps {
  filePath: string | null
  onDismiss: () => void
}

export function LargeFileWarningBanner({ filePath, onDismiss }: LargeFileWarningBannerProps) {
  if (!filePath) return null
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-accent-amber)] bg-[var(--color-accent-amber)]/10 border-b border-[var(--color-accent-amber)]/20">
      <AlertTriangle className="h-3 w-3 shrink-0" />
      <span className="flex-1">Large file — minimap, folding, and other visual features disabled for performance.</span>
      <button
        onClick={onDismiss}
        className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] text-xs leading-none"
      >
        ✕
      </button>
    </div>
  )
}
