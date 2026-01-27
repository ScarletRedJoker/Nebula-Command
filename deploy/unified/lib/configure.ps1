# Nebula Command - Configuration Generator (Windows)
# Generates per-node configuration based on hardware profile

param(
    [Parameter(Mandatory=$true)]
    [string]$ProfileFile,
    [string]$OutputDir = "",
    [string]$DashboardUrl = ""
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $OutputDir) {
    $OutputDir = Join-Path (Split-Path -Parent $ScriptDir) "state"
}

function New-EnvFile {
    param($Profile, $NodeDir, $DashboardUrl)
    
    $advertiseIP = if ($Profile.network.tailscale_ip) { $Profile.network.tailscale_ip } else { $Profile.network.primary_ip }
    
    $envContent = @"
# Nebula Command Node Configuration
# Generated: $(Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
# Node ID: $($Profile.node_id)

# Node Identity
NODE_ID=$($Profile.node_id)
NODE_PLATFORM=$($Profile.platform)
NODE_IP=$advertiseIP
WINDOWS_VM_TAILSCALE_IP=$advertiseIP

# Dashboard Connection
DASHBOARD_URL=$DashboardUrl

# AI Service URLs
OLLAMA_URL=http://${advertiseIP}:11434
STABLE_DIFFUSION_URL=http://${advertiseIP}:7860
COMFYUI_URL=http://${advertiseIP}:8188

# Hardware Capabilities
HAS_GPU=$($Profile.capabilities.has_gpu.ToString().ToLower())
GPU_VENDOR=$($Profile.gpu.vendor)
VRAM_MB=$($Profile.capabilities.vram_mb)
CUDA_VERSION=$($Profile.gpu.cuda_version)

# Service Ports
OLLAMA_PORT=11434
COMFYUI_PORT=8188
SD_PORT=7860

# Logging
LOG_LEVEL=info
AI_LOG_LEVEL=info
"@

    if ($Profile.capabilities.has_gpu -and $Profile.gpu.vendor -eq "nvidia") {
        $envContent += @"

# NVIDIA GPU Settings
CUDA_VISIBLE_DEVICES=all
NVIDIA_VISIBLE_DEVICES=all
"@
    }
    
    $envContent | Out-File -FilePath (Join-Path $NodeDir ".env") -Encoding UTF8
    Write-Host "[Configure] Generated .env file"
}

function New-ServiceConfig {
    param($Profile, $NodeDir, $Service)
    
    switch ($Service) {
        "ollama" {
            $numGpu = 0
            if ($Profile.capabilities.has_gpu) {
                if ($Profile.capabilities.vram_mb -ge 8000) {
                    $numGpu = 99
                } else {
                    $numGpu = 1
                }
            }
            
            @"
# Ollama Configuration - Node: $($Profile.node_id)
OLLAMA_HOST=0.0.0.0:11434
OLLAMA_ORIGINS=*
OLLAMA_KEEP_ALIVE=5m
OLLAMA_NUM_GPU=$numGpu
"@ | Out-File -FilePath (Join-Path $NodeDir "ollama.conf") -Encoding UTF8
            Write-Host "[Configure] Generated ollama.conf"
        }
        
        "comfyui" {
            $extraArgs = ""
            if (-not $Profile.capabilities.has_gpu) {
                $extraArgs = "--cpu"
            } elseif ($Profile.gpu.vendor -eq "amd") {
                $extraArgs = "--directml"
            } elseif ($Profile.capabilities.vram_mb -lt 6000) {
                $extraArgs = "--lowvram"
            } elseif ($Profile.capabilities.vram_mb -lt 8000) {
                $extraArgs = "--normalvram"
            } else {
                $extraArgs = "--highvram"
            }
            
            @"
# ComfyUI Configuration - Node: $($Profile.node_id)
COMFYUI_PORT=8188
COMFYUI_LISTEN=0.0.0.0
COMFYUI_EXTRA_ARGS=$extraArgs
"@ | Out-File -FilePath (Join-Path $NodeDir "comfyui.conf") -Encoding UTF8
            Write-Host "[Configure] Generated comfyui.conf"
        }
        
        "sd" {
            $extraArgs = ""
            if (-not $Profile.capabilities.has_gpu) {
                $extraArgs = "--skip-torch-cuda-test --use-cpu all --no-half"
            } elseif ($Profile.capabilities.vram_mb -lt 4000) {
                $extraArgs = "--lowvram --opt-sub-quad-attention"
            } elseif ($Profile.capabilities.vram_mb -lt 6000) {
                $extraArgs = "--medvram --opt-sdp-attention"
            } else {
                $extraArgs = "--xformers"
            }
            
            @"
# Stable Diffusion Configuration - Node: $($Profile.node_id)
SD_WEBUI_PORT=7860
SD_WEBUI_LISTEN=0.0.0.0
SD_WEBUI_EXTRA_ARGS=$extraArgs
SD_WEBUI_API=true
"@ | Out-File -FilePath (Join-Path $NodeDir "sd.conf") -Encoding UTF8
            Write-Host "[Configure] Generated sd.conf"
        }
    }
}

function New-ServicesManifest {
    param($Profile, $NodeDir)
    
    $services = @()
    
    if ($Profile.capabilities.can_run_llm) {
        $services += @{name="ollama"; enabled=$true; port=11434}
    }
    
    if ($Profile.capabilities.can_run_sd) {
        $services += @{name="stable-diffusion"; enabled=$true; port=7860}
    }
    
    if ($Profile.capabilities.can_run_comfyui) {
        $services += @{name="comfyui"; enabled=$true; port=8188}
    }
    
    @{
        node_id = $Profile.node_id
        generated_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        services = $services
    } | ConvertTo-Json -Depth 3 | Out-File -FilePath (Join-Path $NodeDir "services.json") -Encoding UTF8
    
    Write-Host "[Configure] Generated services.json"
}

function Main {
    if (-not (Test-Path $ProfileFile)) {
        Write-Error "Profile file not found: $ProfileFile"
        exit 1
    }
    
    $profile = Get-Content $ProfileFile | ConvertFrom-Json
    $nodeDir = Join-Path $OutputDir $profile.node_id
    
    if (-not (Test-Path $nodeDir)) {
        New-Item -ItemType Directory -Path $nodeDir -Force | Out-Null
    }
    
    Copy-Item $ProfileFile -Destination (Join-Path $nodeDir "hardware-profile.json") -Force
    
    New-EnvFile -Profile $profile -NodeDir $nodeDir -DashboardUrl $DashboardUrl
    New-ServiceConfig -Profile $profile -NodeDir $nodeDir -Service "ollama"
    New-ServiceConfig -Profile $profile -NodeDir $nodeDir -Service "comfyui"
    New-ServiceConfig -Profile $profile -NodeDir $nodeDir -Service "sd"
    New-ServicesManifest -Profile $profile -NodeDir $nodeDir
    
    Write-Host "[Configure] Configuration complete for node: $($profile.node_id)"
    Write-Host "[Configure] Output directory: $nodeDir"
}

Main
