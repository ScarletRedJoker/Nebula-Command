# Fix Sunshine Virtual Display Resolution
# Run as Administrator on Windows VM
# Sets virtual display to 1920x1080 @ 60Hz

Write-Host "=== Sunshine Resolution Fix ===" -ForegroundColor Cyan
Write-Host "Target: 1920x1080 @ 60Hz" -ForegroundColor Yellow

# Check for VDD Control
$vddControlPath = "C:\VirtualDisplayDriver\vdd_settings.xml"
if (Test-Path $vddControlPath) {
    Write-Host "`nFound VDD Settings at: $vddControlPath" -ForegroundColor Green
    
    # Update VDD settings for 1080p
    $xml = @"
<?xml version="1.0" encoding="utf-8"?>
<VddSettings>
  <Monitors>
    <Monitor>
      <Id>1</Id>
      <Width>1920</Width>
      <Height>1080</Height>
      <RefreshRate>60</RefreshRate>
      <Enabled>true</Enabled>
    </Monitor>
  </Monitors>
</VddSettings>
"@
    $xml | Set-Content -Path $vddControlPath -Encoding UTF8
    Write-Host "Updated VDD settings to 1920x1080@60Hz" -ForegroundColor Green
}

# Check for Parsec VDD
$parsecPath = "${env:ProgramFiles}\Parsec\vdd"
if (Test-Path $parsecPath) {
    Write-Host "`nFound Parsec VDD at: $parsecPath" -ForegroundColor Green
    Write-Host "Use Parsec VDD Control app to add 1920x1080@60Hz display" -ForegroundColor Yellow
}

# Restart display driver
Write-Host "`nRestarting virtual display driver..." -ForegroundColor Yellow
try {
    pnputil /restart-device "ROOT\DISPLAY\0000" 2>$null
    Write-Host "Display driver restarted" -ForegroundColor Green
} catch {
    Write-Host "Could not restart via pnputil, trying alternate method..." -ForegroundColor Yellow
}

# Update Sunshine config
$sunshineConfig = "C:\Program Files\Sunshine\config\sunshine.conf"
if (Test-Path $sunshineConfig) {
    Write-Host "`nUpdating Sunshine configuration..." -ForegroundColor Yellow
    
    $config = Get-Content $sunshineConfig
    
    # Ensure output_name is empty for auto-detection
    $config = $config -replace 'output_name = .*', 'output_name = '
    
    # Ensure capture is set to nvfbc
    if ($config -notmatch 'capture = nvfbc') {
        if ($config -match 'capture = .*') {
            $config = $config -replace 'capture = .*', 'capture = nvfbc'
        } else {
            $config += "`ncapture = nvfbc"
        }
    }
    
    $config | Set-Content -Path $sunshineConfig -Force
    Write-Host "Sunshine config updated" -ForegroundColor Green
}

# Kill and restart Sunshine
Write-Host "`nRestarting Sunshine..." -ForegroundColor Yellow
Stop-Process -Name "sunshine" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# Start Sunshine
$sunshinePath = "C:\Program Files\Sunshine\sunshine.exe"
if (Test-Path $sunshinePath) {
    Start-Process -FilePath $sunshinePath -WorkingDirectory "C:\Program Files\Sunshine"
    Write-Host "Sunshine started" -ForegroundColor Green
} else {
    Write-Host "Sunshine not found at expected path" -ForegroundColor Red
}

Write-Host "`n=== Resolution Fix Complete ===" -ForegroundColor Cyan
Write-Host "Check Display Settings to verify 1920x1080@60Hz display" -ForegroundColor Yellow
Write-Host "Then test with Moonlight from your Linux host" -ForegroundColor Yellow
