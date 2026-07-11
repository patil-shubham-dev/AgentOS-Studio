import { describe, it, expect, beforeEach } from "vitest"
import { TypeGraph, type TypeNode } from "@/lib/type-graph"

// Helper to create mock TSSymbolInfo (minimal subset used by TypeGraph.build)
function mockSymbol(name: string, kind: string, file: string, line: number, opts?: {
  typeParameters?: string[]
  extends?: string[]
  implements?: string[]
  type?: string
}) {
  return {
    name,
    kind,
    file,
    line,
    modifiers: [],
    isExported: true,
    isDefaultExport: false,
    typeParameters: opts?.typeParameters,
    extends: opts?.extends,
    implements: opts?.implements,
    type: opts?.type,
  } as any
}

describe("TypeGraph", () => {
  let graph: TypeGraph

  beforeEach(() => {
    graph = new TypeGraph()
  })

  describe("build and basic queries", () => {
    it("builds empty graph from empty symbols", () => {
      graph.build([])
      expect(graph.isReady).toBe(false)
      expect(graph.getAllTypes()).toHaveLength(0)
    })

    it("builds graph from type symbols", () => {
      const symbols = [
        mockSymbol("User", "interface", "src/types.ts", 1),
        mockSymbol("ApiClient", "class", "src/client.ts", 10),
        mockSymbol("Status", "enum", "src/types.ts", 15),
        mockSymbol("Callback", "type", "src/types.ts", 20),
      ]
      graph.build(symbols)
      expect(graph.isReady).toBe(true)
      expect(graph.getAllTypes()).toHaveLength(4)
    })

    it("ignores non-type symbols (functions, variables, etc)", () => {
      const symbols = [
        mockSymbol("User", "interface", "src/types.ts", 1),
        mockSymbol("helper", "function", "src/utils.ts", 5),
        mockSymbol("count", "const", "src/utils.ts", 10),
        mockSymbol("temp", "variable", "src/utils.ts", 15),
      ]
      graph.build(symbols)
      expect(graph.getAllTypes()).toHaveLength(1)
      expect(graph.getAllTypes()[0].kind).toBe("interface")
    })
  })

  describe("whereUsed", () => {
    it("returns empty array for unknown type", () => {
      expect(graph.whereUsed("NonExistent")).toEqual([])
    })

    it("returns files that reference a type", () => {
      const symbols = [
        mockSymbol("User", "interface", "src/types.ts", 1, { type: "interface" }),
        mockSymbol("getUser", "function", "src/user.ts", 5, { type: "() => User" }),
        mockSymbol("UserCard", "function", "src/components/UserCard.ts", 10, { type: "User" }),
      ]
      graph.build(symbols)
      const users = graph.whereUsed("User")
      expect(users).toContain("src/user.ts")
      expect(users).toContain("src/components/UserCard.ts")
    })

    it("excludes the type's own file from referencedBy", () => {
      const symbols = [
        mockSymbol("User", "interface", "src/types.ts", 1, { type: "interface" }),
      ]
      graph.build(symbols)
      expect(graph.whereUsed("User")).not.toContain("src/types.ts")
    })
  })

  describe("whoDependsOn", () => {
    it("returns empty for unknown file", () => {
      expect(graph.whoDependsOn("src/unknown.ts")).toEqual([])
    })

    it("returns files that depend on types defined in a file", () => {
      const symbols = [
        mockSymbol("User", "interface", "src/types.ts", 1, { type: "interface" }),
        mockSymbol("Config", "type", "src/types.ts", 10, { type: "{ theme: string }" }),
        mockSymbol("login", "function", "src/auth.ts", 5, { type: "User => void" }),
        mockSymbol("UserCard", "function", "src/components/UserCard.ts", 10, { type: "Config & User" }),
      ]
      graph.build(symbols)
      const deps = graph.whoDependsOn("src/types.ts")
      expect(deps).toContain("src/auth.ts")
      expect(deps).toContain("src/components/UserCard.ts")
    })
  })

  describe("whatBreaks", () => {
    const symbols = [
      mockSymbol("User", "interface", "src/types.ts", 1, { type: "interface" }),
      mockSymbol("login", "function", "src/auth.ts", 5, { type: "User => void" }),
      mockSymbol("UserCard", "function", "src/components/UserCard.tsx", 10, { type: "User" }),
      mockSymbol("userTest", "function", "src/__tests__/user.test.ts", 15, { type: "User" }),
    ]

    beforeEach(() => {
      graph.build(symbols)
    })

    it("returns affected files and tests when a type changes", () => {
      const result = graph.whatBreaks("src/types.ts", "User")
      expect(result.files).toContain("src/auth.ts")
      expect(result.files).toContain("src/components/UserCard.tsx")
      expect(result.tests).toContain("src/__tests__/user.test.ts")
    })

    it("returns empty for unknown type", () => {
      const result = graph.whatBreaks("src/types.ts", "NonExistent")
      expect(result.files).toEqual([])
      expect(result.tests).toEqual([])
    })
  })

  describe("getType", () => {
    it("returns undefined for unknown type", () => {
      expect(graph.getType("Unknown")).toBeUndefined()
    })

    it("returns the type node", () => {
      graph.build([mockSymbol("User", "interface", "src/types.ts", 1)])
      const t = graph.getType("User")
      expect(t).toBeDefined()
      expect(t!.name).toBe("User")
      expect(t!.kind).toBe("interface")
      expect(t!.file).toBe("src/types.ts")
      expect(t!.line).toBe(1)
    })
  })

  describe("getTypesInFile", () => {
    it("returns all types defined in a file", () => {
      const symbols = [
        mockSymbol("User", "interface", "src/types.ts", 1),
        mockSymbol("Config", "type", "src/types.ts", 10),
        mockSymbol("ApiClient", "class", "src/client.ts", 1),
      ]
      graph.build(symbols)
      const types = graph.getTypesInFile("src/types.ts")
      expect(types).toHaveLength(2)
      expect(types.map((t) => t.name)).toContain("User")
      expect(types.map((t) => t.name)).toContain("Config")
    })
  })

  describe("getTypeContextForFiles", () => {
    it("returns empty string for empty graph", () => {
      expect(graph.getTypeContextForFiles(["src/types.ts"])).toBe("")
    })

    it("returns XML context for types in given files", () => {
      const symbols = [
        mockSymbol("User", "interface", "src/types.ts", 1),
        mockSymbol("Config", "type", "src/types.ts", 10),
        mockSymbol("ApiClient", "class", "src/client.ts", 1),
      ]
      graph.build(symbols)
      const ctx = graph.getTypeContextForFiles(["src/types.ts"])
      expect(ctx).toContain("<type_context>")
      expect(ctx).toContain("User")
      expect(ctx).toContain("Config")
      expect(ctx).toContain("</type_context>")
      expect(ctx).not.toContain("ApiClient")
    })

    it("respects maxTypes limit", () => {
      const symbols = [
        mockSymbol("A", "interface", "src/types.ts", 1),
        mockSymbol("B", "type", "src/types.ts", 2),
        mockSymbol("C", "class", "src/types.ts", 3),
        mockSymbol("D", "enum", "src/types.ts", 4),
        mockSymbol("E", "type", "src/types.ts", 5),
      ]
      graph.build(symbols)
      const ctx = graph.getTypeContextForFiles(["src/types.ts"], 3)
      const match = ctx.match(/name="([A-Z])"/g)
      expect(match).toBeTruthy()
      expect(match!.length).toBeLessThanOrEqual(3)
    })

    it("includes referencedBy count when types are used elsewhere", () => {
      const symbols = [
        mockSymbol("User", "interface", "src/types.ts", 1, { type: "interface" }),
        mockSymbol("login", "function", "src/auth.ts", 5, { type: "User => void" }),
      ]
      graph.build(symbols)
      const ctx = graph.getTypeContextForFiles(["src/types.ts"])
      expect(ctx).toContain("used by")
      expect(ctx).toContain("1 file(s)")
    })
  })

  describe("toJSON / fromJSON", () => {
    it("serializes and deserializes", () => {
      const symbols = [
        mockSymbol("User", "interface", "src/types.ts", 1),
        mockSymbol("Config", "type", "src/types.ts", 10),
      ]
      graph.build(symbols)
      const json = graph.toJSON()
      const restored = TypeGraph.fromJSON(json)
      expect(restored.getAllTypes()).toHaveLength(2)
      expect(restored.getType("User")).toBeDefined()
      expect(restored.getType("User")!.kind).toBe("interface")
    })
  })

  describe("getStats", () => {
    it("returns stats for built graph", () => {
      const symbols = [
        mockSymbol("User", "interface", "src/types.ts", 1),
      ]
      graph.build(symbols)
      const stats = graph.getStats()
      expect(stats.totalTypes).toBe(1)
      expect(stats.totalFiles).toBe(1)
      expect(stats.indexedAt).toBeGreaterThan(0)
    })
  })
})
