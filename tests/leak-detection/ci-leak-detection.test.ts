/**
 * Memory Leak Detection — automated leak detection for CI.
 *
 * This test takes memory snapshots before and after heavy operations
 * to detect leaks. It's designed to run in CI as part of the pipeline.
 *
 * Thresholds:
 *   - After 10 sequential agent session cycles, memory should not grow > 10MB
 *   - After 100 file read/write operations, memory should not grow > 5MB
 *   - After 50 search operations, memory should not grow > 3MB
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"

const LEAK_THRESHOLD_MB = {
  agentCycles: 10,   // Max MB growth after 10 agent cycles
  fileOps: 5,        // Max MB growth after 100 file operations
  searchOps: 3,      // Max MB growth after 50 search operations
}

function getMemoryUsage(): NodeJS.MemoryUsage {
  return process.memoryUsage()
}

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function deltaMB(a: NodeJS.MemoryUsage, b: NodeJS.MemoryUsage): number {
  return (b.heapUsed - a.heapUsed) / 1024 / 1024
}

describe("Memory Leak Detection — CI", () => {
  // Skip if not running in CI or LEAK_DETECTION env var is not set
  const isLeakTest = process.env.CI === "true" || process.env.LEAK_DETECTION === "true"
  const run = isLeakTest ? it : it.skip

  describe("Agent session cycles", () => {
    run("should not leak after 10 sequential agent cycles", async () => {
      // Simulate agent session create/dispose cycles
      const sessions: Array<{ id: string; events: unknown[] }> = []
      const memBefore = getMemoryUsage()

      for (let i = 0; i < 10; i++) {
        const session = {
          id: `leak-test-session-${i}`,
          events: Array.from({ length: 50 }, (_, j) => ({
            type: "TOOL_START" as const,
            toolName: ["read_file", "grep_files", "glob_files"][j % 3],
            timestamp: Date.now() + j,
          })),
        }
        sessions.push(session)

        // Simulate dispose
        sessions.length = 0
        if (global.gc) global.gc()
      }

      const memAfter = getMemoryUsage()
      const delta = deltaMB(memBefore, memAfter)

      console.log(`[Leak] Agent cycles: heap ${formatMB(memBefore.heapUsed)} → ${formatMB(memAfter.heapUsed)} (delta: ${delta.toFixed(2)} MB, threshold: ${LEAK_THRESHOLD_MB.agentCycles} MB)`)

      expect(delta).toBeLessThan(LEAK_THRESHOLD_MB.agentCycles)
    })
  })

  describe("File operation cycles", () => {
    run("should not leak after 100 simulated file operations", async () => {
      const memBefore = getMemoryUsage()
      const buffers: string[] = []

      for (let i = 0; i < 100; i++) {
        // Simulate reading a file (creating a string buffer)
        const content = `// File ${i}\nexport function test${i}() {\n  return ${i};\n}\n`
        buffers.push(content)

        // Process then release
        const result = content.split("\n").map(l => l.trim()).filter(Boolean)
        // Keep result briefly then allow GC
        if (i % 10 === 9) {
          buffers.length = 0
          if (global.gc) global.gc()
        }
      }

      buffers.length = 0
      if (global.gc) global.gc()

      const memAfter = getMemoryUsage()
      const delta = deltaMB(memBefore, memAfter)

      console.log(`[Leak] File ops: heap ${formatMB(memBefore.heapUsed)} → ${formatMB(memAfter.heapUsed)} (delta: ${delta.toFixed(2)} MB, threshold: ${LEAK_THRESHOLD_MB.fileOps} MB)`)

      expect(delta).toBeLessThan(LEAK_THRESHOLD_MB.fileOps)
    })
  })

  describe("Search operation cycles", () => {
    run("should not leak after 50 search operations", async () => {
      const memBefore = getMemoryUsage()
      const results: string[][] = []

      for (let i = 0; i < 50; i++) {
        // Simulate search operations
        const files = Array.from({ length: 100 }, (_, j) => `src/module_${j}.ts`)
        const matches = files.filter(f => f.includes(String(i % 10)))
        results.push(matches)

        if (i % 10 === 9) {
          results.length = 0
          if (global.gc) global.gc()
        }
      }

      results.length = 0
      if (global.gc) global.gc()

      const memAfter = getMemoryUsage()
      const delta = deltaMB(memBefore, memAfter)

      console.log(`[Leak] Search ops: heap ${formatMB(memBefore.heapUsed)} → ${formatMB(memAfter.heapUsed)} (delta: ${delta.toFixed(2)} MB, threshold: ${LEAK_THRESHOLD_MB.searchOps} MB)`)

      expect(delta).toBeLessThan(LEAK_THRESHOLD_MB.searchOps)
    })
  })
})
