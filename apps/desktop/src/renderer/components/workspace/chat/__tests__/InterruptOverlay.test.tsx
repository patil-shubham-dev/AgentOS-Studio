import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"

describe("InterruptOverlay", () => {
  let InterruptOverlay: any

  beforeEach(async () => {
    vi.resetModules()
    vi.mock("framer-motion", () => ({
      motion: new Proxy({}, { get: () => "div" }),
      AnimatePresence: ({ children }: any) => children,
    }))
    const mod = await import("../InterruptOverlay")
    InterruptOverlay = mod.InterruptOverlay
  })

  it("should export component", () => {
    expect(InterruptOverlay).toBeDefined()
  })

  it("should create element when closed", () => {
    expect(() => React.createElement(InterruptOverlay, {
      open: false,
      onSendCorrection: vi.fn(),
      onDismiss: vi.fn(),
      isProcessing: false,
    })).not.toThrow()
  })

  it("should create element when open", () => {
    expect(() => React.createElement(InterruptOverlay, {
      open: true,
      onSendCorrection: vi.fn(),
      onDismiss: vi.fn(),
      isProcessing: false,
    })).not.toThrow()
  })

  it("should create element in processing state", () => {
    expect(() => React.createElement(InterruptOverlay, {
      open: true,
      onSendCorrection: vi.fn(),
      onDismiss: vi.fn(),
      isProcessing: true,
    })).not.toThrow()
  })
})
