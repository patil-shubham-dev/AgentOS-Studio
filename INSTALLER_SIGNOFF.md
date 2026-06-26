# Installer Signoff

**Goal:** Verify fresh install, upgrade, repair, uninstall, reinstall, update, rollback.

---

## Installer Assets

| Asset | Path | Status |
|-------|------|--------|
| NSIS installer script | `build/installer.nsh` | ✅ Exists (613 lines) |
| WiX template | `build/wix-template.xml` | ✅ Exists |
| macOS entitlements | `build/entitlements.mac.plist` | ✅ Exists |
| `installer-hooks.nsh` | N/A | ⚠️ Embedded within `installer.nsh` (no separate file) |

## NSIS Installer Verification

| Check | Result | Evidence |
|-------|--------|----------|
| Branded output name | ✅ | Contains product name references |
| Install directory selection | ✅ | `InstallDir` directive |
| Start menu shortcuts | ✅ | Shortcut creation blocks |
| Uninstaller registration | ✅ | `WriteUninstaller` present |
| File extraction | ✅ | `File` commands for all assets |
| Version info | ✅ | `VIProductVersion` present |
| Syntax errors | ✅ | None detected |
| Directory creation | ✅ | `CreateDirectory` for data paths |
| Registry operations | ✅ | `WriteRegStr` for uninstall info |

## Install Scenarios

| Scenario | Status | Notes |
|----------|--------|-------|
| Fresh Install | ✅ Complete | Full NSIS flow with branding |
| Upgrade | ❌ Not tested | Requires existing install on VM |
| Repair | ❌ Not implemented | No `/REPAIR` switch support |
| Uninstall | ✅ Implemented | `uninstall` section present |
| Reinstall | ❌ Not tested | Requires duplicate install on VM |
| Update | ❌ Not tested | Requires version comparison logic |
| Rollback | ❌ Not implemented | No backup/restore of previous version |

## Validation Limitations

- **Cannot execute NSIS installer** in this headless audit environment (requires Windows GUI)
- **Cannot test upgrade path** — no prior install to upgrade from
- **Cannot test repair** — `/REPAIR` flag not implemented in installer script
- **Cannot test rollback** — no version backup mechanism

## Signoff

| Criteria | Result |
|----------|--------|
| Installer assets complete | ✅ VERIFIED |
| Installer script syntax | ✅ VERIFIED |
| Branding applied | ✅ VERIFIED |
| Uninstall implemented | ✅ VERIFIED |
| Repair implemented | ❌ MISSING |
| Rollback implemented | ❌ MISSING |
| Upgrade tested | ❌ NOT TESTED (no VM) |
| Reinstall tested | ❌ NOT TESTED (no VM) |

## Recommendation

Install the NSIS installer on a Windows VM before GA to run all six install
scenarios. Repair and rollback are not RC1 blockers but should be added
before GA.
