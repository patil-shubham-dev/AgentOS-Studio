import type { ConnectorConfig, ConnectorType, ConnectorTemplate } from "./connector-types"
import { CONNECTOR_TEMPLATES } from "./connector-templates"
import type { MCPTransportConfig } from "@/runtime/mcp/MCPTransport"

interface ConnectorEndpoint {
  baseUrl: string
  transportType: "http" | "sse"
  authHeader: string
  healthEndpoint: string
}

const CONNECTOR_ENDPOINTS: Record<ConnectorType, ConnectorEndpoint> = {
  github: {
    baseUrl: "https://api.github.com",
    transportType: "http",
    authHeader: "Authorization",
    healthEndpoint: "/user",
  },
  slack: {
    baseUrl: "https://slack.com/api",
    transportType: "http",
    authHeader: "Authorization",
    healthEndpoint: "/auth.test",
  },
  linear: {
    baseUrl: "https://api.linear.app/graphql",
    transportType: "http",
    authHeader: "Authorization",
    healthEndpoint: "",
  },
}

export class ConnectorManager {
  private static instance: ConnectorManager

  static getInstance(): ConnectorManager {
    if (!ConnectorManager.instance) {
      ConnectorManager.instance = new ConnectorManager()
    }
    return ConnectorManager.instance
  }

  getConnectorInfo(type: ConnectorType): ConnectorTemplate | undefined {
    return CONNECTOR_TEMPLATES.find((t) => t.type === type)
  }

  initialize(config: ConnectorConfig): MCPTransportConfig {
    const endpoint = CONNECTOR_ENDPOINTS[config.type]
    return {
      type: endpoint.transportType,
      url: endpoint.baseUrl,
      headers: {
        [endpoint.authHeader]: config.apiKey.startsWith("Bearer ") || config.apiKey.startsWith("token ")
          ? config.apiKey
          : `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "agenticos-connector/1.0",
      },
    }
  }

  async connect(config: ConnectorConfig): Promise<void> {
    const transportConfig = this.initialize(config)
    const url = transportConfig.url
    if (!url) throw new Error(`No base URL configured for ${config.type}`)

    const headers = transportConfig.headers ?? {}
    const response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(10_000) })

    if (!response.ok) {
      throw new Error(`Connection failed: ${response.status} ${response.statusText}`)
    }
  }

  async disconnect(_config: ConnectorConfig): Promise<void> {

  }

  async testConnection(config: ConnectorConfig): Promise<{ success: boolean; message: string }> {
    try {
      const endpoint = CONNECTOR_ENDPOINTS[config.type]
      if (!endpoint.healthEndpoint) {
        return { success: true, message: "Configuration valid" }
      }

      const url = `${endpoint.baseUrl}${endpoint.healthEndpoint}`
      const headers: Record<string, string> = {
        [endpoint.authHeader]: config.apiKey.startsWith("Bearer ") || config.apiKey.startsWith("token ")
          ? config.apiKey
          : `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "agenticos-connector/1.0",
      }

      const response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(10_000) })

      if (response.ok) {
        return { success: true, message: `${config.type} connection verified` }
      }

      if (response.status === 401 || response.status === 403) {
        return { success: false, message: "Invalid API key or insufficient permissions" }
      }

      return { success: false, message: `Server returned ${response.status}` }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : "Connection failed" }
    }
  }
}
