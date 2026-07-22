---
paths: ["apps/desktop/src/renderer/runtime/**"]
---

# Agent runtime rules

- Preserve capability-based tool permissions. A new tool, plugin, or MCP integration must declare its capabilities before a restricted role can use it; do not rely on an allow-by-default fallback.
- Keep prompts structured: stable policy and role instructions first, then project rules, task state, selected context, available tools, and finally volatile tool output.
- Context is a budget, not a dump. Prefer symbols, call sites, diffs, diagnostics, and targeted search results over entire directories or raw histories.
- Any durable session, memory, checkpoint, replay, or tool-event change needs a migration/compatibility story and a focused test.
- Agents should distinguish observations, assumptions, actions taken, and verification evidence. Never fabricate a command result, edit, tool call, or test pass.
