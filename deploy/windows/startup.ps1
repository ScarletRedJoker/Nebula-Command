<#
.SYNOPSIS
    Nebula Command - Windows VM Startup Script
    Environment bootstrap for AI services

.DESCRIPTION
    This script is idempotent - safe to run multiple times.
    Handles first-run provisioning on fresh nodes.
    It configures the environment, loads secrets, and starts all AI services.

.PARAMETER SkipRegistration
    Skip registering with the service registry
#>

param(
    [switch]$SkipRegistration
)

$ErrorActionPreference = "Continue"

$env:NEBULA_ENV = "windows-vm"
$env:NEBULA_ROLE = "agent"

$NebulaDir = $env:NEBULA_DIR
if (-not $NebulaDir) { $NebulaDir = "C:\NebulaCommand" }
$AgentDir = "C:\AI\nebula-agent"
$SecretsDir = "$NebulaDir\secrets"
$LogDir = "C:\ProgramData\NebulaCommand\logs"
$EnvFile = "$NebulaDir\.env"
$TokenFile = "$SecretsDir\agent-token.json"

function Write-Log {
    param(
        [string]$Level,
        [string]$Message
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    
    $color = switch ($Level) {
        "INFO"  { "Green" }
        "WARN"  { "Yellow" }
        "ERROR" { "Red" }
        default { "White" }
    }
    
    Write-Host $logEntry -ForegroundColor $color
    
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    Add-Content -Path "$LogDir\startup.log" -Value $logEntry -ErrorAction SilentlyContinue
}

function Create-Directories {
    Write-Log "INFO" "Creating required directories..."
    
    $directories = @(
        $NebulaDir,
        $AgentDir,
        $SecretsDir,
        $LogDir,
        "C:\AI",
        "C:\AI\ComfyUI",
        "C:\AI\StableDiffusion",
        "C:\NebulaData"
    )
    
    foreach ($dir in $directories) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Log "INFO" "  Created: $dir"
        }
    }
    
    Write-Log "INFO" "  Directories ready"
}

function Check-Prerequisites {
    Write-Log "INFO" "Checking prerequisites..."
    
    $hasNode = Get-Command "node" -ErrorAction SilentlyContinue
    $hasNpm = Get-Command "npm" -ErrorAction SilentlyContinue
    $hasGit = Get-Command "git" -ErrorAction SilentlyContinue
    $hasPm2 = Get-Command "pm2" -ErrorAction SilentlyContinue
    
    if (-not $hasNode) {
        Write-Log "ERROR" "  Node.js is not installed!"
        Write-Log "ERROR" "  Please install Node.js from https://nodejs.org/"
        Write-Log "ERROR" "  Or run: winget install OpenJS.NodeJS.LTS"
        return $false
    }
    else {
        $nodeVersion = & node --version 2>$null
        Write-Log "INFO" "  Node.js: $nodeVersion"
    }
    
    if (-not $hasNpm) {
        Write-Log "ERROR" "  npm is not installed!"
        return $false
    }
    else {
        $npmVersion = & npm --version 2>$null
        Write-Log "INFO" "  npm: $npmVersion"
    }
    
    if (-not $hasGit) {
        Write-Log "WARN" "  Git is not installed (optional)"
        Write-Log "WARN" "  Install with: winget install Git.Git"
    }
    else {
        Write-Log "INFO" "  Git: installed"
    }
    
    if (-not $hasPm2) {
        Write-Log "INFO" "  Installing PM2..."
        try {
            & npm install -g pm2 2>$null
            Write-Log "INFO" "  PM2 installed successfully"
        }
        catch {
            Write-Log "WARN" "  Failed to install PM2 (will start services directly)"
        }
    }
    else {
        Write-Log "INFO" "  PM2: installed"
    }
    
    return $true
}

function Detect-Environment {
    Write-Log "INFO" "Detecting environment..."
    
    $hostname = $env:COMPUTERNAME
    $platform = [System.Environment]::OSVersion.Platform
    
    if ($platform -eq "Win32NT") {
        Write-Log "INFO" "  Detected: Windows VM (AI workstation)"
        Write-Log "INFO" "  Hostname: $hostname"
    }
    
    if (Get-Command "nvidia-smi" -ErrorAction SilentlyContinue) {
        try {
            $gpuInfo = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>$null
            Write-Log "INFO" "  GPU: $gpuInfo"
        }
        catch {
            Write-Log "WARN" "  GPU detection failed"
        }
    }
    else {
        Write-Log "WARN" "  nvidia-smi not found (GPU may not be available)"
    }
    
    $env:NEBULA_ENV = "windows-vm"
}

function Generate-Secrets {
    Write-Log "INFO" "Checking secrets..."
    
    if (-not (Test-Path $SecretsDir)) {
        New-Item -ItemType Directory -Path $SecretsDir -Force | Out-Null
    }
    
    if (-not (Test-Path $EnvFile)) {
        Write-Log "INFO" "  Creating .env template..."
        @"
# Nebula Command - Windows VM Environment Configuration

# Dashboard connection
NEBULA_DASHBOARD_URL=https://dash.evindrake.net

# Agent settings (auto-generated if not set)
# NEBULA_AGENT_TOKEN=

# Optional AI service settings
# OLLAMA_HOST=0.0.0.0
# COMFYUI_PORT=8188
"@ | Set-Content $EnvFile
        Write-Log "INFO" "  Created $EnvFile"
    }
}

function Load-Secrets {
    Write-Log "INFO" "Loading secrets..."
    
    if (Test-Path $EnvFile) {
        Write-Log "INFO" "  Loading from $EnvFile"
        
        Get-Content $EnvFile -ErrorAction SilentlyContinue | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#")) {
                $parts = $line -split "=", 2
                if ($parts.Count -eq 2) {
                    $key = $parts[0].Trim()
                    $value = $parts[1].Trim().Trim('"').Trim("'")
                    [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
                }
            }
        }
    }
    
    if (Test-Path $SecretsDir) {
        Write-Log "INFO" "  Loading from secrets directory"
        
        Get-ChildItem -Path $SecretsDir -File -ErrorAction SilentlyContinue | ForEach-Object {
            $key = $_.BaseName
            $value = (Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue).Trim()
            if ($value) {
                [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
            }
        }
    }
    
    if (-not $env:NEBULA_AGENT_TOKEN) {
        Write-Log "WARN" "  NEBULA_AGENT_TOKEN not found, generating..."
        $token = Generate-AgentToken
        $env:NEBULA_AGENT_TOKEN = $token
    }
    
    Write-Log "INFO" "  Secrets loaded"
}

function Generate-AgentToken {
    Write-Log "INFO" "Generating agent token..."
    
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $token = [Convert]::ToBase64String($bytes) -replace '\+', '-' -replace '/', '_' -replace '=', ''
    
    if (-not (Test-Path $SecretsDir)) {
        New-Item -ItemType Directory -Path $SecretsDir -Force | Out-Null
    }
    
    $tokenInfo = @{
        token = $token
        nodeId = $env:COMPUTERNAME
        createdAt = (Get-Date).ToUniversalTime().ToString("o")
        expiresAt = (Get-Date).AddYears(1).ToUniversalTime().ToString("o")
    }
    
    $tokenInfo | ConvertTo-Json | Set-Content $TokenFile
    Write-Log "INFO" "  Token saved to $TokenFile"
    
    return $token
}

function Clone-Or-Update-Repo {
    Write-Log "INFO" "Setting up repository..."
    
    if (-not (Get-Command "git" -ErrorAction SilentlyContinue)) {
        Write-Log "WARN" "  Git not installed, skipping repository setup"
        return
    }
    
    $agentRepoDir = Join-Path $NebulaDir "services\nebula-agent"
    
    if (Test-Path (Join-Path $NebulaDir ".git")) {
        Write-Log "INFO" "  Repository exists, pulling latest..."
        Push-Location $NebulaDir
        try {
            & git fetch origin 2>$null
            & git reset --hard origin/main 2>$null
        }
        catch {
            Write-Log "WARN" "  Git pull failed"
        }
        Pop-Location
    }
    elseif ($env:NEBULA_REPO_URL -or $env:GITHUB_TOKEN) {
        Write-Log "INFO" "  Cloning repository..."
        $repoUrl = $env:NEBULA_REPO_URL
        if (-not $repoUrl) {
            $repoUrl = "https://github.com/evindrake/NebulaCommand.git"
        }
        if ($env:GITHUB_TOKEN) {
            $repoUrl = "https://$($env:GITHUB_TOKEN)@github.com/evindrake/NebulaCommand.git"
        }
        try {
            & git clone $repoUrl $NebulaDir 2>$null
        }
        catch {
            Write-Log "WARN" "  Git clone failed"
        }
    }
    else {
        Write-Log "INFO" "  No repository URL configured, skipping clone"
    }
}

function Install-Dependencies {
    Write-Log "INFO" "Installing dependencies..."
    
    $agentDir = Join-Path $NebulaDir "services\nebula-agent"
    
    if ((Test-Path $agentDir) -and (Test-Path (Join-Path $agentDir "package.json"))) {
        Write-Log "INFO" "  Installing agent dependencies..."
        Push-Location $agentDir
        try {
            & npm ci --production 2>$null
            if ($LASTEXITCODE -ne 0) {
                & npm install --production 2>$null
            }
            Write-Log "INFO" "  Dependencies installed"
        }
        catch {
            Write-Log "WARN" "  npm install failed"
        }
        Pop-Location
    }
}

function Start-AIServices {
    Write-Log "INFO" "Starting AI services..."
    
    $nebulaAiScript = Join-Path $NebulaDir "deploy\windows\nebula-ai.ps1"
    
    if (Test-Path $nebulaAiScript) {
        Write-Log "INFO" "  Using nebula-ai.ps1 manager"
        & $nebulaAiScript start
    }
    else {
        Write-Log "INFO" "  Starting services individually..."
        
        if (Get-Command "ollama" -ErrorAction SilentlyContinue) {
            Write-Log "INFO" "    Starting Ollama..."
            Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue
        }
        else {
            Write-Log "WARN" "    Ollama not installed (optional)"
        }
        
        Start-NebulaAgent
    }
}

function Start-NebulaAgent {
    Write-Log "INFO" "Starting Nebula Agent..."
    
    $agentDir = Join-Path $NebulaDir "services\nebula-agent"
    
    if (-not (Test-Path $agentDir)) {
        Write-Log "WARN" "  Agent directory not found: $agentDir"
        Write-Log "WARN" "  Clone the repository or set NEBULA_REPO_URL"
        return
    }
    
    $distFile = Join-Path $agentDir "dist\index.js"
    if (-not (Test-Path $distFile)) {
        Write-Log "WARN" "  Agent not built: $distFile not found"
        Write-Log "WARN" "  Run 'npm run build' in $agentDir"
        return
    }
    
    Push-Location $agentDir
    
    if (Get-Command "pm2" -ErrorAction SilentlyContinue) {
        pm2 delete nebula-agent 2>$null
        pm2 start dist/index.js --name nebula-agent --update-env 2>$null
        pm2 save 2>$null
        Write-Log "INFO" "  Agent started via PM2"
    }
    else {
        Write-Log "INFO" "  Starting agent directly..."
        Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WindowStyle Hidden -ErrorAction SilentlyContinue
    }
    
    Pop-Location
}

function Register-WithRegistry {
    if ($SkipRegistration) {
        Write-Log "INFO" "Skipping service registration (--SkipRegistration)"
        return
    }
    
    Write-Log "INFO" "Registering with service registry..."
    
    $dashboardUrl = $env:NEBULA_DASHBOARD_URL
    if (-not $dashboardUrl) {
        $dashboardUrl = "https://dash.evindrake.net"
    }
    
    $tailscaleIp = $null
    if (Get-Command "tailscale" -ErrorAction SilentlyContinue) {
        try {
            $tailscaleIp = & tailscale ip -4 2>$null
            Write-Log "INFO" "  Tailscale IP: $tailscaleIp"
        }
        catch {
            Write-Log "WARN" "  Tailscale not connected"
        }
    }
    else {
        Write-Log "WARN" "  Tailscale not installed"
    }
    
    if (-not $tailscaleIp) {
        Write-Log "WARN" "  No Tailscale IP, skipping registration"
        return
    }
    
    $registration = @{
        name = "nebula-agent"
        environment = "windows-vm"
        endpoint = "http://$($tailscaleIp):9765"
        capabilities = @("ai", "gpu", "ollama", "comfyui", "stable-diffusion", "whisper")
        hostname = $env:COMPUTERNAME
        platform = "windows"
        startedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
    
    try {
        $body = $registration | ConvertTo-Json
        Invoke-RestMethod -Uri "$dashboardUrl/api/server-registry" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 10
        Write-Log "INFO" "  Registered with dashboard"
    }
    catch {
        Write-Log "WARN" "  Registration failed (dashboard may be unavailable)"
    }
}

function Verify-Services {
    Write-Log "INFO" "Verifying services..."
    
    Start-Sleep -Seconds 5
    
    $services = @(
        @{ name = "Agent"; url = "http://localhost:9765/api/health"; critical = $true },
        @{ name = "Ollama"; url = "http://localhost:11434/api/tags"; critical = $true },
        @{ name = "ComfyUI"; url = "http://localhost:8188/system_stats"; critical = $false },
        @{ name = "SD WebUI"; url = "http://localhost:7860/sdapi/v1/sd-models"; critical = $false }
    )
    
    $criticalFailures = @()
    $optionalFailures = @()
    $healthyServices = @()
    
    foreach ($service in $services) {
        try {
            $response = Invoke-RestMethod -Uri $service.url -TimeoutSec 3 -ErrorAction SilentlyContinue
            Write-Log "INFO" "  $($service.name): healthy"
            $healthyServices += $service.name
        }
        catch {
            if ($service.critical) {
                Write-Log "ERROR" "  $($service.name): not responding (CRITICAL)"
                $criticalFailures += $service.name
            }
            else {
                Write-Log "WARN" "  $($service.name): not responding"
                $optionalFailures += $service.name
            }
        }
    }
    
    if ($criticalFailures.Count -gt 0) {
        Write-Log "ERROR" "Critical services failed: $($criticalFailures -join ', ')"
        Write-Log "WARN" "Deployment will continue but critical functionality is unavailable"
        return $false
    }
    
    return $true
}

function Print-Summary {
    param(
        [bool]$ServicesHealthy = $true
    )
    
    Write-Host ""
    Write-Log "INFO" "=========================================="
    Write-Log "INFO" "Windows VM Bootstrap Complete"
    Write-Log "INFO" "=========================================="
    Write-Host ""
    Write-Host "Environment: $env:NEBULA_ENV" -ForegroundColor Cyan
    Write-Host "Role: $env:NEBULA_ROLE" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Directories:" -ForegroundColor Yellow
    Write-Host "  Nebula:    $NebulaDir" -ForegroundColor White
    Write-Host "  AI:        C:\AI" -ForegroundColor White
    Write-Host "  Logs:      $LogDir" -ForegroundColor White
    Write-Host ""
    Write-Host "Service URLs:" -ForegroundColor Yellow
    Write-Host "  Agent:              http://localhost:9765" -ForegroundColor White
    Write-Host "  Ollama:             http://localhost:11434" -ForegroundColor White
    Write-Host "  ComfyUI:            http://localhost:8188" -ForegroundColor White
    Write-Host "  Stable Diffusion:   http://localhost:7860" -ForegroundColor White
    Write-Host ""
    Write-Host "Capabilities:" -ForegroundColor Yellow
    Write-Host "  - Local LLM inference (Ollama)" -ForegroundColor White
    Write-Host "  - Image generation (ComfyUI, SD WebUI)" -ForegroundColor White
    Write-Host "  - Speech-to-text (Whisper)" -ForegroundColor White
    Write-Host "  - GPU-accelerated AI tasks" -ForegroundColor White
    Write-Host ""
    
    Write-Host "Deployment Status:" -ForegroundColor Yellow
    if ($ServicesHealthy) {
        Write-Host "  Status: SUCCESS - All critical services are healthy" -ForegroundColor Green
        Write-Host "  Exit Code: 0" -ForegroundColor Green
    }
    else {
        Write-Host "  Status: WARNING - Some critical services failed to start" -ForegroundColor Red
        Write-Host "  Exit Code: 2 (partial success)" -ForegroundColor Yellow
        Write-Host "  See logs above for which services are unavailable" -ForegroundColor Yellow
    }
    Write-Host ""
}

function Main {
    Write-Host ""
    Write-Log "INFO" "=========================================="
    Write-Log "INFO" "Nebula Command - Windows VM Bootstrap"
    Write-Log "INFO" "Environment: $env:NEBULA_ENV | Role: $env:NEBULA_ROLE"
    Write-Log "INFO" "=========================================="
    Write-Host ""
    
    Create-Directories
    
    $prereqsMet = Check-Prerequisites
    if (-not $prereqsMet) {
        Write-Log "ERROR" "Prerequisites not met. Please install Node.js and try again."
        exit 1
    }
    
    Detect-Environment
    Generate-Secrets
    Load-Secrets
    Clone-Or-Update-Repo
    Install-Dependencies
    Start-AIServices
    Register-WithRegistry
    
    $servicesHealthy = Verify-Services
    
    Print-Summary $servicesHealthy
    
    if (-not $servicesHealthy) {
        Write-Log "ERROR" "Bootstrap completed with critical service failures"
        Write-Log "INFO" "Exit code: 2 (partial success - critical services unavailable)"
        exit 2
    }
    
    Write-Log "INFO" "Bootstrap completed successfully"
    exit 0
}

Main
