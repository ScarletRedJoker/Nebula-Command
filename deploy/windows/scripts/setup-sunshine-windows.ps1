# Sunshine Setup Script for Windows VM
# Run this in PowerShell as Administrator on your Windows VM

Write-Host "=== Sunshine GameStream Setup ===" -ForegroundColor Green

# Check if running as admin
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "Please run as Administrator!" -ForegroundColor Red
    exit 1
}

$SunshineUrl = "https://github.com/LizardByte/Sunshine/releases/latest/download/sunshine-windows-installer.exe"
$InstallerPath = "$env:TEMP\sunshine-installer.exe"

# Download Sunshine
Write-Host "Downloading Sunshine..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri $SunshineUrl -OutFile $InstallerPath -UseBasicParsing
    Write-Host "Download complete" -ForegroundColor Green
} catch {
    Write-Host "Failed to download. Get it manually from: https://github.com/LizardByte/Sunshine/releases" -ForegroundColor Red
    exit 1
}

# Run installer
Write-Host "Running installer..." -ForegroundColor Yellow
Start-Process -FilePath $InstallerPath -Wait

# Configure firewall
Write-Host "Configuring firewall..." -ForegroundColor Yellow
$ports = @(
    @{Name="Sunshine-TCP-47984"; Port=47984; Protocol="TCP"},
    @{Name="Sunshine-TCP-47989"; Port=47989; Protocol="TCP"},
    @{Name="Sunshine-TCP-47990"; Port=47990; Protocol="TCP"},
    @{Name="Sunshine-UDP-47998"; Port=47998; Protocol="UDP"},
    @{Name="Sunshine-UDP-47999"; Port=47999; Protocol="UDP"},
    @{Name="Sunshine-UDP-48000"; Port=48000; Protocol="UDP"},
    @{Name="Sunshine-UDP-48010"; Port=48010; Protocol="UDP"}
)

foreach ($p in $ports) {
    $existing = Get-NetFirewallRule -DisplayName $p.Name -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule -DisplayName $p.Name -Direction Inbound -Protocol $p.Protocol -LocalPort $p.Port -Action Allow | Out-Null
        Write-Host "  Added firewall rule: $($p.Name)" -ForegroundColor Gray
    }
}

# Disable Game Bar (causes issues with Sunshine)
Write-Host "Disabling Xbox Game Bar..." -ForegroundColor Yellow
Set-ItemProperty -Path "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR" -Name "AppCaptureEnabled" -Value 0 -ErrorAction SilentlyContinue
Set-ItemProperty -Path "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR" -Name "GameDVR_Enabled" -Value 0 -ErrorAction SilentlyContinue

# Set high performance power plan
Write-Host "Setting high performance power plan..." -ForegroundColor Yellow
powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>$null

# Start Sunshine service
Write-Host "Starting Sunshine service..." -ForegroundColor Yellow
Start-Service -Name "Sunshine" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Open Sunshine Web UI: https://localhost:47990"
Write-Host "2. Set username/password on first run"
Write-Host "3. On your client, install Moonlight: https://moonlight-stream.org"
Write-Host "4. Connect to this PC via Tailscale IP: 100.118.44.102"
Write-Host ""
Write-Host "Tailscale IP: 100.118.44.102" -ForegroundColor Cyan
