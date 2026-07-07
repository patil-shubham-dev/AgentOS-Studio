import type { ImplementationPlan, PlanStep } from "./PlanTypes"
import { generatePlanId } from "./PlanTypes"
import { useAppStore } from "@/stores/app-store"
import { providerGateway } from "@/runtime/providers/ProviderGateway"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { RuntimeOS } from "@/runtime/RuntimeOS"
import { configLoader } from "@/runtime/project-config/ConfigLoader"
import type { StructuredProjectConfig } from "@/runtime/project-config/ProjectConfigTypes"
import { FAST_CHAT_PROMPT } from "@/runtime/runtime-role-registry"
import { ArchitecturePlanningStrategy } from "@/runtime/intelligence/ArchitecturePlanningStrategy"
import { EntryPointExplorer } from "@/runtime/intelligence/EntryPointExplorer"
import { PlanComparisonEngine } from "./PlanComparisonEngine"

const PLAN_SYSTEM_PROMPT = `You are a planning expert. Given a user request, generate a structured implementation plan.

Your response must be valid JSON with this exact schema:
{
  "title": "Short plan title",
  "overview": "1-2 sentence overview of what needs to be done",
  "steps": [
    {
      "id": "step-1",
      "title": "Step title",
      "description": "Detailed description of what this step involves",
      "filesAffected": [
        { "path": "path/to/file.ts", "changeType": "create|modify|delete", "summary": "What changes to make" }
      ],
      "estimatedChanges": "~X lines added/modified"
    }
  ],
  "verificationCriteria": [
    "Check that X works correctly",
    "Run Y test to verify"
  ]
}

Rules:
- Each step should be independently reviewable and executable
- Break complex changes into multiple focused steps
- List ALL files that will be affected across all steps
- Be specific about what changes each file needs
- verificationCriteria must be actionable and testable
- Output ONLY the JSON object, no markdown fences`

export class PlanGenerator {
  private static instance: PlanGenerator

  static getInstance(): PlanGenerator {
    if (!PlanGenerator.instance) {
      PlanGenerator.instance = new PlanGenerator()
    }
    return PlanGenerator.instance
  }

  async generatePlan(
    userInput: string,
    signal?: AbortSignal,
  ): Promise<ImplementationPlan> {
    const providers = useAppStore.getState().providers ?? []
    const runtimeState = useWorkspaceRuntime.getState()
    const managerAgent = runtimeState.wiredAgents.find((a) => a.runtimeRole === "manager")
    const provider = managerAgent ? providers.find((p) => p.id === managerAgent.providerId) : providers[0]

    if (!provider) {
      return this.fallbackPlan(userInput)
    }

    // Gather workspace context for better plans
    const rootPath = useWorkspaceStore.getState().rootPath
    const wsSnapshot = useWorkspaceStore.getState()
    const activeFile = wsSnapshot.activeFilePath
    const openFiles = wsSnapshot.openFiles ?? []
    const fileTreeSummary = wsSnapshot.fileTreeSummary

    const contextParts: string[] = []
    if (rootPath) {
      contextParts.push(`Workspace root: ${rootPath}`)
    }
    if (activeFile) {
      contextParts.push(`Active file: ${activeFile}`)
    }
    if (openFiles.length > 0) {
      contextParts.push(`Open files: ${openFiles.slice(0, 5).join(", ")}`)
    }
    if (fileTreeSummary) {
      contextParts.push(`Project structure: ${fileTreeSummary.slice(0, 500)}`)
    }

    // ── Inject AGENTIC.md project config for better planning ──
    let projectConfigStr = ""
    let architectureBlock = ""
    let explorationBlock = ""
    if (rootPath) {
      try {
        const configResult = await configLoader.load(rootPath)
        const sc = configResult.structured
        if (sc) {
          const planBlocks: string[] = []
          planBlocks.push(`Architecture: ${sc.architecture.type}`)
          if (sc.architecture.workspaces.length > 0) {
            planBlocks.push(`Workspaces: ${sc.architecture.workspaces.join(", ")}`)
          }
          planBlocks.push(`Stack: ${sc.stack.languages.join(", ")}`)
          if (sc.commands.build) planBlocks.push(`Build: ${sc.commands.build}`)
          if (sc.commands.test) planBlocks.push(`Test: ${sc.commands.test}`)
          if (sc.commands.lint) planBlocks.push(`Lint: ${sc.commands.lint}`)
          if (sc.commands.typecheck) planBlocks.push(`Typecheck: ${sc.commands.typecheck}`)
          if (sc.conventions.isTypeScript) {
            planBlocks.push(`TypeScript: ${sc.conventions.isStrictMode ? "strict mode" : "enabled"}`)
          }
          if (sc.conventions.customRules.length > 0) {
            planBlocks.push("Conventions:", ...sc.conventions.customRules.map(r => `  - ${r}`))
          }
          if (sc.verification.requiredChecks.length > 0) {
            planBlocks.push("Verification:", ...sc.verification.requiredChecks.map(r => `  - ${r}`))
          }
          projectConfigStr = `\n\n## Project Configuration\n${planBlocks.join("\n")}`
        }

        // ── Inject architecture intelligence context ──
        const archStrategy = new ArchitecturePlanningStrategy()
        architectureBlock = await archStrategy.getArchitectureContextBlock()

        const explorer = new EntryPointExplorer()
        const plan = await explorer.getExplorationPlan()
        if (plan.entryPoints.length > 0) {
          const epLines = plan.entryPoints.map(e => `  - ${e.id}`).join("\n")
          explorationBlock = `\n## Repository Map\nEntry Points:\n${epLines}\nModules: ${plan.modules.components.length} components, ${plan.modules.pages.length} routes, ${plan.modules.services.length} services\nTotal: ${plan.totalFiles} files, ${plan.totalSymbols} symbols`
        }
      } catch { console.warn("[PlanGenerator] Failed to build exploration block") }
    }

    const contextStr = contextParts.length > 0 || projectConfigStr || architectureBlock || explorationBlock
      ? `\n\nCurrent workspace context:\n${contextParts.join("\n")}${projectConfigStr}\n\n${architectureBlock}${explorationBlock}`
      : ""

    const messages = [
      { role: "system" as const, content: PLAN_SYSTEM_PROMPT },
      { role: "user" as const, content: `Request: ${userInput}${contextStr}` },
    ]

    try {
      const result = await providerGateway.chat({
        messages,
        maxTokens: 4096,
        temperature: 0.3,
        signal,
        providerId: managerAgent?.providerId,
        model: managerAgent?.model ?? provider.models[0]?.id,
      })

      const plan = this.parsePlanResponse(result.content ?? "")
      if (plan) {
        return plan
      }
    } catch (err) {
      console.warn("[PlanGenerator] AI plan generation failed, using fallback:", err)
    }

    return this.fallbackPlan(userInput)
  }

  private parsePlanResponse(content: string): ImplementationPlan | null {
    try {
      // Strip markdown fences if present
      let cleaned = content.trim()
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "")
      }
      const parsed = JSON.parse(cleaned)

      if (!parsed.steps || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
        return null
      }

      const steps: PlanStep[] = parsed.steps.map((s: Record<string, unknown>, i: number) => ({
        id: s.id ?? `step-${i + 1}`,
        title: (s.title as string) ?? `Step ${i + 1}`,
        description: (s.description as string) ?? "",
        filesAffected: Array.isArray(s.filesAffected) ? s.filesAffected.map((f: Record<string, unknown>) => ({
          path: (f.path as string) ?? "",
          changeType: (f.changeType as "create" | "modify" | "delete") ?? "modify",
          summary: (f.summary as string) ?? "",
        })) : [],
        estimatedChanges: (s.estimatedChanges as string) ?? "",
        status: "pending" as const,
      }))

      return {
        id: generatePlanId(),
        title: (parsed.title as string) ?? "Implementation Plan",
        overview: (parsed.overview as string) ?? "",
        steps,
        verificationCriteria: Array.isArray(parsed.verificationCriteria)
          ? parsed.verificationCriteria.map(String)
          : [],
        createdAt: Date.now(),
        status: "pending_review",
      }
    } catch (err) {
      console.warn("[PlanGenerator] Failed to parse plan response:", err)
      return null
    }
  }

  private fallbackPlan(userInput: string): ImplementationPlan {
    const id = generatePlanId()
    return {
      id,
      title: "Plan for: " + userInput.slice(0, 60),
      overview: `Implementation plan for: ${userInput}`,
      steps: [
        {
          id: `${id}_step_1`,
          title: "Analyze requirements",
          description: "Review the request and gather necessary context from the codebase.",
          filesAffected: [],
          estimatedChanges: "",
          status: "pending",
        },
        {
          id: `${id}_step_2`,
          title: "Implement changes",
          description: "Make the required code changes following the project conventions.",
          filesAffected: [],
          estimatedChanges: "",
          status: "pending",
        },
        {
          id: `${id}_step_3`,
          title: "Verify correctness",
          description: "Run tests and typecheck to ensure changes are correct.",
          filesAffected: [],
          estimatedChanges: "",
          status: "pending",
        },
      ],
      verificationCriteria: [
        "All type checks pass",
        "Existing tests continue to pass",
        "Changes follow project conventions",
      ],
      createdAt: Date.now(),
      status: "pending_review",
    }
  }

  /**
   * Generate plans from multiple providers for side-by-side comparison.
   */
  async compare(
    userInput: string,
    providerIds?: string[],
    signal?: AbortSignal,
  ) {
    const engine = new PlanComparisonEngine()
    return engine.compare(userInput, providerIds, signal)
  }
}
