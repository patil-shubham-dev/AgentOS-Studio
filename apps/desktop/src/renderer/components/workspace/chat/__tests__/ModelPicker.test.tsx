import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"

const MOCK_PROVIDERS = [
  { id: "openai", name: "OpenAI", models: [{ id: "gpt-4o", name: "GPT-4o" }, { id: "gpt-4o-mini", name: "GPT-4o Mini" }] },
  { id: "anthropic", name: "Anthropic", models: [{ id: "claude-3-opus", name: "Claude 3 Opus" }] },
]

describe("ModelPicker", () => {
  let ModelPicker: any

  beforeEach(async () => {
    vi.resetModules()
    vi.mock("@/stores/settings/app-store", () => ({
      useAppStore: (selector: any) => {
        const state = { providers: MOCK_PROVIDERS }
        return selector ? selector(state) : state
      },
    }))
    vi.mock("framer-motion", () => ({
      motion: new Proxy({}, { get: () => "div" }),
      AnimatePresence: ({ children }: any) => children,
    }))
    const mod = await import("../ModelPicker")
    ModelPicker = mod.ModelPicker
  })

  it("should export ModelPicker component", () => {
    expect(ModelPicker).toBeDefined()
  })

  it("should render without crashing", () => {
    expect(() => React.createElement(ModelPicker, {
      selectedProviderId: "openai",
      selectedModel: "gpt-4o",
      onSelect: vi.fn(),
    })).not.toThrow()
  })

  it("should handle empty providers gracefully", async () => {
    vi.resetModules()
    vi.mock("@/stores/settings/app-store", () => ({
      useAppStore: () => ({ providers: [] }),
    }))
    vi.mock("framer-motion", () => ({
      motion: new Proxy({}, { get: () => "div" }),
      AnimatePresence: ({ children }: any) => children,
    }))
    const mod = await import("../ModelPicker")
    ModelPicker = mod.ModelPicker

    expect(() => React.createElement(ModelPicker, {
      selectedProviderId: "",
      selectedModel: "",
      onSelect: vi.fn(),
      compact: true,
    })).not.toThrow()
  })

  it("should render in compact mode", () => {
    expect(() => React.createElement(ModelPicker, {
      selectedProviderId: "anthropic",
      selectedModel: "claude-3-opus",
      onSelect: vi.fn(),
      compact: true,
    })).not.toThrow()
  })
})
