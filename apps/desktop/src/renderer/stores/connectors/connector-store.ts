import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ConnectorConfig, ConnectorType, ConnectorStatus } from "@/lib/connectors/connector-types"
import { ConnectorManager } from "@/lib/connectors/ConnectorManager"

interface ConnectorStoreState {
  connectors: ConnectorConfig[]
  addConnector: (config: ConnectorConfig) => void
  removeConnector: (id: string) => void
  updateConnector: (id: string, updates: Partial<ConnectorConfig>) => void
  setConnectorStatus: (id: string, status: ConnectorStatus) => void
  toggleConnector: (id: string) => void
  connect: (id: string) => Promise<void>
  disconnect: (id: string) => Promise<void>
  getConnectorsByType: (type: ConnectorType) => ConnectorConfig[]
  getConnectedCount: () => number
  getByStatus: (status: ConnectorStatus) => ConnectorConfig[]
}

let connectorIdCounter = 0

function nextConnectorId(): string {
  connectorIdCounter++
  return `conn-${Date.now().toString(36)}-${connectorIdCounter}`
}

export const useConnectorStore = create<ConnectorStoreState>()(
  persist(
    (set, get) => ({
      connectors: [],

      addConnector: (config) => {
        const existing = get().connectors.some((c) => c.id === config.id)
        if (existing) return
        set((state) => ({
          connectors: [
            ...state.connectors,
            { ...config, id: config.id || nextConnectorId() },
          ],
        }))
      },

      removeConnector: (id) => {
        set((state) => ({
          connectors: state.connectors.filter((c) => c.id !== id),
        }))
      },

      updateConnector: (id, updates) => {
        set((state) => ({
          connectors: state.connectors.map((c) =>
            c.id === id ? { ...c, ...updates } : c,
          ),
        }))
      },

      setConnectorStatus: (id, status) => {
        set((state) => ({
          connectors: state.connectors.map((c) =>
            c.id === id ? { ...c, status } : c,
          ),
        }))
      },

      toggleConnector: (id) => {
        set((state) => ({
          connectors: state.connectors.map((c) =>
            c.id === id ? { ...c, enabled: !c.enabled } : c,
          ),
        }))
      },

      connect: async (id) => {
        const connector = get().connectors.find((c) => c.id === id)
        if (!connector) return

        get().setConnectorStatus(id, "connecting")

        try {
          const manager = ConnectorManager.getInstance()
          await manager.connect(connector)
          const testResult = await manager.testConnection(connector)
          if (testResult.success) {
            get().updateConnector(id, {
              status: "connected",
              error: undefined,
              lastSyncAt: new Date().toISOString(),
            })
          } else {
            get().updateConnector(id, {
              status: "error",
              error: testResult.message,
            })
          }
        } catch (err) {
          get().updateConnector(id, {
            status: "error",
            error: err instanceof Error ? err.message : "Connection failed",
          })
        }
      },

      disconnect: async (id) => {
        const connector = get().connectors.find((c) => c.id === id)
        if (!connector) return

        try {
          const manager = ConnectorManager.getInstance()
          await manager.disconnect(connector)
        } catch {

        }
        get().updateConnector(id, {
          status: "disconnected",
          error: undefined,
        })
      },

      getConnectorsByType: (type) => {
        return get().connectors.filter((c) => c.type === type)
      },

      getConnectedCount: () => {
        return get().connectors.filter((c) => c.status === "connected").length
      },

      getByStatus: (status) => {
        return get().connectors.filter((c) => c.status === status)
      },
    }),
    { name: "aos-connector-store" },
  ),
)
