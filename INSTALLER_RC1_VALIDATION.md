# Installer RC1 Validation

**Goal:** Test all install scenarios on a Windows VM.

---

## Prerequisites
- Windows 10/11 VM (or physical machine)
- Clean OS (no prior AgenticOS install)
- Prior AgenticOS install (for upgrade test)
- Network access to download

---

## Test Scenarios

### 1. Fresh Install

| Step | Expected | Actual | Pass/Fail |
|------|----------|--------|-----------|
| Run installer | Installer launches without UAC warning | — | ⏳ UNTESTED |
| License acceptance | License displayed, accept required | — | ⏳ UNTESTED |
| Install directory | Default path accepted | — | ⏳ UNTESTED |
| Start menu shortcut | Created in AgenticOS folder | — | ⏳ UNTESTED |
| Desktop shortcut | Optional, created if selected | — | ⏳ UNTESTED |
| Launch after install | Application opens without crash | — | ⏳ UNTESTED |
| First-launch wizard | Wizard appears on first run | — | ⏳ UNTESTED |

### 2. Upgrade (Fresh → RC1)

| Step | Expected | Actual | Pass/Fail |
|------|----------|--------|-----------|
| Run RC1 installer over existing install | Upgrade mode detected | — | ⏳ UNTESTED |
| Settings preserved | Existing config.json retained | — | ⏳ UNTESTED |
| Workspace history preserved | Recent workspaces list kept | — | ⏳ UNTESTED |
| Provider config preserved | API keys and model settings kept | — | ⏳ UNTESTED |

### 3. Repair

| Step | Expected | Actual | Pass/Fail |
|------|----------|--------|-----------|
| Run installer with /REPAIR | Repair mode activates | — | ❌ NOT IMPLEMENTED |
| Missing files restored | Corrupted/missing files replaced | — | ❌ NOT IMPLEMENTED |

### 4. Uninstall

| Step | Expected | Actual | Pass/Fail |
|------|----------|--------|-----------|
| Control Panel uninstall | AgenticOS listed in Programs | — | ⏳ UNTESTED |
| Data cleanup | User data directory preserved? | — | ⏳ UNTESTED |
| Shortcuts removed | Start menu + desktop cleaned | — | ⏳ UNTESTED |

### 5. Reinstall

| Step | Expected | Actual | Pass/Fail |
|------|----------|--------|-----------|
| Uninstall → Fresh Install | Both operations succeed | — | ⏳ UNTESTED |

### 6. Update (In-app)

| Step | Expected | Actual | Pass/Fail |
|------|----------|--------|-----------|
| Update check | App detects new version | — | ⏳ UNTESTED |
| Download update | Download starts automatically | — | ⏳ UNTESTED |
| Apply update | App restarts with new version | — | ⏳ UNTESTED |

### 7. Rollback

| Step | Expected | Actual | Pass/Fail |
|------|----------|--------|-----------|
| Version backup | Previous version backed up | — | ❌ NOT IMPLEMENTED |
| Rollback trigger | User can revert to previous | — | ❌ NOT IMPLEMENTED |

---

## Installer Assets

| Asset | Path | Status |
|-------|------|--------|
| NSIS installer script | `build/installer.nsh` | ✅ EXISTS (613 lines, branded) |
| WiX template | `build/wix-template.xml` | ✅ EXISTS |
| macOS entitlements | `build/entitlements.mac.plist` | ✅ EXISTS |
| Build integrity check | `scripts/verify-build.mjs` | ✅ EXISTS (74 lines) |

---

## Known Issues

1. **Repair mode not implemented** — `installer.nsh` has no `/REPAIR` switch
2. **Rollback not implemented** — No version backup mechanism
3. **Cannot test on this machine** — Requires Windows VM with clean OS
4. **installer-hooks.nsh** — Not a separate file (hooks embedded in `installer.nsh`)

---

## Signoff

| Check | Result |
|-------|--------|
| Installer assets exist | ✅ |
| Installer syntax valid | ✅ |
| Uninstall implemented | ✅ |
| Fresh install testable | ⏳ Requires VM |
| Upgrade testable | ⏳ Requires VM |
| Repair implementable | ❌ Not in RC1 scope |
| Rollback implementable | ❌ Not in RC1 scope |
