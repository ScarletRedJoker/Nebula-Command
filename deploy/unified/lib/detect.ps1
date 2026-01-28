# Nebula Command - Hardware Detection Module (Windows)
# Detects GPU, VRAM, CUDA/ROCm, RAM, disk, and network interfaces

param(
    [string]$OutputFile = ""
)

$ErrorActionPreference = "SilentlyContinue"

function Get-OSInfo {
    $os = Get-CimInstance Win32_OperatingSystem
    return @{
        Name = $os.Caption
        Version = $os.Version
        Build = $os.BuildNumber
        Arch = if ([Environment]::Is64BitOperatingSystem) { "x86_64" } else { "x86" }
    }
}

function Get-RAMInfo {
    $ram = Get-CimInstance Win32_ComputerSystem
    return [math]::Round($ram.TotalPhysicalMemory / 1MB)
}

function Get-DiskInfo {
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    return [math]::Round($disk.FreeSpace / 1MB)
}

function Get-NvidiaGPU {
    $gpuInfo = $null
    
    try {
        $nvidiaSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
        if ($nvidiaSmi) {
            $gpuData = & nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits 2>$null
            
            if ($gpuData) {
                $gpus = $gpuData -split "`n" | Where-Object { $_ -match '\S' }
                $totalVram = 0
                $gpuNames = @()
                $driverVersion = ""
                
                foreach ($gpu in $gpus) {
                    $parts = $gpu -split ","
                    if ($parts.Count -ge 3) {
                        $gpuNames += $parts[0].Trim()
                        $totalVram += [int]$parts[1].Trim()
                        $driverVersion = $parts[2].Trim()
                    }
                }
                
                $cudaVersion = ""
                $nvcc = Get-Command nvcc -ErrorAction SilentlyContinue
                if ($nvcc) {
                    $nvccOutput = & nvcc --version 2>$null | Select-String "release"
                    if ($nvccOutput -match "release (\d+\.\d+)") {
                        $cudaVersion = $matches[1]
                    }
                }
                
                $gpuInfo = @{
                    vendor = "nvidia"
                    count = $gpus.Count
                    names = ($gpuNames -join ", ")
                    vram_mb = $totalVram
                    cuda_version = if ($cudaVersion) { $cudaVersion } else { $driverVersion }
                }
            }
        }
    } catch {
        # Silently continue
    }
    
    return $gpuInfo
}

function Get-AMDGPU {
    $gpuInfo = $null
    
    try {
        $amdGpus = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match "AMD|Radeon" }
        
        if ($amdGpus) {
            $totalVram = 0
            $gpuNames = @()
            
            foreach ($gpu in $amdGpus) {
                $gpuNames += $gpu.Name
                $totalVram += [math]::Round($gpu.AdapterRAM / 1MB)
            }
            
            $gpuInfo = @{
                vendor = "amd"
                count = @($amdGpus).Count
                names = ($gpuNames -join ", ")
                vram_mb = $totalVram
                rocm_version = ""
            }
        }
    } catch {
        # Silently continue
    }
    
    return $gpuInfo
}

function Get-IntelGPU {
    $gpuInfo = $null
    
    try {
        $intelGpus = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match "Intel" }
        
        if ($intelGpus -and -not (Get-NvidiaGPU) -and -not (Get-AMDGPU)) {
            $gpuInfo = @{
                vendor = "intel"
                count = @($intelGpus).Count
                names = ($intelGpus | Select-Object -First 1).Name
                vram_mb = 0
                driver = "integrated"
            }
        }
    } catch {
        # Silently continue
    }
    
    return $gpuInfo
}

function Get-GPUInfo {
    $nvidia = Get-NvidiaGPU
    if ($nvidia) { return $nvidia }
    
    $amd = Get-AMDGPU
    if ($amd) { return $amd }
    
    $intel = Get-IntelGPU
    if ($intel) { return $intel }
    
    return @{
        vendor = "none"
        count = 0
        names = ""
        vram_mb = 0
    }
}

function Get-NetworkInfo {
    $primaryIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -notmatch "^169\." } | Select-Object -First 1).IPAddress
    
    $tailscaleIP = ""
    try {
        $tailscale = Get-Command tailscale -ErrorAction SilentlyContinue
        if ($tailscale) {
            $tailscaleIP = & tailscale ip -4 2>$null
        }
    } catch {
        # Silently continue
    }
    
    $interfaces = (Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | Select-Object -ExpandProperty Name) -join ", "
    
    return @{
        primary_ip = if ($primaryIP) { $primaryIP } else { "127.0.0.1" }
        tailscale_ip = $tailscaleIP
        interfaces = $interfaces
    }
}

function Get-InstalledServices {
    $ollama = $null -ne (Get-Command ollama -ErrorAction SilentlyContinue)
    $docker = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)
    $comfyui = (Test-Path "C:\ComfyUI") -or (Test-Path "$env:USERPROFILE\ComfyUI")
    $sd = (Test-Path "C:\stable-diffusion-webui") -or (Test-Path "$env:USERPROFILE\stable-diffusion-webui")
    
    return @{
        ollama = $ollama
        comfyui = $comfyui
        stable_diffusion = $sd
        docker = $docker
    }
}

function Get-NodeId {
    $hostname = $env:COMPUTERNAME
    $mac = (Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | Select-Object -First 1).MacAddress
    $macSuffix = if ($mac) { ($mac -replace "-", "").Substring(6) } else { (Get-Date).Ticks.ToString().Substring(12) }
    return "$hostname-$macSuffix"
}

function Main {
    $osInfo = Get-OSInfo
    $ramMB = Get-RAMInfo
    $diskMB = Get-DiskInfo
    $gpu = Get-GPUInfo
    $network = Get-NetworkInfo
    $services = Get-InstalledServices
    $nodeId = Get-NodeId
    
    $hasGpu = $gpu.count -gt 0 -and $gpu.vendor -ne "none"
    $vramMB = $gpu.vram_mb
    $isGpuCapable = $hasGpu -and ($vramMB -ge 4000)
    
    $profile = @{
        node_id = $nodeId
        detected_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        platform = "windows"
        os = $osInfo.Name
        arch = $osInfo.Arch
        ram_mb = $ramMB
        disk_available_mb = $diskMB
        gpu = $gpu
        network = $network
        services = $services
        capabilities = @{
            has_gpu = $hasGpu
            is_gpu_capable = $isGpuCapable
            vram_mb = $vramMB
            can_run_llm = $ramMB -ge 8000
            can_run_sd = $isGpuCapable
            can_run_comfyui = $isGpuCapable
        }
    }
    
    $json = $profile | ConvertTo-Json -Depth 5
    
    if ($OutputFile) {
        $parentDir = Split-Path -Parent $OutputFile
        if (-not (Test-Path $parentDir)) {
            New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
        }
        $json | Out-File -FilePath $OutputFile -Encoding UTF8
        Write-Host "[Detect] Hardware profile saved to: $OutputFile"
        # Return the file path for callers that capture output
        return $OutputFile
    } else {
        Write-Output $json
    }
}

Main
