---
name: ship-feature
description: Implement a product feature or multi-file change in AgenticOS. Use whenever the user asks to add, change, connect, refactor, or complete a feature, UI flow, agent capability, IPC path, provider integration, persistence behavior, or workflow. Produces a minimal implementation with verification evidence.
tags: ["implementation", "feature", "workflow", "verification"]
aliases: ["implement-feature", "build-feature", "complete-feature"]
requiresConfirmation: false
---

# Ship a feature

First establish the execution path from user interaction to state, runtime/tooling, bridge, and persistence. Read the target implementation, its callers, and the nearest test before changing code. This prevents a polished but disconnected surface.

Choose the smallest safe route:

1. State the intended behavior and acceptance checks in one or two sentences.
2. Inspect only the files needed to trace the existing path and find the local conventions.
3. Make a focused change that preserves public contracts unless the task explicitly requires a contract change.
4. When crossing renderer/preload/main boundaries, update all sides together and validate inputs at the privileged boundary.
5. Add or update a focused test for each changed behavior, especially for errors, cancellation, permissions, and persistence.
6. Run the narrowest relevant checks while editing, then run the strongest practical final check.

In the handoff, provide: outcome, changed files, verification commands/results, and remaining limitations. Do not say a UI or runtime flow works unless it was actually exercised or the limitation is explicit.
