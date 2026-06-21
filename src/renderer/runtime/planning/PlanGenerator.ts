import type { ImplementationPlan, PlanStep } from "./PlanTypes"
import { generatePlanId } from "./PlanTypes"
import { useAppStore } from "@/stores/app-store"
import { ProviderRuntime } from "@/runtime/providers/ProviderRuntime"
import { useWorkspaceRuntime } from "@/runtime/workspace-runtime"
import { useWorkspaceStore } from "@/stores/workspace-store"
import { ContextManager } from "@/runtime/context/ContextManager"
import { RuntimeOS } from "@/runtime/RuntimeOS"
import { FAST_CHAT_PROMPT } from "@/runtime/runtime-role-registry"

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
    const contextStr = contextParts.length > 0
      ? `\n\nCurrent workspace context:\n${contextParts.join("\n")}`
      : ""

    const messages = [
      { role: "system" as const, content: PLAN_SYSTEM_PROMPT },
      { role: "user" as const, content: `Request: ${userInput}${contextStr}` },
    ]

    try {
      const providerRuntime = new ProviderRuntime(provider.baseUrl, provider.apiKey)
      providerRuntime.setDefaultModel(managerAgent?.model ?? provider.models[0]?.id ?? "")

      const result = await providerRuntime.complete({
        messages,
        maxTokens: 4096,
        temperature: 0.3,
        signal,
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
}
