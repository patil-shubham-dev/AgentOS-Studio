import { AgentSignal } from "@/components/ui/PanelIcons"

/**
 * Minimal workspace-ready state — small code-mark SVG, compact.
 * Replaces the previous heavy geometric animated illustration.
 * Uses only CSS transforms/opacity, respects prefers-reduced-motion.
 */
export function PremiumGeometricEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative flex items-center justify-center w-14 h-14">
        <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
          <rect
            x="4" y="4" width="32" height="32" rx="6"
            stroke="currentColor" strokeWidth="0.8"
            className="text-white/[0.12]"
            fill="currentColor" fillOpacity="0.02"
          />
          <path
            d="M16 14l-4 6 4 6"
            stroke="currentColor" strokeWidth="1.2"
            strokeLinecap="round" strokeLinejoin="round"
            className="text-white/[0.25]"
            fill="none"
          />
          <path
            d="M24 14l4 6-4 6"
            stroke="currentColor" strokeWidth="1.2"
            strokeLinecap="round" strokeLinejoin="round"
            className="text-white/[0.25]"
            fill="none"
          />
          <path
            d="M21 12l-2 16"
            stroke="currentColor" strokeWidth="0.8"
            strokeLinecap="round"
            className="text-white/[0.15]"
            fill="none"
          />
        </svg>
        <div className="absolute -bottom-1 -right-1">
          <AgentSignal size={10} active={true} />
        </div>
      </div>
    </div>
  )
}
