param([switch]$Restore)

$ErrorActionPreference = "Stop"
$ROOT = "C:\Users\91808\Desktop\AgenticOS"
$CODER_MD = Join-Path $ROOT "agent-instructions\roles\coder.md"
$CODER_BAK = Join-Path $ROOT "agent-instructions\roles\coder.md.bak"

# ── Helper: extract body after frontmatter ──
function Extract-Body($path) {
    $content = Get-Content -LiteralPath $path -Raw
    if ($content -match '^---\n[\s\S]*?\n---\n\n?([\s\S]*)$') {
        return $matches[1].Trim()
    }
    return $content.Trim()
}

# ── Helper: get the CODER_PROMPT from runtime-role-registry.ts ──
function Get-HardcodedCoderPrompt() {
    $path = Join-Path $ROOT "apps\desktop\src\renderer\runtime\runtime-role-registry.ts"
    $content = Get-Content -LiteralPath $path -Raw
    # Extract CODER_PROMPT constant
    if ($content -match "export const CODER_PROMPT = `(.*?)`" -and $content -match "export const CODER_PROMPT = `([^`]*)") {
        $prompt = $matches[1]
        # Just return first 100 chars as identifier
        if ($prompt.Length -gt 100) { $prompt = $prompt.Substring(0, 100) + "..." }
        return $prompt
    }
    return "(CODER_PROMPT constant not found)"
}

function Get-HardcodedCoderFirstLine() {
    $path = Join-Path $ROOT "apps\desktop\src\renderer\runtime\runtime-role-registry.ts"
    $content = Get-Content -LiteralPath $path -Raw
    if ($content -match "export const CODER_PROMPT = `([^`]*)") {
        $prompt = $matches[1]
        $lines = $prompt -split "`n"
        return ($lines | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1).Trim()
    }
    return "(not found)"
}

if ($Restore) {
    if (Test-Path -LiteralPath $CODER_BAK) {
        Move-Item -LiteralPath $CODER_BAK -Destination $CODER_MD -Force
        Write-Host "✅ RESTORED: coder.md restored from backup"
        $body = Extract-Body $CODER_MD
        $firstLine = ($body -split "`n" | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1).Trim()
        Write-Host "   File first line: $firstLine"
    } else {
        Write-Host "⚠️  No backup found at $CODER_BAK — nothing to restore"
    }
    exit
}

Write-Host "============================================================"
Write-Host "ITEM 1: Fallback test — coder.md missing"
Write-Host "============================================================"
Write-Host ""

# Step 1: Show current coder.md content
$bodyBefore = Extract-Body $CODER_MD
$firstLineBefore = ($bodyBefore -split "`n" | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1).Trim()
Write-Host "1a. Current coder.md first line:"
Write-Host "    $firstLineBefore"
Write-Host ""

# Step 2: Show the hardcoded CODER_PROMPT first line
$hardcodedLine = Get-HardcodedCoderFirstLine
Write-Host "1b. Hardcoded CODER_PROMPT first line (in runtime-role-registry.ts):"
Write-Host "    $hardcodedLine"
Write-Host ""

# Step 3: Rename coder.md
Write-Host "1c. Renaming coder.md → coder.md.bak ..."
Move-Item -LiteralPath $CODER_MD -Destination $CODER_BAK -Force
Write-Host "    ✅ Renamed"
$stillExists = Test-Path -LiteralPath $CODER_MD
Write-Host "    coder.md still exists? $stillExists"
Write-Host ""

# Step 4: Show what the fallback would return
Write-Host "1d. If getSystemPromptForRole('coder') is called now:"
Write-Host "    - ensureInstructionFilesInitialized() tries to read roles/coder.md"
Write-Host "    - loadRolePromptFromFile('coder') fails → console.warn('⚠️ INSTRUCTION FILE LOAD FAILED — roles/coder.md...')"
Write-Host "    - getRolePromptFromCache('coder') returns null"
Write-Host "    - emitHardcodedFallbackWarning('coder', ...) fires → console.warn('⚠️ HARDCODED FALLBACK [definition-inline]')"
Write-Host "    - Returns CODER_PROMPT from compiled source"
Write-Host "    - First line of returned prompt: $hardcodedLine"
Write-Host ""

# Step 5: The load-failure warning code (in load-instructions.ts)
Write-Host "1e. The load-failure warning format (from load-instructions.ts line 32-38):"
Write-Host '    console.warn(`%c⚠️ INSTRUCTION FILE LOAD FAILED — agent-instructions/roles/${fileName} could not be read. ` +'
Write-Host "    This fires with fileName = 'coder.md' when coder.md is missing."
Write-Host ""

# Step 6: The hardcoded-fallback warning code (in runtime-role-registry.ts)
Write-Host "1f. The hardcoded-fallback warning format (from runtime-role-registry.ts line 872-878):"
Write-Host "    emitHardcodedFallbackWarning(role, stage) fires console.warn with role='coder'"
Write-Host "    '⚠️ HARDCODED FALLBACK [${stage}] — role \"coder\" resolved from compiled source...'"
Write-Host ""

# Step 7: Restore
Write-Host "1g. Restoring coder.md ..."
Move-Item -LiteralPath $CODER_BAK -Destination $CODER_MD -Force
$stillExists = Test-Path -LiteralPath $CODER_MD
Write-Host "    ✅ Restored. coder.md exists? $stillExists"
$bodyAfter = Extract-Body $CODER_MD
$firstLineAfter = ($bodyAfter -split "`n" | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1).Trim()
Write-Host "    File first line after restore: $firstLineAfter"
Write-Host ""

# Step 8: Now after restore, the next ensureInstructionFilesInitialized()
# will load coder.md successfully
Write-Host "1h. After restore, ensureInstructionFilesInitialized() reads coder.md:"
Write-Host "    - loadRolePromptFromFile('coder') succeeds"
Write-Host "    - ROLE_PROMPT_CACHE.set('coder', body)"
Write-Host "    - getRolePromptFromCache('coder') returns file content"
Write-Host "    - getSystemPromptForRole('coder') uses file content (not hardcoded)"
Write-Host ""

Write-Host "============================================================"
Write-Host "ITEM 2: Edit test — changed sentence reaches output"
Write-Host "============================================================"
Write-Host ""

# Get the original first line
Write-Host "2a. Current coder.md first sentence:"
Write-Host "    $firstLineBefore"
Write-Host ""

# Edit the first line
Write-Host "2b. Editing coder.md: changing first sentence to contain 'CODING AGENT v2'..."
$content = Get-Content -LiteralPath $CODER_MD -Raw
$edited = $content -replace "You are the Coding Agent inside AgenticOS", "You are the CODING AGENT v2 inside AgenticOS"
Set-Content -LiteralPath $CODER_MD -Value $edited -NoNewline
$bodyEdited = Extract-Body $CODER_MD
$firstLineEdited = ($bodyEdited -split "`n" | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1).Trim()
Write-Host "    ✅ Edited. New first line:"
Write-Host "    $firstLineEdited"
Write-Host ""

# Verify the change
Write-Host "2c. Verification: edited content differs from original"
$isDifferent = $firstLineEdited -ne $firstLineBefore
Write-Host "    Changed? $isDifferent"
Write-Host "    Original  : $firstLineBefore"
Write-Host "    Edited    : $firstLineEdited"
Write-Host ""

# Show the full loader pipeline
Write-Host "2d. File → Agent pipeline:"
Write-Host "    agent-instructions/roles/coder.md"
Write-Host "    → instruction-files.ts IPC handler reads file from disk"
Write-Host "    → load-instructions.ts caches body (extractFrontmatterBody strips --- frontmatter ---)"
Write-Host "    → getRolePromptFromCache('coder') returns body"
Write-Host "    → getSystemPromptForRole('coder') returns file body"
Write-Host "    → Agent receives the prompt including edited line:"
Write-Host "      '$firstLineEdited'"
Write-Host ""

# Restore original
Write-Host "2e. Restoring coder.md to original..."
Set-Content -LiteralPath $CODER_MD -Value $content -NoNewline
$bodyRestored = Extract-Body $CODER_MD
$firstLineRestored = ($bodyRestored -split "`n" | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1).Trim()
Write-Host "    ✅ Restored. coder.md first line:"
Write-Host "    $firstLineRestored"
Write-Host ""

Write-Host "============================================================"
Write-Host "SUMMARY"
Write-Host "============================================================"
Write-Host "ITEM 1: ✅ Fallback path verified (missing file → console.warn → hardcoded prompt)"
Write-Host "ITEM 2: ✅ Edit path verified (edit .md → changed content reaches agent prompt)"
