# AgenticOS Installer Screenshot Capture Script
param([string]$InstallerPath = "release\AgenticOS Setup 3.0.0.exe")

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$reportDir = "installer-screenshots"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

Write-Output "=== AgenticOS Installer Screenshot Capture ==="
Write-Output "Launching installer: $InstallerPath"

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

Write-Output ""
Write-Output "--- Capture Sequence ---"

# Page 1: Welcome
Write-Output "Page 1/5: Welcome"
Take-Screenshot "01-welcome.png"

# Page 2: Options (press Enter for Next)
Write-Output "Page 2/5: Options"
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Seconds 2
Take-Screenshot "02-options.png"

# Page 3: Directory
Write-Output "Page 3/5: Directory"
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Seconds 2
Take-Screenshot "03-directory.png"

# Page 4: Installing (click Next to start install)
Write-Output "Page 4/5: Installing"
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Seconds 5
Take-Screenshot "04-installing.png"

# Page 5: Complete
Write-Output "Page 5/5: Complete"
Start-Sleep -Seconds 3
Take-Screenshot "05-complete.png"

# Close
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Seconds 1

Write-Output ""
Write-Output "=== Screenshots Captured ==="
Write-Output "Location: $((Resolve-Path $reportDir).Path)"
$proc | Stop-Process -Force -ErrorAction SilentlyContinue
