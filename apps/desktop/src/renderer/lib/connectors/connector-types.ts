export type ConnectorType = "github" | "slack" | "linear"
export type ConnectorStatus = "disconnected" | "connecting" | "connected" | "error"

export interface ConnectorConfig {
  id: string
  name: string
  type: ConnectorType
  apiKey: string
  webhookUrl?: string
  enabled: boolean
  status: ConnectorStatus
  error?: string
  lastSyncAt?: string
  createdAt: string
}

export interface ConnectorTemplate {
  type: ConnectorType
  name: string
  description: string
  icon: string
  docsUrl: string
  defaultPort?: number
}
