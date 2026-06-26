# Workspace Test Plan

## Scope

End-to-end tests covering all critical workspace flows. Tests should run against the packaged Electron application (not just the renderer) and be integrated into CI.

---

## Test Infrastructure Requirements

1. **Electron test harness**: Use `playwright` or `spectron` to launch and control the packaged app
2. **Temp workspace fixtures**: Pre-created directory structures with known files
3. **Fixture cleanup**: After each test, clean up temp directories
4. **CI integration**: Tests must fail the pipeline on any failure

---

## 1. Workspace Open / Close

### TC-01: Open workspace from file picker

- Action: Click "Open Folder" → select a valid directory
- Expect: File tree populates, workspace root appears in sidebar, welcome page dismissed
- Assert: `workspace-store.rootPath === selected path`, `fileTree.length > 0`

### TC-02: Open workspace from recent list

- Action: Open app → click recent workspace entry
- Expect: Same as TC-01
- Assert: Workspace loads with same root path

### TC-03: Close workspace

- Action: Open workspace → Close workspace (via command or menu)
- Expect: File tree clears, editor tabs close, welcome page shown
- Assert: `rootPath === null`, `openFiles === []`, `activeFilePath === null`

### TC-04: Switch between workspaces

- Action: Open workspace A → Open workspace B
- Expect: Workspace B loads, workspace A state is not visible
- Assert: `rootPath` changes, file tree reflects B's structure

---

## 2. Session Restoration

### TC-05: Restore open tabs after restart

- Action: Open workspace → open 3 files → close app → reopen
- Expect: Same 3 files are open, same active tab
- Assert: `openFiles.length === 3`, `activeFilePath` matches

### TC-06: Restore cursor position after restart

- Action: Open file → move cursor to line 42, column 15 → close app → reopen
- Expect: Cursor at line 42, column 15
- Assert: Monaco cursor position restored

### TC-07: Restore scroll position after restart

- Action: Open large file → scroll to line 500 → close app → reopen
- Expect: Visible range near line 500
- Assert: Monaco scroll position restored

### TC-08: Restore split editor after restart (future)

- Action: Open split editor → close app → reopen
- Expect: Split editor state restored (same mode, same file)
- Assert: `splitMode` and `splitFilePath` match pre-restart values

### TC-09: No restore when safe mode active

- Action: Enable safe mode → open workspace → restart
- Expect: No workspace state restored (clean start)
- Assert: `openFiles === []`, `activeFilePath === null`

---

## 3. File Tree

### TC-10: Initial tree load

- Action: Open workspace with known structure
- Expect: All files and directories visible, no duplicates
- Assert: File count matches expected, directory structure is correct

### TC-11: Create file

- Action: In explorer, create file "test.ts" in root
- Expect: File appears in tree, opens in editor with empty content
- Assert: `fileTree` contains new entry, `openFiles` includes it

### TC-12: Create directory

- Action: In explorer, create directory "new-folder" in root
- Expect: Directory appears in tree, expandable, empty
- Assert: `fileTree` contains new directory entry, `children.length === 0`

### TC-13: Rename file

- Action: Right-click file → Rename → type new name
- Expect: File renamed in tree, tab title updates if file is open
- Assert: File with new path exists, old path no longer in tree

### TC-14: Rename directory

- Action: Right-click directory → Rename → type new name
- Expect: Directory and all children renamed
- Assert: All descendant paths updated

### TC-15: Delete file

- Action: Right-click file → Delete → confirm
- Expect: File removed from tree, tab closes if open
- Assert: File not in `fileTree`, `openFiles`, or `activeFilePath`

### TC-16: Delete directory (recursive)

- Action: Right-click directory with nested files → Delete → confirm
- Expect: Directory and all children removed
- Assert: Tree no longer contains any paths under the deleted directory

### TC-17: Move file (drag-and-drop)

- Action: Drag file from root into subdirectory
- Expect: File moved to new location, tree updated
- Assert: File at new path, not at old path

### TC-18: Multiple file selection operations

- Action: Select multiple files → Delete (or Move)
- Expect: Operation applies to all selected files
- Assert: All selected files affected, non-selected files unchanged

### TC-19: Tree expansion state preserved on refresh

- Action: Expand dir1/subdir1 → create new file in root → tree refreshes
- Expect: dir1/subdir1 remains expanded
- Assert: Expanded paths preserved after tree update

### TC-20: Large directory lazy loading

- Action: Expand directory with 1000+ children
- Expect: Children load asynchronously, tree remains responsive
- Assert: Loading indicator shown, children appear after load

---

## 4. Editor

### TC-21: Open file from explorer

- Action: Click file in explorer
- Expect: Tab opens in editor, content loaded, syntax highlighted
- Assert: Tab visible, Monaco model has correct content

### TC-22: Open file from search

- Action: Search for file name → click result
- Expect: Same as TC-21
- Assert: Tab opens with correct content

### TC-23: Close active tab

- Action: Open 3 files → close active (middle) tab
- Expect: Tab closes, left neighbor becomes active
- Assert: `activeFilePath === left neighbor path`

### TC-24: Close non-active tab

- Action: Open 3 files → close non-active tab
- Expect: Tab closes, active tab unchanged
- Assert: `activeFilePath` not changed

### TC-25: Close last tab

- Action: Open 1 file → close it
- Expect: No tabs, welcome page shown
- Assert: `openFiles === []`, `activeFilePath === null`

### TC-26: Tab FIFO eviction

- Action: Open 31 files
- Expect: Only 30 files in tabs, oldest is evicted
- Assert: `openFiles.length === 30`, first opened file no longer present

### TC-27: Tab content reflects file changes

- Action: Open file → edit content → save → reopen file
- Expect: Saved content persists
- Assert: Monaco content matches file on disk

### TC-28: Dirty indicator

- Action: Open file → make edit without saving
- Expect: Tab shows dirty indicator (blue dot)
- Assert: `isDirty === true` for the tab

### TC-29: External file change detected

- Action: Open file in editor → modify file externally → switch to tab
- Expect: Editor detects change, prompts reload (or auto-reloads)
- Assert: Content updated

### TC-30: Undo/redo

- Action: Make edits → Ctrl+Z → Ctrl+Shift+Z
- Expect: Undo reverts, redo restores
- Assert: Content matches expected after each operation

### TC-31: Split editor — open

- Action: Open file → click "Split" button
- Expect: Two editors visible, same file in both
- Assert: `splitMode !== 'none'`, both editors show content

### TC-32: Split editor — close

- Action: Open split editor → close split
- Expect: Single editor, original view restored
- Assert: `splitMode === 'none'`

### TC-33: Split editor — different files

- Action: Open file A → split → select file B for second pane
- Expect: Left shows A, right shows B
- Assert: Each editor has its own content and cursor

---

## 5. Persistence

### TC-34: Workspace state persists across tabs

- Action: Open workspace, open files → navigate to settings → navigate back to workspace
- Expect: Workspace state unchanged
- Assert: `openFiles`, `activeFilePath`, cursor position preserved

### TC-35: Workspace state isolated per root

- Action: Open workspace A → open files a1, a2 → close → open workspace B → open files b1, b2 → restart
- Expect: Opening workspace A shows a1, a2; opening B shows b1, b2
- Assert: State is correctly isolated by workspace root

### TC-36: Chat history survives restart

- Action: Have conversation → close app → reopen
- Expect: Chat history visible in timeline, last session restored
- Assert: Timeline contains previous messages

### TC-37: Browser sessions survive restart

- Action: Open browser tab → navigate to URL → close app → reopen
- Expect: Browser tab restored with same URL
- Assert: Browser session visible in browser workspace

### TC-38: Settings survive restart

- Action: Add provider → reopen app
- Expect: Provider still configured
- Assert: `useAppStore.getState().providers` includes the provider

### TC-39: localStorage quota handling

- Action: Fill localStorage to near capacity → open workspace
- Expect: App continues working, no crash
- Assert: `safe-storage.ts` eviction works correctly

---

## 6. Crash & Recovery

### TC-40: Renderer crash with unsaved content

- Action: Open file, make unsaved edits → kill renderer process → restart
- Expect: Tab restored with file content from disk (not dirty state)
- Assert: `openFiles` restored, `isDirty === false` for all files

### TC-41: Consecutive crashes trigger safe mode

- Action: Force crash 4 times in 60 seconds → restart
- Expect: Safe mode activates, workspace restore disabled
- Assert: `sessionStorage` contains safe mode flag, no state restored

### TC-42: Safe mode recovery

- Action: Trigger safe mode → manually resolve issue → restart
- Expect: Safe mode deactivates, normal operation resumes
- Assert: `sessionStorage` safe mode flag cleared

### TC-43: Missing workspace folder

- Action: Open workspace → delete workspace folder externally → restart
- Expect: Graceful error message, option to choose another folder
- Assert: No crash, no blank screen

### TC-44: Corrupted localStorage state

- Action: Write corrupted JSON to `agentic-workspace-state` → restart
- Expect: App loads with default state (empty workspace)
- Assert: No crash, console warning logged

---

## 7. Performance

### TC-45: Large workspace open time

- Action: Open workspace with 100k+ files
- Expect: Tree visible within 5 seconds
- Assert: Measure time from click to tree rendered

### TC-46: Tab switch time

- Action: Open 10 tabs → rapidly switch between tabs 5-6
- Expect: Each switch completes within 50ms
- Assert: `performance.now()` measurements

### TC-47: File create in large workspace

- Action: Create new file in workspace with 100k+ files
- Expect: Tree updates within 500ms
- Assert: Time from Enter to tree updated

### TC-48: Memory stability over time

- Action: Use workspace for 1 hour (open/close files, edit, search, etc.)
- Expect: Memory does not grow unbounded
- Assert: Heap snapshots at t=0 and t=60min show <50MB growth

---

## 8. Cross-Platform

### TC-49: Windows — path handling

- Action: Open workspace at `C:\Users\user\project`
- Expect: All paths use forward slashes after normalization
- Assert: No backslash-based path errors

### TC-50: macOS — package contents

- Action: Open `.app` bundle as workspace
- Expect: Tree shows package contents (not treated as single file)
- Assert: Directory entry for `.app` is expandable

### TC-51: Linux — symlinks

- Action: Open workspace containing symlinks
- Expect: Symlinks shown in tree, can be opened
- Assert: Symlinked files are readable

### TC-52: Case-sensitive filesystem (Linux)

- Action: Open workspace with `Foo.ts` and `foo.ts`
- Expect: Both files shown, distinct entries
- Assert: Two entries in tree, both openable

---

## 9. Multi-Window

### TC-53: Open same workspace in two windows

- Action: Open workspace → open second window with same workspace
- Expect: Both windows functional, warning about multi-window conflicts
- Assert: Warning banner visible

### TC-54: Edit in one window reflects in other

- Action: Open same workspace in two windows → create file in window A
- Expect: File appears in window B tree within reasonable time
- Assert: File watcher triggers update in second window

---

## Test Execution

### Running Tests

```bash
# Run all workspace tests
npm run test:workspace

# Run specific test file
npm run test:workspace -- --grep "TC-05"

# Run with Electron debug output
WORKSPACE_TEST_DEBUG=true npm run test:workspace
```

### CI Integration

```yaml
# .github/workflows/workspace-tests.yml
jobs:
  workspace-tests:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
      - run: npm run test:workspace
```

### Test Results Tracking

| Test Suite | Total Tests | Passing | Failing | Last Run |
|-----------|-------------|---------|---------|----------|
| Workspace Open/Close | 4 | — | — | — |
| Session Restoration | 5 | — | — | — |
| File Tree | 10 | — | — | — |
| Editor | 13 | — | — | — |
| Persistence | 6 | — | — | — |
| Crash & Recovery | 5 | — | — | — |
| Performance | 4 | — | — | — |
| Cross-Platform | 4 | — | — | — |
| Multi-Window | 2 | — | — | — |
| **Total** | **53** | — | — | — |
