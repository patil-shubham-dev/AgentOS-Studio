# agent-instructions/

This directory holds all system prompts, role definitions, and agent instructions
as standalone markdown files, extracted from hardcoded strings in the source code.

## Structure

| Directory      | Contents |
|----------------|----------|
| `roles/`       | One file per agent role (coder, manager, vision, etc.) — the system prompt injected at the start of every conversation with that role |
| `system-prompts/` | Reusable prompt fragments used by the runtime (e.g. conversation compaction) |
| `skills/`      | Skill definitions the agent runtime can invoke (coming soon) |
| `templates/`   | Templates for agent-generated content (coming soon) |

## How It Works

At startup, the renderer calls `read-instruction-file` IPC to load the relevant
markdown file into a cache. When `getSystemPromptForRole()` is called:

1. Try the ContextManager pipeline (the canonical path — assembles role prompt +
   memory + environment context dynamically)
2. Fall back to the file-based cache (loaded from `agent-instructions/roles/`)
3. Fall back to the hardcoded default in `runtime-role-registry.ts`

This means the markdown files are **authoritative** at runtime, but the compiled
fallback guarantees the app never starts without a prompt even if the files are
missing (e.g. during development or packaging).

## File Format

Each file starts with YAML frontmatter for metadata:

```markdown
---
id: role-coder
name: Coder
runtimeRole: coder
description: Writes, debugs, and refactors production code across the project
temperature: 0.2
maxTokens: 64000
---

Prompt body goes here...
```

The frontmatter is stripped before the prompt is injected into the LLM context.

## Adding a New Role Prompt

1. Create `agent-instructions/roles/<role-id>.md` with frontmatter
2. Add the mapping in `apps/desktop/src/renderer/runtime/load-instructions.ts`
3. Add the hardcoded fallback in `runtime-role-registry.ts`
4. The IPC cache will pick it up automatically on next startup

## Development

In development mode, files are read from `<project-root>/agent-instructions/`.
In production (packaged app), they are read from `process.resourcesPath`.
