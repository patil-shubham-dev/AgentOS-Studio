import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { Folder } from "lucide-react"
import type { RuntimeRole } from "@/types"

interface ContextBarProps {
  workspaceName: string | null
  activeRole: RuntimeRole
}

export function ContextBar({
  workspaceName,
}: ContextBarProps) {
  return (
    <motion.div
      className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-white/[0.02] via-white/[0.01] to-transparent border-t border-white/[0.04]"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Workspace */}
      <div className="flex items-center gap-1.5 min-w-0 pl-0.5" title={workspaceName || "No workspace"}>
        <Folder className="h-2.5 w-2.5 shrink-0 text-white/30" aria-hidden="true" />
        <span className="text-[9px] text-white/35 truncate max-w-[160px] font-medium">
          {workspaceName || "No workspace"}
        </span>
      </div>
    </motion.div>
  )
}
