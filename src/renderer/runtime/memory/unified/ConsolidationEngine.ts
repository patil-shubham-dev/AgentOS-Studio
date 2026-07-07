import type { MemoryEntry, MemoryScope, MemoryConfig } from "./types"
import { DEFAULT_MEMORY_CONFIG } from "./types"

export interface ConsolidationReport {
  timestamp: number
  entriesProcessed: number
  promoted: number
  demoted: number
  archived: number
  decayed: number
  deleted: number
  remainingActive: number
}

interface StorageInterface {
  getAll: (query?: any) => Promise<MemoryEntry[]>
  store: (entry: MemoryEntry) => Promise<void>
  update: (id: string, updates: Partial<MemoryEntry>) => Promise<void>
  delete: (id: string) => Promise<void>
}

const SCOPE_HIERARCHY: MemoryScope[] = ["ephemeral", "session", "project", "workspace", "user", "global"]

const PROMOTION_THRESHOLDS = {
  importance: 0.7,
  confidence: 0.6,
  accessCount: 3,
}

const DEMOTION_THRESHOLDS = {
  importance: 0.3,
  confidence: 0.2,
  accessCount: 0,
  ageDays: 30,
}

const DECAY_RATE = 0.1

export class ConsolidationEngine {
  private config: MemoryConfig

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config }
  }

  async consolidate(storage: StorageInterface): Promise<ConsolidationReport> {
    const all = await storage.getAll()
    const report: ConsolidationReport = {
      timestamp: Date.now(),
      entriesProcessed: all.length,
      promoted: 0,
      demoted: 0,
      archived: 0,
      decayed: 0,
      deleted: 0,
      remainingActive: 0,
    }

    for (const entry of all) {
      const action = this.processEntry(entry)
      switch (action) {
        case "promote": {
          const newScope = this.nextScopeUp(entry.scope)
          if (newScope) {
            await storage.update(entry.id, {
              scope: newScope,
              importance: Math.min(1, entry.importance + 0.1),
              status: "active",
              updatedAt: Date.now(),
            })
            report.promoted++
          }
          break
        }
        case "demote": {
          const newScope = this.nextScopeDown(entry.scope)
          if (newScope) {
            await storage.update(entry.id, {
              scope: newScope,
              importance: Math.max(0.1, entry.importance - 0.1),
              updatedAt: Date.now(),
            })
            report.demoted++
          }
          break
        }
        case "archive":
          await storage.update(entry.id, {
            status: "archived",
            updatedAt: Date.now(),
          })
          report.archived++
          break

        case "decay":
          await storage.update(entry.id, {
            decayFactor: Math.max(0, entry.decayFactor - DECAY_RATE),
            importance: Math.max(0.1, entry.importance - 0.05),
            updatedAt: Date.now(),
          })
          report.decayed++
          break

        case "delete":
          await storage.delete(entry.id)
          report.deleted++
          break

        case "keep":
          report.remainingActive++
          break
      }
    }

    return report
  }

  private processEntry(entry: MemoryEntry): "promote" | "demote" | "archive" | "decay" | "delete" | "keep" {
    if (entry.status === "deleted") return "delete"

    const ageMs = Date.now() - entry.timestamp
    const ageDays = ageMs / (24 * 60 * 60 * 1000)

    if (entry.ttl > 0 && ageMs > entry.ttl) {
      return "delete"
    }

    if (entry.status === "archived") {
      return "keep"
    }

    if (
      entry.importance >= PROMOTION_THRESHOLDS.importance &&
      entry.confidence >= PROMOTION_THRESHOLDS.confidence &&
      entry.accessCount >= PROMOTION_THRESHOLDS.accessCount &&
      entry.scope !== "global"
    ) {
      return "promote"
    }

    if (entry.status === "decaying") {
      if (entry.decayFactor <= 0) {
        return "delete"
      }
      return "decay"
    }

    if (
      entry.importance < DEMOTION_THRESHOLDS.importance &&
      entry.accessCount <= DEMOTION_THRESHOLDS.accessCount &&
      ageDays > DEMOTION_THRESHOLDS.ageDays
    ) {
      if (entry.scope === "ephemeral" || entry.scope === "session") {
        return "archive"
      }
      return "demote"
    }

    const recentInactivityThreshold = 7
    if (ageDays > recentInactivityThreshold && entry.accessCount === 0) {
      if (entry.scope === "ephemeral") return "delete"
      if (entry.decayFactor < 0.3) return "archive"
      return "decay"
    }

    return "keep"
  }

  private nextScopeUp(current: MemoryScope): MemoryScope | null {
    const idx = SCOPE_HIERARCHY.indexOf(current)
    if (idx >= SCOPE_HIERARCHY.length - 1) return null
    return SCOPE_HIERARCHY[idx + 1]
  }

  private nextScopeDown(current: MemoryScope): MemoryScope | null {
    const idx = SCOPE_HIERARCHY.indexOf(current)
    if (idx <= 0) return null
    return SCOPE_HIERARCHY[idx - 1]
  }
}

export function shouldConsolidate(lastConsolidation: number, intervalMs: number): boolean {
  return Date.now() - lastConsolidation >= intervalMs
}
