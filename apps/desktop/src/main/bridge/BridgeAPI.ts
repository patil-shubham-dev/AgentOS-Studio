export interface BridgeRequest {
  id: string
  method: string
  params: Record<string, unknown>
  timestamp: number
}

export interface BridgeResponse {
  id: string
  result?: unknown
  error?: { code: number; message: string }
  timestamp: number
}

export type BridgeEvent =
  | { type: 'agent:token'; data: string }
  | { type: 'agent:status'; data: { status: string; task?: string } }
  | { type: 'agent:complete'; data: { result: string } }
  | { type: 'agent:error'; data: { error: string } }
  | { type: 'workspace:changed'; data: { filePath: string; change: string } }
  | { type: 'workspace:diagnostic'; data: { filePath: string; diagnostics: unknown[] } }

export type BridgeMethod =
  | { name: 'workspace.listFiles'; params: { path?: string }; result: string[] }
  | { name: 'workspace.readFile'; params: { path: string }; result: string }
  | { name: 'workspace.writeFile'; params: { path: string; content: string }; result: boolean }
  | { name: 'agent.execute'; params: { prompt: string; model?: string }; result: { sessionId: string } }
  | { name: 'agent.query'; params: { sessionId: string }; result: { status: string; output: string } }
  | { name: 'agent.cancel'; params: { sessionId: string }; result: boolean }
  | { name: 'system.health'; params: Record<string, never>; result: { status: string; uptime: number; memory: number } }
  | { name: 'system.shutdown'; params: { reason?: string }; result: boolean }

export const BRIDGE_METHODS = [
  'workspace.listFiles',
  'workspace.readFile',
  'workspace.writeFile',
  'agent.execute',
  'agent.query',
  'agent.cancel',
  'system.health',
  'system.shutdown',
] as const

export function validateBridgeRequest(data: unknown): BridgeRequest | null {
  if (!data || typeof data !== 'object') return null
  const req = data as Record<string, unknown>
  if (typeof req.id !== 'string' || typeof req.method !== 'string') return null
  if (!BRIDGE_METHODS.includes(req.method as string)) return null
  return req as unknown as BridgeRequest
}
