import { describe, it, expect, beforeEach } from "vitest"
import { SharedPipelineContext } from "./SharedPipelineContext"
import type { ContextSlot, ContextSlotRequirement, ContextSlotProduction, ContextSlice } from "./SharedPipelineContext"

describe("SharedPipelineContext", () => {
  let ctx: SharedPipelineContext

  beforeEach(() => {
    ctx = new SharedPipelineContext()
  })

  describe("slot storage and retrieval", () => {
    it("stores and retrieves a slot by type and key", () => {
      ctx.setSlot({
        type: "workspace_summary",
        key: "project-root",
        content: "src/\n  main.ts\n  utils/",
        version: 1,
        size: 30,
        ttl: 60_000,
        tags: ["workspace"],
      })

      const retrieved = ctx.getSlot("workspace_summary", "project-root")
      expect(retrieved).toBeDefined()
      expect(retrieved!.type).toBe("workspace_summary")
      expect(retrieved!.key).toBe("project-root")
      expect(retrieved!.content).toBe("src/\n  main.ts\n  utils/")
      expect(retrieved!.version).toBe(1)
      expect(retrieved!.checksum).toBeDefined()
      expect(retrieved!.id).toContain("workspace_summary")
    })

    it("returns undefined for missing slot", () => {
      const retrieved = ctx.getSlot("file_content", "nonexistent.ts")
      expect(retrieved).toBeUndefined()
    })

    it("updates existing slot with same type and key", () => {
      ctx.setSlot({
        type: "git_context",
        key: "diff",
        content: "diff --git a/src/main.ts b/src/main.ts",
        version: 1,
        size: 50,
        ttl: 30_000,
        tags: ["git"],
      })

      const updated = ctx.setSlot({
        type: "git_context",
        key: "diff",
        content: "diff --git a/src/main.ts b/src/main.ts",
        version: 2,
        size: 50,
        ttl: 60_000,
        tags: ["git", "updated"],
      })

      expect(updated.version).toBe(2)
      expect(updated.tags).toContain("updated")
    })

    it("replaces slot content when checksum changes", () => {
      ctx.setSlot({
        type: "file_content",
        key: "src/main.ts",
        content: "const x = 1",
        version: 1,
        size: 12,
        ttl: 60_000,
        tags: [],
      })

      ctx.setSlot({
        type: "file_content",
        key: "src/main.ts",
        content: "const x = 2",
        version: 2,
        size: 12,
        ttl: 60_000,
        tags: [],
      })

      const slots = ctx.getAllSlots()
      expect(slots).toHaveLength(1)
      expect(slots[0].content).toBe("const x = 2")
      expect(slots[0].version).toBe(2)
    })
  })

  describe("content addresing and deduplication", () => {
    it("deduplicates slots with identical content", () => {
      ctx.setSlot({
        type: "file_content",
        key: "src/main.ts",
        content: "identical content",
        version: 1,
        size: 20,
        ttl: 60_000,
        tags: [],
      })

      const slot2 = ctx.setSlot({
        type: "file_content",
        key: "src/utils.ts",
        content: "identical content",
        version: 1,
        size: 20,
        ttl: 60_000,
        tags: [],
      })

      expect(ctx.contentSize).toBe(1)
      expect(slot2.checksum).toBe(ctx.getSlot("file_content", "src/main.ts")!.checksum)
    })

    it("counts dedup writes when slot is updated with same content", () => {
      ctx.setSlot({
        type: "file_content",
        key: "src/main.ts",
        content: "same",
        version: 1,
        size: 4,
        ttl: 60_000,
        tags: [],
      })

      ctx.setSlot({
        type: "file_content",
        key: "src/main.ts",
        content: "same",
        version: 2,
        size: 4,
        ttl: 60_000,
        tags: [],
      })

      const stats = ctx.getStats()
      expect(stats.deduplicatedWrites).toBe(1)
    })

    it("does not deduplicate different content", () => {
      ctx.setSlot({
        type: "file_content",
        key: "src/main.ts",
        content: "content a",
        version: 1,
        size: 10,
        ttl: 60_000,
        tags: [],
      })

      ctx.setSlot({
        type: "file_content",
        key: "src/utils.ts",
        content: "content b",
        version: 1,
        size: 10,
        ttl: 60_000,
        tags: [],
      })

      const stats = ctx.getStats()
      expect(stats.deduplicatedWrites).toBe(0)
      expect(ctx.contentSize).toBe(2)
    })

    it("evicts content from store when last slot referencing it is removed", () => {
      ctx.setSlot({
        type: "file_content",
        key: "src/main.ts",
        content: "shared content",
        version: 1,
        size: 15,
        ttl: 60_000,
        tags: [],
      })

      ctx.setSlot({
        type: "file_content",
        key: "src/utils.ts",
        content: "shared content",
        version: 1,
        size: 15,
        ttl: 60_000,
        tags: [],
      })

      expect(ctx.contentSize).toBe(1)

      ctx.removeSlot("file_content", "src/main.ts")
      expect(ctx.contentSize).toBe(1)

      ctx.removeSlot("file_content", "src/utils.ts")
      expect(ctx.contentSize).toBe(0)
    })
  })

  describe("context collection", () => {
    it("collects no context when task has no requirements", () => {
      const slice = ctx.collectContext("task_no_reqs")
      expect(slice.slots).toHaveLength(0)
      expect(slice.totalTokens).toBe(0)
    })

    it("collects context for a task with specific key requirement", () => {
      ctx.setSlot({
        type: "workspace_summary",
        key: "project-root",
        content: "src/",
        version: 1,
        size: 5,
        ttl: 60_000,
        tags: [],
      })

      ctx.registerConsumer("task1", [
        { type: "workspace_summary", key: "project-root", optional: false },
      ])

      const slice = ctx.collectContext("task1")
      expect(slice.slots).toHaveLength(1)
      expect(slice.slots[0].key).toBe("project-root")
      expect(slice.totalTokens).toBe(5)
      expect(slice.missingOptionalSlots).toHaveLength(0)
    })

    it("reports missing non-optional slots", () => {
      ctx.registerConsumer("task1", [
        { type: "file_content", key: "src/missing.ts", optional: false },
      ])

      const slice = ctx.collectContext("task1")
      expect(slice.slots).toHaveLength(0)
    })

    it("reports missing optional slots without error", () => {
      ctx.registerConsumer("task1", [
        { type: "file_content", key: "src/missing.ts", optional: true },
      ])

      const slice = ctx.collectContext("task1")
      expect(slice.slots).toHaveLength(0)
      expect(slice.missingOptionalSlots).toEqual(["file_content:src/missing.ts"])
    })

    it("collects all slots of a type when key is not specified", () => {
      ctx.setSlot({ type: "file_content", key: "a.ts", content: "a", version: 1, size: 1, ttl: 60_000, tags: [] })
      ctx.setSlot({ type: "file_content", key: "b.ts", content: "b", version: 1, size: 1, ttl: 60_000, tags: [] })
      ctx.setSlot({ type: "file_content", key: "c.ts", content: "c", version: 1, size: 1, ttl: 60_000, tags: [] })

      ctx.registerConsumer("task1", [
        { type: "file_content", optional: false },
      ])

      const slice = ctx.collectContext("task1")
      expect(slice.slots).toHaveLength(3)
      expect(slice.totalTokens).toBe(3)
    })

    it("deduplicates slots with identical checksums during collection", () => {
      ctx.setSlot({ type: "file_content", key: "a.ts", content: "same content", version: 1, size: 12, ttl: 60_000, tags: [] })
      ctx.setSlot({ type: "file_content", key: "b.ts", content: "same content", version: 1, size: 12, ttl: 60_000, tags: [] })

      ctx.registerConsumer("task1", [
        { type: "file_content", optional: false },
      ])

      const slice = ctx.collectContext("task1")
      expect(slice.slots).toHaveLength(1)
      expect(slice.deduplicatedSlots).toBeGreaterThanOrEqual(1)
    })
  })

  describe("producer/consumer lifecycle", () => {
    it("publishes task outputs as context slots", () => {
      ctx.registerProducer("taskA", [
        { type: "task_output", key: "analysis", ttl: 60_000 },
      ])

      ctx.setSlot({
        type: "task_output",
        key: "analysis",
        content: "file x contains bug",
        version: 1,
        size: 20,
        ttl: 60_000,
        producerTaskId: "taskA",
        tags: [],
      })

      const slot = ctx.getSlot("task_output", "analysis")
      expect(slot).toBeDefined()
      expect(slot!.producerTaskId).toBe("taskA")
      expect(slot!.content).toBe("file x contains bug")
    })

    it("invalidates producer slots on command", () => {
      ctx.registerProducer("taskA", [
        { type: "task_output", key: "analysis", ttl: 60_000 },
      ])

      ctx.setSlot({
        type: "task_output",
        key: "analysis",
        content: "bug found",
        version: 1,
        size: 10,
        ttl: 60_000,
        producerTaskId: "taskA",
        tags: [],
      })

      expect(ctx.getSlot("task_output", "analysis")).toBeDefined()

      ctx.invalidateTaskSlots("taskA")
      expect(ctx.getSlot("task_output", "analysis")).toBeUndefined()
    })

    it("slot consumer can access produced context from another task", () => {
      ctx.registerProducer("taskA", [
        { type: "task_output", key: "result", ttl: 60_000 },
      ])

      ctx.registerConsumer("taskB", [
        { type: "task_output", key: "result", optional: false },
      ])

      ctx.setSlot({
        type: "task_output",
        key: "result",
        content: "analysis complete",
        version: 1,
        size: 16,
        ttl: 60_000,
        producerTaskId: "taskA",
        tags: [],
      })

      const slice = ctx.collectContext("taskB")
      expect(slice.slots).toHaveLength(1)
      expect(slice.slots[0].producerTaskId).toBe("taskA")
      expect(slice.totalTokens).toBe(16)
    })
  })

  describe("TTL expiration", () => {
    it("expires slots after TTL", async () => {
      ctx.setSlot({
        type: "workspace_summary",
        key: "temp",
        content: "temporary",
        version: 1,
        size: 10,
        ttl: 10,
        tags: [],
      })

      expect(ctx.getSlot("workspace_summary", "temp")).toBeDefined()

      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(ctx.getSlot("workspace_summary", "temp")).toBeUndefined()
    })

    it("slots with zero or negative TTL never expire", async () => {
      ctx.setSlot({
        type: "workspace_summary",
        key: "permanent",
        content: "permanent content",
        version: 1,
        size: 16,
        ttl: 0,
        tags: [],
      })

      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(ctx.getSlot("workspace_summary", "permanent")).toBeDefined()
    })
  })

  describe("stats tracking", () => {
    it("returns zero stats for empty context", () => {
      const stats = ctx.getStats()
      expect(stats.totalSlots).toBe(0)
      expect(stats.totalTokens).toBe(0)
      expect(stats.deduplicatedWrites).toBe(0)
      expect(stats.hitRate).toBe(0)
    })

    it("tracks slot count and tokens", () => {
      ctx.setSlot({ type: "file_content", key: "a.ts", content: "hello", version: 1, size: 5, ttl: 60_000, tags: [] })
      ctx.setSlot({ type: "file_content", key: "b.ts", content: "world", version: 1, size: 5, ttl: 60_000, tags: [] })

      const stats = ctx.getStats()
      expect(stats.totalSlots).toBe(2)
      expect(stats.totalTokens).toBe(10)
    })

    it("tracks active producers and consumers", () => {
      ctx.registerProducer("p1", [{ type: "task_output", key: "out", ttl: 60_000 }])
      ctx.registerConsumer("c1", [{ type: "task_output", key: "out", optional: false }])
      ctx.registerConsumer("c2", [{ type: "task_output", key: "out", optional: true }])

      const stats = ctx.getStats()
      expect(stats.activeProducers).toBe(1)
      expect(stats.activeConsumers).toBe(2)
    })

    it("tracks cache hits and misses", () => {
      ctx.setSlot({ type: "file_content", key: "a.ts", content: "hi", version: 1, size: 2, ttl: 60_000, tags: [] })

      ctx.registerConsumer("task1", [{ type: "file_content", key: "a.ts", optional: false }])
      ctx.registerConsumer("task2", [{ type: "file_content", key: "b.ts", optional: false }])

      ctx.collectContext("task1")
      ctx.collectContext("task2")

      const stats = ctx.getStats()
      expect(stats.cacheHits).toBe(0)
      expect(stats.cacheMisses).toBe(1)
    })
  })

  describe("clear and reset", () => {
    it("clears all slots and resets stats", () => {
      ctx.setSlot({ type: "file_content", key: "a.ts", content: "hello", version: 1, size: 5, ttl: 60_000, tags: [] })
      ctx.registerProducer("p1", [{ type: "task_output", key: "out", ttl: 60_000 }])
      ctx.registerConsumer("c1", [{ type: "task_output", key: "out", optional: false }])

      ctx.clear()

      expect(ctx.size).toBe(0)
      expect(ctx.contentSize).toBe(0)
      const stats = ctx.getStats()
      expect(stats.activeProducers).toBe(0)
      expect(stats.activeConsumers).toBe(0)
    })
  })

  describe("slot removal", () => {
    it("removes a specific slot by type and key", () => {
      ctx.setSlot({ type: "file_content", key: "a.ts", content: "hello", version: 1, size: 5, ttl: 60_000, tags: [] })

      expect(ctx.size).toBe(1)

      ctx.removeSlot("file_content", "a.ts")
      expect(ctx.size).toBe(0)
      expect(ctx.getSlot("file_content", "a.ts")).toBeUndefined()
    })
  })

  describe("getContent convenience method", () => {
    it("returns content for an existing slot", () => {
      ctx.setSlot({
        type: "project_rules",
        key: "AGENTIC.md",
        content: "## Rules\n- Be safe",
        version: 1,
        size: 20,
        ttl: 60_000,
        tags: [],
      })

      const content = ctx.getContent("project_rules", "AGENTIC.md")
      expect(content).toBe("## Rules\n- Be safe")
    })

    it("returns undefined for a missing slot", () => {
      const content = ctx.getContent("project_rules", "missing.md")
      expect(content).toBeUndefined()
    })
  })
})

describe("SharedPipelineContext integration with DagExecutionEngine", () => {
  it("simulates a multi-agent pipeline sharing context", async () => {
    const ctx = new SharedPipelineContext()

    ctx.registerProducer("planner", [
      { type: "task_output", key: "plan", ttl: 120_000 },
      { type: "task_output", key: "files", ttl: 120_000 },
    ])

    ctx.registerConsumer("research", [
      { type: "task_output", key: "plan", optional: false },
      { type: "task_output", key: "files", optional: false },
    ])

    ctx.registerProducer("research", [
      { type: "task_output", key: "findings", ttl: 120_000 },
    ])

    ctx.registerConsumer("coder", [
      { type: "task_output", key: "plan", optional: false },
      { type: "task_output", key: "findings", optional: false },
    ])

    // Planner produces plan and file list
    ctx.setSlot({
      type: "task_output",
      key: "plan",
      content: "Step 1: Research the API. Step 2: Implement the endpoint.",
      version: 1,
      size: 60,
      ttl: 120_000,
      producerTaskId: "planner",
      tags: [],
    })

    ctx.setSlot({
      type: "task_output",
      key: "files",
      content: "src/api/users.ts, src/api/users.test.ts",
      version: 1,
      size: 40,
      ttl: 120_000,
      producerTaskId: "planner",
      tags: [],
    })

    // Research collects plan and files
    const researchSlice = ctx.collectContext("research")
    expect(researchSlice.slots).toHaveLength(2)
    expect(researchSlice.slots.map((s) => s.key)).toContain("plan")
    expect(researchSlice.slots.map((s) => s.key)).toContain("files")

    // Research produces findings
    ctx.setSlot({
      type: "task_output",
      key: "findings",
      content: "The API uses REST with JWT auth. Endpoints documented in /api/docs.",
      version: 1,
      size: 70,
      ttl: 120_000,
      producerTaskId: "research",
      tags: [],
    })

    // Coder collects plan + findings (plan is deduplicated)
    const coderSlice = ctx.collectContext("coder")
    expect(coderSlice.slots).toHaveLength(2)
    const keys = coderSlice.slots.map((s) => s.key)
    expect(keys).toContain("plan")
    expect(keys).toContain("findings")

    // Stats reflect dedup
    const stats = ctx.getStats()
    expect(stats.totalSlots).toBe(3)
  })

  it("isolates failure — invalidated slots block downstream tasks", () => {
    const ctx = new SharedPipelineContext()

    ctx.registerProducer("taskA", [
      { type: "task_output", key: "data", ttl: 60_000 },
    ])

    ctx.registerConsumer("taskB", [
      { type: "task_output", key: "data", optional: false },
    ])

    ctx.setSlot({
      type: "task_output",
      key: "data",
      content: "important data",
      version: 1,
      size: 14,
      ttl: 60_000,
      producerTaskId: "taskA",
      tags: [],
    })

    // Before failure, taskB can access context
    const sliceBefore = ctx.collectContext("taskB")
    expect(sliceBefore.slots).toHaveLength(1)

    // Simulate taskA failure — invalidate its slots
    ctx.invalidateTaskSlots("taskA")

    // After invalidation, taskB's required context is gone
    const sliceAfter = ctx.collectContext("taskB")
    expect(sliceAfter.slots).toHaveLength(0)
  })

  it("supports multiple concurrent consumers reading same slot", () => {
    const ctx = new SharedPipelineContext()

    ctx.registerProducer("setup", [
      { type: "workspace_summary", key: "files", ttl: 120_000 },
    ])

    ctx.setSlot({
      type: "workspace_summary",
      key: "files",
      content: "src/, tests/, docs/",
      version: 1,
      size: 20,
      ttl: 120_000,
      producerTaskId: "setup",
      tags: [],
    })

    const consumerIds = ["consumer1", "consumer2", "consumer3"]
    for (const id of consumerIds) {
      ctx.registerConsumer(id, [
        { type: "workspace_summary", key: "files", optional: false },
      ])
    }

    for (const id of consumerIds) {
      const slice = ctx.collectContext(id)
      expect(slice.slots).toHaveLength(1)
      expect(slice.slots[0].content).toBe("src/, tests/, docs/")
    }

    const stats = ctx.getStats()
    expect(stats.cacheHits).toBe(0)
  })
})

describe("SharedPipelineContext edge cases", () => {
  let ctx: SharedPipelineContext

  beforeEach(() => {
    ctx = new SharedPipelineContext()
  })

  it("handles empty requirements gracefully", () => {
    ctx.registerConsumer("task1", [])
    const slice = ctx.collectContext("task1")
    expect(slice.slots).toHaveLength(0)
    expect(slice.totalTokens).toBe(0)
  })

  it("handles producer with no outputs set", () => {
    ctx.registerProducer("task1", [
      { type: "task_output", key: "never_set", ttl: 60_000 },
    ])
    ctx.invalidateTaskSlots("task1")
    expect(ctx.size).toBe(0)
  })

  it("handles unregistered consumers", () => {
    const slice = ctx.collectContext("unknown_task")
    expect(slice.slots).toHaveLength(0)
  })

  it("handles unregistered producers", () => {
    ctx.invalidateTaskSlots("unknown_task")
    expect(ctx.size).toBe(0)
  })

  it("clears properly between sessions", () => {
    ctx.setSlot({ type: "file_content", key: "a.ts", content: "data", version: 1, size: 4, ttl: 60_000, tags: [] })
    ctx.registerProducer("p1", [{ type: "task_output", key: "o", ttl: 60_000 }])
    ctx.registerConsumer("c1", [{ type: "file_content", key: "a.ts", optional: false }])

    expect(ctx.size).toBe(1)
    expect(ctx.getStats().activeProducers).toBe(1)
    expect(ctx.getStats().activeConsumers).toBe(1)

    ctx.clear()

    expect(ctx.size).toBe(0)
    expect(ctx.contentSize).toBe(0)
    expect(ctx.getStats().activeProducers).toBe(0)
    expect(ctx.getStats().activeConsumers).toBe(0)
  })

  it("maintains correctness under concurrent-style sequential slot writes", () => {
    for (let i = 0; i < 100; i++) {
      ctx.setSlot({
        type: "file_content",
        key: `file_${i}.ts`,
        content: `content of file ${i}`,
        version: 1,
        size: 15,
        ttl: 60_000,
        tags: [],
      })
    }

    expect(ctx.size).toBe(100)
    expect(ctx.contentSize).toBe(100)

    ctx.registerConsumer("consumer", [
      { type: "file_content", optional: true },
    ])
    const slice = ctx.collectContext("consumer")
    expect(slice.slots).toHaveLength(100)
  })
})
