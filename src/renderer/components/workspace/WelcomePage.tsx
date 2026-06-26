import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { FolderOpen, FilePlus, FileCode } from "lucide-react"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { loadFileTree, createFile } from "@/lib/filesystem"
import { configGenerator } from "@/runtime/project-config/ConfigGenerator"
import { configLoader } from "@/runtime/project-config/ConfigLoader"
import { startWatching } from "@/lib/workspace"

export function WelcomePage({ rootPath, onOpenWorkspace }: { rootPath: string | null; onOpenWorkspace: () => void }) {
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem("agentic-workspace-root")
      if (raw && raw !== rootPath) {
        setRecentWorkspaces([raw])
      }
    } catch { console.warn("[WelcomePage] Failed to load recent workspaces") }
  }, [rootPath])

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-12 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex flex-col items-center gap-6 max-w-sm w-full"
      >
        <div className="relative h-16 w-16 mb-2">
          <svg viewBox="0 0 64 64" fill="none" className="absolute inset-0 h-full w-full">
            <motion.rect
              x="8" y="12" width="48" height="40" rx="4"
              stroke="currentColor" strokeWidth="1.5" fill="none"
              className="text-blue-400/40"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
            <motion.path
              d="M22 28L18 32L22 36"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="text-blue-400"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.4 }}
            />
            <motion.path
              d="M42 28L46 32L42 36"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="text-cyan-400"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.6 }}
            />
            <motion.path
              d="M34 22L30 42"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              className="text-purple-400"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.8 }}
            />
            <motion.circle
              cx="32" cy="32" r="2"
              fill="currentColor" className="text-blue-400"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.3 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            />
          </svg>
        </div>

        <div className="text-center">
          <h1 className="text-lg font-semibold text-white/70">AgenticOS</h1>
          <p className="text-[11px] text-white/30 mt-1">
            {rootPath
              ? "Workspace is ready. Open a file to start editing."
              : "Open a project folder to begin working with AI assistance."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 w-full">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onOpenWorkspace}
            className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2.5 text-[11px] font-medium text-white/60 hover:bg-white/[0.07] hover:text-white/80 transition-all"
          >
            <FolderOpen className="h-4 w-4 text-blue-400" />
            <span>Open Folder</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={!rootPath}
            onClick={async () => {
              if (!rootPath) return
              const name = prompt("File name:")
              if (!name) return
              try {
                await createFile(`${rootPath}\\${name}`)
                const tree = await loadFileTree(rootPath)
                useWorkspaceStore.getState().setFileTree(tree)
              } catch { console.warn("[WelcomePage] Failed to create file") }
            }}
            className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2.5 text-[11px] font-medium text-white/40 hover:bg-white/[0.07] hover:text-white/70 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <FilePlus className="h-4 w-4 text-emerald-400" />
            <span>New File</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={!rootPath}
            onClick={async () => {
              if (!rootPath) return
              try {
                const config = await configLoader.load(rootPath)
                if (config) { alert("AGENTIC.md already exists in this project"); return }
                const content = await configGenerator.generate(rootPath)
                await configGenerator.write(rootPath, content)
                alert("AGENTIC.md generated successfully!")
              } catch (err) { console.error("Failed to generate AGENTIC.md:", err) }
            }}
            className="flex items-center gap-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-2.5 text-[11px] font-medium text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <FileCode className="h-4 w-4 text-indigo-400" />
            <span>Generate AGENTIC.md</span>
          </motion.button>
        </div>

        {recentWorkspaces.length > 0 && (
          <div className="w-full">
            <p className="text-[9px] font-medium text-white/20 uppercase tracking-wider mb-2">Recent</p>
            {recentWorkspaces.map((ws) => (
              <button
                key={ws}
                onClick={() => {
                  const { setRootPath, setFileTree, setLoading } = useWorkspaceStore.getState()
                  setRootPath(ws)
                  setLoading(true)
                  loadFileTree(ws).then((tree) => {
                    setFileTree(tree)
                    startWatching(ws).catch((err) => console.error("Workspace watch failed:", err))
                  }).catch((err) => console.error("File tree loading failed:", err))
                }}
                className="flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-[11px] text-white/40 hover:bg-white/[0.04] hover:text-white/60 transition-all"
              >
                <FolderOpen className="h-3 w-3 shrink-0 text-white/20" />
                <span className="truncate">{ws.split(/[/\\]/).pop()}</span>
                <span className="ml-auto text-[9px] text-white/15 truncate max-w-[120px]">{ws}</span>
              </button>
            ))}
          </div>
        )}

        <div className="w-full pt-2 border-t border-white/[0.04]">
          <p className="text-[9px] font-medium text-white/15 uppercase tracking-wider mb-2">Keyboard Shortcuts</p>
          <div className="space-y-1">
            {[
              { keys: "⌘P", desc: "Quick open" },
              { keys: "⌘⇧P", desc: "Command palette" },
              { keys: "⌘B", desc: "Toggle explorer" },
              { keys: "⌘J", desc: "Toggle panel" },
              { keys: "⌘S", desc: "Save file" },
              { keys: "⌘W", desc: "Close tab" },
            ].map(({ keys, desc }) => (
              <div key={keys} className="flex items-center justify-between">
                <span className="text-[10px] text-white/20">{desc}</span>
                <kbd className="text-[9px] font-mono text-white/15 bg-white/[0.04] px-1.5 py-0.5 rounded">{keys}</kbd>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
