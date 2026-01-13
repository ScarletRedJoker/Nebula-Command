#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Nebula Command - Unified Windows AI Node Installer
    One-click deployment of GPU-accelerated AI services with full integration

.DESCRIPTION
    This script provides a comprehensive installation experience for setting up
    a Windows machine as an AI inference node within the Nebula Command ecosystem.
    
    Phases:
    1. Preflight Checks - System requirements validation
    2. Dependencies Installation - Git, Python, VC++ Runtime, Tailscale
    3. AI Services Installation - Ollama, Stable Diffusion, ComfyUI
    4. Configuration - Environment setup, firewall rules
    5. Verification - Service health checks
    6. Start Services - Launch supervisor and health daemon

.PARAMETER SkipOllama
    Skip Ollama installation

.PARAMETER SkipStableDiffusion
    Skip Stable Diffusion WebUI installation

.PARAMETER SkipComfyUI
    Skip ComfyUI installation

.PARAMETER SkipWhisper
    Skip Whisper installation

.PARAMETER InstallTraining
    Include training tools (kohya_ss, Unsloth)

.PARAMETER Unattended
    Run without prompts for automated deployment

.PARAMETER WhatIf
    Preview changes without making them

.PARAMETER Force
    Skip confirmation prompts

.PARAMETER DashboardWebhook
    URL for health webhook reporting

.EXAMPLE
    .\install-ai-node.ps1
    
.EXAMPLE
    .\install-ai-node.ps1 -Unattended -DashboardWebhook "https://dashboard.example.com/api/ai/health-webhook"

.EXAMPLE
    .\install-ai-node.ps1 -WhatIf
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$SkipOllama,
    [switch]$SkipStableDiffusion,
    [switch]$SkipComfyUI,
    [switch]$SkipWhisper,
    [switch]$InstallTraining,
    [switch]$Unattended,
    [switch]$Force,
    [string]$DashboardWebhook
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Script:Version = "1.0.0"
$Script:InstallStartTime = Get-Date
$Script:RollbackActions = @()
$Script:InstallationReport = @{
    version = $Script:Version
    started_at = $Script:InstallStartTime.ToString("o")
    hostname = $env:COMPUTERNAME
    phases = @{}
    services_installed = @()
    errors = @()
    warnings = @()
}

$Script:Paths = @{
    RootDir = "C:\ProgramData\NebulaCommand"
    LogDir = "C:\ProgramData\NebulaCommand\logs"
    LogFile = "C:\ProgramData\NebulaCommand\logs\install.log"
    StateFile = "C:\ProgramData\NebulaCommand\ai-state.json"
    ManifestFile = "C:\ProgramData\NebulaCommand\node-manifest.json"
    AIRoot = "C:\AI"
    ModelsDir = "C:\AI\models"
    TrainingDir = "C:\AI\Training"
}

$Script:Requirements = @{
    MinWindowsVersion = 10
    PreferredWindowsVersion = 11
    MinDriverVersion = 535
    MinVRAM_MB = 8192
    RecommendedVRAM_MB = 12288
    MinDiskSpace_GB = 50
    RequiredPorts = @(11434, 7860, 8188, 8765)
    TailscaleSubnet = "100.64.0.0/10"
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$ConfigDir = Join-Path $RootDir "configs"

function Initialize-Installation {
    foreach ($path in $Script:Paths.Values) {
        if ($path -match '\\logs\\' -or $path -match '\.log$' -or $path -match '\.json$') {
            $dir = Split-Path -Parent $path
        } else {
            $dir = $path
        }
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }
    
    "" | Set-Content -Path $Script:Paths.LogFile -Force
}

function Write-InstallLog {
    param(
        [string]$Message,
        [ValidateSet("INFO", "OK", "WARN", "ERROR", "DEBUG", "PHASE")]
        [string]$Level = "INFO",
        [switch]$NoConsole
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "[$timestamp] [$Level] $Message"
    
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN"  { "Yellow" }
        "OK"    { "Green" }
        "PHASE" { "Cyan" }
        "DEBUG" { "DarkGray" }
        default { "White" }
    }
    
    if (-not $NoConsole) {
        if ($Level -eq "PHASE") {
            Write-Host ""
            Write-Host ("=" * 60) -ForegroundColor Cyan
            Write-Host " $Message" -ForegroundColor Cyan
            Write-Host ("=" * 60) -ForegroundColor Cyan
        } else {
            Write-Host $logLine -ForegroundColor $color
        }
    }
    
    Add-Content -Path $Script:Paths.LogFile -Value $logLine -ErrorAction SilentlyContinue
    
    if ($Level -eq "ERROR") {
        $Script:InstallationReport.errors += $Message
    } elseif ($Level -eq "WARN") {
        $Script:InstallationReport.warnings += $Message
    }
}

function Show-Progress {
    param(
        [string]$Activity,
        [string]$Status,
        [int]$PercentComplete = -1
    )
    
    if ($PercentComplete -ge 0) {
        Write-Progress -Activity $Activity -Status $Status -PercentComplete $PercentComplete
    } else {
        Write-Progress -Activity $Activity -Status $Status
    }
}

function Add-RollbackAction {
    param(
        [string]$Description,
        [scriptblock]$Action
    )
    
    $Script:RollbackActions += @{
        Description = $Description
        Action = $Action
    }
}

function Invoke-Rollback {
    param([string]$Reason)
    
    Write-InstallLog "ROLLBACK INITIATED: $Reason" "ERROR"
    
    if ($Script:RollbackActions.Count -eq 0) {
        Write-InstallLog "No rollback actions registered" "WARN"
        return
    }
    
    Write-InstallLog "Executing $($Script:RollbackActions.Count) rollback actions..." "WARN"
    
    for ($i = $Script:RollbackActions.Count - 1; $i -ge 0; $i--) {
        $action = $Script:RollbackActions[$i]
        Write-InstallLog "Rollback: $($action.Description)" "INFO"
        try {
            & $action.Action
        } catch {
            Write-InstallLog "Rollback action failed: $_" "ERROR"
        }
    }
}

function Test-Administrator {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-WindowsVersion {
    $os = Get-CimInstance -ClassName Win32_OperatingSystem
    $version = [System.Environment]::OSVersion.Version
    
    $buildNumber = [int]$os.BuildNumber
    $windowsVersion = if ($buildNumber -ge 22000) { 11 } else { 10 }
    
    return @{
        Version = $windowsVersion
        Build = $os.BuildNumber
        Caption = $os.Caption
        Architecture = $os.OSArchitecture
    }
}

function Get-NvidiaGPUInfo {
    $gpu = Get-CimInstance -ClassName Win32_VideoController | Where-Object { $_.Name -like "*NVIDIA*" } | Select-Object -First 1
    
    if (-not $gpu) {
        return @{ Available = $false; Error = "No NVIDIA GPU detected" }
    }
    
    $result = @{
        Available = $true
        Name = $gpu.Name
        DriverVersion = $gpu.DriverVersion
        DriverDate = $gpu.DriverDate
        VRAM_MB = $null
        DriverMajorVersion = $null
        CUDACapable = $false
    }
    
    try {
        $nvidiaSmi = & nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits 2>$null
        if ($nvidiaSmi) {
            $parts = $nvidiaSmi -split ","
            $result.Name = $parts[0].Trim()
            $result.VRAM_MB = [int]$parts[1].Trim()
            $driverVersion = $parts[2].Trim()
            
            if ($driverVersion -match "^(\d+)\.") {
                $result.DriverMajorVersion = [int]$Matches[1]
                $result.CUDACapable = $result.DriverMajorVersion -ge $Script:Requirements.MinDriverVersion
            }
        }
    } catch {
        $result.Error = "nvidia-smi not available: $_"
    }
    
    return $result
}

function Get-DiskSpaceGB {
    param([string]$Drive = "C:")
    
    $disk = Get-CimInstance -ClassName Win32_LogicalDisk | Where-Object { $_.DeviceID -eq $Drive }
    if ($disk) {
        return [math]::Round($disk.FreeSpace / 1GB, 2)
    }
    return 0
}

function Test-CommandExists {
    param([string]$Command)
    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Install-WingetPackage {
    param(
        [string]$PackageId,
        [string]$DisplayName,
        [switch]$Silent
    )
    
    if ($WhatIfPreference) {
        Write-InstallLog "WhatIf: Would install $DisplayName ($PackageId)" "INFO"
        return $true
    }
    
    Write-InstallLog "Installing $DisplayName..." "INFO"
    Show-Progress -Activity "Installing Dependencies" -Status "Installing $DisplayName..."
    
    try {
        $args = @("install", $PackageId, "--accept-source-agreements", "--accept-package-agreements")
        if ($Silent -or $Unattended) {
            $args += "--silent"
        }
        
        $result = & winget @args 2>&1
        $exitCode = $LASTEXITCODE
        
        if ($exitCode -eq 0 -or $result -match "already installed") {
            Write-InstallLog "$DisplayName installed successfully" "OK"
            return $true
        } else {
            Write-InstallLog "Failed to install $DisplayName (exit code: $exitCode)" "ERROR"
            return $false
        }
    } catch {
        Write-InstallLog "Exception installing $DisplayName : $_" "ERROR"
        return $false
    }
}

function Get-TailscaleIP {
    try {
        $tsStatus = & tailscale status --json 2>$null | ConvertFrom-Json
        if ($tsStatus.Self -and $tsStatus.Self.TailscaleIPs) {
            foreach ($ip in $tsStatus.Self.TailscaleIPs) {
                if ($ip -match "^100\.") {
                    return $ip
                }
            }
        }
    } catch {}
    
    try {
        $interfaces = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match "^100\." }
        if ($interfaces) {
            return $interfaces[0].IPAddress
        }
    } catch {}
    
    return $null
}

function New-SecureToken {
    param([int]$Length = 32)
    
    $bytes = New-Object byte[] $Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    return [BitConverter]::ToString($bytes).Replace("-", "").ToLower()
}

function Test-ServiceHealth {
    param(
        [string]$Name,
        [string]$Url,
        [int]$Timeout = 5
    )
    
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec $Timeout -UseBasicParsing -ErrorAction Stop
        return @{
            Online = $true
            StatusCode = $response.StatusCode
        }
    } catch {
        return @{
            Online = $false
            Error = $_.Exception.Message
        }
    }
}

function Invoke-Phase1PreflightChecks {
    Write-InstallLog "PHASE 1: Preflight Checks" "PHASE"
    
    $phaseResult = @{
        status = "passed"
        checks = @{}
        blockers = @()
        warnings = @()
    }
    
    Write-InstallLog "Checking Administrator privileges..." "INFO"
    if (-not (Test-Administrator)) {
        $phaseResult.status = "failed"
        $phaseResult.blockers += "Script must be run as Administrator"
        Write-InstallLog "FAILED: Not running as Administrator" "ERROR"
        return $phaseResult
    }
    Write-InstallLog "Administrator: OK" "OK"
    $phaseResult.checks["administrator"] = $true
    
    Write-InstallLog "Checking Windows version..." "INFO"
    $winInfo = Get-WindowsVersion
    $phaseResult.checks["windows"] = $winInfo
    
    if ($winInfo.Version -lt $Script:Requirements.MinWindowsVersion) {
        $phaseResult.status = "failed"
        $phaseResult.blockers += "Windows $($Script:Requirements.MinWindowsVersion) or higher required (found: Windows $($winInfo.Version))"
        Write-InstallLog "FAILED: Windows version too old" "ERROR"
    } elseif ($winInfo.Version -lt $Script:Requirements.PreferredWindowsVersion) {
        $phaseResult.warnings += "Windows $($Script:Requirements.PreferredWindowsVersion) recommended (found: Windows $($winInfo.Version))"
        Write-InstallLog "Windows $($winInfo.Version) Build $($winInfo.Build) - Supported (Win 11 recommended)" "WARN"
    } else {
        Write-InstallLog "Windows $($winInfo.Version) Build $($winInfo.Build) - OK" "OK"
    }
    
    Write-InstallLog "Checking NVIDIA GPU..." "INFO"
    $gpuInfo = Get-NvidiaGPUInfo
    $phaseResult.checks["gpu"] = $gpuInfo
    
    if (-not $gpuInfo.Available) {
        $phaseResult.status = "failed"
        $phaseResult.blockers += "No NVIDIA GPU detected"
        Write-InstallLog "FAILED: No NVIDIA GPU found" "ERROR"
    } else {
        Write-InstallLog "GPU: $($gpuInfo.Name)" "OK"
        
        if ($gpuInfo.VRAM_MB) {
            if ($gpuInfo.VRAM_MB -lt $Script:Requirements.MinVRAM_MB) {
                $phaseResult.status = "failed"
                $phaseResult.blockers += "Insufficient VRAM: $($gpuInfo.VRAM_MB)MB (minimum: $($Script:Requirements.MinVRAM_MB)MB)"
                Write-InstallLog "FAILED: VRAM $($gpuInfo.VRAM_MB)MB < required $($Script:Requirements.MinVRAM_MB)MB" "ERROR"
            } elseif ($gpuInfo.VRAM_MB -lt $Script:Requirements.RecommendedVRAM_MB) {
                $phaseResult.warnings += "VRAM: $($gpuInfo.VRAM_MB)MB (recommended: $($Script:Requirements.RecommendedVRAM_MB)MB)"
                Write-InstallLog "VRAM: $($gpuInfo.VRAM_MB)MB - Supported (12GB recommended)" "WARN"
            } else {
                Write-InstallLog "VRAM: $($gpuInfo.VRAM_MB)MB - OK" "OK"
            }
        }
        
        if ($gpuInfo.DriverMajorVersion) {
            if ($gpuInfo.DriverMajorVersion -lt $Script:Requirements.MinDriverVersion) {
                $phaseResult.warnings += "NVIDIA Driver $($gpuInfo.DriverMajorVersion) is older than recommended ($($Script:Requirements.MinDriverVersion)+)"
                Write-InstallLog "Driver version $($gpuInfo.DriverMajorVersion) - Update to $($Script:Requirements.MinDriverVersion)+ for CUDA 12.x" "WARN"
            } else {
                Write-InstallLog "Driver version $($gpuInfo.DriverMajorVersion) - OK (CUDA 12.x compatible)" "OK"
            }
        }
    }
    
    Write-InstallLog "Checking disk space..." "INFO"
    $freeSpaceGB = Get-DiskSpaceGB -Drive "C:"
    $phaseResult.checks["disk_space_gb"] = $freeSpaceGB
    
    if ($freeSpaceGB -lt $Script:Requirements.MinDiskSpace_GB) {
        $phaseResult.status = "failed"
        $phaseResult.blockers += "Insufficient disk space: ${freeSpaceGB}GB (minimum: $($Script:Requirements.MinDiskSpace_GB)GB)"
        Write-InstallLog "FAILED: Disk space ${freeSpaceGB}GB < required $($Script:Requirements.MinDiskSpace_GB)GB" "ERROR"
    } else {
        Write-InstallLog "Disk space: ${freeSpaceGB}GB free - OK" "OK"
    }
    
    Write-InstallLog "Checking CUDA availability..." "INFO"
    try {
        $cudaInfo = & nvidia-smi --query-gpu=compute_cap --format=csv,noheader 2>$null
        if ($cudaInfo) {
            Write-InstallLog "CUDA compute capability: $($cudaInfo.Trim()) - OK" "OK"
            $phaseResult.checks["cuda"] = @{ available = $true; compute_capability = $cudaInfo.Trim() }
        } else {
            $phaseResult.warnings += "Could not determine CUDA compute capability"
            Write-InstallLog "CUDA: Could not determine compute capability" "WARN"
            $phaseResult.checks["cuda"] = @{ available = $false }
        }
    } catch {
        $phaseResult.warnings += "nvidia-smi not responding"
        Write-InstallLog "CUDA check failed: $_" "WARN"
        $phaseResult.checks["cuda"] = @{ available = $false; error = $_.ToString() }
    }
    
    $Script:InstallationReport.phases["preflight"] = $phaseResult
    
    if ($phaseResult.blockers.Count -gt 0) {
        Write-InstallLog "Preflight checks FAILED with $($phaseResult.blockers.Count) blocker(s)" "ERROR"
        foreach ($blocker in $phaseResult.blockers) {
            Write-InstallLog "  BLOCKER: $blocker" "ERROR"
        }
        return $phaseResult
    }
    
    if ($phaseResult.warnings.Count -gt 0) {
        Write-InstallLog "Preflight checks passed with $($phaseResult.warnings.Count) warning(s)" "WARN"
    } else {
        Write-InstallLog "All preflight checks passed" "OK"
    }
    
    return $phaseResult
}

function Invoke-Phase2DependenciesInstallation {
    Write-InstallLog "PHASE 2: Dependencies Installation" "PHASE"
    
    $phaseResult = @{
        status = "passed"
        installed = @()
        skipped = @()
        failed = @()
    }
    
    if (-not (Test-CommandExists "winget")) {
        Write-InstallLog "winget not found - Windows Package Manager required" "ERROR"
        $phaseResult.status = "failed"
        $phaseResult.failed += "winget"
        $Script:InstallationReport.phases["dependencies"] = $phaseResult
        return $phaseResult
    }
    
    Write-InstallLog "Checking Git..." "INFO"
    if (Test-CommandExists "git") {
        $gitVersion = & git --version 2>$null
        Write-InstallLog "Git already installed: $gitVersion" "OK"
        $phaseResult.skipped += "git"
    } else {
        if ($PSCmdlet.ShouldProcess("Git", "Install via winget")) {
            if (Install-WingetPackage -PackageId "Git.Git" -DisplayName "Git") {
                $phaseResult.installed += "git"
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
                Add-RollbackAction -Description "Uninstall Git" -Action { winget uninstall Git.Git --silent 2>$null }
            } else {
                $phaseResult.failed += "git"
            }
        }
    }
    
    Write-InstallLog "Checking Python 3.11..." "INFO"
    $pythonOK = $false
    if (Test-CommandExists "python") {
        $pyVersion = & python --version 2>$null
        if ($pyVersion -match "Python 3\.11") {
            Write-InstallLog "Python 3.11 already installed: $pyVersion" "OK"
            $phaseResult.skipped += "python"
            $pythonOK = $true
        } elseif ($pyVersion -match "Python 3\.12") {
            Write-InstallLog "Python 3.12 detected - may have compatibility issues, 3.11 recommended" "WARN"
            $phaseResult.skipped += "python"
            $pythonOK = $true
        }
    }
    
    if (-not $pythonOK) {
        if ($PSCmdlet.ShouldProcess("Python 3.11", "Install via winget")) {
            if (Install-WingetPackage -PackageId "Python.Python.3.11" -DisplayName "Python 3.11") {
                $phaseResult.installed += "python"
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
                Add-RollbackAction -Description "Uninstall Python 3.11" -Action { winget uninstall Python.Python.3.11 --silent 2>$null }
            } else {
                $phaseResult.failed += "python"
            }
        }
    }
    
    Write-InstallLog "Checking Visual C++ Redistributables..." "INFO"
    $vcInstalled = Get-CimInstance -ClassName Win32_Product | Where-Object { $_.Name -like "*Visual C++*2022*x64*" -or $_.Name -like "*Visual C++*2019*x64*" }
    if ($vcInstalled) {
        Write-InstallLog "Visual C++ Redistributable already installed" "OK"
        $phaseResult.skipped += "vcredist"
    } else {
        if ($PSCmdlet.ShouldProcess("Visual C++ Redistributables", "Install via winget")) {
            if (Install-WingetPackage -PackageId "Microsoft.VCRedist.2015+.x64" -DisplayName "Visual C++ Redistributables") {
                $phaseResult.installed += "vcredist"
            } else {
                $phaseResult.failed += "vcredist"
                Write-InstallLog "VC++ Redist installation failed - may affect some AI tools" "WARN"
            }
        }
    }
    
    Write-InstallLog "Checking Tailscale..." "INFO"
    if (Test-CommandExists "tailscale") {
        $tsIP = Get-TailscaleIP
        if ($tsIP) {
            Write-InstallLog "Tailscale installed and connected: $tsIP" "OK"
            $phaseResult.skipped += "tailscale"
        } else {
            Write-InstallLog "Tailscale installed but not connected" "WARN"
            if (-not $Unattended) {
                Write-Host ""
                Write-Host "Tailscale is installed but not connected to a network." -ForegroundColor Yellow
                Write-Host "Please run 'tailscale up' to join your network, or press Enter to continue." -ForegroundColor Yellow
                Read-Host "Press Enter to continue"
            }
            $phaseResult.skipped += "tailscale"
        }
    } else {
        if ($PSCmdlet.ShouldProcess("Tailscale", "Install via winget")) {
            if (Install-WingetPackage -PackageId "Tailscale.Tailscale" -DisplayName "Tailscale") {
                $phaseResult.installed += "tailscale"
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
                
                if (-not $Unattended) {
                    Write-Host ""
                    Write-Host "Tailscale installed. Please run 'tailscale up' to join your network." -ForegroundColor Cyan
                    Write-Host "Press Enter after connecting to Tailscale..." -ForegroundColor Cyan
                    Read-Host
                }
                
                Add-RollbackAction -Description "Uninstall Tailscale" -Action { winget uninstall Tailscale.Tailscale --silent 2>$null }
            } else {
                $phaseResult.failed += "tailscale"
            }
        }
    }
    
    if ($phaseResult.failed.Count -gt 0) {
        $criticalFailures = $phaseResult.failed | Where-Object { $_ -in @("git", "python") }
        if ($criticalFailures) {
            $phaseResult.status = "failed"
            Write-InstallLog "Critical dependencies failed: $($criticalFailures -join ', ')" "ERROR"
        } else {
            $phaseResult.status = "partial"
            Write-InstallLog "Some non-critical dependencies failed: $($phaseResult.failed -join ', ')" "WARN"
        }
    }
    
    $Script:InstallationReport.phases["dependencies"] = $phaseResult
    
    Write-InstallLog "Dependencies phase complete: $($phaseResult.installed.Count) installed, $($phaseResult.skipped.Count) skipped, $($phaseResult.failed.Count) failed" "INFO"
    
    return $phaseResult
}

function Invoke-Phase3AIServicesInstallation {
    Write-InstallLog "PHASE 3: AI Services Installation" "PHASE"
    
    $phaseResult = @{
        status = "passed"
        services = @{}
    }
    
    $setupScript = Join-Path $ScriptDir "setup-windows-ai.ps1"
    
    if (-not (Test-Path $setupScript)) {
        Write-InstallLog "setup-windows-ai.ps1 not found at: $setupScript" "ERROR"
        $phaseResult.status = "failed"
        $Script:InstallationReport.phases["ai_services"] = $phaseResult
        return $phaseResult
    }
    
    if ($WhatIfPreference) {
        Write-InstallLog "WhatIf: Would execute setup-windows-ai.ps1" "INFO"
        $Script:InstallationReport.phases["ai_services"] = $phaseResult
        return $phaseResult
    }
    
    $args = @()
    if ($SkipOllama) { $args += "-SkipOllama" }
    if ($SkipStableDiffusion) { $args += "-SkipStableDiffusion" }
    if ($SkipComfyUI) { $args += "-SkipComfyUI" }
    if ($SkipWhisper) { $args += "-SkipWhisper" }
    if ($InstallTraining) { $args += "-InstallTraining" }
    if ($Unattended) { $args += "-Unattended" }
    
    Write-InstallLog "Calling setup-windows-ai.ps1 with args: $($args -join ' ')" "INFO"
    
    try {
        Show-Progress -Activity "Installing AI Services" -Status "This may take a while..."
        
        & $setupScript @args
        
        if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
            Write-InstallLog "setup-windows-ai.ps1 exited with code $LASTEXITCODE" "WARN"
        }
        
        if (-not $SkipOllama) {
            $phaseResult.services["ollama"] = Test-CommandExists "ollama"
            if ($phaseResult.services["ollama"]) {
                $Script:InstallationReport.services_installed += "ollama"
            }
        }
        
        $sdPath = if ($env:SD_WEBUI_PATH) { $env:SD_WEBUI_PATH } else { "C:\AI\stable-diffusion-webui" }
        if (-not $SkipStableDiffusion) {
            $phaseResult.services["stable_diffusion"] = Test-Path $sdPath
            if ($phaseResult.services["stable_diffusion"]) {
                $Script:InstallationReport.services_installed += "stable_diffusion"
            }
        }
        
        $comfyPath = if ($env:COMFYUI_PATH) { $env:COMFYUI_PATH } else { "C:\AI\ComfyUI" }
        if (-not $SkipComfyUI) {
            $phaseResult.services["comfyui"] = Test-Path $comfyPath
            if ($phaseResult.services["comfyui"]) {
                $Script:InstallationReport.services_installed += "comfyui"
            }
        }
        
        Write-InstallLog "AI Services installation completed" "OK"
        
    } catch {
        Write-InstallLog "AI Services installation failed: $_" "ERROR"
        $phaseResult.status = "failed"
    }
    
    $Script:InstallationReport.phases["ai_services"] = $phaseResult
    return $phaseResult
}

function Invoke-Phase4Configuration {
    Write-InstallLog "PHASE 4: Configuration" "PHASE"
    
    $phaseResult = @{
        status = "passed"
        tailscale_ip = $null
        token_generated = $false
        firewall_rules = @()
        environment_file = $null
    }
    
    Write-InstallLog "Detecting Tailscale IP..." "INFO"
    $tsIP = Get-TailscaleIP
    if ($tsIP) {
        $phaseResult.tailscale_ip = $tsIP
        Write-InstallLog "Tailscale IP: $tsIP" "OK"
    } else {
        Write-InstallLog "Could not detect Tailscale IP" "WARN"
    }
    
    Write-InstallLog "Generating environment configuration..." "INFO"
    $envFile = Join-Path $ConfigDir "environment.ps1"
    $envExample = Join-Path $ConfigDir "environment.ps1.example"
    
    if (-not (Test-Path $envFile)) {
        if (Test-Path $envExample) {
            $envContent = Get-Content $envExample -Raw
            
            if ($tsIP) {
                $envContent = $envContent -replace '\$env:TAILSCALE_IP = "100\.x\.x\.x"', "`$env:TAILSCALE_IP = `"$tsIP`""
            }
            
            $token = New-SecureToken -Length 32
            $envContent = $envContent -replace '\$env:KVM_AGENT_TOKEN = "generate-with-openssl-rand-hex-32"', "`$env:KVM_AGENT_TOKEN = `"$token`""
            $phaseResult.token_generated = $true
            
            if ($DashboardWebhook) {
                $envContent = $envContent -replace '\$env:NEBULA_HEALTH_WEBHOOK = "https://your-dashboard\.domain\.com/api/ai/health-webhook"', "`$env:NEBULA_HEALTH_WEBHOOK = `"$DashboardWebhook`""
            }
            
            if ($PSCmdlet.ShouldProcess($envFile, "Create environment configuration")) {
                $envContent | Set-Content -Path $envFile -Force
                $phaseResult.environment_file = $envFile
                Write-InstallLog "Created environment.ps1 with auto-detected settings" "OK"
            }
        } else {
            Write-InstallLog "environment.ps1.example not found - skipping auto-configuration" "WARN"
        }
    } else {
        Write-InstallLog "environment.ps1 already exists - preserving existing configuration" "INFO"
        $phaseResult.environment_file = $envFile
    }
    
    Write-InstallLog "Configuring Windows Firewall rules..." "INFO"
    
    $firewallRules = @(
        @{ Name = "Nebula-Ollama"; Port = 11434; Description = "Ollama API" },
        @{ Name = "Nebula-StableDiffusion"; Port = 7860; Description = "Stable Diffusion WebUI" },
        @{ Name = "Nebula-ComfyUI"; Port = 8188; Description = "ComfyUI" },
        @{ Name = "Nebula-Agent"; Port = 8765; Description = "Nebula Agent WebSocket" }
    )
    
    foreach ($rule in $firewallRules) {
        $existingRule = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
        
        if ($existingRule) {
            Write-InstallLog "Firewall rule '$($rule.Name)' already exists" "INFO"
            $phaseResult.firewall_rules += @{ name = $rule.Name; status = "exists" }
        } else {
            if ($PSCmdlet.ShouldProcess($rule.Name, "Create firewall rule for port $($rule.Port)")) {
                try {
                    New-NetFirewallRule -DisplayName $rule.Name `
                        -Direction Inbound `
                        -Protocol TCP `
                        -LocalPort $rule.Port `
                        -Action Allow `
                        -RemoteAddress "100.64.0.0/10" `
                        -Description "Nebula Command: $($rule.Description) - Tailscale access only" `
                        -ErrorAction Stop | Out-Null
                    
                    Write-InstallLog "Created firewall rule: $($rule.Name) (port $($rule.Port))" "OK"
                    $phaseResult.firewall_rules += @{ name = $rule.Name; status = "created" }
                    
                    Add-RollbackAction -Description "Remove firewall rule $($rule.Name)" -Action {
                        Remove-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
                    }
                } catch {
                    Write-InstallLog "Failed to create firewall rule $($rule.Name): $_" "ERROR"
                    $phaseResult.firewall_rules += @{ name = $rule.Name; status = "failed"; error = $_.ToString() }
                }
            }
        }
    }
    
    $Script:InstallationReport.phases["configuration"] = $phaseResult
    Write-InstallLog "Configuration phase complete" "OK"
    
    return $phaseResult
}

function Invoke-Phase5Verification {
    Write-InstallLog "PHASE 5: Verification" "PHASE"
    
    $phaseResult = @{
        status = "passed"
        services = @{}
        gpu_test = $null
    }
    
    $serviceTests = @(
        @{ Name = "ollama"; Url = "http://localhost:11434/api/version"; Skip = $SkipOllama },
        @{ Name = "stable_diffusion"; Url = "http://localhost:7860/sdapi/v1/options"; Skip = $SkipStableDiffusion },
        @{ Name = "comfyui"; Url = "http://localhost:8188/system_stats"; Skip = $SkipComfyUI }
    )
    
    foreach ($test in $serviceTests) {
        if ($test.Skip) {
            $phaseResult.services[$test.Name] = @{ status = "skipped" }
            continue
        }
        
        Write-InstallLog "Testing $($test.Name)..." "INFO"
        
        $health = Test-ServiceHealth -Name $test.Name -Url $test.Url -Timeout 10
        
        if ($health.Online) {
            Write-InstallLog "$($test.Name): Online (HTTP $($health.StatusCode))" "OK"
            $phaseResult.services[$test.Name] = @{ status = "online"; http_code = $health.StatusCode }
        } else {
            Write-InstallLog "$($test.Name): Offline or not started yet" "WARN"
            $phaseResult.services[$test.Name] = @{ status = "offline"; error = $health.Error }
        }
    }
    
    Write-InstallLog "Testing GPU memory allocation..." "INFO"
    try {
        $gpuTest = & nvidia-smi --query-gpu=memory.free,memory.total,memory.used --format=csv,noheader,nounits 2>$null
        if ($gpuTest) {
            $parts = $gpuTest -split ","
            $phaseResult.gpu_test = @{
                status = "passed"
                memory_free_mb = [int]$parts[0].Trim()
                memory_total_mb = [int]$parts[1].Trim()
                memory_used_mb = [int]$parts[2].Trim()
            }
            Write-InstallLog "GPU Memory: $($phaseResult.gpu_test.memory_free_mb)MB free of $($phaseResult.gpu_test.memory_total_mb)MB total" "OK"
        } else {
            $phaseResult.gpu_test = @{ status = "failed"; error = "nvidia-smi returned no data" }
            Write-InstallLog "GPU test: nvidia-smi returned no data" "WARN"
        }
    } catch {
        $phaseResult.gpu_test = @{ status = "failed"; error = $_.ToString() }
        Write-InstallLog "GPU test failed: $_" "WARN"
    }
    
    $offlineServices = $phaseResult.services.GetEnumerator() | Where-Object { $_.Value.status -eq "offline" }
    if ($offlineServices.Count -gt 0) {
        Write-InstallLog "Note: Some services are offline - they may need to be started manually or are still initializing" "WARN"
    }
    
    $Script:InstallationReport.phases["verification"] = $phaseResult
    Write-InstallLog "Verification phase complete" "OK"
    
    return $phaseResult
}

function Invoke-Phase6StartServices {
    Write-InstallLog "PHASE 6: Start Services" "PHASE"
    
    $phaseResult = @{
        status = "passed"
        supervisor_started = $false
        health_daemon_started = $false
        webhook_reported = $false
    }
    
    if ($WhatIfPreference) {
        Write-InstallLog "WhatIf: Would start AI supervisor and health daemon" "INFO"
        $Script:InstallationReport.phases["start_services"] = $phaseResult
        return $phaseResult
    }
    
    $supervisorScript = Join-Path $ScriptDir "windows-ai-supervisor.ps1"
    if (Test-Path $supervisorScript) {
        Write-InstallLog "Starting AI Supervisor..." "INFO"
        try {
            & $supervisorScript -Action start
            $phaseResult.supervisor_started = $true
            Write-InstallLog "AI Supervisor started" "OK"
        } catch {
            Write-InstallLog "Failed to start AI Supervisor: $_" "ERROR"
        }
    } else {
        Write-InstallLog "windows-ai-supervisor.ps1 not found" "WARN"
    }
    
    $healthDaemonScript = Join-Path $ScriptDir "vm-ai-health-daemon.ps1"
    if (Test-Path $healthDaemonScript) {
        Write-InstallLog "Starting Health Daemon in background..." "INFO"
        try {
            Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File `"$healthDaemonScript`"" -WindowStyle Hidden
            $phaseResult.health_daemon_started = $true
            Write-InstallLog "Health Daemon started in background" "OK"
        } catch {
            Write-InstallLog "Failed to start Health Daemon: $_" "ERROR"
        }
    } else {
        Write-InstallLog "vm-ai-health-daemon.ps1 not found" "WARN"
    }
    
    $webhookUrl = if ($DashboardWebhook) { $DashboardWebhook } else { $env:NEBULA_HEALTH_WEBHOOK }
    if ($webhookUrl) {
        Write-InstallLog "Reporting installation success to dashboard..." "INFO"
        try {
            $report = @{
                event = "node_installed"
                hostname = $env:COMPUTERNAME
                tailscale_ip = Get-TailscaleIP
                timestamp = (Get-Date -Format "o")
                services = $Script:InstallationReport.services_installed
                gpu = (Get-NvidiaGPUInfo)
            }
            
            Invoke-RestMethod -Uri $webhookUrl -Method Post -Body ($report | ConvertTo-Json -Depth 5) -ContentType "application/json" -TimeoutSec 10 | Out-Null
            $phaseResult.webhook_reported = $true
            Write-InstallLog "Installation reported to dashboard" "OK"
        } catch {
            Write-InstallLog "Failed to report to dashboard: $_" "WARN"
        }
    }
    
    $Script:InstallationReport.phases["start_services"] = $phaseResult
    Write-InstallLog "Start services phase complete" "OK"
    
    return $phaseResult
}

function Save-InstallationManifest {
    $gpuInfo = Get-NvidiaGPUInfo
    
    $manifest = @{
        version = $Script:Version
        installed_at = (Get-Date -Format "o")
        hostname = $env:COMPUTERNAME
        tailscale_ip = Get-TailscaleIP
        os = (Get-WindowsVersion)
        gpu = @{
            name = $gpuInfo.Name
            vram_mb = $gpuInfo.VRAM_MB
            driver_version = $gpuInfo.DriverMajorVersion
            cuda_capable = $gpuInfo.CUDACapable
        }
        services = @{
            ollama = @{
                installed = -not $SkipOllama
                port = 11434
                endpoint = "/api/version"
            }
            stable_diffusion = @{
                installed = -not $SkipStableDiffusion
                port = 7860
                endpoint = "/sdapi/v1/options"
            }
            comfyui = @{
                installed = -not $SkipComfyUI
                port = 8188
                endpoint = "/system_stats"
            }
        }
        capabilities = @{
            llm_inference = -not $SkipOllama
            image_generation = -not $SkipStableDiffusion
            video_generation = -not $SkipComfyUI
            training = $InstallTraining
            max_vram_gb = if ($gpuInfo.VRAM_MB) { [math]::Round($gpuInfo.VRAM_MB / 1024, 1) } else { $null }
        }
        paths = @{
            ai_root = $Script:Paths.AIRoot
            models = $Script:Paths.ModelsDir
            logs = $Script:Paths.LogDir
            state_file = $Script:Paths.StateFile
        }
    }
    
    try {
        $manifest | ConvertTo-Json -Depth 10 | Set-Content -Path $Script:Paths.ManifestFile -Force
        Write-InstallLog "Node manifest saved to: $($Script:Paths.ManifestFile)" "OK"
    } catch {
        Write-InstallLog "Failed to save manifest: $_" "WARN"
    }
    
    return $manifest
}

function Save-InstallationReport {
    $Script:InstallationReport.completed_at = (Get-Date -Format "o")
    $Script:InstallationReport.duration_seconds = ((Get-Date) - $Script:InstallStartTime).TotalSeconds
    
    $reportFile = Join-Path $Script:Paths.LogDir "install-report-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
    
    try {
        $Script:InstallationReport | ConvertTo-Json -Depth 10 | Set-Content -Path $reportFile -Force
        Write-InstallLog "Installation report saved to: $reportFile" "OK"
    } catch {
        Write-InstallLog "Failed to save installation report: $_" "WARN"
    }
}

function Show-InstallationSummary {
    $duration = [math]::Round(((Get-Date) - $Script:InstallStartTime).TotalMinutes, 1)
    
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host " INSTALLATION COMPLETE" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Duration: ${duration} minutes" -ForegroundColor White
    Write-Host "Hostname: $env:COMPUTERNAME" -ForegroundColor White
    
    $tsIP = Get-TailscaleIP
    if ($tsIP) {
        Write-Host "Tailscale IP: $tsIP" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "Services Installed:" -ForegroundColor Yellow
    if (-not $SkipOllama) { Write-Host "  - Ollama:            http://localhost:11434" -ForegroundColor White }
    if (-not $SkipStableDiffusion) { Write-Host "  - Stable Diffusion:  http://localhost:7860" -ForegroundColor White }
    if (-not $SkipComfyUI) { Write-Host "  - ComfyUI:           http://localhost:8188" -ForegroundColor White }
    
    if ($Script:InstallationReport.errors.Count -gt 0) {
        Write-Host ""
        Write-Host "Errors ($($Script:InstallationReport.errors.Count)):" -ForegroundColor Red
        foreach ($err in $Script:InstallationReport.errors) {
            Write-Host "  - $err" -ForegroundColor Red
        }
    }
    
    if ($Script:InstallationReport.warnings.Count -gt 0) {
        Write-Host ""
        Write-Host "Warnings ($($Script:InstallationReport.warnings.Count)):" -ForegroundColor Yellow
        foreach ($warn in $Script:InstallationReport.warnings | Select-Object -First 5) {
            Write-Host "  - $warn" -ForegroundColor Yellow
        }
        if ($Script:InstallationReport.warnings.Count -gt 5) {
            Write-Host "  ... and $($Script:InstallationReport.warnings.Count - 5) more (see log file)" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "Log file: $($Script:Paths.LogFile)" -ForegroundColor Cyan
    Write-Host "Manifest: $($Script:Paths.ManifestFile)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "  1. Verify services: .\windows-ai-supervisor.ps1 -Action status" -ForegroundColor White
    Write-Host "  2. Configure dashboard webhook in configs\environment.ps1" -ForegroundColor White
    Write-Host "  3. Test from dashboard: AI > Nodes > $env:COMPUTERNAME" -ForegroundColor White
    Write-Host ""
}

function Main {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host " Nebula Command - Windows AI Node Installer v$($Script:Version)" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host ""
    
    if ($WhatIfPreference) {
        Write-Host "[WhatIf Mode] No changes will be made" -ForegroundColor Yellow
        Write-Host ""
    }
    
    Initialize-Installation
    
    Write-InstallLog "Installation started on $env:COMPUTERNAME" "INFO"
    Write-InstallLog "Parameters: SkipOllama=$SkipOllama, SkipSD=$SkipStableDiffusion, SkipComfy=$SkipComfyUI, Training=$InstallTraining, Unattended=$Unattended" "DEBUG"
    
    $preflightResult = Invoke-Phase1PreflightChecks
    if ($preflightResult.status -eq "failed") {
        Write-InstallLog "Installation aborted due to failed preflight checks" "ERROR"
        Save-InstallationReport
        exit 1
    }
    
    if (-not $Force -and -not $Unattended -and -not $WhatIfPreference) {
        Write-Host ""
        Write-Host "Ready to install AI services. This will:" -ForegroundColor Yellow
        Write-Host "  - Install Git, Python 3.11, and other dependencies" -ForegroundColor White
        Write-Host "  - Download and configure Ollama, Stable Diffusion, ComfyUI" -ForegroundColor White
        Write-Host "  - Configure Windows Firewall for Tailscale access" -ForegroundColor White
        Write-Host "  - Set up automatic service startup" -ForegroundColor White
        Write-Host ""
        $confirm = Read-Host "Continue? (Y/n)"
        if ($confirm -eq "n" -or $confirm -eq "N") {
            Write-InstallLog "Installation cancelled by user" "INFO"
            exit 0
        }
    }
    
    try {
        $depsResult = Invoke-Phase2DependenciesInstallation
        if ($depsResult.status -eq "failed") {
            throw "Critical dependencies installation failed"
        }
        
        $aiResult = Invoke-Phase3AIServicesInstallation
        if ($aiResult.status -eq "failed") {
            throw "AI services installation failed"
        }
        
        $configResult = Invoke-Phase4Configuration
        
        $verifyResult = Invoke-Phase5Verification
        
        $startResult = Invoke-Phase6StartServices
        
        Save-InstallationManifest
        
    } catch {
        Write-InstallLog "Installation failed: $_" "ERROR"
        
        if (-not $WhatIfPreference -and $Script:RollbackActions.Count -gt 0) {
            $doRollback = $true
            if (-not $Unattended) {
                $rollbackChoice = Read-Host "Installation failed. Rollback changes? (Y/n)"
                $doRollback = $rollbackChoice -ne "n" -and $rollbackChoice -ne "N"
            }
            
            if ($doRollback) {
                Invoke-Rollback -Reason $_
            }
        }
        
        Save-InstallationReport
        exit 1
    }
    
    Save-InstallationReport
    
    Show-InstallationSummary
    
    Write-Progress -Activity "Installation" -Completed
    
    Write-InstallLog "Installation completed successfully" "OK"
}

Main
