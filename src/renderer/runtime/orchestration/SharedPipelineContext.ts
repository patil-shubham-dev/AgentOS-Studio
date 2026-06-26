import type { TaskId } from "./types"
import crypto from "crypto"

export type ContextSlotType =
  | "workspace_summary"
  | "file_content"
  | "git_context"
  | "memory_summary"
  | "task_output"
  | "project_rules"
  | "tool_results"
  | "agent_scratchpad"
  | "environment_info"
  | "custom"

export interface ContextSlot {
  id: string
  type: ContextSlotType
  key: string
  content: string
  version: number
  size: number
  ttl: number
  createdAt: number
  producerTaskId?: TaskId
  tags: string[]
  checksum: string
}

export interface ContextSlotRequirement {
  type: ContextSlotType
  key?: string
  optional: boolean
}

export interface ContextSlotProduction {
  type: ContextSlotType
  key: string
  ttl: number
}

export interface ContextSlice {
  taskId: TaskId
  slots: ContextSlot[]
  totalTokens: number
  missingOptionalSlots: string[]
  deduplicatedSlots: number
  totalTokensSaved: number
}

export interface PipelineContextStats {
  totalSlots: number
  totalTokens: number
  deduplicatedWrites: number
  totalTokensSaved: number
  cacheHits: number
  cacheMisses: number
  hitRate: number
  activeProducers: number
  activeConsumers: number
}

function computeChecksum(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex")
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export class SharedPipelineContext {
  private slots = new Map<string, ContextSlot>()
  private producers = new Map<TaskId, ContextSlotProduction[]>()
  private consumers = new Map<TaskId, ContextSlotRequirement[]>()
  private contentStore = new Map<string, string>()
  private contentRefCount = new Map<string, Set<string>>()
  private hits = 0
  private misses = 0
  private dedupWrites = 0
  private tokensSaved = 0

  private slotKey(type: ContextSlotType, key: string): string {
    return `${type}:${key}`
  }

  registerProducer(taskId: TaskId, productions: ContextSlotProduction[]): void {
    this.producers.set(taskId, productions)
  }

  registerConsumer(taskId: TaskId, requirements: ContextSlotRequirement[]): void {
    this.consumers.set(taskId, requirements)
  }

  unregisterProducer(taskId: TaskId): void {
    this.producers.delete(taskId)
  }

  unregisterConsumer(taskId: TaskId): void {
    this.consumers.delete(taskId)
  }

  getProductions(taskId: TaskId): ContextSlotProduction[] {
    return this.producers.get(taskId) ?? []
  }

  getRequirements(taskId: TaskId): ContextSlotRequirement[] {
    return this.consumers.get(taskId) ?? []
  }

  setSlot(slot: Omit<ContextSlot, "id" | "checksum" | "createdAt">): ContextSlot {
    const existingChecksum = computeChecksum(slot.content)
    const existing = this.getSlot(slot.type, slot.key)

    if (existing) {
      if (existing.checksum === existingChecksum) {
        this.dedupWrites++
        this.tokensSaved += slot.size
        existing.version = slot.version
        existing.ttl = slot.ttl
        existing.tags = [...new Set([...existing.tags, ...slot.tags])]
        if (slot.producerTaskId) {
          existing.producerTaskId = slot.producerTaskId
        }
        return existing
      }
      this.removeSlot(slot.type, slot.key)
    }

    const full: ContextSlot = {
      ...slot,
      id: `${slot.type}_${slot.key}_${Date.now()}`,
      checksum: existingChecksum,
      createdAt: Date.now(),
    }

    this.slots.set(this.slotKey(slot.type, slot.key), full)

    const checksum = full.checksum
    if (!this.contentStore.has(checksum)) {
      this.contentStore.set(checksum, slot.content)
    }
    if (!this.contentRefCount.has(checksum)) {
      this.contentRefCount.set(checksum, new Set())
    }
    this.contentRefCount.get(checksum)!.add(this.slotKey(slot.type, slot.key))

    return full
  }

  getSlot(type: ContextSlotType, key: string): ContextSlot | undefined {
    const slot = this.slots.get(this.slotKey(type, key))
    if (!slot) return undefined
    if (this.isExpired(slot)) {
      this.slots.delete(this.slotKey(type, key))
      return undefined
    }
    return slot
  }

  getContent(type: ContextSlotType, key: string): string | undefined {
    const slot = this.getSlot(type, key)
    if (!slot) return undefined
    this.hits++
    return this.contentStore.get(slot.checksum) ?? slot.content
  }

  collectContext(taskId: TaskId): ContextSlice {
    const requirements = this.consumers.get(taskId) ?? []
    const slots: ContextSlot[] = []
    const missingOptionalSlots: string[] = []
    let totalTokens = 0
    let dedupCount = 0

    const seenChecksums = new Set<string>()

    for (const req of requirements) {
      if (req.key) {
        const slot = this.getSlot(req.type, req.key)
        if (slot) {
          if (!seenChecksums.has(slot.checksum)) {
            seenChecksums.add(slot.checksum)
            slots.push(slot)
            totalTokens += slot.size
          } else {
            dedupCount++
            this.tokensSaved += slot.size
          }
        } else if (!req.optional) {
          this.misses++
        } else {
          missingOptionalSlots.push(`${req.type}:${req.key}`)
        }
      } else {
        const matchingSlots = this.getAllSlotsByType(req.type)
        for (const slot of matchingSlots) {
          if (!seenChecksums.has(slot.checksum)) {
            seenChecksums.add(slot.checksum)
            slots.push(slot)
            totalTokens += slot.size
          } else {
            dedupCount++
            this.tokensSaved += slot.size
          }
        }
        if (matchingSlots.length === 0 && !req.optional) {
          this.misses++
        } else if (matchingSlots.length === 0 && req.optional) {
          missingOptionalSlots.push(`${req.type}:*`)
        }
      }
    }

    const totalSaved = this.tokensSaved

    return {
      taskId,
      slots,
      totalTokens,
      missingOptionalSlots,
      deduplicatedSlots: dedupCount,
      totalTokensSaved: totalSaved,
    }
  }

  invalidateTaskSlots(taskId: TaskId): void {
    const productions = this.producers.get(taskId)
    if (!productions) return

    for (const prod of productions) {
      this.removeSlot(prod.type, prod.key)
    }
  }

  removeSlot(type: ContextSlotType, key: string): void {
    const sk = this.slotKey(type, key)
    const slot = this.slots.get(sk)
    if (slot) {
      const refs = this.contentRefCount.get(slot.checksum)
      if (refs) {
        refs.delete(sk)
        if (refs.size === 0) {
          this.contentStore.delete(slot.checksum)
          this.contentRefCount.delete(slot.checksum)
        }
      }
      this.slots.delete(sk)
    }
  }

  clear(): void {
    this.slots.clear()
    this.contentStore.clear()
    this.contentRefCount.clear()
    this.producers.clear()
    this.consumers.clear()
    this.hits = 0
    this.misses = 0
    this.dedupWrites = 0
    this.tokensSaved = 0
  }

  getStats(): PipelineContextStats {
    const totalTokens = Array.from(this.slots.values()).reduce((sum, s) => sum + s.size, 0)
    const total = this.hits + this.misses
    return {
      totalSlots: this.slots.size,
      totalTokens,
      deduplicatedWrites: this.dedupWrites,
      totalTokensSaved: this.tokensSaved,
      cacheHits: this.hits,
      cacheMisses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      activeProducers: this.producers.size,
      activeConsumers: this.consumers.size,
    }
  }

  getAllSlots(): ContextSlot[] {
    return Array.from(this.slots.values())
  }

  private getAllSlotsByType(type: ContextSlotType): ContextSlot[] {
    return Array.from(this.slots.values()).filter(
      (s) => s.type === type && !this.isExpired(s)
    )
  }

  private isExpired(slot: ContextSlot): boolean {
    if (slot.ttl <= 0) return false
    return Date.now() - slot.createdAt > slot.ttl
  }

  get size(): number {
    return this.slots.size
  }

  get contentSize(): number {
    return this.contentStore.size
  }
}
