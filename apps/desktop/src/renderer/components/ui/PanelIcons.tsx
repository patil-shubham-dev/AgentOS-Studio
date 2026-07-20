import type { SVGProps } from "react"

export function CodePanelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M5 6L3 8L5 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 6L13 8L11 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 4.5L7 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function BrowserPanelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <rect x="1" y="3" width="14" height="3" fill="currentColor" opacity="0.15" />
      <circle cx="4" cy="4.5" r="0.8" fill="currentColor" />
      <circle cx="6" cy="4.5" r="0.8" fill="currentColor" />
      <circle cx="8" cy="4.5" r="0.8" fill="currentColor" />
      <path d="M3 8H13M3 10H13M3 12H10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

export function DesignPanelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M8 1V3M8 13V15M1 8H3M13 8H15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
    </svg>
  )
}

export function DiffPanelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="1" y="1" width="6" height="14" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <rect x="9" y="1" width="6" height="14" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M4 5H4.01M4 8H4.01M4 11H4.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 5H12.01M12 8H12.01M12 11H12.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 8H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="1 1" />
    </svg>
  )
}

export function PreviewPanelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="1" y="2" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M1 5H15" stroke="currentColor" strokeWidth="1" />
      <circle cx="3.5" cy="3.5" r="0.7" fill="currentColor" />
      <circle cx="5.5" cy="3.5" r="0.7" fill="currentColor" />
      <circle cx="7.5" cy="3.5" r="0.7" fill="currentColor" />
      <path d="M8 10L10 8L12 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10L10 12L12 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Agent Signal — lightweight animated motif using only CSS transforms and opacity.
 * Three concentric circles that pulse with a staggered delay to suggest
 * active listening/thinking. Respects prefers-reduced-motion.
 */
export function AgentSignal({ size = 12, active = true }: { size?: number; active?: boolean }) {
  return (
    <span
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 rounded-full motion-safe:animate-ping"
        style={{
          backgroundColor: "var(--color-ai)",
          opacity: active ? 0.2 : 0,
          animationDuration: "2s",
          animationDelay: "0s",
        }}
      />
      <span
        className="absolute inset-0 rounded-full motion-safe:animate-ping"
        style={{
          backgroundColor: "var(--color-ai)",
          opacity: active ? 0.15 : 0,
          animationDuration: "2s",
          animationDelay: "0.4s",
        }}
      />
      <span
        className="absolute inset-0 rounded-full"
        style={{
          backgroundColor: active ? "var(--color-ai)" : "var(--color-ai-muted)",
          opacity: active ? 0.5 : 0.3,
          transform: "scale(0.6)",
        }}
      />
    </span>
  )
}
