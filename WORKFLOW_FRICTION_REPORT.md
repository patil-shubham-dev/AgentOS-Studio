# Workflow Friction Report

**Goal:** Identify and measure friction across all user workflows.

---

## User Profiles

| Profile | Description | Primary Needs |
|---------|-------------|---------------|
| New User | First-time visitor, no config | Guided setup, clear defaults |
| Power User | Daily user, custom config | Speed, keyboard shortcuts, batch ops |
| Returning User | Opens existing project | Quick resume, state preservation |

---

## Workflow Analysis

### Flow 1: Install

| Step | New User | Power User | Returning User |
|------|----------|------------|----------------|
| Download installer | ✅ 1 click | ✅ 1 click | ✅ 1 click |
| Run installer | ✅ Silent | ✅ Silent | ✅ Silent |
| First launch config | ❌ No guided setup | ✅ Fast | ✅ Fast |
| **Friction Score** | **HIGH** (no wizard) | **LOW** | **LOW** |

### Flow 2: Open Project

| Step | New User | Power User | Returning User |
|------|----------|------------|----------------|
| See workspace list | ✅ Immediate | ✅ Immediate | ✅ Immediate |
| Pick project | ✅ Click | ✅ Click | ✅ Click |
| File tree loads | ✅ Lazy imports | ✅ Lazy imports | ✅ Lazy imports |
| **Friction Score** | **LOW** (intuitive) | **LOW** | **LOW** |

### Flow 3: Generate AGENTIC.md

| Step | New User | Power User | Returning User |
|------|----------|------------|----------------|
| Discover feature | ❌ No visible button | ✅ Keyboard/menu | ✅ Knows it exists |
| Run generation | ✅ Automatic | ✅ Automatic | ✅ Automatic |
| See result | ❌ No confirmation UI | ✅ Reads file | ✅ Reads file |
| **Friction Score** | **HIGH** (undiscoverable) | **MEDIUM** | **MEDIUM** |

### Flow 4: Ask Question

| Step | New User | Power User | Returning User |
|------|----------|------------|----------------|
| Know where to type | ✅ Chat input visible | ✅ Chat input | ✅ Chat input |
| Get response | ✅ Immediate | ✅ Immediate | ✅ Immediate |
| Understand response | ❌ No progress indicator | ✅ Follows stream | ✅ Follows stream |
| **Friction Score** | **MEDIUM** | **LOW** | **LOW** |

### Flow 5: Modify Code

| Step | New User | Power User | Returning User |
|------|----------|------------|----------------|
| Issue edit command | ❌ Unclear syntax | ✅ Knows format | ✅ Knows format |
| See edit applied | ❌ No preview | ✅ Checks output | ✅ Checks output |
| Verify edit correct | ❌ Must manually verify | ✅ Uses verify cmd | ✅ Uses verify cmd |
| **Friction Score** | **HIGH** | **MEDIUM** | **MEDIUM** |

### Flow 6: Verify Changes

| Step | New User | Power User | Returning User |
|------|----------|------------|----------------|
| Trigger verification | ❌ Not discoverable | ✅ Via menu | ✅ Via menu |
| See results | ⚠️ Internal only | ✅ Reads events | ✅ Reads events |
| Fix failures | ❌ Unclear how | ✅ Manual fix | ✅ Manual fix |
| **Friction Score** | **HIGH** | **MEDIUM** | **MEDIUM** |

### Flow 7: Repair

| Step | New User | Power User | Returning User |
|------|----------|------------|----------------|
| Detect failure | ❌ Silent errors | ⚠️ Reads logs | ⚠️ Reads logs |
| Trigger repair | ❌ Hidden | ✅ From timeline | ✅ From timeline |
| See recovery | ⚠️ Auto-rollback | ✅ Auto-rollback | ✅ Auto-rollback |
| **Friction Score** | **CRITICAL** | **MEDIUM** | **MEDIUM** |

### Flow 8: Close / Reopen Project

| Step | New User | Power User | Returning User |
|------|----------|------------|----------------|
| Close | ✅ Window close | ✅ Window close | ✅ Window close |
| Reopen | ✅ Recent list | ✅ Recent list | ✅ Recent list |
| State restored | ⚠️ Partial (no undo history) | ⚠️ Partial | ⚠️ Partial |
| **Friction Score** | **MEDIUM** | **MEDIUM** | **MEDIUM** |

---

## Top Friction Points (Ranked)

| Rank | Friction | Score | Affects | Fix Priority |
|------|----------|-------|---------|-------------|
| 1 | Silent errors in repair flow | CRITICAL | New users | P0 |
| 2 | No guided setup at first launch | HIGH | New users | P1 |
| 3 | Undiscoverable AGENTIC.md generation | HIGH | New users | P1 |
| 4 | No edit preview before apply | HIGH | All users | P1 |
| 5 | Verification results hidden | HIGH | All users | P1 |
| 6 | No undo for file edits | MEDIUM | All users | P2 |
| 7 | State not fully preserved across sessions | MEDIUM | Returning users | P2 |
| 8 | No keyboard shortcut documentation | MEDIUM | New users | P2 |

---

## Friction Reduction Targets

| Flow | Current | Target | Improvement |
|------|---------|--------|-------------|
| Install | 3 steps, 2 friction points | 3 steps, 0 friction | Add first-launch wizard |
| Open Project | 3 steps, 0 friction | 3 steps, 0 friction | Already good |
| Generate AGENTIC.md | 3 steps, 2 friction | 3 steps, 0 friction | Add discoverable button |
| Ask Question | 4 steps, 1 friction | 4 steps, 0 friction | Add progress indicator |
| Modify Code | 4 steps, 3 friction | 4 steps, 0 friction | Add edit preview |
| Verify Changes | 4 steps, 3 friction | 4 steps, 0 friction | Surface results in UI |
| Repair | 4 steps, 3 friction | 4 steps, 0 friction | Surface error + fix path |
| Close/Reopen | 3 steps, 1 friction | 3 steps, 0 friction | Persist undo history |
