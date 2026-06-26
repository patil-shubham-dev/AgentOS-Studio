# Workspace Failure Modes

## Goal

Document every known failure mode in the workspace subsystem, its current behavior, and the recommended recovery mechanism.

---

## 1. Filesystem Failures

### F1 — File Not Found (deleted externally)

| Attribute | Value |
|-----------|-------|
| **Trigger** | File in `openFiles` is deleted externally (another app, Git checkout) |
| **Current behavior** | `readFile()` returns error or empty content. Tab shows stale content or crashes. |
| **Detection** | File watcher marks `changedFiles` set but does not detect deletion specifically |
| **Recovery** | On file activate, check existence. If missing: show "File deleted" placeholder, offer to close tab. |
| **Severity** | Medium |

### F2 — Permission Error

| Attribute | Value |
|-----------|-------|
| **Trigger** | File/directory has no read or write permission |
| **Current behavior** | `readFile()` / `writeFile()` throws. Error logged to console, not shown to user. |
| **Detection** | Catch in filesystem.ts operations |
| **Recovery** | Show inline error in editor: "Permission denied. Open with elevated permissions or choose another file." |
| **Severity** | Medium |

### F3 — Disk Full

| Attribute | Value |
|-----------|-------|
| **Trigger** | Write operation fails due to disk quota |
| **Current behavior** | `writeFile()` throws. Error logged. |
| **Detection** | Catch in save handler |
| **Recovery** | Show user message: "Disk full. Free up space and try again." Offer save-as to another location. |
| **Severity** | High (data loss risk) |

### F4 — File Locked by Another Process

| Attribute | Value |
|-----------|-------|
| **Trigger** | Write to a file locked by another process (e.g., Git, compiler) |
| **Current behavior** | `writeFile()` throws. Error logged. |
| **Detection** | Catch in save handler |
| **Recovery** | Retry after 1s. Show "File locked by another process" after 3 retries. Offer save-as. |
| **Severity** | Medium |

---

## 2. Workspace State Failures

### F5 — Corrupted localStorage State

| Attribute | Value |
|-----------|-------|
| **Trigger** | `agentic-workspace-state` or `agentic-workspace-root` is corrupted JSON |
| **Current behavior** | `restoreWorkspaceState()` catches JSON parse error silently. State is lost. |
| **Detection** | try/catch around `JSON.parse(localStorage.getItem(...))` |
| **Recovery** | Log warning. Fall back to default state (no open files). Do NOT block workspace load. |
| **Severity** | Low |

### F6 — Workspace Root No Longer Exists

| Attribute | Value |
|-----------|-------|
| **Trigger** | User opens a workspace, then the folder is deleted/moved on disk |
| **Current behavior** | `loadFileTree()` returns empty or throws. Tree is empty. No user message. |
| **Detection** | Error in `loadFileTree()` |
| **Recovery** | Show "Workspace folder not found" with options: Remove from recent, Choose another folder. |
| **Severity** | High |

### F7 — Multiple Windows with Same Workspace

| Attribute | Value |
|-----------|-------|
| **Trigger** | User opens the same workspace in two windows |
| **Current behavior** | Both windows read/write to the same `localStorage` keys. Last write wins. State corruption possible. |
| **Detection** | Not detected. |
| **Recovery** | Use a `broadcastchannel` or `storage` event listener to detect same-workspace conflicts. Show warning. |
| **Severity** | Medium |

---

## 3. Editor Failures

### F8 — Monaco Initialization Failure

| Attribute | Value |
|-----------|-------|
| **Trigger** | Monaco editor fails to load (network, CDN, or bundle issue) |
| **Current behavior** | `@monaco-editor/react` shows its default loading/error state. |
| **Detection** | `handleEditorMount` never called. |
| **Recovery** | Show "Editor failed to load. Check your connection and reload." Offer textarea fallback. |
| **Severity** | High |

### F9 — Large File Freezes UI

| Attribute | Value |
|-----------|-------|
| **Trigger** | Opening a file >10MB in Monaco |
| **Current behavior** | Monaco attempts to tokenize the entire file. UI freezes for seconds to minutes. |
| **Detection** | Check file size before `getOrCreateModel()`. |
| **Recovery** | Show warning: "Large file. Open as read-only with line-limited preview?" |
| **Severity** | High |

### F10 — Unicode/Encoding Mismatch

| Attribute | Value |
|-----------|-------|
| **Trigger** | File is not UTF-8 encoded (e.g., ISO-8859-1, UTF-16, Shift-JIS) |
| **Current behavior** | `readFile()` decodes as UTF-8. Garbled characters displayed. |
| **Detection** | Not detected. |
| **Recovery** | Detect encoding via BOM or content sniffing. Offer to re-open with correct encoding. |
| **Severity** | Low |

---

## 4. Persistence Failures

### F11 — localStorage Quota Exceeded

| Attribute | Value |
|-----------|-------|
| **Trigger** | Multiple `localStorage` writes fill the 5-10MB quota |
| **Current behavior** | `safe-storage.ts` handles with priority-based eviction. But state data may be lost. |
| **Detection** | `QuotaExceededError` caught in `safeSetItem()`. |
| **Recovery** | Evict lowest-priority items. If still failing, show user message. |
| **Severity** | Medium |

### F12 — Tauri FS Write Failure

| Attribute | Value |
|-----------|-------|
| **Trigger** | `saveConfig()` or `persistSettings()` fails via Tauri FS |
| **Current behavior** | Falls back to `localStorage`. Silent. |
| **Detection** | Catch error in `persistence.ts`. |
| **Recovery** | Log warning. Continue with `localStorage` fallback. Show "Settings not synced to disk" if persistent. |
| **Severity** | Low |

### F13 — IndexedDB Corrupted

| Attribute | Value |
|-----------|-------|
| **Trigger** | Symbol index or semantic search IndexedDB database corrupted |
| **Current behavior** | `loadAll()` throws. Catch returns null. Index rebuild needed. |
| **Detection** | Catch in `index-persistence.ts`. |
| **Recovery** | Clear IndexedDB stores and trigger full re-index on next idle. |
| **Severity** | Low |

---

## 5. IPC & Backend Failures

### F14 — Electron IPC Timeout

| Attribute | Value |
|-----------|-------|
| **Trigger** | Main process is busy or crashed. IPC `invoke()` call hangs or returns error. |
| **Current behavior** | No timeout on IPC calls. May hang indefinitely. |
| **Detection** | Not detected. |
| **Recovery** | Add timeout wrapper around IPC calls (default 10s). On timeout: retry once, then show error. |
| **Severity** | High |

### F15 — Preload Script Failure

| Attribute | Value |
|-----------|-------|
| **Trigger** | Preload script fails to load or `contextBridge` is broken |
| **Current behavior** | `window.electronAPI` is undefined. All Electron-specific paths silently fall back. |
| **Detection** | Check `window.electronAPI` before each call. |
| **Recovery** | Show fallback UI. Most features degrade gracefully (e.g., browser download instead of Tauri save). |
| **Severity** | High |

### F16 — Main Process Crash

| Attribute | Value |
|-----------|-------|
| **Trigger** | Main process exits unexpectedly |
| **Current behavior** | Renderer continues running but IPC calls fail. App becomes partially functional. |
| **Detection** | `main.ts` `crashed` event handler sets a flag. |
| **Recovery** | Show "Application encountered an error" overlay. Offer "Restart" or "Continue with limited functionality". |
| **Severity** | Critical |

---

## 6. File Watcher Failures

### F17 — Watcher Limit Exceeded

| Attribute | Value |
|-----------|-------|
| **Trigger** | Large workspace exceeds OS file watcher limit (Linux: `fs.inotify.max_user_watches`) |
| **Current behavior** | Watcher silently fails or stops reporting changes. |
| **Detection** | Not detected. |
| **Recovery** | Detect on `startWatching()` failure. Show warning. Fall back to periodic polling (every 30s). |
| **Severity** | Medium |

### F18 — Watcher Misses Changes

| Attribute | Value |
|-----------|-------|
| **Trigger** | Rapid file operations (Git checkout, npm install) may be coalesced or missed |
| **Current behavior** | `onFileChange` receives reduced events. May miss intermediate states. |
| **Detection** | Not detected. |
| **Recovery** | After external command execution (Git, build), trigger a full tree refresh. |
| **Severity** | Medium |

---

## 7. Concurrent Access Failures

### F19 — AI Agent and User Edit Same File

| Attribute | Value |
|-----------|-------|
| **Trigger** | AI agent is streaming edits while user manually edits the same file |
| **Current behavior** | `AiChangeOverlay` detects conflict via dirty flag. But race conditions exist. |
| **Detection** | Content change event conflicts with AI update. |
| **Recovery** | Show "Concurrent edit detected" dialog. Offer to keep AI changes, user changes, or both (diff view). |
| **Severity** | Medium |

### F20 — tab Eviction While Active

| Attribute | Value |
|-----------|-------|
| **Trigger** | User opens 31st file. FIFO eviction removes the oldest file from `openFiles`. |
| **Current behavior** | The oldest `openFiles[0]` is spliced out. If it was the active tab, active changes to last remaining. |
| **Detection** | Not detected as a failure — silent data loss of tab state. |
| **Recovery** | Change to LRU eviction. Show toast when eviction occurs. |
| **Severity** | Medium |

---

## 8. Crash Recovery

### F21 — Renderer Crash with Unsaved Content

| Attribute | Value |
|-----------|-------|
| **Trigger** | Renderer process crashes while dirty files are open |
| **Current behavior** | Unsaved content is lost. On restart, `restoreWorkspaceState()` shows file paths but content is reloaded from disk. |
| **Detection** | Not detected (crash is external). |
| **Recovery** | Persist dirty buffers to `sessionStorage` or temp file on each content change. Restore from crash snapshot. |
| **Severity** | Critical |

### F22 — Consecutive Crash Loop (Safe Mode)

| Attribute | Value |
|-----------|-------|
| **Trigger** | App crashes 4+ times in 60 seconds |
| **Current behavior** | `safe-mode.ts:35-36` detects crash threshold. `sessionStorage` marks safe mode. |
| **Recovery** | Safe mode disables workspace restore, panel restore, AI runtime, and extensions. User must manually re-enable. |
| **Severity** | High (feature loss) |

---

## Failure Mode Matrix

| ID | Failure | Detectability | User Impact | Recovery |
|----|---------|--------------|-------------|----------|
| F1 | File not found | Medium | Medium | Close tab gracefully |
| F2 | Permission error | High | Medium | Show inline error |
| F3 | Disk full | High | High | Offer save-as |
| F4 | File locked | High | Medium | Retry + save-as |
| F5 | Corrupted state | High | Low | Fall back to defaults |
| F6 | Missing workspace root | Medium | High | Offer folder chooser |
| F7 | Multi-window conflict | Low | Medium | BroadcastChannel warning |
| F8 | Monaco failure | High | High | Textarea fallback |
| F9 | Large file freeze | High | High | Preview mode |
| F10 | Encoding mismatch | Low | Low | Re-open with encoding |
| F11 | Quota exceeded | High | Medium | Priority eviction |
| F12 | Tauri FS failure | High | Low | localStorage fallback |
| F13 | IndexedDB corrupted | Medium | Low | Rebuild index |
| F14 | IPC timeout | Low | High | Timeout + retry |
| F15 | Preload failure | High | High | Graceful fallback |
| F16 | Main process crash | Medium | Critical | Restart overlay |
| F17 | Watcher limit | Low | Medium | Fall back to polling |
| F18 | Watcher misses | Low | Medium | Full refresh on command |
| F19 | Concurrent edit | Medium | Medium | Conflict dialog |
| F20 | Tab eviction | Low | Medium | LRU + toast |
| F21 | Crash w/ unsaved | Low | Critical | Dirty buffer persistence |
| F22 | Crash loop | High | High | Safe mode |
