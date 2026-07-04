import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { FolderOpen, FilePlus, FileCode, Cpu, Key, CheckCircle2, ArrowRight, Bot } from "lucide-react"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { useAppStore } from "@/stores/app-store"
import type { GatewayProvider, ProviderModel } from "@/types"
import { loadFileTree, createFile } from "@/lib/filesystem"
import { configGenerator } from "@/runtime/project-config/ConfigGenerator"
import { configLoader } from "@/runtime/project-config/ConfigLoader"
import { startWatching } from "@/lib/workspace"

const QUICK_ADD_PROVIDERS = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o" },
  { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com", defaultModel: "claude-sonnet-4-20250514" },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "anthropic/claude-sonnet-4" },
]

export function WelcomePage({ rootPath, onOpenWorkspace }: { rootPath: string | null; onOpenWorkspace: () => void }) {
  const navigate = useNavigate()
  const providers = useAppStore((s) => s.providers)
  const addProvider = useAppStore((s) => s.addProvider)
  const mockMode = useAppStore((s) => s.mockMode)
  const setMockMode = useAppStore((s) => s.setMockMode)
  const hasProvider = providers.length > 0
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([])
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [modelName, setModelName] = useState("")
  const [connecting, setConnecting] = useState(false)
  const [showSetup, setShowSetup] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem("agentic-workspace-root")
      if (raw && raw !== rootPath) {
        setRecentWorkspaces([raw])
      }
    } catch { console.warn("[WelcomePage] Failed to load recent workspaces") }
  }, [rootPath])

  const currentPreset = QUICK_ADD_PROVIDERS.find((p) => p.id === selectedPreset)

  const handleConnect = useCallback(async () => {
    if (!currentPreset || !apiKey.trim()) return
    setConnecting(true)
    try {
      const model: ProviderModel = {
        id: modelName || currentPreset.defaultModel,
        name: modelName || currentPreset.defaultModel,
        supportsTools: true,
        supportsVision: false,
        supportsStreaming: true,
      }
      const provider: GatewayProvider = {
        id: currentPreset.id,
        name: currentPreset.name,
        baseUrl: currentPreset.baseUrl,
        apiKey: apiKey.trim(),
        runtime: null,
        isLocal: false,
        isOpenAiCompatible: true,
        models: [model],
        createdAt: new Date().toISOString(),
      }
      addProvider(provider)
      setSelectedPreset(null)
      setApiKey("")
      setModelName("")
      setShowSetup(false)
    } catch (err) {
      console.error("[WelcomePage] Failed to add provider:", err)
    } finally {
      setConnecting(false)
    }
  }, [currentPreset, apiKey, modelName, addProvider])

  const isReady = hasProvider || mockMode

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-12 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex flex-col items-center gap-5 max-w-sm w-full"
      >
        <div className="relative h-16 w-16 mb-1">
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

        <div className="flex flex-col gap-2 w-full">
          {/* Status banner when configured */}
          {isReady && (
            <div className="flex items-center gap-2 rounded-lg border border-green-500/15 bg-green-500/[0.04] px-3 py-2.5 text-[11px] font-medium text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{mockMode ? "Mock mode active" : `${providers[0]?.name ?? "AI Provider"} configured`}</span>
              <span className="ml-auto text-[9px] text-green-500/60">Ready</span>
            </div>
          )}

          {/* Inline provider setup card (when no provider and not mock mode) */}
          {!isReady && (
            <AnimatePresence mode="wait">
              {!showSetup ? (
                <motion.div
                  key="setup-picker"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-2"
                >
                  <p className="text-[10px] font-medium text-white/40 text-center">Choose an AI provider to get started</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {QUICK_ADD_PROVIDERS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => { setSelectedPreset(preset.id); setShowSetup(true); setApiKey(""); setModelName(preset.defaultModel) }}
                        className="flex items-center gap-1.5 rounded-lg border border-white/5 px-2 py-2 text-[11px] font-medium text-white/50 hover:border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-300 transition-all"
                      >
                        <Cpu className="h-3 w-3 shrink-0" />
                        <span>{preset.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-white/[0.04]" />
                    <span className="text-[8px] text-white/20">or</span>
                    <div className="flex-1 h-px bg-white/[0.04]" />
                  </div>
                  <button
                    onClick={() => navigate("/settings")}
                    className="w-full rounded-lg border border-white/5 px-2 py-1.5 text-[10px] text-white/30 hover:text-white/50 hover:bg-white/[0.03] transition-all"
                  >
                    Advanced setup (all providers)
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="setup-form"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-lg border border-blue-500/20 bg-blue-500/[0.03] p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Cpu className="h-3.5 w-3.5 text-blue-400" />
                    <span className="text-[11px] font-medium text-white/70">{currentPreset?.name}</span>
                    <button
                      onClick={() => { setShowSetup(false); setSelectedPreset(null) }}
                      className="ml-auto text-[9px] text-white/30 hover:text-white/60"
                    >
                      Change
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Key className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/20" />
                      <input
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="API key"
                        type="password"
                        className="w-full h-8 rounded-lg border border-white/10 bg-black/30 pl-7 pr-2 text-[11px] text-white outline-none placeholder:text-white/20 focus:border-blue-500/30 transition-all"
                      />
                    </div>
                    <div>
                      <input
                        value={modelName}
                        onChange={(e) => setModelName(e.target.value)}
                        placeholder={`Model (default: ${currentPreset?.defaultModel})`}
                        className="w-full h-8 rounded-lg border border-white/10 bg-black/30 px-2 text-[11px] text-white outline-none placeholder:text-white/20 focus:border-blue-500/30 transition-all"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleConnect}
                      disabled={!apiKey.trim() || connecting}
                      className="flex-1 rounded-lg bg-blue-600 px-2 py-1.5 text-[10px] font-medium text-white hover:bg-blue-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {connecting ? "Connecting..." : "Connect"}
                    </button>
                    <button
                      onClick={() => navigate("/settings")}
                      className="rounded-lg border border-white/10 px-2 py-1.5 text-[10px] text-white/40 hover:text-white/60 transition-all"
                    >
                      More options
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* Try Mock Mode (when no provider configured) */}
          {!isReady && (
            <button
              onClick={() => setMockMode(true)}
              className="flex items-center gap-2 rounded-lg border border-dashed border-indigo-500/15 px-3 py-2 text-[11px] font-medium text-indigo-400/60 hover:text-indigo-300 hover:border-indigo-500/30 hover:bg-indigo-500/[0.03] transition-all"
            >
              <Bot className="h-3.5 w-3.5" />
              <span>Try Mock Mode (simulated AI responses)</span>
              <ArrowRight className="h-3 w-3 ml-auto" />
            </button>
          )}

          {/* Action buttons */}
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
          </div>

          {/* Secondary action: Generate AGENTIC.md */}
          {rootPath && (
            <button
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
              className="flex items-center gap-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 text-[10px] font-medium text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-all"
            >
              <FileCode className="h-3.5 w-3.5" />
              <span>Generate AGENTIC.md</span>
            </button>
          )}
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
