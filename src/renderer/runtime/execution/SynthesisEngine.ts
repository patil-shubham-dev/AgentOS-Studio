import { AgentExecutor } from "@/runtime/agents/AgentExecutor"
import type { ExecutionEvent } from "@/runtime/ExecutionEvent"

export class SynthesisEngine {
  async *synthesize(
    userInput: string,
    agentResults: { role: string; content: string }[],
    history: { role: string; content: string; timestamp?: number }[],
    executionId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<ExecutionEvent, string, void> {
    const roleDescriptions: Record<string, string> = {
      coder: "Code implementation specialist — evaluates technical feasibility, produces file edits and code",
      research: "Information gatherer — searches documentation, web, and codebase for relevant context",
      qa: "Quality assurance — validates correctness, catches bugs, verifies edge cases",
      browser: "Browser automation — interacts with web UI, extracts dynamic content",
      manager: "Orchestrator — coordinates multi-agent execution, resolves conflicts, makes final call",
      design: "UI/UX designer — creates visual artifacts, prototypes, design specifications",
      memory: "Long-term memory — recalls past decisions, project conventions, historical context",
      "fast-inference": "Quick response agent — optimized for speed over depth",
    }

    const agentOutputs = agentResults
      .map((r) => {
        const roleLabel = roleDescriptions[r.role] ?? "Specialist agent"
        return `## ${r.role} Response\n*Role: ${roleLabel}*\n\n${r.content}`
      })
      .join("\n\n---\n\n")
    const synthInput = `The user asked: "${userInput}"

Below are responses from multiple specialist agents, each analyzing the request from their perspective.

${agentOutputs}

Now synthesize these into a single coherent response. Follow this process:
1. Identify where agents agree — those points are high-confidence
2. Flag any contradictions between agents — resolve them with reasoning
3. Prioritize factual/code output over speculation
4. Present a unified final response that credits the strongest analysis

No preamble. Start directly with the synthesized response.`

    const executor = new AgentExecutor({
      executionId,
      mode: "FAST",
      role: "manager",
      input: synthInput,
      history: history as any,
      signal,
    })

    let content = ""
    for await (const event of executor.execute()) {
      if (event.type === "MESSAGE_COMPLETE") {
        content = event.content
      }
      yield event
    }
    return content
  }
}
