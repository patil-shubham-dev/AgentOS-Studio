# Workspace Performance Report

## Methodology

Performance was assessed through code analysis of critical paths. Actual measurements should be collected on reference hardware (4GB/RAM, 16GB, 32GB) using `performance.now()` markers and Chrome DevTools Performance traces.

---

## 1. Workspace Open Time

### Current Flow

```
code-canvas.tsx mount
  → read agentic-workspace-root from localStorage                 (~0ms)
  → loadFileTree(rootPath)                                        (O(n))
    → Electron IPC: workspaceGetTree (recursive)                   (varies)
    → OR Tauri: list_directory (recursive)                        (varies)
  → setFileTree(tree)                                              (~0ms)
  → @pierre/trees: model.resetPaths(paths)                        (O(n))
  → restoreWorkspaceState()                                        (~0ms)
  → loadRestoredFileContent() (for each open tab)                  (O(tabs))
```

### Estimated Times (10k files)

| Operation | Estimate | Notes |
|-----------|----------|-------|
| localStorage reads | <1ms | Near-instant |
| File tree load (IPC) | 500-3000ms | Depends on disk speed, file count |
| Tree model reset | 200-1000ms | `@pierre/trees` path insertion |
| Restore workspace state | <1ms | localStorage parse |
| Load content for all tabs | 100-500ms/tab | Sequential reads |

**Total estimated**: 1-5 seconds for 10k files with 10 open tabs on SSD.

### Issues

- **Full tree load is the bottleneck**: `loadFileTree` reads every file/directory recursively. For 100k+ files, this could take 10-30 seconds.
- **Tree model reset is O(n)**: `@pierre/trees` processes all paths on every reset. No incremental update API.
- **Content loading is sequential**: Each tab's content is loaded one at a time. No parallelization.

---

## 2. File Tree Operations

### Operation Cost Estimates

| Operation | Current | Optimized | Notes |
|-----------|---------|-----------|-------|
| Initial tree load | O(n) | O(n) | Baseline — must read all files |
| Refresh (full) | O(n) | O(n) | Same as initial load |
| Create file | O(n) | O(k) | Currently full reload; target: insert single node |
| Rename | O(n) | O(k) | Currently full reload; target: update single node |
| Delete | O(n) | O(k) | Currently full reload; target: remove single node |
| Lazy directory load | O(k) | O(k) | Already lazy per-directory |

Where n = total files, k = affected subtree size.

### Issue: Full Tree Reload After Every CRUD

Every operation in `useFileActions.ts` calls `refreshTree()` → `loadFileTree(rootPath)`. For a 100k-file repo:
- **Full load**: ~5-15 seconds
- **Single node insert**: ~10ms (if we update in-place)

**Impact**: Creating or renaming a file in a large repo causes a multi-second UI freeze.

---

## 3. Tab Switching Performance

### Current Flow

```
User clicks tab
  → workspace-store.setActiveFile(path)                            (~0ms)
  → workspace-store.openFile(file) if not already open              (~0ms)
  → Monaco: editor.getModel() → getOrCreateModel()                  (~0ms if cached)
  → Monaco: setModel(model)                                         (<10ms)
  → Monaco: restoreViewState(state)                                 (<5ms)
  → requestRefresh("workspace_change")                             (deferred)
```

### Model Cache Hit Rate

- **First open**: Model created. Time: 50-200ms (tokenization + syntax highlighting).
- **Subsequent opens**: Model reused from cache. Time: <15ms.
- **Issue**: `modelCache` is unbounded but never evicted. Cache grows monotonically.

### Estimated Switch Time

| Scenario | Time |
|----------|------|
| Tab switch (cached) | <20ms |
| Tab switch (uncached, small file) | 50-100ms |
| Tab switch (uncached, 5MB file) | 500-3000ms |

---

## 4. Memory Usage

### Known Allocations

| Component | Memory | Notes |
|-----------|--------|-------|
| `modelCache` | ~1-5MB per file model | Unbounded, grows with unique files opened |
| `editorViewStateCache` | ~1KB per entry | Unbounded, grows with unique files opened |
| fileTree (10k nodes) | ~500KB-2MB | Depends on path depth |
| Monaco editor instance | ~20-50MB baseline | Before any files opened |
| Monaco per-file model | ~0.5-5MB | Tokenized AST |
| fileTree chart (ProjectMap) | ~1-5MB | SVG force graph |
| Semantic search index | ~10-100MB | Varies by project size |

### Estimated Session Memory

| Scenario | Memory | Notes |
|----------|--------|-------|
| Empty workspace | 30-50MB | Monaco baseline |
| 10 open files, 10k file tree | 80-150MB | Typical session |
| 30 open files, large index | 200-500MB | Heavy session |
| Memory leak (long session) | 500MB+ | Unbounded caches accumulate |

### Issues

- **Monaco model cache never pruned**: Each model holds the tokenized file content. Over a long session with 100+ unique files opened, this can exceed 200MB.
- **View state cache never pruned**: Smaller concern (~100KB for 100 files), but still unbounded.
- **No memory pressure monitoring**: `workspace-runtime.ts` tracks `memoryPressure` value but nothing in the workspace store monitors or responds to memory pressure.

---

## 5. CPU Utilization

### Hot Paths

| Operation | CPU Time | Frequency |
|-----------|----------|-----------|
| Full tree load + model reset | 500-3000ms | Once on open, on every CRUD |
| Monaco tokenization (first open) | 50-200ms | Once per unique file |
| File tree sort + flatten | 50-200ms | On every tree change |
| Git status (polling) | 100-500ms | Every 30s |
| Semantic search indexing | 1000-5000ms | On tree change (debounced 2s) |

### Issue: Full Tree Reload Causes Jank

Every CRUD operation triggers:
1. Full filesystem tree read (I/O bound)
2. Tree model reset (CPU bound — all paths re-inserted)
3. Flatten tree for virtual list (CPU bound)
4. Git status map rebuild (CPU bound)
5. Semantic index rebuild (CPU bound, debounced but still triggered)

For large repos, a single file create can cause 1-3 seconds of UI freezing.

---

## 6. Disk I/O

### Read Operations

| Operation | Read Pattern | Data |
|-----------|-------------|------|
| File tree load | Sequential directory reads | Directory listing |
| File content load | Random read per file | File content |
| Symbol index build | Read every source file | Full project scan |
| Semantic index build | Read every source file | Full project scan |

### Write Operations

| Operation | Write Pattern | Data |
|-----------|--------------|------|
| Save file | Write single file | File content |
| Persist workspace state | Write to localStorage | ~1KB JSON |
| Persist settings | Write to localStorage / Tauri FS | ~10-100KB JSON |
| Persistent log | Append to file | Log entries |

---

## 7. Performance Budgets (Recommended)

| Metric | Budget | Measurement Point |
|--------|--------|-------------------|
| Workspace open (10k files) | <2s | From click to tree visible |
| Workspace open (100k files) | <5s | Same |
| Tab switch (cached) | <20ms | Click to editor ready |
| Tab switch (uncached, <1MB) | <200ms | Same |
| File create | <100ms | Click to tree updated |
| File rename | <100ms | Same |
| File delete | <100ms | Same |
| Initial Monaco paint | <500ms | From mount to code visible |
| Search indexing (10k files) | <5s | Background, non-blocking |
| Memory (idle, 10 tabs) | <150MB | Process memory |
| Memory (heavy, 30 tabs) | <300MB | Process memory |
| CPU (idle) | <5% | Task Manager |

---

## 8. Optimization Recommendations

| Priority | Optimization | Expected Impact | Effort |
|----------|-------------|----------------|--------|
| P0 | Targeted tree updates instead of full reload | 10-100x faster CRUD operations | Medium |
| P1 | Prune modelCache on tab close | Prevent memory leak | Small |
| P1 | Virtualize file tree model updates | Reduce UI jank on tree change | Medium |
| P2 | Parallel tab content loading | Faster session restore | Small |
| P2 | Incremental Git status (watch-based) | Reduce 30s poll overhead | Medium |
| P3 | Lazy Monaco model creation (defer tokenization) | Faster tab switch for large files | Medium |
| P3 | Compress file tree for IPC transfer | Reduce serialization time | Small |
