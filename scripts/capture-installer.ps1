param([string]$InstallerPath = "release\AgenticOS Setup 3.0.0.exe")

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$reportDir = "installer-screenshots"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

Write-Output "=== AgenticOS Installer Screenshot Capture ==="
Write-Output "Launching installer: $InstallerPath"
Write-Output "Each page will wait 90 seconds before capture."

$proc = Start-Process -FilePath $InstallerPath -PassThru
Start-Sleep -Seconds 3

function Take-Screenshot {
    param([string]$name)
    Start-Sleep -Milliseconds 1000
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size)
    $graphics.Dispose()
    $path = Join-Path $reportDir $name
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    Write-Output "  Saved: $name"
}

$pageNum = 1

Write-Output "`n--- Page $pageNum/?: Welcome ---"
Write-Output "  Waiting 90s for page to render..."
Start-Sleep -Seconds 90
Take-Screenshot "01-welcome.png"
$pageNum++

# Loop through remaining pages — press Enter, wait 90s, screenshot, repeat
while ($pageNum -le 20) {
    Write-Output "`n--- Page $pageNum/? ---"
    Write-Output "  Pressing Enter to advance..."
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Seconds 1
    
    Write-Output "  Waiting 90s for page to render..."
    Start-Sleep -Seconds 90
    
    $num = $pageNum.ToString("00")
    Take-Screenshot "$num-page.png"
    
    $pageNum++
}

Write-Output "`n=== Capture complete ==="
Write-Output "Checking for additional pages..."

# One more check — press Enter, wait, see if window closes
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Seconds 5

Write-Output "Location: $((Resolve-Path $reportDir).Path)"

# Don't kill the process — let user see the final state
Write-Output "Installer process left running for user inspection."
