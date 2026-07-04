# ADR-010: Visual QA & Layout Standardization

**Status:** Accepted
**Phase:** G
**Date:** 2026-07-02

## Context

During Phase G implementation, a visual QA pass identified five specific layout defects that did not warrant full component rewrites but required targeted CSS fixes. These defects were symptomatic of a broader lack of layout discipline during earlier development phases:

1. **Stacking context violations.** Components used z-index values without a shared reference scale, leading to elements that should be above editor content rendering beneath it.

2. **Missing shrink constraints.** Badges and decorative elements without `shrink-0` would compress in flex layouts when container width was constrained, making them illegible.

3. **Inconsistent tree row padding.** The `WorkspaceExplorer` used `px-1` (4px) horizontal padding while similar list-like components (command list, file picker) used `px-2` (8px) or `px-3` (12px).

4. **Fixed-width filename cells.** Filename elements in the tree used `width` instead of `flex-1`, preventing the tree from using available horizontal space. This caused path truncation even when the panel had room.

5. **Inline style fragmentation.** `LargeFileWarning` used hand-coded pixel values for positioning while equivalent components used Tailwind utility classes, creating a maintenance inconsistency.

## Decision

### 1. Z-Index Audit and Correction

Audit all `z-{n}` values across the workspace component tree against the canonical scale defined in ADR-009:

| Component | Before | After | Rationale |
|-----------|--------|-------|-----------|
| SplitEditor resize handle | `z-10` | `z-20` | Should overlay editor content (z-10) but remain below floating menus (z-30) |
| LargeFileWarning banner | `z-30` | `z-30` | Already correct; documented |

No other violations found. The `z-20` tier now serves as the canonical "overlay handle / drag indicator" tier.

### 2. Badge shrink-0 Audit

All `Badge`-like components in `WorkspaceExplorer`, `CommandCard`, and `ToolCallCard` reviewed for flex shrink behavior:

**Fixed:**
- `ExitCodeBadge` in `CommandCard`: added `shrink-0`
- `ImpactBadge` in `ToolCallCard`: added `shrink-0`

**Verified correct (no change needed):**
- `StatusDot` in `WorkspaceExplorerRow` — already used fixed dimensions (`w-2 h-2`)
- `FileIcon` in `WorkspaceExplorerRow` — already `shrink-0`
- `ModelBadge` in agent session headers — already `shrink-0`
- Token count badges in message metadata — already `shrink-0`

### 3. Tree Row Layout Standardization

`WorkspaceExplorer` tree rows adopt a standardized flex layout:

```tsx
// Standard row layout
<div className="flex items-center gap-1 px-2 h-7 hover:bg-accent/50 cursor-pointer">
  <FileIcon className="shrink-0" />
  <span className="flex-1 truncate text-sm">{fileName}</span>
  <StatusDot status={fileStatus} className="shrink-0" />
</div>
```

Key changes:
- `px-2` (was `px-1`) — consistent with other list-like components
- `h-7` (28px) — comfortable touch target for pointer interaction
- `text-sm` — standard body size for file names

### 4. Elastic Filename Layout

The filename `<span>` changed from a fixed-width pattern to `flex-1 truncate`:

**Before (conceptual):**
```tsx
<span className="w-[160px] truncate">{fileName}</span>
```

**After:**
```tsx
<span className="flex-1 truncate">{fileName}</span>
```

This allows the filename to use all available space in the tree panel while truncating with ellipsis when the panel is narrow. The `flex-1` on the filename and `shrink-0` on icons/badges work together: icons maintain their size, the filename absorbs all remaining space.

### 5. LargeFileWarning Tailwind Conversion

All inline styles in `LargeFileWarning` converted to Tailwind:

| Inline Style | Tailwind Replacement | Notes |
|-------------|---------------------|-------|
| `position: "fixed"` | `fixed` | |
| `bottom: 0, left: 0, right: 0` | `inset-x-0 bottom-0` | |
| `zIndex: 30` | `z-30` | Confirmed correct per hierarchy |
| `padding: "12px 16px"` | `px-4 py-3` | 12px = py-3 (0.75rem), 16px = px-4 (1rem) |
| `display: "flex"` | `flex` | |
| `alignItems: "center"` | `items-center` | |
| `gap: "12px"` | `gap-3` | |
| `borderTop: "1px solid..."` | `border-t` | Color via `border-border` |
| `fontSize: "14px"` | `text-sm` | |

The component's fade-in animation was preserved but migrated from `@keyframes` in a `<style>` tag to Tailwind's `animate-in` utility (from `tailwindcss-animate`).

## Verification

1. **Visual inspection**: Each fix verified in the browser at three viewport widths (1200px, 768px, 480px).
2. **No regressions**: All existing component and integration tests continue to pass.
3. **TypeScript**: No type changes — all fixes are CSS-only.

## Consequences

### Positive

1. **Immediate visual improvement.** The five targeted fixes resolved the most visible layout defects without refactoring any component's logic or data flow.

2. **Pattern documentation.** The fixes establish reusable patterns (flex-1 filename, shrink-0 badge, px-2 row padding) that new components can follow.

3. **No behavioral risk.** All fixes are CSS-only. No JavaScript logic, state management, or rendering behavior was modified.

### Negative

1. **Manual audit required for future components.** The z-index hierarchy and flex layout patterns are documented but not enforced by lint rules. Future components could introduce violations.

2. **`LargeFileWarning` position behavior.** The `fixed` positioning made the banner appear on top of toolbars and menus. Verified that `z-30` keeps it below `z-40` (dropdowns) and `z-50` (modals), but if any element is added at `z-35` in the future, the banner will clip.

## Key Files

- `src/renderer/components/workspace/SplitEditor.tsx` — `z-10` → `z-20`
- `src/renderer/components/workspace/timeline/conversation/CommandCard.tsx` — ExitCodeBadge `shrink-0`
- `src/renderer/components/workspace/timeline/conversation/ToolCallCard.tsx` — ImpactBadge `shrink-0`
- `src/renderer/components/workspace/explorer/WorkspaceExplorer.tsx` — Tree row `px-1` → `px-2`, filename `flex-1`
- `src/renderer/components/workspace/LargeFileWarning.tsx` — Inline styles → Tailwind
