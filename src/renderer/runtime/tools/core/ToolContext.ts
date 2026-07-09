export type WorkspaceStoreAPI = {
  rootPath: string | null
}

export type DiffStoreAPI = {
  addFileDiff: (entry: unknown) => void
}

export interface AgentTreeNodeInfo {
  id: string
  parentId: string | null
  depth: number
  role: string
  type: string
  state: string
  currentTask: string
  lastUpdated: number
  children: string[]
}

export type AgentStoreAPI = {
  agentTreeRootId: string | null
  agentTree: Record<string, { id: string; children: string[]; [key: string]: unknown }>
  addAgentTreeNode: (node: AgentTreeNodeInfo) => void
  setAgentTreeRoot: (id: string) => void
  updateAgentTreeNode: (id: string, updates: Partial<AgentTreeNodeInfo>) => void
}

export type ToolContext = {
  role: string
  executionMode?: string
  provider?: string
  model?: string
  signal?: AbortSignal
  env?: Record<string, string>
  cwd?: string
  traceId?: string
  messageHistory?: Array<{ role: string; content: string }>
  setProgress?: (msg: string) => void
  appendSystemMessage?: (msg: string) => void
  onOutput?: (output: string) => void
  workspaceStore?: WorkspaceStoreAPI
  diffStore?: DiffStoreAPI
  agentStore?: AgentStoreAPI
}
