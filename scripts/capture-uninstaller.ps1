param(
  [string]$UninstallerPath = "$env:LOCALAPPDATA\Programs\AgenticOS\Uninstall AgenticOS.exe"
)

if (-not (Test-Path -LiteralPath $UninstallerPath)) {
  Write-Error "Uninstaller not found at: $UninstallerPath"
  exit 1
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$reportDir = "uninstaller-screenshots"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

Write-Output "=== AgenticOS Uninstaller Screenshot Capture ==="
Write-Output "Launching uninstaller: $UninstallerPath"
Write-Output "Each page will wait 30 seconds before capture."

$proc = Start-Process -FilePath $UninstallerPath -PassThru
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
$maxPages = 10

while ($pageNum -le $maxPages) {
    $num = $pageNum.ToString("00")
    Write-Output "`n--- Uninstaller Page $pageNum/$maxPages ---"
    
    if ($pageNum -eq 1) {
        Write-Output "  (First page already visible, capturing...)"
    } else {
        Write-Output "  Pressing Enter to advance..."
        [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
        Start-Sleep -Seconds 1
    }
    
    Write-Output "  Waiting 30s for page to render..."
    Start-Sleep -Seconds 30
    
    Take-Screenshot "un-$num.png"
    $pageNum++
}

Write-Output "`n=== Screenshots Captured ==="
Write-Output "Location: $((Resolve-Path $reportDir).Path)"
Write-Output "Uninstaller process left running for user inspection."
