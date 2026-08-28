export type RuntimeStatus = "uninitialized" | "initializing" | "ready" | "error"
export type RuntimeHealth = "healthy" | "degraded" | "unhealthy"
export interface WiredAgent { id: string; role: string }
export interface BootStep { id: string; status: string }
export interface RuntimeGraph { agents: WiredAgent[]; bootSteps: BootStep[]; status: RuntimeStatus; health: RuntimeHealth }
export function computeGraphWithLogging(): RuntimeGraph {
  return { agents: [], bootSteps: [], status: "ready", health: "healthy" }
}
export function computeGraph(): RuntimeGraph {
  return computeGraphWithLogging()
}
export function computeGraphRaw(): RuntimeGraph {
  return computeGraphWithLogging()
}
