import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { Badge, Separator, Switch, Button, Input, Label } from "@agentic-os/ui"
import { useAppStore } from "@/stores/app-store"
import { RuntimeOS } from "@/runtime/RuntimeOS"
import type { MCPConfig } from "@/types"
import {
  Server, Plus, Search,
  ChevronDown, ChevronRight,
  Link, Trash2, Key, RefreshCw, Box,
} from "lucide-react"

let mcpCounter = 0
function nextMcpId(): string {
  mcpCounter++
  return `mcp-${Date.now()}-${mcpCounter}`
}

export function ToolsTab() {
  const mcps = useAppStore((s) => s.mcpServers)
  const addMcpServer = useAppStore((s) => s.addMcpServer)
  const removeMcpServer = useAppStore((s) => s.removeMcpServer)
  const toggleMcpServer = useAppStore((s) => s.toggleMcpServer)
  const updateMcpServer = useAppStore((s) => s.updateMcpServer)

  const toolCount = (() => {
    try { return RuntimeOS.getInstance().toolRegistry.size().total } catch { return 0 }
  })()

  const [search, setSearch] = useState("")
  const [expandedMcp, setExpandedMcp] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [newCmd, setNewCmd] = useState("")

  const filteredMcp = mcps.filter((m) => {
    if (!search) return true
    const q = search.toLowerCase()
    return m.name.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-white tracking-tight">MCP Servers</h2>
        <p className="text-sm text-white/40">Manage MCP server connections for extended tool capabilities</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {[
          { label: "Registered Tools", value: toolCount.toString(), icon: Box, color: "text-blue-400" },
          { label: "MCP Servers", value: mcps.length.toString(), icon: Server, color: "text-green-400" },
          { label: "Connected", value: mcps.filter((m) => m.status === "connected").length.toString(), icon: Link, color: "text-purple-400" },
          { label: "Errors", value: mcps.filter((m) => m.status === "error").length.toString(), icon: Server, color: "text-red-400" },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-white">{stat.value}</span>
                <Icon className={cn("h-5 w-5 opacity-60", stat.color)} />
              </div>
              <p className="text-xs text-white/40 mt-1">{stat.label}</p>
            </div>
          )
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search MCP servers..." className="w-full h-10 rounded-xl border border-white/5 bg-white/[0.03] pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/20 focus:border-white/10" />
        </div>
        <div className="flex-1" />
        <Button size="sm" className="h-9 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white border-0 shadow-lg shadow-blue-600/20" onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add MCP Server
        </Button>
      </div>

      {/* Add MCP Server form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/[0.05] to-purple-500/[0.03] p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/60">Server Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-9 border-white/10 bg-white/[0.03] text-xs text-white" placeholder="my-server" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/60">Command</Label>
                  <Input value={newCmd} onChange={(e) => setNewCmd(e.target.value)} className="h-9 border-white/10 bg-white/[0.03] text-xs text-white font-mono" placeholder="npx @anthropic/mcp-server" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" className="h-8 text-xs border-white/10 text-white/50" onClick={() => { setShowAddForm(false); setNewName(""); setNewCmd("") }}>Cancel</Button>
                <Button size="sm" className="h-8 text-xs bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0" disabled={!newName.trim() || !newCmd.trim()} onClick={() => {
                  const cfg: MCPConfig = {
                    id: nextMcpId(),
                    name: newName.trim(),
                    command: newCmd.trim(),
                    args: [],
                    env: {},
                    enabled: true,
                    status: "disconnected",
                  }
                  addMcpServer(cfg)
                  setNewName("")
                  setNewCmd("")
                  setShowAddForm(false)
                }}>Add Server</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MCP Server List */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filteredMcp.map((mcp) => (
            <motion.div
              key={mcp.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden"
            >
              <div className="flex items-center gap-4 px-5 py-4">
                <button onClick={() => setExpandedMcp(expandedMcp === mcp.id ? null : mcp.id)} className="text-white/20 hover:text-white/40 transition-colors">
                  {expandedMcp === mcp.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <div className={cn("flex items-center justify-center h-9 w-9 rounded-xl border", mcp.status === "connected" ? "bg-green-500/10 border-green-500/20" : mcp.status === "error" ? "bg-red-500/10 border-red-500/20" : "bg-white/[0.02] border-white/5")}>
                  <Server className={cn("h-4 w-4", mcp.status === "connected" ? "text-green-400" : mcp.status === "error" ? "text-red-400" : "text-white/30")} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{mcp.name}</span>
                    <Badge variant={mcp.status === "connected" ? "success" : mcp.status === "error" ? "error" : "default"} size="sm">{mcp.status}</Badge>
                  </div>
                  <p className="text-xs text-white/30 font-mono mt-0.5">{mcp.command} {mcp.args.join(" ")}</p>
                </div>
                <Switch checked={mcp.enabled} onCheckedChange={() => toggleMcpServer(mcp.id)} size="default" />
              </div>

              <AnimatePresence>
                {expandedMcp === mcp.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <Separator />
                    <div className="p-5 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-white/60">Command</Label>
                          <Input value={mcp.command} className="h-9 border-white/10 bg-white/[0.03] text-xs text-white font-mono" readOnly />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-white/60">Args</Label>
                          <Input value={mcp.args.join(" ")} className="h-9 border-white/10 bg-white/[0.03] text-xs text-white font-mono" readOnly />
                        </div>
                      </div>
                      {Object.keys(mcp.env).length > 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-white/60">Environment Variables</Label>
                          {Object.entries(mcp.env).map(([key, val]) => (
                            <div key={key} className="flex items-center gap-2 rounded-lg bg-white/[0.02] border border-white/5 px-3 py-2">
                              <Key className="h-3 w-3 text-white/20" />
                              <span className="text-xs font-mono text-white/50">{key}</span>
                              <span className="text-xs font-mono text-white/20">=</span>
                              <span className="text-xs font-mono text-white/30">{val || "(not set)"}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-8 text-xs border-white/10 text-white/50 hover:text-white" onClick={() => {
                          updateMcpServer(mcp.id, { status: "disconnected" })
                          setTimeout(() => updateMcpServer(mcp.id, { status: "connected" }), 500)
                        }}><RefreshCw className="h-3 w-3 mr-1" /> Restart</Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs border-white/10 text-red-400 hover:bg-red-500/10" onClick={() => removeMcpServer(mcp.id)}><Trash2 className="h-3 w-3 mr-1" /> Remove</Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
        {filteredMcp.length === 0 && (
          <div className="text-center py-12">
            <Server className="h-8 w-8 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/30">{mcps.length === 0 ? "No MCP servers configured — add one to extend tool capabilities" : "No MCP servers match your search"}</p>
          </div>
        )}
      </div>
    </div>
  )
}
