import { motion } from "framer-motion"
import { Terminal as TerminalIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface TerminalToggleButtonProps {
  showTerminal: boolean
  onToggle: () => void
}

export function TerminalToggleButton({ showTerminal, onToggle }: TerminalToggleButtonProps) {
  return (
    <div className="flex items-center px-3 py-1 gap-1 shrink-0">
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onToggle}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-medium transition-all",
          showTerminal
            ? "text-blue-400 bg-blue-500/10 border border-blue-500/20"
            : "text-white/30 hover:text-white/50 hover:bg-white/[0.04] border border-transparent",
        )}
      >
        <TerminalIcon className="h-3 w-3" />
        <span>Terminal</span>
        <span className="text-[8px] text-white/20 font-mono ml-1">Ctrl+`</span>
      </motion.button>
    </div>
  )
}
