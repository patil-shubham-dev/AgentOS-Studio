import { motion, useMotionValue, useSpring } from "framer-motion"
import { useEffect, useRef, useMemo } from "react"
import { cn } from "@/lib/utils"
import {
  MessageSquare, FileCode, Globe, Palette,
  Sparkles, Terminal, Search, MousePointer, FolderOpen,
  type LucideIcon,
} from "lucide-react"

export interface EmptyStateConfig {
  icon: LucideIcon
  iconColor: string
  iconBg: string
  iconBorder: string
  title: string
  description: string
  features?: { label: string; icon: LucideIcon }[]
  actions?: { label: string; icon: LucideIcon; onClick: () => void; primary?: boolean; disabled?: boolean }[]
  hint?: string
  illustration?: "code" | "browser" | "design" | "chat" | "search" | "folder"
}

interface PremiumEmptyStateProps {
  config: EmptyStateConfig
  className?: string
}

function FloatingParticles({ count = 6 }: { count?: number }) {
  const particles = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 3,
      duration: Math.random() * 4 + 3,
    })),
  [count])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-white/5"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
          }}
          animate={{
            y: [0, -20, 0],
            opacity: [0, 0.4, 0],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  )
}

function CodeIllustration() {
  return (
    <svg viewBox="0 0 120 80" className="w-24 h-16" fill="none">
      <motion.rect
        x="10" y="8" width="100" height="64" rx="6"
        className="stroke-white/[0.08]" strokeWidth="1" fill="white/[0.02]"
        initial={{ opacity: 0, scaleY: 0.8 }}
        animate={{ opacity: 1, scaleY: 1 }}
        transition={{ duration: 0.4 }}
      />
      <motion.line
        x1="20" y1="24" x2="60" y2="24"
        className="stroke-blue-400/40" strokeWidth="1.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      />
      <motion.line
        x1="20" y1="34" x2="80" y2="34"
        className="stroke-emerald-400/30" strokeWidth="1.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, delay: 0.35 }}
      />
      <motion.line
        x1="20" y1="44" x2="55" y2="44"
        className="stroke-purple-400/40" strokeWidth="1.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      />
      <motion.line
        x1="65" y1="44" x2="95" y2="44"
        className="stroke-amber-400/25" strokeWidth="1.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.6 }}
      />
      <motion.circle
        cx="100" cy="58" r="3"
        className="fill-blue-400/30"
        animate={{ opacity: [0.3, 0.8, 0.3] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    </svg>
  )
}

function FolderIllustration() {
  return (
    <svg viewBox="0 0 120 80" className="w-24 h-16" fill="none">
      <motion.path
        d="M15 25 L15 68 Q15 72 19 72 L105 72 Q109 72 109 68 L109 30 Q109 26 105 26 L55 26 L48 18 L24 18 Q20 18 19 21 Z"
        className="fill-white/[0.03] stroke-white/[0.08]" strokeWidth="1"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.6 }}
      />
      <motion.rect
        x="25" y="38" width="74" height="4" rx="2"
        className="fill-white/[0.06]"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 2, delay: 0.3, repeat: Infinity }}
      />
      <motion.rect
        x="25" y="48" width="55" height="4" rx="2"
        className="fill-white/[0.04]"
        animate={{ opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 2.5, delay: 0.6, repeat: Infinity }}
      />
      <motion.rect
        x="25" y="58" width="40" height="4" rx="2"
        className="fill-white/[0.03]"
        animate={{ opacity: [0.15, 0.4, 0.15] }}
        transition={{ duration: 3, delay: 0.9, repeat: Infinity }}
      />
    </svg>
  )
}

function ChatIllustration() {
  return (
    <svg viewBox="0 0 120 80" className="w-24 h-16" fill="none">
      <motion.rect
        x="10" y="10" width="100" height="50" rx="8"
        className="fill-white/[0.02] stroke-white/[0.08]" strokeWidth="1"
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      />
      <motion.circle cx="30" cy="35" r="4" className="fill-blue-400/40"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <motion.rect x="42" y="31" width="55" height="3" rx="1.5" className="fill-white/[0.08]"
        initial={{ width: 0 }} animate={{ width: 55 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      />
      <motion.rect x="42" y="39" width="35" height="3" rx="1.5" className="fill-white/[0.05]"
        initial={{ width: 0 }} animate={{ width: 35 }}
        transition={{ duration: 0.4, delay: 0.4 }}
      />
      <motion.rect
        x="45" y="62" width="30" height="3" rx="1.5"
        className="fill-blue-400/20"
        animate={{ opacity: [0.2, 0.6, 0.2] }}
        transition={{ duration: 2.5, repeat: Infinity }}
      />
    </svg>
  )
}

function SearchIllustration() {
  return (
    <svg viewBox="0 0 120 80" className="w-24 h-16" fill="none">
      <motion.circle
        cx="48" cy="36" r="14"
        className="stroke-white/[0.08]" strokeWidth="1.5"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.5 }}
      />
      <motion.line
        x1="58" y1="46" x2="70" y2="58"
        className="stroke-white/[0.06]" strokeWidth="1.5" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.4 }}
      />
      <motion.rect
        x="80" y="28" width="30" height="3" rx="1.5"
        className="fill-white/[0.06]"
        animate={{ opacity: [0.2, 0.6, 0.2] }}
        transition={{ duration: 2, delay: 0.5, repeat: Infinity }}
      />
      <motion.rect
        x="80" y="36" width="22" height="3" rx="1.5"
        className="fill-white/[0.04]"
        animate={{ opacity: [0.15, 0.5, 0.15] }}
        transition={{ duration: 2.5, delay: 0.7, repeat: Infinity }}
      />
    </svg>
  )
}

function BrowserIllustration() {
  return (
    <svg viewBox="0 0 160 100" className="w-32 h-20" fill="none">
      {/* Window shadow/glow */}
      <motion.rect
        x="6" y="4" width="148" height="92" rx="7"
        className="fill-blue-500/[0.02]"
        animate={{ opacity: [0.02, 0.06, 0.02] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Browser window frame */}
      <motion.rect
        x="8" y="6" width="144" height="88" rx="6"
        className="fill-white/[0.02] stroke-white/[0.08]" strokeWidth="1"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* Window chrome */}
      <motion.rect x="12" y="10" width="136" height="10" rx="3" className="fill-white/[0.04]"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      />
      {/* Traffic light dots */}
      <motion.circle cx="22" cy="15" r="2" className="fill-red-400/40"
        animate={{ opacity: [0.3, 0.9, 0.3] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle cx="31" cy="15" r="2" className="fill-amber-400/40"
        animate={{ opacity: [0.3, 0.9, 0.3] }}
        transition={{ duration: 2.5, delay: 0.3, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle cx="40" cy="15" r="2" className="fill-green-400/40"
        animate={{ opacity: [0.3, 0.9, 0.3] }}
        transition={{ duration: 2.5, delay: 0.6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* URL bar */}
      <motion.rect x="52" y="12" width="60" height="6" rx="3" className="fill-white/[0.05]"
        initial={{ width: 0, opacity: 0 }} animate={{ width: 60, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2, ease: "easeOut" }}
      />
      <motion.rect x="56" y="14" width="20" height="2" rx="1" className="fill-white/[0.08]"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.4 }}
      />
      {/* Security lock icon */}
      <motion.rect x="112" y="13" width="4" height="4" rx="1" className="fill-green-400/30"
        animate={{ opacity: [0.3, 0.7, 0.3] }}
        transition={{ duration: 2, delay: 0.5, repeat: Infinity }}
      />
      {/* Main content area */}
      <motion.rect x="14" y="26" width="134" height="62" rx="3" className="fill-blue-400/[0.04] stroke-blue-400/[0.08]" strokeWidth="0.5"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* Page content — top bar */}
      <motion.rect x="22" y="34" width="118" height="3" rx="1.5" className="fill-white/[0.06]"
        initial={{ width: 0 }} animate={{ width: 118 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      />
      {/* Page content — left sidebar */}
      <motion.rect x="22" y="42" width="30" height="38" rx="2" className="fill-white/[0.03]"
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, delay: 0.55 }}
      />
      {/* Page content — main area lines */}
      <motion.rect x="58" y="42" width="70" height="2" rx="1" className="fill-white/[0.06]"
        initial={{ width: 0 }} animate={{ width: 70 }}
        transition={{ duration: 0.3, delay: 0.6 }}
      />
      <motion.rect x="58" y="48" width="55" height="2" rx="1" className="fill-white/[0.04]"
        initial={{ width: 0 }} animate={{ width: 55 }}
        transition={{ duration: 0.3, delay: 0.7 }}
      />
      <motion.rect x="58" y="54" width="65" height="2" rx="1" className="fill-white/[0.04]"
        initial={{ width: 0 }} animate={{ width: 65 }}
        transition={{ duration: 0.3, delay: 0.8 }}
      />
      <motion.rect x="58" y="60" width="40" height="2" rx="1" className="fill-white/[0.03]"
        initial={{ width: 0 }} animate={{ width: 40 }}
        transition={{ duration: 0.3, delay: 0.9 }}
      />
      {/* Content block */}
      <motion.rect x="58" y="66" width="70" height="10" rx="2" className="fill-blue-400/[0.06] stroke-blue-400/[0.08]" strokeWidth="0.5"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 1.0, ease: "easeOut" }}
      />
      {/* Cursor blinking indicator */}
      <motion.rect
        x="60" y="68" width="1" height="6" rx="0.5"
        className="fill-blue-400/60"
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Bottom status bar glow */}
      <motion.rect
        x="14" y="84" width="134" height="1" rx="0.5"
        className="fill-blue-400/10"
        animate={{ opacity: [0.05, 0.15, 0.05] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
      />
    </svg>
  )
}

function DesignIllustration() {
  return (
    <svg viewBox="0 0 120 80" className="w-24 h-16" fill="none">
      <motion.rect
        x="10" y="12" width="100" height="56" rx="6"
        className="fill-white/[0.02] stroke-white/[0.08]" strokeWidth="1"
        initial={{ opacity: 0, scaleY: 0.9 }}
        animate={{ opacity: 1, scaleY: 1 }}
        transition={{ duration: 0.4 }}
      />
      <motion.rect
        x="16" y="18" width="88" height="6" rx="2"
        className="fill-purple-400/[0.07] stroke-purple-400/[0.1]" strokeWidth="0.5"
        initial={{ width: 0 }} animate={{ width: 88 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      />
      <motion.circle
        cx="22" cy="21" r="1.5"
        className="fill-purple-400/40"
        animate={{ opacity: [0.3, 0.8, 0.3] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <motion.line
        x1="16" y1="30" x2="104" y2="30"
        className="stroke-white/[0.04]" strokeWidth="1"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      />
      <motion.rect
        x="18" y="36" width="40" height="24" rx="3"
        className="fill-purple-400/[0.04] stroke-purple-400/[0.08]" strokeWidth="0.5"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.4 }}
      />
      <motion.rect
        x="62" y="36" width="40" height="10" rx="2"
        className="fill-white/[0.04]"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.5 }}
      />
      <motion.rect
        x="62" y="50" width="30" height="4" rx="2"
        className="fill-white/[0.03]"
        animate={{ opacity: [0.2, 0.6, 0.2] }}
        transition={{ duration: 2.5, delay: 0.6, repeat: Infinity }}
      />
      <motion.rect
        x="62" y="56" width="22" height="4" rx="2"
        className="fill-white/[0.02]"
        animate={{ opacity: [0.15, 0.45, 0.15] }}
        transition={{ duration: 2.5, delay: 0.8, repeat: Infinity }}
      />
      <motion.circle
        cx="104" cy="66" r="3"
        className="fill-purple-400/30"
        animate={{ opacity: [0.2, 0.7, 0.2] }}
        transition={{ duration: 2, delay: 0.5, repeat: Infinity }}
      />
    </svg>
  )
}

const ILLUSTRATIONS: Record<string, () => JSX.Element> = {
  code: CodeIllustration,
  browser: BrowserIllustration,
  design: DesignIllustration,
  chat: ChatIllustration,
  search: SearchIllustration,
  folder: FolderIllustration,
}

export function PremiumEmptyState({ config, className }: PremiumEmptyStateProps) {
  const Icon = config.icon
  const Illustration = config.illustration ? ILLUSTRATIONS[config.illustration] : null
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "relative flex h-full items-center justify-center overflow-hidden",
        className,
      )}
    >
      <FloatingParticles />
      <div className="relative z-10 flex flex-col items-center text-center max-w-sm px-6">
        {/* Animated SVG illustration */}
        {Illustration && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.05, duration: 0.4, ease: "easeOut" }}
            className="mb-5"
          >
            <Illustration />
          </motion.div>
        )}

        {/* Icon with glow */}
        {!Illustration && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3, ease: "easeOut" }}
            className={cn(
              "relative flex items-center justify-center h-16 w-16 rounded-2xl border backdrop-blur-xl mb-5",
              config.iconBg,
              config.iconBorder,
            )}
          >
            <div className={cn(
              "absolute inset-0 rounded-2xl opacity-20 blur-xl",
              config.iconBg,
            )} />
            <Icon className={cn("h-7 w-7 relative z-10", config.iconColor)} />
          </motion.div>
        )}

        {/* Title */}
        <motion.h3
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.2 }}
          className="text-sm font-semibold text-white/70 mb-1.5"
        >
          {config.title}
        </motion.h3>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.2 }}
          className="text-[11px] text-white/30 leading-relaxed mb-5"
        >
          {config.description}
        </motion.p>

        {/* Features list */}
        {config.features && config.features.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.2 }}
            className="flex flex-wrap justify-center gap-1.5 mb-5"
          >
            {config.features.map((f, i) => {
              const FeatIcon = f.icon
              return (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] px-3 py-1"
                >
                  <FeatIcon className="h-2.5 w-2.5 text-white/30" />
                  <span className="text-[9px] text-white/35 font-medium">{f.label}</span>
                </div>
              )
            })}
          </motion.div>
        )}

        {/* Action buttons */}
        {config.actions && config.actions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.2 }}
            className="flex flex-wrap items-center justify-center gap-2"
          >
            {config.actions.map((action, i) => {
              const ActionIcon = action.icon
              return (
                <button
                  key={i}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-medium transition-all",
                    action.primary
                      ? "bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-blue-500/20 text-blue-400 hover:from-blue-600/30 hover:to-purple-600/30 hover:border-blue-500/30 shadow-lg shadow-blue-600/10"
                      : "bg-white/[0.03] border-white/[0.06] text-white/50 hover:text-white/70 hover:bg-white/[0.06] hover:border-white/[0.12]",
                    action.disabled && "opacity-40 cursor-not-allowed",
                  )}
                >
                  <ActionIcon className={cn("h-3 w-3", action.primary && "text-blue-400")} />
                  <span>{action.label}</span>
                </button>
              )
            })}
          </motion.div>
        )}

        {/* Hint */}
        {config.hint && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.2 }}
            className="text-[9px] text-white/20 mt-4"
          >
            {config.hint}
          </motion.p>
        )}
      </div>
    </motion.div>
  )
}

/** Pre-built empty state configs for each workspace mode */
export function getCodeEmptyState(
  hasOpenFiles: boolean,
  onOpenWorkspace?: () => void,
  rootPath?: string | null,
) {
  if (!hasOpenFiles && rootPath) {
    const workspaceName = rootPath.split(/[/\\]/).pop() || rootPath
    return {
      icon: FolderOpen as LucideIcon,
      iconColor: "text-emerald-400/60",
      iconBg: "bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-green-500/10",
      iconBorder: "border-white/[0.06]",
      illustration: "code" as const,
      title: workspaceName,
      description: "Workspace is open. Select a file from the explorer to start editing.",
      hint: "⌘P to search files · ⌘⇧F to search content · ⌘N new file",
    } satisfies EmptyStateConfig
  }
  return {
    icon: FileCode as LucideIcon,
    iconColor: "text-blue-400/60",
    iconBg: "bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-indigo-500/10",
    iconBorder: "border-white/[0.06]",
    illustration: "code" as const,
    title: hasOpenFiles ? "No file selected" : "Get Started",
    description: hasOpenFiles
      ? "Select an open file tab or click a file in the explorer to start editing."
      : "Open a project folder to start working. I'll help you read, edit, and navigate code with AI assistance.",
    features: hasOpenFiles ? undefined : [
      { label: "Syntax Highlighting", icon: FileCode },
      { label: "AI Editing", icon: Sparkles },
      { label: "File Navigation", icon: Search },
    ],
    actions: !hasOpenFiles && onOpenWorkspace ? [
      { label: "Open Project", icon: Terminal, onClick: onOpenWorkspace, primary: true },
    ] : undefined,
    hint: hasOpenFiles ? "⌘P to search files · ⌘S to save" : undefined,
  } satisfies EmptyStateConfig
}

export function getBrowserEmptyState(
  onLaunch?: () => void,
  isLaunching?: boolean,
  url?: string,
) {
  return {
    icon: Globe as LucideIcon,
    iconColor: "text-sky-400/60",
    iconBg: "bg-gradient-to-br from-sky-500/10 via-cyan-500/10 to-blue-500/10",
    iconBorder: "border-white/[0.06]",
    illustration: "browser" as const,
    title: "Browser Automation",
    description: "Launch a headless browser session to inspect, interact, and automate web pages. The browser runs in a sandboxed environment with full DevTools support.",
    features: [
      { label: "Screenshot & Zoom", icon: Search },
      { label: "Click & Fill", icon: MousePointer },
      { label: "Console Monitor", icon: Terminal },
      { label: "JS Execution", icon: Sparkles },
    ],
    actions: [
      {
        label: isLaunching ? "Launching..." : "Launch Browser",
        icon: Globe,
        onClick: onLaunch || (() => {}),
        primary: true,
        disabled: isLaunching,
      },
    ],
    hint: "Enter a URL above and press Launch, or ⌘↵ to launch quickly",
  } satisfies EmptyStateConfig
}

export function getDesignEmptyState(
  onCreateNew?: () => void,
  onImportClipboard?: () => void,
  onGenerateSample?: () => void,
) {
  return {
    icon: Palette as LucideIcon,
    iconColor: "text-purple-400/60",
    iconBg: "bg-gradient-to-br from-purple-500/10 via-fuchsia-500/10 to-pink-500/10",
    iconBorder: "border-white/[0.06]",
    illustration: "design" as const,
    title: "Design Workspace",
    description: "Create, preview, version, and apply design artifacts to your codebase. Generate UI components visually or import existing code.",
    features: [
      { label: "Version History", icon: FileCode },
      { label: "Live Preview", icon: Search },
      { label: "Code Export", icon: Sparkles },
      { label: "Apply to Code", icon: Terminal },
    ],
    actions: [
      ...(onCreateNew ? [{ label: "New Artifact", icon: Palette, onClick: onCreateNew, primary: true as const }] : []),
      ...(onImportClipboard ? [{ label: "Import Code", icon: Globe, onClick: onImportClipboard }] : []),
      ...(onGenerateSample ? [{ label: "Sample", icon: Sparkles, onClick: onGenerateSample }] : []),
    ],
    hint: "Or select an artifact from the sidebar to preview",
  } satisfies EmptyStateConfig
}

export function getTimelineEmptyState(
  onSuggestionClick?: (text: string) => void,
) {
  return {
    icon: MessageSquare as LucideIcon,
    iconColor: "text-emerald-400/60",
    iconBg: "bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-cyan-500/10",
    iconBorder: "border-white/[0.06]",
    illustration: "chat" as const,
    title: "Execution Timeline",
    description: "Describe what you want to build, fix, or explore. The orchestrator will route your request to the right AI agents and show live progress here.",
    features: [
      { label: "Multi-Agent", icon: Sparkles },
      { label: "Live Streaming", icon: Terminal },
      { label: "File Edits", icon: FileCode },
      { label: "Browser Actions", icon: Globe },
    ],
    actions: onSuggestionClick ? [
      { label: "Fix the login system", icon: Sparkles, onClick: () => onSuggestionClick("Fix the login system") },
      { label: "Generate a dashboard UI", icon: Palette, onClick: () => onSuggestionClick("Generate a dashboard UI") },
    ] : undefined,
    hint: "Try /commands · @agents · or just describe what you need",
  } satisfies EmptyStateConfig
}
