import { useState, useRef, useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion, AnimatePresence, type Transition } from "framer-motion"
import { cn } from "@/lib/utils"
import { TooltipSimple as Tooltip } from "@agentic-os/ui"
import { useTheme } from "@/lib/use-theme"
import { DURATION, EASING } from "@/lib/motion"
import {
  LayoutDashboard,
  Code2,
  Settings,
  GitBranch,
  Bell,
  User,
  Pin,
  PinOff,
  Sun,
  Moon,
} from "lucide-react"
import logoSvg from "@/assets/branding/logo.svg"
import wordmarkSvg from "@/assets/branding/wordmark.svg"

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  route: string
}

const NAV_ITEMS: NavItem[] = [
  { id: "workspace", label: "Workspace", icon: <Code2 className="h-5 w-5" />, route: "/" },
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" />, route: "/dashboard" },
  { id: "git", label: "Git", icon: <GitBranch className="h-5 w-5" />, route: "/git" },
  { id: "settings", label: "Settings", icon: <Settings className="h-5 w-5" />, route: "/settings" },
]

const COLLAPSED_WIDTH = 52
const EXPANDED_WIDTH = 220

const springPreset: Transition = { type: "spring", stiffness: 400, damping: 30 }
const labelTransition = { duration: DURATION.fast, ease: EASING.default }

function NavItemButton({
  item,
  expanded,
  isActive,
  onNavigate,
}: {
  item: NavItem
  expanded: boolean
  isActive: boolean
  onNavigate: (route: string) => void
}) {
  const button = (
    <button
      type="button"
      onClick={() => onNavigate(item.route)}
      className={cn(
        "relative flex w-full items-center transition-all duration-150 rounded-lg",
        expanded ? "gap-3 px-3 py-2.5" : "justify-center px-2 py-2.5",
      )}
      style={{
        color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
        background: isActive ? "var(--border-default)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = "var(--text-secondary)"
          e.currentTarget.style.background = "var(--border-default)"
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = "var(--text-tertiary)"
          e.currentTarget.style.background = "transparent"
        }
      }}
    >
      {isActive && (
        <motion.span
          layoutId="nav-active-indicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full"
          style={{ background: "var(--color-accent-brand)", boxShadow: "0 0 8px var(--color-accent-brand-border)" }}
          transition={springPreset}
        />
      )}

      <span
        className="shrink-0 transition-all duration-200"
        style={isActive ? { filter: "drop-shadow(0 0 6px var(--color-accent-brand-border))" } : {}}
      >
        {item.icon}
      </span>

      <AnimatePresence>
        {expanded && (
          <motion.span
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={labelTransition}
            className="text-xs font-medium truncate"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )

  if (!expanded) {
    return <Tooltip content={item.label}>{button}</Tooltip>
  }
  return button
}

export function NavigationRail() {
  const navigate = useNavigate()
  const location = useLocation()
  const [isHovered, setIsHovered] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const { theme, toggle: toggleTheme } = useTheme()
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const railRef = useRef<HTMLElement>(null)

  const expanded = isHovered || isPinned
  const width = expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH

  const handleMouseEnter = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => setIsHovered(true), 100)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    if (!isPinned) {
      hoverTimerRef.current = setTimeout(() => setIsHovered(false), 200)
    }
  }, [isPinned])

  function isActive(item: NavItem): boolean {
    if (item.route === "/") {
      return location.pathname === "/" || location.pathname === "/code-canvas"
    }
    if (item.route === "/dashboard") {
      return location.pathname === "/dashboard" || location.pathname === "/control-center"
    }
    return location.pathname.startsWith(item.route)
  }

  return (
    <motion.aside
      ref={railRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      animate={{ width }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className={cn(
        "flex flex-col overflow-hidden shrink-0 h-full",
      )}
      style={{
        background: "var(--surface-panel)",
        borderRight: "1px solid var(--border-default)",
      }}
    >
      {/* Branding */}
      <div
        className="flex items-center justify-center px-3 pt-4 pb-3"
        style={{
          background: "linear-gradient(to bottom, transparent 0%, transparent 100%)",
        }}
      >
        <AnimatePresence mode="wait">
          {expanded ? (
            <motion.img
              key="wordmark"
              src={wordmarkSvg}
              alt="AgenticOS"
              height={28}
              className="h-7 w-auto"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={labelTransition}
            />
          ) : (
            <motion.img
              key="logo"
              src={logoSvg}
              alt="AgenticOS"
              width={28}
              height={28}
              className="shrink-0"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={labelTransition}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Navigation items */}
      <div className="flex flex-col gap-0.5 px-2 pt-1 pb-2 flex-1">
        {NAV_ITEMS.map((item) => (
          <NavItemButton
            key={item.id}
            item={item}
            expanded={expanded}
            isActive={isActive(item)}
            onNavigate={navigate}
          />
        ))}

        <div className="flex-1 min-h-4" />

        {/* Pin toggle (expanded) */}
        {expanded && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsPinned(!isPinned)}
            className="flex items-center gap-3 px-3 py-1.5 text-[10px] rounded-lg transition-colors"
            style={{ color: "var(--text-quaternary)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "var(--border-default)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-quaternary)"; e.currentTarget.style.background = "transparent" }}
          >
            {isPinned ? (
              <PinOff className="h-3 w-3" />
            ) : (
              <Pin className="h-3 w-3" />
            )}
            {isPinned ? "Unpin sidebar" : "Pin sidebar"}
          </motion.button>
        )}

        {/* Theme toggle */}
        {expanded ? (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={toggleTheme}
            className="flex items-center gap-3 px-3 py-1.5 text-[10px] rounded-lg transition-colors"
            style={{ color: "var(--text-quaternary)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "var(--border-default)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-quaternary)"; e.currentTarget.style.background = "transparent" }}
          >
            {theme === "dark" ? (
              <Sun className="h-3 w-3" />
            ) : (
              <Moon className="h-3 w-3" />
            )}
            {theme === "dark" ? "Switch to warm theme" : "Switch to dark theme"}
          </motion.button>
        ) : (
          <Tooltip content={theme === "dark" ? "Switch to warm theme" : "Switch to dark theme"}>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex justify-center px-2 py-1.5 rounded-lg transition-colors"
              style={{ color: "var(--text-quaternary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-quaternary)" }}
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </Tooltip>
        )}
      </div>

      {/* Bottom section: user */}
      <div
        className={cn("pt-2 pb-2 transition-all", expanded ? "px-3" : "px-2")}
        style={{
          borderTop: "1px solid var(--border-default)",
          background: "linear-gradient(to top, color-mix(in srgb, var(--color-accent-brand) 2%, transparent) 0%, transparent 100%)",
        }}
      >
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg transition-colors",
            expanded ? "px-2 py-2" : "justify-center py-2",
          )}
          style={{ color: "var(--text-primary)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border-default)" }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
        >
          <div className="relative shrink-0">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <User className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500"
              style={{ border: "2px solid var(--surface-panel)" }} />
          </div>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={labelTransition}
                className="flex-1 min-w-0"
              >
                <p className="text-[11px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>
                  Developer
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          {expanded && (
            <button
              className="shrink-0 rounded-md p-1 transition-all"
              style={{ color: "var(--text-quaternary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "var(--border-default)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-quaternary)"; e.currentTarget.style.background = "transparent" }}
            >
              <Bell className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.aside>
  )
}
