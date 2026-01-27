# Nebula Command - One-Command Node Bootstrap (Windows)
# Detects hardware, configures services, installs dependencies, and starts services

param(
    [string]$DashboardUrl = "",
    [switch]$NoOllama,
    [switch]$NoComfyUI,
    [switch]$ForceComfyUI,
    [switch]$DryRun,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LibDir = Join-Path $ScriptDir "lib"
$StateDir = Join-Path $ScriptDir "state"

function Write-Info { param($Message) Write-Host "[INFO] $Message" -ForegroundColor Blue }
function Write-Success { param($Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Warn { param($Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

if ($Help) {
    Write-Host @"
Nebula Command - Windows Node Bootstrap

Usage: .\bootstrap.ps1 [options]

Options:
  -DashboardUrl URL    Dashboard URL for node registration
  -NoOllama            Skip Ollama installation
  -NoComfyUI           Skip ComfyUI installation  
  -ForceComfyUI        Install ComfyUI even without GPU
  -DryRun              Show what would be done without making changes
  -Help                Show this help message

Examples:
  .\bootstrap.ps1
  .\bootstrap.ps1 -DashboardUrl "http://192.168.1.100:5000"
  .\bootstrap.ps1 -DryRun
"@
    exit 0
}

function Test-Admin {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Install-Chocolatey {
    if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
        Write-Info "Installing Chocolatey package manager..."
        
        if ($DryRun) {
            Write-Info "[DRY RUN] Would install Chocolatey"
            return
        }
        
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        
        Write-Success "Chocolatey installed"
    }
}

function Install-Dependencies {
    Write-Info "Checking dependencies..."
    
    $missing = @()
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { $missing += "git" }
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) { $missing += "python3" }
    
    if ($missing.Count -gt 0) {
        Write-Info "Installing: $($missing -join ', ')"
        
        if ($DryRun) {
            Write-Info "[DRY RUN] Would install: $($missing -join ', ')"
            return
        }
        
        Install-Chocolatey
        
        foreach ($pkg in $missing) {
            choco install $pkg -y --no-progress
        }
        
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    }
    
    Write-Success "Dependencies satisfied"
}

function Invoke-HardwareDetection {
    Write-Info "Detecting hardware..."
    
    if (-not (Test-Path $StateDir)) {
        New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
    }
    
    $profileFile = Join-Path $StateDir "hardware-profile.json"
    
    & powershell -ExecutionPolicy Bypass -File "$LibDir\detect.ps1" -OutputFile $profileFile
    
    if (Test-Path $profileFile) {
        Write-Success "Hardware detection complete"
        
        $profile = Get-Content $profileFile | ConvertFrom-Json
        
        Write-Info "Node ID: $($profile.node_id)"
        Write-Info "RAM: $($profile.ram_mb)MB"
        Write-Info "GPU: $($profile.gpu.vendor) ($($profile.gpu.vram_mb)MB VRAM)"
        
        return $profileFile
    } else {
        Write-Error "Hardware detection failed"
        exit 1
    }
}

function New-NodeConfiguration {
    param($ProfileFile)
    
    Write-Info "Generating node configuration..."
    
    $profile = Get-Content $ProfileFile | ConvertFrom-Json
    $nodeId = $profile.node_id
    $nodeDir = Join-Path $StateDir $nodeId
    
    if (-not (Test-Path $nodeDir)) {
        New-Item -ItemType Directory -Path $nodeDir -Force | Out-Null
    }
    
    Copy-Item $ProfileFile -Destination (Join-Path $nodeDir "hardware-profile.json") -Force
    
    $advertiseIP = if ($profile.network.tailscale_ip) { $profile.network.tailscale_ip } else { $profile.network.primary_ip }
    
    $envContent = @"
# Nebula Command Node Configuration
# Generated: $(Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
# Node ID: $nodeId

# Node Identity
NODE_ID=$nodeId
NODE_PLATFORM=windows
NODE_IP=$advertiseIP
WINDOWS_VM_TAILSCALE_IP=$advertiseIP

# Dashboard Connection
DASHBOARD_URL=$DashboardUrl

# AI Service URLs
OLLAMA_URL=http://${advertiseIP}:11434
STABLE_DIFFUSION_URL=http://${advertiseIP}:7860
COMFYUI_URL=http://${advertiseIP}:8188

# Hardware Capabilities
HAS_GPU=$($profile.capabilities.has_gpu.ToString().ToLower())
GPU_VENDOR=$($profile.gpu.vendor)
VRAM_MB=$($profile.capabilities.vram_mb)

# Service Ports
OLLAMA_PORT=11434
COMFYUI_PORT=8188
SD_PORT=7860
"@

    $envContent | Out-File -FilePath (Join-Path $nodeDir ".env") -Encoding UTF8
    
    $vramArgs = ""
    if (-not $profile.capabilities.has_gpu) {
        $vramArgs = "--cpu"
    } elseif ($profile.capabilities.vram_mb -lt 6000) {
        $vramArgs = "--lowvram"
    } elseif ($profile.capabilities.vram_mb -lt 8000) {
        $vramArgs = "--normalvram"
    } else {
        $vramArgs = "--highvram"
    }
    
    @"
# ComfyUI Configuration
COMFYUI_PORT=8188
COMFYUI_LISTEN=0.0.0.0
COMFYUI_EXTRA_ARGS=$vramArgs
"@ | Out-File -FilePath (Join-Path $nodeDir "comfyui.conf") -Encoding UTF8
    
    $services = @()
    if ($profile.capabilities.can_run_llm) {
        $services += @{name="ollama"; enabled=$true; port=11434}
    }
    if ($profile.capabilities.can_run_sd) {
        $services += @{name="stable_diffusion"; enabled=$true; port=7860}
    }
    if ($profile.capabilities.can_run_comfyui) {
        $services += @{name="comfyui"; enabled=$true; port=8188}
    }
    
    @{
        node_id = $nodeId
        generated_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        services = $services
    } | ConvertTo-Json -Depth 3 | Out-File -FilePath (Join-Path $nodeDir "services.json") -Encoding UTF8
    
    Write-Success "Configuration generated"
    
    return $nodeDir
}

function Install-Ollama {
    param($ProfileFile)
    
    if ($NoOllama) {
        Write-Info "Skipping Ollama installation"
        return
    }
    
    if (Get-Command ollama -ErrorAction SilentlyContinue) {
        Write-Info "Ollama already installed"
        return
    }
    
    $profile = Get-Content $ProfileFile | ConvertFrom-Json
    
    if (-not $profile.capabilities.can_run_llm) {
        Write-Warn "System does not meet minimum requirements for LLM (8GB RAM)"
        return
    }
    
    Write-Info "Installing Ollama..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would install Ollama"
        return
    }
    
    $ollamaInstaller = Join-Path $env:TEMP "OllamaSetup.exe"
    Invoke-WebRequest -Uri "https://ollama.ai/download/OllamaSetup.exe" -OutFile $ollamaInstaller
    
    Start-Process -FilePath $ollamaInstaller -ArgumentList "/SILENT" -Wait
    
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    
    Write-Success "Ollama installed"
}

function Install-ComfyUI {
    param($ProfileFile)
    
    if ($NoComfyUI) {
        Write-Info "Skipping ComfyUI installation"
        return
    }
    
    $comfyuiDir = "C:\ComfyUI"
    $userComfyuiDir = Join-Path $env:USERPROFILE "ComfyUI"
    
    if ((Test-Path $comfyuiDir) -or (Test-Path $userComfyuiDir)) {
        Write-Info "ComfyUI already installed"
        return
    }
    
    $profile = Get-Content $ProfileFile | ConvertFrom-Json
    
    if (-not $ForceComfyUI -and -not $profile.capabilities.can_run_comfyui) {
        Write-Warn "System does not meet requirements for ComfyUI (GPU with 4GB+ VRAM)"
        return
    }
    
    Write-Info "Installing ComfyUI..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would install ComfyUI"
        return
    }
    
    $installDir = $userComfyuiDir
    
    git clone https://github.com/comfyanonymous/ComfyUI.git $installDir
    
    Set-Location $installDir
    python -m venv venv
    & "$installDir\venv\Scripts\pip.exe" install -r requirements.txt
    
    Write-Success "ComfyUI installed at: $installDir"
}

function Install-StableDiffusion {
    param($ProfileFile)
    
    $sdDir = "C:\StableDiffusion"
    $userSdDir = Join-Path $env:USERPROFILE "stable-diffusion-webui"
    
    if ((Test-Path $sdDir) -or (Test-Path $userSdDir)) {
        Write-Info "Stable Diffusion already installed"
        return
    }
    
    $profile = Get-Content $ProfileFile | ConvertFrom-Json
    
    if (-not $profile.capabilities.can_run_sd) {
        Write-Warn "System does not meet requirements for Stable Diffusion (GPU with 4GB+ VRAM)"
        return
    }
    
    Write-Info "Installing Stable Diffusion..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would install Stable Diffusion"
        return
    }
    
    $installDir = $userSdDir
    
    git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git $installDir
    
    Set-Location $installDir
    & "$installDir\webui.bat" --help | Out-Null
    
    Write-Success "Stable Diffusion installed at: $installDir"
}

function Install-NSSM {
    if (Get-Command nssm -ErrorAction SilentlyContinue) {
        return
    }
    
    Write-Info "Installing NSSM for service management..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would install NSSM"
        return
    }
    
    Install-Chocolatey
    choco install nssm -y --no-progress
    
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function New-WindowsServices {
    param($ProfileFile, $NodeDir)
    
    Write-Info "Setting up Windows services..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would create Windows services"
        return
    }
    
    Install-NSSM
    
    if (Get-Command ollama -ErrorAction SilentlyContinue) {
        $existingService = Get-Service -Name "Ollama" -ErrorAction SilentlyContinue
        
        if (-not $existingService) {
            $ollamaPath = (Get-Command ollama).Source
            
            nssm install Ollama $ollamaPath serve
            nssm set Ollama AppEnvironmentExtra "OLLAMA_HOST=0.0.0.0:11434" "OLLAMA_ORIGINS=*"
            nssm set Ollama Start SERVICE_AUTO_START
            nssm set Ollama AppRestartDelay 3000
            
            Write-Success "Ollama service created"
        }
    }
    
    $comfyuiDir = Join-Path $env:USERPROFILE "ComfyUI"
    if (Test-Path $comfyuiDir) {
        $existingService = Get-Service -Name "ComfyUI" -ErrorAction SilentlyContinue
        
        if (-not $existingService) {
            $pythonPath = "$comfyuiDir\venv\Scripts\python.exe"
            $mainPath = "$comfyuiDir\main.py"
            
            $extraArgs = Get-Content (Join-Path $NodeDir "comfyui.conf") | Where-Object { $_ -match "COMFYUI_EXTRA_ARGS=" } | ForEach-Object { $_.Split("=")[1] }
            
            nssm install ComfyUI $pythonPath $mainPath --listen 0.0.0.0 --port 8188 $extraArgs
            nssm set ComfyUI AppDirectory $comfyuiDir
            nssm set ComfyUI Start SERVICE_AUTO_START
            nssm set ComfyUI AppRestartDelay 5000
            
            Write-Success "ComfyUI service created"
        }
    }
    
    $sdDir = Join-Path $env:USERPROFILE "stable-diffusion-webui"
    if (Test-Path $sdDir) {
        $existingService = Get-Service -Name "StableDiffusion" -ErrorAction SilentlyContinue
        
        if (-not $existingService) {
            $batchPath = "$sdDir\webui.bat"
            
            $extraArgs = Get-Content (Join-Path $NodeDir "sd.conf") | Where-Object { $_ -match "SD_WEBUI_EXTRA_ARGS=" } | ForEach-Object { $_.Split("=")[1] }
            
            nssm install StableDiffusion cmd /c "$batchPath $extraArgs"
            nssm set StableDiffusion AppDirectory $sdDir
            nssm set StableDiffusion Start SERVICE_AUTO_START
            nssm set StableDiffusion AppRestartDelay 5000
            
            Write-Success "Stable Diffusion service created"
        }
    }
}

function Start-NodeServices {
    param($ProfileFile)
    
    Write-Info "Starting services..."
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would start services"
        return
    }
    
    $ollamaService = Get-Service -Name "Ollama" -ErrorAction SilentlyContinue
    if ($ollamaService -and $ollamaService.Status -ne "Running") {
        Start-Service -Name "Ollama"
        Write-Success "Ollama started"
    }
    
    $comfyuiService = Get-Service -Name "ComfyUI" -ErrorAction SilentlyContinue
    if ($comfyuiService -and $comfyuiService.Status -ne "Running") {
        Start-Service -Name "ComfyUI"
        Write-Success "ComfyUI started"
    }
    
    $sdService = Get-Service -Name "StableDiffusion" -ErrorAction SilentlyContinue
    if ($sdService -and $sdService.Status -ne "Running") {
        Start-Service -Name "StableDiffusion"
        Write-Success "Stable Diffusion started"
    }
}

function Register-Node {
    param($ProfileFile)
    
    if (-not $DashboardUrl) {
        Write-Info "No DashboardUrl set, skipping node registration"
        return
    }
    
    Write-Info "Registering node with dashboard..."
    
    $profile = Get-Content $ProfileFile -Raw
    
    if ($DryRun) {
        Write-Info "[DRY RUN] Would register node"
        return
    }
    
    try {
        $response = Invoke-RestMethod -Uri "$DashboardUrl/api/nodes/register" -Method Post -Body $profile -ContentType "application/json" -ErrorAction Stop
        
        if ($response.success) {
            Write-Success "Node registered"
        } else {
            Write-Warn "Node registration failed"
        }
    } catch {
        Write-Warn "Node registration failed (dashboard may be unreachable)"
    }
}

function Show-Summary {
    param($ProfileFile, $NodeDir)
    
    $profile = Get-Content $ProfileFile | ConvertFrom-Json
    $primaryIP = $profile.network.primary_ip
    $tailscaleIP = $profile.network.tailscale_ip
    $advertiseIP = if ($tailscaleIP) { $tailscaleIP } else { $primaryIP }
    
    Write-Host ""
    Write-Host "=============================================="
    Write-Host "  Nebula Command Node Bootstrap Complete"
    Write-Host "=============================================="
    Write-Host ""
    Write-Host "Node ID:        $($profile.node_id)"
    Write-Host "Config Dir:     $NodeDir"
    Write-Host "Primary IP:     $primaryIP"
    if ($tailscaleIP) {
        Write-Host "Tailscale IP:   $tailscaleIP"
    }
    Write-Host ""
    Write-Host "Services:"
    
    $ollamaService = Get-Service -Name "Ollama" -ErrorAction SilentlyContinue
    if ($ollamaService -and $ollamaService.Status -eq "Running") {
        Write-Host "  - Ollama:     http://${advertiseIP}:11434 (running)"
    } elseif (Get-Command ollama -ErrorAction SilentlyContinue) {
        Write-Host "  - Ollama:     installed (not running)"
    }
    
    $sdService = Get-Service -Name "StableDiffusion" -ErrorAction SilentlyContinue
    if ($sdService -and $sdService.Status -eq "Running") {
        Write-Host "  - Stable Diffusion: http://${advertiseIP}:7860 (running)"
    } elseif (Test-Path (Join-Path $env:USERPROFILE "stable-diffusion-webui")) {
        Write-Host "  - Stable Diffusion: installed (not running)"
    }
    
    $comfyuiService = Get-Service -Name "ComfyUI" -ErrorAction SilentlyContinue
    if ($comfyuiService -and $comfyuiService.Status -eq "Running") {
        Write-Host "  - ComfyUI:    http://${advertiseIP}:8188 (running)"
    } elseif (Test-Path (Join-Path $env:USERPROFILE "ComfyUI")) {
        Write-Host "  - ComfyUI:    installed (not running)"
    }
    
    Write-Host ""
    Write-Host "To add to dashboard, set environment variable:"
    Write-Host "  WINDOWS_VM_TAILSCALE_IP=$advertiseIP"
    Write-Host ""
}

function Main {
    Write-Host ""
    Write-Host "================================================"
    Write-Host "  Nebula Command - Automated Node Bootstrap"
    Write-Host "================================================"
    Write-Host ""
    
    if (-not (Test-Admin)) {
        Write-Warn "Not running as Administrator. Some features may not work."
    }
    
    Install-Dependencies
    
    $profileFile = Invoke-HardwareDetection
    
    $nodeDir = New-NodeConfiguration -ProfileFile $profileFile
    
    Install-Ollama -ProfileFile $profileFile
    Install-StableDiffusion -ProfileFile $profileFile
    Install-ComfyUI -ProfileFile $profileFile
    
    New-WindowsServices -ProfileFile $profileFile -NodeDir $nodeDir
    Start-NodeServices -ProfileFile $profileFile
    
    Register-Node -ProfileFile $profileFile
    
    Show-Summary -ProfileFile $profileFile -NodeDir $nodeDir
}

Main
