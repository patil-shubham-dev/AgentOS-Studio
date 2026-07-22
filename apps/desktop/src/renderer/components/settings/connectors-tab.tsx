import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { Badge, Separator, Switch, Button, Input, Label } from "@agentic-os/ui"
import { useConnectorStore } from "@/stores/connectors/connector-store"
import { CONNECTOR_TEMPLATES } from "@/lib/connectors/connector-templates"
import { ConnectorManager } from "@/lib/connectors/ConnectorManager"
import type { ConnectorConfig, ConnectorType } from "@/lib/connectors/connector-types"
import {
  GitFork, MessageSquare, KanbanSquare, Plus, Trash2,
  Plug, Unplug, Loader2,
} from "lucide-react"

const TEMPLATE_ICONS: Record<string, typeof GitFork> = {
  github: GitFork,
  slack: MessageSquare,
  linear: KanbanSquare,
}

let connectorCounter = 0

function nextConnectorId(): string {
  connectorCounter++
  return `conn-${Date.now().toString(36)}-${connectorCounter}`
}

export function ConnectorsTab() {
  const connectors = useConnectorStore((s) => s.connectors)
  const addConnector = useConnectorStore((s) => s.addConnector)
  const removeConnector = useConnectorStore((s) => s.removeConnector)
  const updateConnector = useConnectorStore((s) => s.updateConnector)
  const toggleConnector = useConnectorStore((s) => s.toggleConnector)
  const connect = useConnectorStore((s) => s.connect)
  const disconnect = useConnectorStore((s) => s.disconnect)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingType, setAddingType] = useState<ConnectorType | null>(null)
  const [newName, setNewName] = useState("")
  const [newApiKey, setNewApiKey] = useState("")
  const [connectingId, setConnectingId] = useState<string | null>(null)

  function handleAddClick(type: ConnectorType) {
    const existing = connectors.filter((c) => c.type === type)
    setNewName(existing.length === 0 ? `${CONNECTOR_TEMPLATES.find((t) => t.type === type)?.name ?? type} Connector` : `${CONNECTOR_TEMPLATES.find((t) => t.type === type)?.name ?? type} Connector ${existing.length + 1}`)
    setNewApiKey("")
    setAddingType(type)
  }

  async function handleSave() {
    if (!addingType || !newName.trim() || !newApiKey.trim()) return
    const config: ConnectorConfig = {
      id: nextConnectorId(),
      name: newName.trim(),
      type: addingType,
      apiKey: newApiKey.trim(),
      enabled: true,
      status: "disconnected",
      createdAt: new Date().toISOString(),
    }
    addConnector(config)
    setAddingType(null)
    setNewName("")
    setNewApiKey("")

    const id = config.id
    setConnectingId(id)
    updateConnector(id, { status: "connecting" })
    try {
      const manager = ConnectorManager.getInstance()
      const result = await manager.testConnection(config)
      if (result.success) {
        updateConnector(id, { status: "connected", lastSyncAt: new Date().toISOString(), error: undefined })
      } else {
        updateConnector(id, { status: "error", error: result.message })
      }
    } catch (err) {
      updateConnector(id, { status: "error", error: err instanceof Error ? err.message : "Connection failed" })
    } finally {
      setConnectingId(null)
    }
  }

  async function handleConnect(id: string) {
    setConnectingId(id)
    await connect(id)
    setConnectingId(null)
  }

  const stats = [
    { label: "Configured", value: connectors.length.toString(), icon: Plug, color: "text-blue-400" },
    { label: "Connected", value: connectors.filter((c) => c.status === "connected").length.toString(), icon: Plug, color: "text-green-400" },
    { label: "Errors", value: connectors.filter((c) => c.status === "error").length.toString(), icon: Unplug, color: "text-red-400" },
    { label: "Templates", value: CONNECTOR_TEMPLATES.length.toString(), icon: KanbanSquare, color: "text-purple-400" },
  ]

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-white tracking-tight">Connectors</h2>
        <p className="text-sm text-white/40">Manage external service integrations via MCP infrastructure</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((stat) => {
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

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Available Connectors</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {CONNECTOR_TEMPLATES.map((tmpl) => {
            const Icon = TEMPLATE_ICONS[tmpl.type] ?? KanbanSquare
            const isAdding = addingType === tmpl.type
            return (
              <motion.div
                key={tmpl.type}
                layout
                className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden backdrop-blur-xl"
              >
                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-white/5">
                      <Icon className="h-5 w-5 text-white/60" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">{tmpl.name}</h4>
                      <p className="text-xs text-white/40">{tmpl.description}</p>
                    </div>
                  </div>
                  {isAdding ? (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3"
                    >
                      <Separator />
                      <div className="space-y-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-white/60">Name</Label>
                          <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="h-9 border-white/10 bg-white/[0.03] text-xs text-white"
                            placeholder="My Connector"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-white/60">API Key</Label>
                          <Input
                            value={newApiKey}
                            onChange={(e) => setNewApiKey(e.target.value)}
                            className="h-9 border-white/10 bg-white/[0.03] text-xs text-white font-mono"
                            placeholder={tmpl.type === "github" ? "ghp_..." : tmpl.type === "slack" ? "xoxb-..." : "lin_..."}
                            type="password"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs border-white/10 text-white/50 flex-1"
                          onClick={() => setAddingType(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0 flex-1"
                          disabled={!newName.trim() || !newApiKey.trim()}
                          onClick={handleSave}
                        >
                          Save
                        </Button>
                      </div>
                    </motion.div>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white border border-white/5"
                      onClick={() => handleAddClick(tmpl.type)}
                    >
                      <Plus className="h-3 w-3 mr-1.5" /> Add {tmpl.name}
                    </Button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Configured Connectors</h3>

        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {connectors.map((conn) => {
              const tmpl = CONNECTOR_TEMPLATES.find((t) => t.type === conn.type)
              const Icon = tmpl ? (TEMPLATE_ICONS[tmpl.type] ?? KanbanSquare) : KanbanSquare
              const isConnecting = connectingId === conn.id

              return (
                <motion.div
                  key={conn.id}
                  layout
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-white/[0.01] overflow-hidden"
                >
                  <div className="flex items-center gap-4 px-5 py-4">
                    <button
                      onClick={() => setExpandedId(expandedId === conn.id ? null : conn.id)}
                      className="text-white/20 hover:text-white/40 transition-colors"
                    >
                      <svg
                        className={cn("h-3 w-3 transition-transform", expandedId === conn.id && "rotate-90")}
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M4 2L8 6L4 10" />
                      </svg>
                    </button>

                    <div className={cn(
                      "flex items-center justify-center h-9 w-9 rounded-xl border transition-colors",
                      conn.status === "connected" ? "bg-green-500/10 border-green-500/20" :
                      conn.status === "error" ? "bg-red-500/10 border-red-500/20" :
                      conn.status === "connecting" ? "bg-yellow-500/10 border-yellow-500/20" :
                      "bg-white/[0.02] border-white/5",
                    )}>
                      {conn.status === "connecting" ? (
                        <Loader2 className="h-4 w-4 text-yellow-400 animate-spin" />
                      ) : (
                        <Icon className={cn(
                          "h-4 w-4",
                          conn.status === "connected" ? "text-green-400" :
                          conn.status === "error" ? "text-red-400" : "text-white/30",
                        )} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{conn.name}</span>
                        <Badge variant={
                          conn.status === "connected" ? "success" :
                          conn.status === "error" ? "error" :
                          conn.status === "connecting" ? "warning" : "default"
                        } size="sm">
                          <span className="flex items-center gap-1">
                            {conn.status === "connected" && <span className="h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />}
                            {conn.status === "error" && <span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block" />}
                            {conn.status === "connecting" && <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse inline-block" />}
                            {conn.status === "disconnected" && <span className="h-1.5 w-1.5 rounded-full bg-white/20 inline-block" />}
                            {conn.status}
                          </span>
                        </Badge>
                      </div>
                      <p className="text-xs text-white/30 font-mono mt-0.5">{conn.type} &middot; {conn.id.slice(0, 12)}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {conn.status === "disconnected" || conn.status === "error" ? (
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0"
                          disabled={isConnecting}
                          onClick={() => handleConnect(conn.id)}
                        >
                          {isConnecting ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : null}
                          Connect
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs border-white/10 text-white/50 hover:text-white"
                          onClick={() => disconnect(conn.id)}
                        >
                          <Unplug className="h-3 w-3 mr-1" /> Disconnect
                        </Button>
                      )}
                      <Switch
                        checked={conn.enabled}
                        onCheckedChange={() => toggleConnector(conn.id)}
                        size="default"
                      />
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedId === conn.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <Separator />
                        <div className="p-5 space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs text-white/60">Name</Label>
                              <Input
                                value={conn.name}
                                className="h-9 border-white/10 bg-white/[0.03] text-xs text-white"
                                readOnly
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-white/60">Type</Label>
                              <Input
                                value={conn.type}
                                className="h-9 border-white/10 bg-white/[0.03] text-xs text-white font-mono"
                                readOnly
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-white/60">API Key</Label>
                            <Input
                              value={conn.apiKey ? `${conn.apiKey.slice(0, 8)}${"*".repeat(Math.max(0, conn.apiKey.length - 8))}` : ""}
                              className="h-9 border-white/10 bg-white/[0.03] text-xs text-white font-mono"
                              readOnly
                              type="password"
                            />
                          </div>
                          {conn.error && (
                            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                              <p className="text-xs text-red-400">{conn.error}</p>
                            </div>
                          )}
                          {conn.lastSyncAt && (
                            <div className="rounded-lg bg-white/[0.02] border border-white/5 px-3 py-2">
                              <p className="text-xs text-white/40">Last synced: {new Date(conn.lastSyncAt).toLocaleString()}</p>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs border-white/10 text-red-400 hover:bg-red-500/10"
                              onClick={() => removeConnector(conn.id)}
                            >
                              <Trash2 className="h-3 w-3 mr-1" /> Remove
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {connectors.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <Plug className="h-10 w-10 text-white/10 mx-auto mb-4" />
              <p className="text-sm text-white/30 max-w-sm mx-auto leading-relaxed">
                No connectors configured. Click a template above to get started.
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
