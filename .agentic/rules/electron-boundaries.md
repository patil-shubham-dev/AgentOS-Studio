---
paths: ["apps/desktop/src/main/**", "apps/desktop/src/preload/**", "apps/desktop/src/renderer/**"]
---

# Electron boundary rules

- Keep the renderer unprivileged. Expose only narrowly scoped, typed preload APIs; validate inputs again in the main process.
- Do not add broad filesystem, shell, or IPC pass-through APIs. Prefer a specific operation with an explicit path/scope policy.
- Propagate cancellation and errors across IPC without losing the error category or user-actionable message.
- For any new bridge method, update its preload type, main handler, renderer call site, and a focused test where feasible.
