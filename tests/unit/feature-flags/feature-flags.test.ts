import { describe, it, expect } from "vitest"
import {
  isFeatureEnabled,
  getDefaultFlags,
  getDisabledFutureIslandFlags,
  type RuntimeFeatureFlag,
} from "@/app/feature-flags"

describe("RuntimeFeatureFlags", () => {
  describe("isFeatureEnabled defaults", () => {
    it("has codingCore enabled by default", () => {
      expect(isFeatureEnabled("codingCore")).toBe(true)
    })

    it("has browserIsland disabled by default", () => {
      expect(isFeatureEnabled("browserIsland")).toBe(false)
    })

    it("has designIsland disabled by default", () => {
      expect(isFeatureEnabled("designIsland")).toBe(false)
    })

    it("has deviceControlIsland disabled by default", () => {
      expect(isFeatureEnabled("deviceControlIsland")).toBe(false)
    })

    it("has browserToolsInCoding disabled by default", () => {
      expect(isFeatureEnabled("browserToolsInCoding")).toBe(false)
    })

    it("has designToolsInCoding disabled by default", () => {
      expect(isFeatureEnabled("designToolsInCoding")).toBe(false)
    })

    it("has deviceToolsInCoding disabled by default", () => {
      expect(isFeatureEnabled("deviceToolsInCoding")).toBe(false)
    })

    it("has browserContextInCoding disabled by default", () => {
      expect(isFeatureEnabled("browserContextInCoding")).toBe(false)
    })

    it("has designContextInCoding disabled by default", () => {
      expect(isFeatureEnabled("designContextInCoding")).toBe(false)
    })

    it("has deviceContextInCoding disabled by default", () => {
      expect(isFeatureEnabled("deviceContextInCoding")).toBe(false)
    })

    it("has advancedAgents disabled by default", () => {
      expect(isFeatureEnabled("advancedAgents")).toBe(false)
    })

    it("has longTermMemory disabled by default", () => {
      expect(isFeatureEnabled("longTermMemory")).toBe(false)
    })

    it("has plugins disabled by default", () => {
      expect(isFeatureEnabled("plugins")).toBe(false)
    })

    it("has mcp disabled by default", () => {
      expect(isFeatureEnabled("mcp")).toBe(false)
    })
  })

  describe("isFeatureEnabled", () => {
    it("returns true for codingCore", () => {
      expect(isFeatureEnabled("codingCore")).toBe(true)
    })

    it("returns false for browserIsland", () => {
      expect(isFeatureEnabled("browserIsland")).toBe(false)
    })

    it("returns false for deviceControlIsland", () => {
      expect(isFeatureEnabled("deviceControlIsland")).toBe(false)
    })
  })

  describe("getDefaultFlags", () => {
    it("returns a copy of the default flags", () => {
      const flags = getDefaultFlags()
      expect(flags.codingCore).toBe(true)
      expect(flags.browserIsland).toBe(false)
      expect(flags.designIsland).toBe(false)
      expect(flags.deviceControlIsland).toBe(false)
    })
  })

  describe("getDisabledFutureIslandFlags", () => {
    it("forces all future island flags to false", () => {
      const flags = getDisabledFutureIslandFlags()
      expect(flags.browserIsland).toBe(false)
      expect(flags.designIsland).toBe(false)
      expect(flags.deviceControlIsland).toBe(false)
      expect(flags.browserToolsInCoding).toBe(false)
      expect(flags.designToolsInCoding).toBe(false)
      expect(flags.deviceToolsInCoding).toBe(false)
      expect(flags.browserContextInCoding).toBe(false)
      expect(flags.designContextInCoding).toBe(false)
      expect(flags.deviceContextInCoding).toBe(false)
    })
  })
})
