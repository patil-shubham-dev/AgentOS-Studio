# ADR-009: IDE UX Component Architecture & Layout Standardization

**Status:** Accepted
**Phase:** G
**Date:** 2026-07-02

## Context

Before Phase G, the IDE UI components had accumulated visual inconsistencies and layout bugs:

1. **Split editor overlay issues.** `SplitEditor` used `z-10` for its resize handle, causing it to render beneath the editor's content overlay in certain viewport configurations.

2. **Badge shrink behavior.** `ExitCodeBadge` and `ImpactBadge` in `CommandCard` and `ToolCallCard` lacked `shrink-0`, causing them to compress awkwardly when card content overflowed.

3. **File tree padding.** `WorkspaceExplorer` tree rows used `px-1`, making text feel cramped at narrow widths. The filename element used a fixed width rather than `flex-1`, preventing proper elastic layout.

4. **Large file warnings used inline styles.** The `LargeFileWarning` component used hardcoded pixel values for positioning and sizing instead of Tailwind utility classes.

5. **Monaco editor lacked AI integration.** The Monaco editor instance had no custom actions, context menu entries, or keybindings for AI-powered operations (explain, refactor, fix).

6. **Dense layout inconsistency.** `Composer`, `Card`, and `CommandCard` components had varying padding, font sizes, and gap values, creating visual noise in the conversation thread.

7. **Breadcrumb wrapping.** File breadcrumbs in the editor toolbar wrapped to two lines on moderately long paths due to insufficient flex shrink configuration.

8. **File tree git status icons.** Version control indicators (modified, added, deleted, renamed) were not displayed in the file tree explorer, reducing developer awareness of workspace state.

9. **Drag-and-drop file ordering.** No visual feedback or reordering support existed for files in the explorer tree.

## Decision

### 1. Z-Index Hierarchy Standardization

Define a consistent z-index scale for IDE overlay elements:

```
z-10: Base editor content
z-20: Split editor resize handles, drag indicators
z-30: Floating toolbars, inline menus
z-40: Dropdowns, popovers
z-50: Modals, dialogs
```

`SplitEditor` resize handle changed from `z-10` to `z-20` to stay above editor content.

### 2. Flex Layout Discipline

Two rules applied to all card and badge components:

1. **Badges and icons** receive `shrink-0` to prevent compression:
   - `ExitCodeBadge` in `CommandCard`
   - `ImpactBadge` in `ToolCallCard`
   - All `IconButton` instances in card headers

2. **Fill-space elements** receive `flex-1`:
   - Filename spans in `WorkspaceExplorer` tree rows (replacing fixed width)
   - Breadcrumb labels in editor toolbar

### 3. Spacing Token Alignment

Component spacing aligned to a 4-point grid:

| Component | Previous | Standardized |
|-----------|----------|-------------|
| Tree rows | `px-1` (4px) | `px-2` (8px) |
| Card padding | Mixed (12-16px) | `p-3` (12px) |
| Card gap (vertical) | Mixed (4-8px) | `gap-2` (8px) |
| Card gap (horizontal) | Mixed (6-12px) | `gap-3` (12px) |
| Composer padding | Mixed | `p-2` (8px) |
| Composer gap | Mixed | `gap-2` (8px) |

### 4. Monaco Editor AI Actions

Three custom actions registered in the Monaco editor instance:

| Action | Keybind | Description |
|--------|---------|-------------|
| `ai.explain` | `Ctrl+Shift+E` | Sends selected code to the AI with "Explain this" prefix |
| `ai.refactor` | `Ctrl+Shift+R` | Sends selected code with "Refactor this" prefix |
| `ai.fix` | `Ctrl+Shift+F` | Sends selected code with "Fix issues in this" prefix |

Actions appear in the Monaco context menu under an "AI" submenu. The submenu header is created via `editor.addAction()` with `contextMenuGroupId: "ai"`.

### 5. File Tree Enhancements

- **Git status icons**: Colored dots (green=added, yellow=modified, red=deleted, blue=renamed) rendered via a `gitStatusToColor` mapping in `WorkspaceExplorerRow`.
- **Drag-and-drop**: `onDragStart`/`onDragOver`/`onDrop` handlers on tree rows with visual feedback (opacity change, insertion line). Client-side only — no persistence of reordered state.
- **Row padding**: `px-2` for comfortable touch targets.

### 6. LargeFileWarning Tailwind Migration

All inline `style` props replaced with Tailwind classes:

- `position: "fixed"` → `class="fixed"`
- `bottom: 0, left: 0, right: 0` → `class="inset-x-0 bottom-0"`
- `padding: "12px 16px"` → `class="px-4 py-3"`
- `z-index: 30` → `class="z-30"`

This ensures the warning banner respects the z-index hierarchy and responds to theme changes.

## Consequences

### Positive

1. **Visual consistency.** All card-like components (Composer, Card, CommandCard, ToolCallCard) share the same padding, gap, and font sizing tokens.

2. **No layout compression.** Badges and icons maintain their intrinsic size regardless of container overflow. Fill-space elements expand predictably.

3. **Standardized z-index.** No more elements rendering beneath other layers. New components can reference the documented scale.

4. **Tailwind-only styling.** `LargeFileWarning` no longer has inline styles that could vary from the design system. Animations (fade in/out) use Tailwind's `animate-` utilities.

5. **Editor AI integration.** Users can trigger AI operations directly from the editor without switching to the chat panel.

6. **Better workspace awareness.** Git status colors and drag-and-drop reordering make the file explorer more informative and interactive.

### Negative

1. **Tailwind class count increase.** Some components gained 3-4 additional utility classes. In extreme cases, `className` strings exceed 120 characters. Mitigation: common patterns extracted to shared class constants.

2. **Monaco action registration overhead.** Three custom actions are registered on every editor mount. For editors that are created and destroyed frequently (e.g., quick-compare), this adds ~1ms to mount time.

## Migration Notes

- All inline styles in `LargeFileWarning` removed — no behavior change expected.
- Git status colors use simple dot indicators (8px circles). No tooltip text yet — future work to add hover tooltips with "Modified: src/foo.ts" format.
- Drag-and-drop is visual-only. Reordered state is not persisted across sessions. Future work to persist tree sort order via `IndexPersistence`.

## Key Files

- `src/renderer/components/workspace/SplitEditor.tsx` — `z-20` resize handle
- `src/renderer/components/workspace/explorer/WorkspaceExplorer.tsx` — Tree row padding, filename flex, git status, drag-and-drop
- `src/renderer/components/workspace/explorer/WorkspaceExplorerRow.tsx` — Git status icon rendering
- `src/renderer/components/workspace/timeline/conversation/CommandCard.tsx` — `ExitCodeBadge shrink-0`
- `src/renderer/components/workspace/timeline/conversation/ToolCallCard.tsx` — `ImpactBadge shrink-0`
- `src/renderer/components/workspace/LargeFileWarning.tsx` — Tailwind migration
- `src/renderer/components/editor/MonacoEditor.tsx` — AI action registration
- `src/renderer/components/composer/Composer.tsx` — Dense layout alignment
- `src/renderer/components/workspace/timeline/conversation/Card.tsx` — Dense layout alignment
- `src/renderer/components/workspace/editor-toolbar/EditorBreadcrumb.tsx` — Flex shrink fix
