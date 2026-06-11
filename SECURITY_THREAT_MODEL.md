# AgenticOS — Security Threat Model (P16D, Updated June 2026)

## Scope
This threat model covers all security boundaries in the AgenticOS platform: Electron IPC, file system access, browser automation, command execution, and data persistence.

> **Note**: The app was originally Tauri-based but was migrated to Electron. The privilege model remains the same.

## Privilege Levels

| Level | Description | Access |
|-------|-------------|--------|
| **L0 — Application** | React frontend, sandboxed by CSP | Raw IPC invoke access via preload bridge (narrower than Tauri) |
| **L1 — System** | Electron main process | Full OS access via child_process, file system, registry |
| **L2 — Browser** | Playwright Chromium instance | CDP control, JS execution, network access |
| **L3 — External** | Provider APIs, git remotes, web URLs | Network egress, data exfiltration potential |

## Threat Register

### T1 — Shell Command Injection via run_command
- **ID**: T-001
- **Severity**: ~~HIGH~~ → **MITIGATED** (June 2026)
- **Level**: L1
- **Vector**: `run_command` passes AI-generated string to `child_process.spawn`
- **Impact**: Arbitrary OS command execution with application privileges
- **Current Mitigation**: **Dual allowlist enforcement** — both main process (`src/main/ipc/command.ts`) and renderer (`ToolExecutionSandbox.ts`) check commands against an explicit allowlist. Shell interpreters (`powershell`, `pwsh`, `cmd`, `bash`, `sh`) are excluded. Shell metacharacter validation blocks `;&|`$(){}\[]<>!\\` in arguments. Path traversal detection. Defense-in-depth: renderer check + main process enforcement.
- **Recommendation**: Periodically audit allowlist for unnecessary entries. Consider adding a `sudo`-style approval flow for destructive commands.

### T2 — No-Sandbox Browser
- **ID**: T-002
- **Severity**: ~~HIGH~~ → **MITIGATED** (June 2026)
- **Level**: L2
- **Vector**: Chromium launched via Playwright
- **Impact**: Browser compromise → OS access if unsandboxed
- **Current Mitigation**: Sandbox is **enabled** via `--enable-sandbox` flag in `browser-manager.ts`. Temp user-data-dir per session. Electron renderer process uses `sandbox: true`.
- **Recommendation**: Periodically verify sandbox flag is present. Consider adding `--disable-setuid-sandbox` for CI environments.

### T3 — Arbitrary JavaScript Execution in Browser
- **ID**: T-003
- **Severity**: ~~HIGH~~ → **PARTIALLY MITIGATED** (June 2026)
- **Level**: L2
- **Vector**: `browser_execute_js` accepts JS string, executes in CDP page context
- **Impact**: JS can read cookies, localStorage, make fetch() requests from page origin, exfiltrate data
- **Current Mitigation**: Pattern-based allowlist (line 179-210 in `browser-manager.ts`) restricts to safe operations: `document.title`, `document.URL`, `document.querySelector`, `window.location.href`, `navigator.*`, `performance.*`, `localStorage.getItem/setItem`, `JSON.stringify`, `Array.from`, `document.body.innerText`. Blocked keywords: `fetch(`, `XMLHttpRequest`, `WebSocket(`, `document.cookie`, `eval(`, `Function(`, `setTimeout(`, `setInterval(`. Expressions over 200 chars are rejected.
- **Recommendation**: Remove `localStorage.getItem/setItem` from allowlist. Add user approval gate for all JS execution.

### T4 — Full Filesystem Access via IPC
- **ID**: T-004
- **Severity**: ~~HIGH~~ → **PARTIALLY MITIGATED** (June 2026)
- **Level**: L1
- **Vector**: File IPC handlers accept any path, filesystem operations are gated by path checks
- **Impact**: AI agent can read/write any file on disk
- **Current Mitigation**: `assertPathAllowed()` in `path-utils.ts` checks that target paths are within the opened workspace directory. **Now defaults to deny** when no workspace is open (was default-allow). All file IPC handlers except legacy workspace handlers use `assertPathAllowed`. Extra handlers now covered: `read-directory`, `workspace-list-files`, `stop-file-watcher`.
- **Remaining gap**: `read-directory`, `workspace-list-files` assertions added June 2026 — verify coverage is complete. Legacy `workspace:*` handlers use `WorkspaceManager` internal checks.
- **Recommendation**: Add audit log for all denied path access. Consider adding file-type/extension allowlist for read operations.

### T5 — `unsafe-eval` in CSP
- **ID**: T-005
- **Severity**: ~~HIGH~~ → **RESOLVED** (June 2026)
- **Level**: L0
- **Vector**: CSP `script-src` includes `unsafe-eval`
- **Impact**: XSS attacks can execute arbitrary JS via eval()
- **Current Mitigation**: `unsafe-eval` is **not present** in `src/renderer/index.html` CSP. `script-src 'self'` only. The `SECURITY_THREAT_MODEL.md` was out of date — this was already fixed in a prior commit.
- **Recommendation**: Keep CSP under CI — add a test that asserts `unsafe-eval` is absent from the CSP meta tag. Verify CSP on every build.

### T6 — No IPC Argument Validation
- **ID**: T-006
- **Severity**: MEDIUM
- **Level**: L0→L1 boundary
- **Vector**: None of 54 Tauri commands validate argument types, lengths, or ranges
- **Impact**: Buffer overflow via oversized strings, type confusion via unexpected argument shapes
- **Current Mitigation**: None
- **Recommendation**: Add server-side input validation to all command handlers (type check, length limit, range check)

### T7 — API Keys Stored in localStorage
- **ID**: T-007
- **Severity**: MEDIUM
- **Level**: L0
- **Vector**: Provider API keys stored in localStorage (base64 encoded, not encrypted)
- **Impact**: XSS or physical access → key compromise
- **Current Mitigation**: Base64 encoding only (obfuscation, not encryption)
- **Recommendation**: Use Tauri's secure storage plugin or OS keychain (Windows Credential Manager)

### T8 — `sandboxEscape` Capability Not Enforced
- **ID**: T-008
- **Severity**: MEDIUM
- **Level**: L0
- **Vector**: Capability flag exists in UI and docs but no runtime code enforces it
- **Impact**: False sense of security; agents with sandboxEscape=true have no additional restrictions
- **Current Mitigation**: None
- **Recommendation**: Either implement enforcement or remove the flag from UI

### T9 — Permission Default-Allow When No Config
- **ID**: T-009
- **Severity**: MEDIUM
- **Level**: L0
- **Vector**: ToolExecutionSandbox.hasPermission returns `true` when no role config or toolPermissions found
- **Impact**: New roles or misconfigured roles implicitly get full tool access
- **Current Mitigation**: None
- **Recommendation**: Default-deny; require explicit tool permissions for each role

### T10 — No URL Allowlist for Browser Navigation
- **ID**: T-010
- **Severity**: MEDIUM
- **Level**: L2
- **Vector**: Browser navigation accepts any URL; no origin restriction
- **Impact**: Navigation to phishing/malware sites, SSRF-like access to internal resources
- **Current Mitigation**: None
- **Recommendation**: URL allowlist/blocklist with user-configurable patterns; block private IP ranges from browser navigation

### T11 — PTY Spawns Any Shell
- **ID**: T-011
- **Severity**: HIGH
- **Level**: L1
- **Vector**: `pty_spawn` accepts executable path directly, passes `-i` flag
- **Impact**: Unrestricted shell access, persistent shell sessions
- **Current Mitigation**: None
- **Recommendation**: Restrict PTY to predefined shell paths; require user approval for PTY sessions

### T12 — Registry Modification via Context Menu
- **ID**: T-012
- **Severity**: LOW
- **Level**: L1
- **Vector**: `register_context_menu` writes to HKCU registry
- **Impact**: Registry corruption, persistent system modification
- **Current Mitigation**: Limited to HKCU (not HKLM)
- **Recommendation**: Unregister context menu on app exit; add confirmation dialog

## Risk Register (Priority-Ordered) — Updated June 2026

| ID | Threat | Severity | Likelihood | Impact | Risk Score | Effort | Priority | Status |
|----|--------|----------|-----------|--------|-----------|--------|----------|--------|
| T-003 | Arbitrary JS in browser | HIGH (partial mitigated) | Medium | High | 12 | Low | P0 | **Partial** — pattern-allowlisted |
| T-004 | Full filesystem access | HIGH (partial mitigated) | Medium | Critical | 12 | Medium | P0 | **Partial** — path-scoped + default-deny |
| T-011 | PTY unrestricted | HIGH | Low | Critical | 8 | Low | P1 | Not started |
| T-006 | No IPC validation | MEDIUM | Medium | Medium | 6 | High | P1 | Not started |
| T-007 | API keys in localStorage | MEDIUM | Medium | Medium | 6 | Medium | P1 | Not started |
| T-009 | Permission default-allow | MEDIUM | Medium | Medium | 6 | Low | P1 | Not started |
| T-010 | No URL allowlist | MEDIUM | Low | Medium | 4 | Low | P2 | Not started |
| T-008 | sandboxEscape decorative | MEDIUM | Low | Medium | 4 | Low | P2 | Not started |
| T-012 | Registry modification | LOW | Low | Low | 2 | Low | P3 | Not started |

### ✅ Resolved Items (June 2026)
| ID | Threat | Resolution |
|----|--------|------------|
| T-001 | Shell command injection | **MITIGATED** — dual allowlist (main + renderer), shell interpreters excluded, metacharacter validation |
| T-002 | No-sandbox browser | **MITIGATED** — `--enable-sandbox` flag, Electron renderer `sandbox: true` |
| T-005 | unsafe-eval in CSP | **RESOLVED** — was already absent from CSP; doc was out of date |

## Mitigation Plan

### P0 (Remaining — Before Release)
1. **T-003**: Gate `browser_execute_js` behind explicit user approval (always-approve toggle). Remove `localStorage.getItem/setItem` from allowlist.
2. **T-004**: Add audit logging for denied `assertPathAllowed` calls. Add file-type/extension allowlist for read operations.

### P1 (Before GA)
1. **T-011**: Restrict PTY to `cmd.exe` on Windows, `/bin/bash` on Unix. Require approval for PTY spawn.
2. **T-006**: Add input validation to all IPC handlers: type checks, length limits (String max 64KB, Vec max 1000 items).
3. **T-007**: Migrate API key storage to OS keychain (Windows Credential Manager, macOS Keychain).
4. **T-009**: Change `hasPermission` default from allow to deny when no role config exists.

### P2 (Post-GA)
1. **T-010**: Implement URL validation for browser navigation (private IP block, allowlist patterns).
2. **T-008**: Remove `sandboxEscape` from UI if not implemented, or implement enforcement.

## Architecture Diagram (Updated June 2026)
```
┌─────────────────────────────────────────────────────┐
│ L0 — React Frontend (sandboxed by CSP)              │
│  ├── Agent tools (grep, read, write, search)        │
│  ├── Browser automation (navigate, click, eval)     │
│  ├── Command execution (run_command, terminal)       │
│  ├── ToolExecutionSandbox (renderer allowlist)       │
│  └── IPC via preload bridge (narrow, explicit)       │
├─ IPC Boundary — path validation (assertPathAllowed)──┤
│ L1 — Electron Main Process                           │
│  ├── filesystem: read/write/list (path-checked)     │
│  ├── shell: run_command (allowlisted)               │
│  ├── browser: Playwright (sandboxed chromium)        │
│  ├── registry: context menu, app info                │
│  └── network: HTTP proxy, WebSocket, notifications   │
├─ CDP Boundary ──────────────────────────────────────┤
│ L2 — Chromium Browser (sandboxed, JS allowlisted)    │
│  └── CDP: evaluate JS (pattern-allowlisted), nav     │
├─ Network Boundary ──────────────────────────────────┤
│ L3 — External: Provider APIs, git, web URLs          │
└─────────────────────────────────────────────────────┘
```
