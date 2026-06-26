export interface ShortcutBinding {
  id: string
  keys: string[]
  label: string
  scope: "global" | "workspace" | "terminal" | "settings" | "explorer" | "chat" | "navigation" | "commands"
  action: string
  component: string
  category?: "navigation" | "editing" | "views" | "session" | "file" | "chat" | "debug" | "search"
}

const registeredShortcuts = new Map<string, ShortcutBinding>()

export function registerShortcut(binding: ShortcutBinding): void {
  registeredShortcuts.set(binding.id, binding)
}

export function getShortcut(id: string): ShortcutBinding | undefined {
  return registeredShortcuts.get(id)
}

export function listShortcuts(scope?: ShortcutBinding["scope"]): ShortcutBinding[] {
  const all = Array.from(registeredShortcuts.values())
  if (scope) return all.filter((s) => s.scope === scope)
  return all
}

export function listScopes(): ShortcutBinding["scope"][] {
  const scopes = new Set<ShortcutBinding["scope"]>()
  for (const s of registeredShortcuts.values()) scopes.add(s.scope)
  return Array.from(scopes)
}

export function formatShortcut(keys: string[]): string {
  return keys
    .map((k) => {
      const map: Record<string, string> = {
        Meta: "\u2318",
        Control: "Ctrl",
        Shift: "\u21E7",
        Alt: "\u2325",
        Escape: "Esc",
        Enter: "\u21B5",
        Backspace: "\u232B",
        Delete: "\u2326",
        ArrowUp: "\u2191",
        ArrowDown: "\u2193",
        ArrowLeft: "\u2190",
        ArrowRight: "\u2192",
        Tab: "\u21B9",
        Space: "\u2423",
      }
      return map[k] ?? k
    })
    .join("+")
}

export function getShortcutHint(id: string): string {
  const binding = registeredShortcuts.get(id)
  if (!binding) return ""
  return formatShortcut(binding.keys)
}

export function auditShortcuts(): { missing: string[]; conflicts: ShortcutBinding[][] } {
  const missing: string[] = []
  const conflictMap = new Map<string, ShortcutBinding[]>()

  const all = Array.from(registeredShortcuts.values())
  for (const binding of all) {
    const key = binding.keys.join("+")
    const sameScopeConflicts = all.filter(
      (b) => b.keys.join("+") === key && b.scope === binding.scope && b.id !== binding.id
    )
    if (sameScopeConflicts.length > 0) {
      const existing = conflictMap.get(key) ?? []
      if (!existing.find((e) => e.id === binding.id)) {
        existing.push(binding)
      }
      for (const sc of sameScopeConflicts) {
        if (!existing.find((e) => e.id === sc.id)) {
          existing.push(sc)
        }
      }
      conflictMap.set(key, existing)
    }
  }

  const conflicts = Array.from(conflictMap.values()).filter((g) => g.length > 1)

  const expected = [
    "new-chat",
    "toggle-terminal",
    "toggle-explorer",
    "command-palette",
    "settings",
    "explorer-search",
    "chat-send",
    "chat-newline",
    "focus-chat",
    "stop-response",
    "toggle-sidebar",
    "quick-open",
    "focus-editor",
    "save-file",
    "close-tab",
  ]
  for (const id of expected) {
    if (!registeredShortcuts.has(id)) missing.push(id)
  }

  return { missing, conflicts }
}

registerShortcut({
  id: "new-chat",
  keys: ["Control", "Shift", "n"],
  label: "New Chat",
  scope: "global",
  action: "Clear timeline and start fresh conversation",
  component: "_app-shell",
  category: "session",
})

registerShortcut({
  id: "toggle-terminal",
  keys: ["Control", "`"],
  label: "Toggle Terminal",
  scope: "global",
  action: "Show/hide terminal panel",
  component: "_app-shell",
  category: "views",
})

registerShortcut({
  id: "toggle-explorer",
  keys: ["Control", "Shift", "e"],
  label: "Toggle Explorer",
  scope: "global",
  action: "Show/hide file explorer",
  component: "_app-shell",
  category: "views",
})

registerShortcut({
  id: "command-palette",
  keys: ["Control", "Shift", "p"],
  label: "Command Palette",
  scope: "global",
  action: "Open command palette",
  component: "_app-shell",
  category: "navigation",
})

registerShortcut({
  id: "settings",
  keys: ["Control", ","],
  label: "Open Settings",
  scope: "global",
  action: "Open settings page",
  component: "_app-shell",
  category: "navigation",
})

registerShortcut({
  id: "explorer-search",
  keys: ["Control", "Shift", "f"],
  label: "Search Files",
  scope: "explorer",
  action: "Focus the explorer search bar",
  component: "WorkspaceExplorer",
  category: "search",
})

registerShortcut({
  id: "explorer-focus",
  keys: ["Control", "Shift", "1"],
  label: "Focus Explorer",
  scope: "explorer",
  action: "Move keyboard focus to file tree",
  component: "WorkspaceExplorer",
  category: "navigation",
})

registerShortcut({
  id: "chat-send",
  keys: ["Enter"],
  label: "Send Message",
  scope: "chat",
  action: "Send the current chat message",
  component: "ChatPanel",
  category: "chat",
})

registerShortcut({
  id: "chat-newline",
  keys: ["Shift", "Enter"],
  label: "Insert Newline",
  scope: "chat",
  action: "Insert a newline in the message input (instead of sending)",
  component: "ChatPanel",
  category: "chat",
})

registerShortcut({
  id: "focus-chat",
  keys: ["Control", "Shift", "i"],
  label: "Focus Chat Input",
  scope: "global",
  action: "Move keyboard focus to chat input",
  component: "_app-shell",
  category: "navigation",
})

registerShortcut({
  id: "stop-response",
  keys: ["Escape"],
  label: "Stop Response",
  scope: "workspace",
  action: "Stop the current AI response",
  component: "ChatPanel",
  category: "session",
})

registerShortcut({
  id: "toggle-sidebar",
  keys: ["Control", "b"],
  label: "Toggle Sidebar",
  scope: "global",
  action: "Show/hide the navigation sidebar",
  component: "_app-shell",
  category: "views",
})

registerShortcut({
  id: "quick-open",
  keys: ["Control", "p"],
  label: "Quick Open",
  scope: "global",
  action: "Quick open files by name",
  component: "_app-shell",
  category: "navigation",
})

registerShortcut({
  id: "focus-editor",
  keys: ["Control", "Shift", "x"],
  label: "Focus Editor",
  scope: "workspace",
  action: "Move keyboard focus to the code editor",
  component: "CodeWorkspace",
  category: "navigation",
})

registerShortcut({
  id: "save-file",
  keys: ["Control", "s"],
  label: "Save File",
  scope: "workspace",
  action: "Save the current file",
  component: "CodeWorkspace",
  category: "file",
})

registerShortcut({
  id: "close-tab",
  keys: ["Control", "w"],
  label: "Close Tab",
  scope: "workspace",
  action: "Close the current editor tab",
  component: "CodeWorkspace",
  category: "file",
})

registerShortcut({
  id: "zoom-in",
  keys: ["Control", "="],
  label: "Zoom In",
  scope: "global",
  action: "Increase zoom level",
  component: "_app-shell",
  category: "views",
})

registerShortcut({
  id: "zoom-out",
  keys: ["Control", "-"],
  label: "Zoom Out",
  scope: "global",
  action: "Decrease zoom level",
  component: "_app-shell",
  category: "views",
})

registerShortcut({
  id: "next-tab",
  keys: ["Control", "Tab"],
  label: "Next Tab",
  scope: "workspace",
  action: "Switch to the next open tab",
  component: "CodeWorkspace",
  category: "navigation",
})

registerShortcut({
  id: "prev-tab",
  keys: ["Control", "Shift", "Tab"],
  label: "Previous Tab",
  scope: "workspace",
  action: "Switch to the previous open tab",
  component: "CodeWorkspace",
  category: "navigation",
})

registerShortcut({
  id: "toggle-diff",
  keys: ["Control", "Shift", "d"],
  label: "Toggle Diff Pane",
  scope: "workspace",
  action: "Show/hide the diff pane",
  component: "CodeWorkspace",
  category: "views",
})

registerShortcut({
  id: "toggle-preview",
  keys: ["Control", "Shift", "o"],
  label: "Toggle Preview Pane",
  scope: "workspace",
  action: "Show/hide the preview pane",
  component: "CodeWorkspace",
  category: "views",
})

registerShortcut({
  id: "global-search",
  keys: ["Control", "Shift", "f"],
  label: "Global Search",
  scope: "global",
  action: "Open global search across workspace",
  component: "_app-shell",
  category: "search",
})
