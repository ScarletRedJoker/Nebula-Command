<#
.SYNOPSIS
    Nebula Command - Windows AI Stack Setup Script
    
.DESCRIPTION
    Automated installation and configuration of AI tools on Windows:
    - Python 3.10-3.12 (compatible with AI libraries)
    - NVIDIA CUDA Toolkit
    - Ollama (local LLM inference)
    - Stable Diffusion WebUI / Forge
    - ComfyUI (node-based image generation)
    - Nebula Agent (remote management)
    
.PARAMETER Action
    The action to perform: install, configure, verify, uninstall, or status
    
.PARAMETER Components
    Comma-separated list of components: python, cuda, ollama, sd, comfyui, agent, all
    
.PARAMETER DryRun
    Show what would be done without making changes
    
.PARAMETER Verbose
    Enable verbose output
    
.EXAMPLE
    .\setup-ai-stack.ps1 -Action install -Components all
    .\setup-ai-stack.ps1 -Action verify
    .\setup-ai-stack.ps1 -Action install -Components ollama,sd -DryRun
    
.NOTES
    Run as Administrator for full functionality
#>

param(
    [Parameter(Position=0)]
    [ValidateSet("install", "configure", "verify", "uninstall", "status", "autostart")]
    [string]$Action = "status",
    
    [Parameter(Position=1)]
    [string]$Components = "all",
    
    [switch]$DryRun,
    [switch]$Force,
    [switch]$SkipCuda,
    [switch]$EnableAutostart
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

$Script:Config = @{
    InstallDir = "C:\AI"
    DataDir = "C:\ProgramData\NebulaCommand"
    LogFile = "C:\ProgramData\NebulaCommand\logs\setup-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
    
    PythonVersion = "3.10.11"
    PythonUrl = "https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe"
    PythonInstallDir = "C:\Python310"
    
    CudaVersion = "12.1"
    CudaUrl = "https://developer.download.nvidia.com/compute/cuda/12.1.0/local_installers/cuda_12.1.0_531.14_windows.exe"
    
    OllamaUrl = "https://ollama.com/download/OllamaSetup.exe"
    
    SDForgeRepo = "https://github.com/lllyasviel/stable-diffusion-webui-forge.git"
    SDForgeDir = "C:\AI\stable-diffusion-webui-forge"
    
    ComfyUIRepo = "https://github.com/comfyanonymous/ComfyUI.git"
    ComfyUIDir = "C:\AI\ComfyUI"
    
    AgentDir = "C:\NebulaCommand\deploy\windows\agent"
    AgentPort = 9765
    
    Services = @{
        "Ollama" = @{ Port = 11434; Check = "http://localhost:11434/api/tags" }
        "StableDiffusion" = @{ Port = 7860; Check = "http://localhost:7860" }
        "ComfyUI" = @{ Port = 8188; Check = "http://localhost:8188" }
        "NebulaAgent" = @{ Port = 9765; Check = "http://localhost:9765/health" }
    }
}

function Initialize-Logging {
    $logDir = Split-Path $Script:Config.LogFile -Parent
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
}

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("INFO", "WARN", "ERROR", "SUCCESS", "STEP", "DEBUG")]
        [string]$Level = "INFO"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    
    $color = switch ($Level) {
        "ERROR"   { "Red" }
        "WARN"    { "Yellow" }
        "SUCCESS" { "Green" }
        "STEP"    { "Cyan" }
        "DEBUG"   { "Gray" }
        default   { "White" }
    }
    
    $icon = switch ($Level) {
        "ERROR"   { "[X]" }
        "WARN"    { "[!]" }
        "SUCCESS" { "[+]" }
        "STEP"    { "[>]" }
        default   { "[*]" }
    }
    
    Write-Host "$icon $Message" -ForegroundColor $color
    Add-Content -Path $Script:Config.LogFile -Value $logMessage -ErrorAction SilentlyContinue
}

function Write-Banner {
    $banner = @"

 ╔══════════════════════════════════════════════════════════════╗
 ║           Nebula Command - Windows AI Stack Setup            ║
 ╚══════════════════════════════════════════════════════════════╝

"@
    Write-Host $banner -ForegroundColor Cyan
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "━━━ $Title ━━━" -ForegroundColor Magenta
    Write-Host ""
}

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-ServiceRunning {
    param([int]$Port)
    
    try {
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        return $null -ne $listener
    } catch {
        return $false
    }
}

function Test-HttpEndpoint {
    param([string]$Url, [int]$TimeoutSeconds = 5)
    
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSeconds -UseBasicParsing -ErrorAction Stop
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Get-PythonInfo {
    $pythonPaths = @(
        "$($Script:Config.PythonInstallDir)\python.exe",
        "C:\Python311\python.exe",
        "C:\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "python.exe"
    )
    
    foreach ($path in $pythonPaths) {
        try {
            if ($path -eq "python.exe") {
                $python = Get-Command python -ErrorAction SilentlyContinue
                if (-not $python) { continue }
                $path = $python.Source
            }
            
            if (-not (Test-Path $path)) { continue }
            
            $version = & $path --version 2>&1
            if ($version -match "Python (\d+)\.(\d+)\.(\d+)") {
                $major = [int]$Matches[1]
                $minor = [int]$Matches[2]
                
                if ($major -eq 3 -and $minor -ge 10 -and $minor -le 12) {
                    return @{
                        Path = $path
                        Version = "$($Matches[1]).$($Matches[2]).$($Matches[3])"
                        Major = $major
                        Minor = $minor
                        IsCompatible = $true
                    }
                }
            }
        } catch {
            continue
        }
    }
    
    return @{ IsCompatible = $false }
}

function Install-Python {
    Write-Section "Installing Python 3.10"
    
    $pythonInfo = Get-PythonInfo
    if ($pythonInfo.IsCompatible -and -not $Force) {
        Write-Log "Python $($pythonInfo.Version) already installed at $($pythonInfo.Path)" -Level SUCCESS
        return $true
    }
    
    $installerPath = "$env:TEMP\python-installer.exe"
    
    Write-Log "Downloading Python $($Script:Config.PythonVersion)..." -Level STEP
    
    if ($DryRun) {
        Write-Log "[DRY-RUN] Would download Python from $($Script:Config.PythonUrl)" -Level INFO
        return $true
    }
    
    try {
        Invoke-WebRequest -Uri $Script:Config.PythonUrl -OutFile $installerPath -UseBasicParsing
        
        Write-Log "Installing Python (this may take a few minutes)..." -Level STEP
        
        $installArgs = @(
            "/quiet",
            "InstallAllUsers=1",
            "PrependPath=1",
            "Include_pip=1",
            "Include_test=0",
            "TargetDir=$($Script:Config.PythonInstallDir)"
        )
        
        Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -NoNewWindow
        
        Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
        
        $env:Path = "$($Script:Config.PythonInstallDir);$($Script:Config.PythonInstallDir)\Scripts;$env:Path"
        
        $pythonInfo = Get-PythonInfo
        if ($pythonInfo.IsCompatible) {
            Write-Log "Python $($pythonInfo.Version) installed successfully" -Level SUCCESS
            return $true
        } else {
            Write-Log "Python installation verification failed" -Level ERROR
            return $false
        }
    } catch {
        Write-Log "Failed to install Python: $_" -Level ERROR
        return $false
    }
}

function Install-CUDA {
    Write-Section "Installing NVIDIA CUDA Toolkit"
    
    if ($SkipCuda) {
        Write-Log "Skipping CUDA installation (--SkipCuda flag)" -Level INFO
        return $true
    }
    
    $nvidiaSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
    if (-not $nvidiaSmi) {
        Write-Log "NVIDIA GPU not detected - skipping CUDA" -Level WARN
        return $true
    }
    
    $gpuInfo = & nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>&1
    Write-Log "Detected GPU: $gpuInfo" -Level INFO
    
    $cudaPath = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA"
    if ((Test-Path "$cudaPath\v12.1") -or (Test-Path "$cudaPath\v11.8")) {
        Write-Log "CUDA Toolkit already installed" -Level SUCCESS
        return $true
    }
    
    Write-Log "CUDA installation requires manual download from NVIDIA" -Level WARN
    Write-Log "Download from: https://developer.nvidia.com/cuda-downloads" -Level INFO
    Write-Log "Recommended version: CUDA 12.1 or 11.8" -Level INFO
    
    return $true
}

function Install-Ollama {
    Write-Section "Installing Ollama"
    
    $ollama = Get-Command ollama -ErrorAction SilentlyContinue
    if ($ollama -and -not $Force) {
        $version = & ollama --version 2>&1
        Write-Log "Ollama already installed: $version" -Level SUCCESS
        return $true
    }
    
    $installerPath = "$env:TEMP\OllamaSetup.exe"
    
    Write-Log "Downloading Ollama..." -Level STEP
    
    if ($DryRun) {
        Write-Log "[DRY-RUN] Would download and install Ollama" -Level INFO
        return $true
    }
    
    try {
        Invoke-WebRequest -Uri $Script:Config.OllamaUrl -OutFile $installerPath -UseBasicParsing
        
        Write-Log "Installing Ollama..." -Level STEP
        Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -NoNewWindow
        
        Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
        
        Start-Sleep -Seconds 3
        $ollama = Get-Command ollama -ErrorAction SilentlyContinue
        if ($ollama) {
            Write-Log "Ollama installed successfully" -Level SUCCESS
            
            Write-Log "Pulling default model (llama3.2)..." -Level STEP
            Start-Process -FilePath "ollama" -ArgumentList "pull llama3.2" -NoNewWindow
            
            return $true
        } else {
            Write-Log "Ollama installation verification failed" -Level ERROR
            return $false
        }
    } catch {
        Write-Log "Failed to install Ollama: $_" -Level ERROR
        return $false
    }
}

function Install-StableDiffusion {
    Write-Section "Installing Stable Diffusion WebUI Forge"
    
    $sdDir = $Script:Config.SDForgeDir
    
    if ((Test-Path "$sdDir\webui.bat") -and -not $Force) {
        Write-Log "Stable Diffusion Forge already installed at $sdDir" -Level SUCCESS
        return $true
    }
    
    $pythonInfo = Get-PythonInfo
    if (-not $pythonInfo.IsCompatible) {
        Write-Log "Python 3.10-3.12 required for Stable Diffusion" -Level ERROR
        return $false
    }
    
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) {
        Write-Log "Git is required - please install from https://git-scm.com" -Level ERROR
        return $false
    }
    
    if ($DryRun) {
        Write-Log "[DRY-RUN] Would clone Stable Diffusion Forge to $sdDir" -Level INFO
        return $true
    }
    
    try {
        if (-not (Test-Path $Script:Config.InstallDir)) {
            New-Item -ItemType Directory -Path $Script:Config.InstallDir -Force | Out-Null
        }
        
        Write-Log "Cloning Stable Diffusion WebUI Forge..." -Level STEP
        
        if (Test-Path $sdDir) {
            Write-Log "Updating existing installation..." -Level INFO
            Push-Location $sdDir
            git pull
            Pop-Location
        } else {
            git clone $Script:Config.SDForgeRepo $sdDir
        }
        
        Write-Log "Stable Diffusion Forge installed at $sdDir" -Level SUCCESS
        Write-Log "Run $sdDir\webui-user.bat to start" -Level INFO
        
        return $true
    } catch {
        Write-Log "Failed to install Stable Diffusion: $_" -Level ERROR
        return $false
    }
}

function Install-ComfyUI {
    Write-Section "Installing ComfyUI"
    
    $comfyDir = $Script:Config.ComfyUIDir
    
    if ((Test-Path "$comfyDir\main.py") -and -not $Force) {
        Write-Log "ComfyUI already installed at $comfyDir" -Level SUCCESS
        return $true
    }
    
    $pythonInfo = Get-PythonInfo
    if (-not $pythonInfo.IsCompatible) {
        Write-Log "Python 3.10-3.12 required for ComfyUI" -Level ERROR
        return $false
    }
    
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) {
        Write-Log "Git is required - please install from https://git-scm.com" -Level ERROR
        return $false
    }
    
    if ($DryRun) {
        Write-Log "[DRY-RUN] Would clone ComfyUI to $comfyDir" -Level INFO
        return $true
    }
    
    try {
        if (-not (Test-Path $Script:Config.InstallDir)) {
            New-Item -ItemType Directory -Path $Script:Config.InstallDir -Force | Out-Null
        }
        
        Write-Log "Cloning ComfyUI..." -Level STEP
        
        if (Test-Path $comfyDir) {
            Write-Log "Updating existing installation..." -Level INFO
            Push-Location $comfyDir
            git pull
            Pop-Location
        } else {
            git clone $Script:Config.ComfyUIRepo $comfyDir
        }
        
        Write-Log "Setting up Python virtual environment..." -Level STEP
        Push-Location $comfyDir
        & $pythonInfo.Path -m venv venv
        & ".\venv\Scripts\pip.exe" install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
        & ".\venv\Scripts\pip.exe" install -r requirements.txt
        Pop-Location
        
        Write-Log "ComfyUI installed at $comfyDir" -Level SUCCESS
        
        return $true
    } catch {
        Write-Log "Failed to install ComfyUI: $_" -Level ERROR
        return $false
    }
}

function Install-NebulaAgent {
    Write-Section "Installing Nebula Agent"
    
    $agentDir = $Script:Config.AgentDir
    $serverJs = Join-Path $agentDir "server.js"
    
    if ((Test-Path $serverJs) -and -not $Force) {
        Write-Log "Nebula Agent already installed at $agentDir" -Level SUCCESS
        return $true
    }
    
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        Write-Log "Node.js is required - please install from https://nodejs.org" -Level ERROR
        return $false
    }
    
    if ($DryRun) {
        Write-Log "[DRY-RUN] Would setup Nebula Agent at $agentDir" -Level INFO
        return $true
    }
    
    try {
        if (Test-Path $agentDir) {
            Write-Log "Installing agent dependencies..." -Level STEP
            Push-Location $agentDir
            npm install
            Pop-Location
            Write-Log "Nebula Agent configured" -Level SUCCESS
        } else {
            Write-Log "Agent directory not found - clone the repository first" -Level WARN
        }
        
        return $true
    } catch {
        Write-Log "Failed to setup Nebula Agent: $_" -Level ERROR
        return $false
    }
}

function Set-Autostart {
    Write-Section "Configuring Auto-Start"
    
    if ($DryRun) {
        Write-Log "[DRY-RUN] Would configure auto-start for AI services" -Level INFO
        return
    }
    
    $startupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
    
    $ollamaScript = @"
@echo off
start /min "" "ollama" serve
"@
    $ollamaScript | Out-File "$startupDir\start-ollama.bat" -Encoding ASCII
    Write-Log "Created Ollama auto-start script" -Level SUCCESS
    
    if (Test-Path $Script:Config.SDForgeDir) {
        $sdScript = @"
@echo off
cd /d $($Script:Config.SDForgeDir)
start /min "" "webui-user.bat"
"@
        $sdScript | Out-File "$startupDir\start-sd.bat" -Encoding ASCII
        Write-Log "Created Stable Diffusion auto-start script" -Level SUCCESS
    }
    
    if (Test-Path "$($Script:Config.ComfyUIDir)\venv\Scripts\python.exe") {
        $comfyScript = @"
@echo off
cd /d $($Script:Config.ComfyUIDir)
start /min "" "venv\Scripts\python.exe" main.py --listen 0.0.0.0 --port 8188
"@
        $comfyScript | Out-File "$startupDir\start-comfyui.bat" -Encoding ASCII
        Write-Log "Created ComfyUI auto-start script" -Level SUCCESS
    }
    
    Write-Log "Auto-start configuration complete" -Level SUCCESS
}

function Get-ServiceStatus {
    Write-Section "Service Status"
    
    $results = @()
    
    foreach ($service in $Script:Config.Services.GetEnumerator()) {
        $name = $service.Key
        $port = $service.Value.Port
        $checkUrl = $service.Value.Check
        
        $portOpen = Test-ServiceRunning -Port $port
        $httpOk = $false
        
        if ($portOpen) {
            $httpOk = Test-HttpEndpoint -Url $checkUrl -TimeoutSeconds 3
        }
        
        $status = if ($httpOk) { "Running" } elseif ($portOpen) { "Listening" } else { "Stopped" }
        $statusColor = if ($httpOk) { "Green" } elseif ($portOpen) { "Yellow" } else { "Red" }
        $icon = if ($httpOk) { "[+]" } elseif ($portOpen) { "[~]" } else { "[-]" }
        
        Write-Host "  $icon $name (port $port): $status" -ForegroundColor $statusColor
        
        $results += @{
            Name = $name
            Port = $port
            Status = $status
            Healthy = $httpOk
        }
    }
    
    return $results
}

function Start-HealthVerification {
    Write-Section "Health Check Verification"
    
    $results = Get-ServiceStatus
    $healthy = ($results | Where-Object { $_.Healthy }).Count
    $total = $results.Count
    
    Write-Host ""
    Write-Log "$healthy of $total services are healthy" -Level $(if ($healthy -eq $total) { "SUCCESS" } else { "WARN" })
    
    return $healthy -eq $total
}

function Invoke-Installation {
    param([string[]]$ComponentList)
    
    Write-Banner
    
    if (-not (Test-Administrator)) {
        Write-Log "Some features require Administrator privileges" -Level WARN
    }
    
    Initialize-Logging
    Write-Log "Installation log: $($Script:Config.LogFile)" -Level INFO
    
    $componentMap = @{
        "python" = { Install-Python }
        "cuda" = { Install-CUDA }
        "ollama" = { Install-Ollama }
        "sd" = { Install-StableDiffusion }
        "comfyui" = { Install-ComfyUI }
        "agent" = { Install-NebulaAgent }
    }
    
    if ($ComponentList -contains "all") {
        $ComponentList = @("python", "cuda", "ollama", "sd", "comfyui", "agent")
    }
    
    $results = @{}
    
    foreach ($component in $ComponentList) {
        if ($componentMap.ContainsKey($component)) {
            $results[$component] = & $componentMap[$component]
        } else {
            Write-Log "Unknown component: $component" -Level WARN
        }
    }
    
    if ($EnableAutostart) {
        Set-Autostart
    }
    
    Write-Section "Installation Summary"
    
    foreach ($result in $results.GetEnumerator()) {
        $status = if ($result.Value) { "SUCCESS" } else { "FAILED" }
        $color = if ($result.Value) { "Green" } else { "Red" }
        Write-Host "  $($result.Key): $status" -ForegroundColor $color
    }
    
    Start-HealthVerification
}

$componentList = $Components -split ","

switch ($Action) {
    "install" {
        Invoke-Installation -ComponentList $componentList
    }
    "configure" {
        Set-Autostart
    }
    "verify" {
        Write-Banner
        Start-HealthVerification
    }
    "status" {
        Write-Banner
        Get-ServiceStatus | Out-Null
    }
    "autostart" {
        Write-Banner
        Set-Autostart
    }
    default {
        Write-Banner
        Get-ServiceStatus | Out-Null
    }
}
