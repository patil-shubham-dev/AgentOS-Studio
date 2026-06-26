import { describe, it, expect } from "vitest"
import {
  canTransition,
  isTerminalStatus,
  isActiveStatus,
  createTaskId,
  PRIORITY_ORDER,
} from "./types"

describe("createTaskId", () => {
  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => createTaskId()))
    expect(ids.size).toBe(100)
  })

  it("starts with task_ prefix", () => {
    expect(createTaskId()).toMatch(/^task_/)
  })
})

describe("isTerminalStatus", () => {
  it("returns true for completed", () => {
    expect(isTerminalStatus("completed")).toBe(true)
  })

  it("returns true for failed", () => {
    expect(isTerminalStatus("failed")).toBe(true)
  })

  it("returns true for cancelled", () => {
    expect(isTerminalStatus("cancelled")).toBe(true)
  })

  it("returns false for active statuses", () => {
    expect(isTerminalStatus("pending")).toBe(false)
    expect(isTerminalStatus("ready")).toBe(false)
    expect(isTerminalStatus("running")).toBe(false)
    expect(isTerminalStatus("blocked")).toBe(false)
  })
})

describe("isActiveStatus", () => {
  it("returns true for non-terminal statuses", () => {
    expect(isActiveStatus("pending")).toBe(true)
    expect(isActiveStatus("ready")).toBe(true)
    expect(isActiveStatus("running")).toBe(true)
    expect(isActiveStatus("blocked")).toBe(true)
  })

  it("returns false for terminal statuses", () => {
    expect(isActiveStatus("completed")).toBe(false)
    expect(isActiveStatus("failed")).toBe(false)
    expect(isActiveStatus("cancelled")).toBe(false)
  })
})

describe("canTransition", () => {
  it("allows pending -> ready", () => {
    expect(canTransition("pending", "ready")).toBe(true)
  })

  it("allows pending -> cancelled", () => {
    expect(canTransition("pending", "cancelled")).toBe(true)
  })

  it("allows ready -> running", () => {
    expect(canTransition("ready", "running")).toBe(true)
  })

  it("allows ready -> blocked", () => {
    expect(canTransition("ready", "blocked")).toBe(true)
  })

  it("allows running -> completed", () => {
    expect(canTransition("running", "completed")).toBe(true)
  })

  it("allows running -> failed", () => {
    expect(canTransition("running", "failed")).toBe(true)
  })

  it("allows running -> cancelled", () => {
    expect(canTransition("running", "cancelled")).toBe(true)
  })

  it("allows pending -> blocked", () => {
    expect(canTransition("pending", "blocked")).toBe(true)
  })

  it("allows blocked -> ready", () => {
    expect(canTransition("blocked", "ready")).toBe(true)
  })

  it("allows failed -> pending (retry)", () => {
    expect(canTransition("failed", "pending")).toBe(true)
  })

  it("disallows completed -> any", () => {
    expect(canTransition("completed", "pending")).toBe(false)
    expect(canTransition("completed", "ready")).toBe(false)
    expect(canTransition("completed", "running")).toBe(false)
  })

  it("disallows cancelled -> any", () => {
    expect(canTransition("cancelled", "pending")).toBe(false)
    expect(canTransition("cancelled", "ready")).toBe(false)
  })

  it("disallows pending -> running (must go through ready)", () => {
    expect(canTransition("pending", "running")).toBe(false)
  })

  it("disallows pending -> completed", () => {
    expect(canTransition("pending", "completed")).toBe(false)
  })

  it("disallows running -> ready (no rollback)", () => {
    expect(canTransition("running", "ready")).toBe(false)
  })

  it("disallows completed -> failed", () => {
    expect(canTransition("completed", "failed")).toBe(false)
  })
})

describe("PRIORITY_ORDER", () => {
  it("orders critical first", () => {
    expect(PRIORITY_ORDER.critical).toBeLessThan(PRIORITY_ORDER.high)
    expect(PRIORITY_ORDER.high).toBeLessThan(PRIORITY_ORDER.normal)
    expect(PRIORITY_ORDER.normal).toBeLessThan(PRIORITY_ORDER.low)
  })
})
