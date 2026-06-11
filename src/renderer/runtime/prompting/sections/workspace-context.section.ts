import { Importance } from '../ast/PromptNode'
import { PromptCategory } from '../categories/PromptCategory'
import type { SectionDefinition, ResolutionContext } from '../registry/SectionDefinition'

export const workspaceContextSection: SectionDefinition = {
  id: 'workspace-context',
  category: PromptCategory.WORKSPACE,
  importance: Importance.HIGH,
  priority: 55,
  cache: 'none',
  dependsOn: ['project-rules'],
  compute: async (ctx: ResolutionContext) => {
    const hasWorkspace = ctx.activeFilePath || ctx.openFiles?.length || ctx.workspaceFiles
    const hasEditorState = ctx.cursorLine || ctx.selectedText
    if (!hasWorkspace && !hasEditorState && !ctx.environmentInfo) return null

    const lines: string[] = [
      '## Current Workspace State',
      '',
    ]

    // ── Active file ──
    if (ctx.activeFilePath) {
      lines.push('**Active File:**')
      let fileLine = `- \`${ctx.activeFilePath}\``
      if (ctx.activeFileLanguage) fileLine += ` (${ctx.activeFileLanguage})`
      if (ctx.activeFileLines !== undefined) fileLine += ` — ${ctx.activeFileLines} lines`
      lines.push(fileLine)

      // Cursor position
      if (ctx.cursorLine !== undefined) {
        const cursor = `- Cursor at line ${ctx.cursorLine}`
        if (ctx.cursorColumn !== undefined) {
          lines.push(`${cursor}, column ${ctx.cursorColumn}`)
        } else {
          lines.push(cursor)
        }
      }

      // Visible range (lines visible in the editor viewport)
      if (ctx.visibleRangeStart !== undefined && ctx.visibleRangeEnd !== undefined) {
        lines.push(`- Visible lines: ${ctx.visibleRangeStart}–${ctx.visibleRangeEnd}`)
      }

      // Selection
      if (ctx.selectedText) {
        const preview = ctx.selectedText.length > 120
          ? ctx.selectedText.slice(0, 120) + '...'
          : ctx.selectedText
        lines.push(`- Selected text (${ctx.selectedText.length} chars): \`\`\`${preview}\`\`\``)
      }
    }

    // ── Open tabs ──
    if (ctx.openFiles && ctx.openFiles.length > 0) {
      lines.push('', '**Open Files:**')
      for (const f of ctx.openFiles) {
        const dirty = f.isDirty ? ' (unsaved)' : ''
        lines.push(`- \`${f.path}\`${dirty}`)
      }
    }

    // ── Unsaved changes ──
    if (ctx.unsavedChanges !== undefined && ctx.unsavedChanges > 0) {
      lines.push('', `> ⚠️ ${ctx.unsavedChanges} file(s) have unsaved changes`)
    }

    // ── Recent edits ──
    if (ctx.recentEdits && ctx.recentEdits.length > 0) {
      lines.push('', '**Recently Edited:**')
      for (const edit of ctx.recentEdits) {
        const ago = Math.round((Date.now() - edit.timestamp) / 1000)
        const label = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`
        lines.push(`- \`${edit.path}\` (${label})`)
      }
    }

    // ── File tree summary ──
    if (ctx.fileTreeSummary) {
      lines.push('', '**Project Structure:**')
      lines.push(ctx.fileTreeSummary)
    }

    if (ctx.workspaceFiles !== undefined) {
      lines.push('', `_Workspace contains approximately ${ctx.workspaceFiles} files._`)
    }

    if (ctx.environmentInfo) {
      lines.push('', '**Environment:**')
      for (const [key, value] of Object.entries(ctx.environmentInfo)) {
        lines.push(`- ${key}: ${value}`)
      }
    }

    // Add a clear separation from the dynamic content that follows
    lines.push('', '---')

    return lines.join('\n')
  },
}
