import { useState, useRef, useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { TooltipSimple as Tooltip } from "@agentic-os/ui"
import {
  LayoutDashboard,
  Code2,
  Users,
  Smartphone,
  Settings,
  ScrollText,
  GitBranch,
  ArrowUpCircle,
  Bell,
  User,
  Pin,
  PinOff,
} from "lucide-react"

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  route: string
}

const TOP_NAV_ITEMS: NavItem[] = [
  { id: "control-center", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" />, route: "/" },
  { id: "code-canvas", label: "Workspace", icon: <Code2 className="h-5 w-5" />, route: "/code-canvas" },
  { id: "agents", label: "Agents", icon: <Users className="h-5 w-5" />, route: "/agents" },
]

const BOTTOM_NAV_ITEMS: NavItem[] = [
  { id: "logs", label: "Logs", icon: <ScrollText className="h-5 w-5" />, route: "/logs" },
  { id: "git", label: "Git", icon: <GitBranch className="h-5 w-5" />, route: "/git" },
  { id: "settings", label: "Settings", icon: <Settings className="h-5 w-5" />, route: "/settings" },
  { id: "updates", label: "Updates", icon: <ArrowUpCircle className="h-5 w-5" />, route: "/settings/update" },
]

const COLLAPSED_WIDTH = 52
const EXPANDED_WIDTH = 220

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
        isActive
          ? "text-white"
          : "text-white/30 hover:text-white/60",
      )}
    >
      {/* Active indicator glow */}
      {isActive && (
        <motion.span
          layoutId="nav-active-indicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}

      {/* Icon with active glow */}
      <span className={cn(
        "shrink-0 transition-all duration-200",
        isActive && "drop-shadow-[0_0_6px_rgba(59,130,246,0.4)]"
      )}>
        {item.icon}
      </span>

      {/* Label (visible when expanded) */}
      <AnimatePresence>
        {expanded && (
          <motion.span
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.12 }}
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
      return location.pathname === "/" || location.pathname === "/control-center"
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
        "flex flex-col border-r border-white/[0.06] bg-[#0c0c0d] overflow-hidden shrink-0 h-full",
      )}
    >
      {/* Top section: main navigation */}
      <div className="flex flex-col gap-0.5 px-2 pt-3 pb-2 flex-1">
        {TOP_NAV_ITEMS.map((item) => (
          <NavItemButton
            key={item.id}
            item={item}
            expanded={expanded}
            isActive={isActive(item)}
            onNavigate={navigate}
          />
        ))}

        {/* Spacer */}
        <div className="flex-1 min-h-4" />

        {/* Pin toggle */}
        {expanded && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsPinned(!isPinned)}
            className="flex items-center gap-3 px-3 py-2 text-[10px] text-white/20 hover:text-white/50 transition-colors rounded-lg hover:bg-white/[0.04]"
          >
            {isPinned ? (
              <PinOff className="h-3.5 w-3.5" />
            ) : (
              <Pin className="h-3.5 w-3.5" />
            )}
            {isPinned ? "Unpin sidebar" : "Pin sidebar"}
          </motion.button>
        )}

        {/* Bottom navigation items */}
        {BOTTOM_NAV_ITEMS.map((item) => (
          <NavItemButton
            key={item.id}
            item={item}
            expanded={expanded}
            isActive={isActive(item)}
            onNavigate={navigate}
          />
        ))}
      </div>

      {/* Bottom section: user */}
      <div className={cn(
        "border-t border-white/[0.06] pt-2 pb-2 transition-all",
        expanded ? "px-3" : "px-2"
      )}>
        <div className={cn(
          "flex items-center gap-3 rounded-lg transition-colors hover:bg-white/[0.04]",
          expanded ? "px-2 py-2" : "justify-center py-2"
        )}>
          <div className="relative shrink-0">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <User className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-[#0c0c0d]" />
          </div>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.12 }}
                className="flex-1 min-w-0"
              >
                <p className="text-[11px] font-medium text-white/70 truncate">Developer</p>
              </motion.div>
            )}
          </AnimatePresence>
          {expanded && (
            <button className="shrink-0 rounded-md p-1 text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all">
              <Bell className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.aside>
  )
}
