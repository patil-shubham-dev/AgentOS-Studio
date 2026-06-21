import { describe, it, expect, beforeEach } from "vitest"
import { ToolExecutionScheduler, type ToolCallEntry, type ToolExecutionGroup } from "@/runtime/tools/execution/ToolExecutionScheduler"

describe("ToolExecutionScheduler", () => {
  let scheduler: ToolExecutionScheduler

  beforeEach(() => {
    scheduler = ToolExecutionScheduler.getInstance()
  })

  function makeTool(name: string, id = `tool-${Math.random().toString(36).slice(2, 6)}`): ToolCallEntry {
    return { id, name, args: {} }
  }

  describe("schedule", () => {
    it("returns empty array for no tools", () => {
      const groups = scheduler.schedule([])
      expect(groups).toEqual([])
    })

    it("groups multiple read tools together", () => {
      const tools = [
        makeTool("read_file"),
        makeTool("grep_files"),
        makeTool("glob_files"),
      ]
      const groups = scheduler.schedule(tools)
      expect(groups.length).toBe(1)
      expect(groups[0].type).toBe("read")
      expect(groups[0].tools.length).toBe(3)
    })

    it("separates write tools into their own groups", () => {
      const tools = [
        makeTool("read_file"),
        makeTool("write_file"),
        makeTool("edit_file"),
      ]
      const groups = scheduler.schedule(tools)

      // read_file should be a read group, then write_file, then edit_file
      expect(groups.length).toBe(3)
      expect(groups[0].type).toBe("read")
      expect(groups[0].tools.length).toBe(1)
      expect(groups[0].tools[0].name).toBe("read_file")
      expect(groups[1].type).toBe("write")
      expect(groups[1].tools[0].name).toBe("write_file")
      expect(groups[2].type).toBe("write")
      expect(groups[2].tools[0].name).toBe("edit_file")
    })

    it("puts browser tools in their own sequential groups", () => {
      const tools = [
        makeTool("read_file"),
        makeTool("browser_navigate"),
        makeTool("browser_click"),
      ]
      const groups = scheduler.schedule(tools)

      // read_file → read group, browser_navigate alone, browser_click alone
      expect(groups.length).toBe(3)
      expect(groups[0].type).toBe("read")
      expect(groups[1].type).toBe("browser")
      expect(groups[2].type).toBe("browser")
    })

    it("accumulates reads before a write tool", () => {
      const tools = [
        makeTool("read_file"),
        makeTool("grep_files"),
        makeTool("write_file"),
        makeTool("glob_files"),
      ]
      const groups = scheduler.schedule(tools)

      // read_file + grep_files → read group, write_file alone, glob_files → read group
      expect(groups.length).toBe(3)
      expect(groups[0].type).toBe("read")
      expect(groups[0].tools.length).toBe(2)
      expect(groups[1].type).toBe("write")
      expect(groups[2].type).toBe("read")
      expect(groups[2].tools.length).toBe(1)
    })

    it("creates unique group indices", () => {
      const tools = [
        makeTool("read_file"),
        makeTool("write_file"),
        makeTool("read_file"),
      ]
      const groups = scheduler.schedule(tools)
      const indices = groups.map((g) => g.groupIndex)
      const unique = new Set(indices)
      expect(unique.size).toBe(groups.length)
    })
  })

  describe("getConcurrencyLimit", () => {
    it("returns positive number", () => {
      const limit = scheduler.getConcurrencyLimit()
      expect(limit).toBeGreaterThan(0)
      expect(Number.isInteger(limit)).toBe(true)
    })
  })

  describe("singleton", () => {
    it("returns same instance", () => {
      const instance1 = ToolExecutionScheduler.getInstance()
      const instance2 = ToolExecutionScheduler.getInstance()
      expect(instance1).toBe(instance2)
    })
  })
})
