<#
.SYNOPSIS
    Verify Windows AI Services Status
.DESCRIPTION
    Checks status of all AI services on Windows VM and returns JSON report.
    Designed for dashboard consumption and automated health checks.
.PARAMETER OutputFormat
    Output format: json (default), text, or minimal
.PARAMETER Timeout
    HTTP request timeout in seconds (default: 10)
.EXAMPLE
    .\verify-ai-services.ps1
.EXAMPLE
    .\verify-ai-services.ps1 -OutputFormat text
.NOTES
    Returns exit code 0 if all critical services are online, 1 otherwise.
#>

[CmdletBinding()]
param(
    [ValidateSet("json", "text", "minimal")]
    [string]$OutputFormat = "json",
    
    [int]$Timeout = 10
)

$ErrorActionPreference = "SilentlyContinue"

$script:Status = @{
    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    hostname = $env:COMPUTERNAME
    overall = "unknown"
    services = @{}
    gpu = @{}
    system = @{}
    errors = @()
}

function Test-OllamaService {
    $result = @{
        name = "Ollama"
        status = "offline"
        endpoint = "http://localhost:11434"
        port = 11434
        version = $null
        models = @()
        error = $null
        responseTimeMs = 0
    }
    
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/version" -TimeoutSec $Timeout
        $result.responseTimeMs = $stopwatch.ElapsedMilliseconds
        
        if ($response.version) {
            $result.status = "online"
            $result.version = $response.version
        }
        
        $models = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec $Timeout
        if ($models.models) {
            $result.models = $models.models | ForEach-Object { 
                @{ name = $_.name; size = $_.size; modified = $_.modified_at }
            }
        }
    }
    catch {
        $result.error = $_.Exception.Message
        $result.responseTimeMs = $stopwatch.ElapsedMilliseconds
    }
    
    return $result
}

function Test-StableDiffusionService {
    $result = @{
        name = "Stable Diffusion WebUI"
        status = "offline"
        endpoint = "http://localhost:7860"
        port = 7860
        model = $null
        sampler = $null
        isGenerating = $false
        error = $null
        responseTimeMs = 0
    }
    
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:7860/sdapi/v1/options" -TimeoutSec $Timeout
        $result.responseTimeMs = $stopwatch.ElapsedMilliseconds
        
        if ($response) {
            $result.status = "online"
            $result.model = $response.sd_model_checkpoint
            $result.sampler = $response.sampler_name
        }
        
        $progress = Invoke-RestMethod -Uri "http://localhost:7860/sdapi/v1/progress" -TimeoutSec 5
        if ($progress) {
            $result.isGenerating = $progress.state.job_count -gt 0
            $result.progress = $progress.progress
        }
    }
    catch {
        $result.error = $_.Exception.Message
        $result.responseTimeMs = $stopwatch.ElapsedMilliseconds
    }
    
    return $result
}

function Test-ComfyUIService {
    $result = @{
        name = "ComfyUI"
        status = "offline"
        endpoint = "http://localhost:8188"
        port = 8188
        gpuDevices = @()
        queueSize = 0
        error = $null
        responseTimeMs = 0
    }
    
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8188/system_stats" -TimeoutSec $Timeout
        $result.responseTimeMs = $stopwatch.ElapsedMilliseconds
        
        if ($response) {
            $result.status = "online"
            
            if ($response.devices) {
                $result.gpuDevices = $response.devices | ForEach-Object {
                    @{
                        name = $_.name
                        type = $_.type
                        vramTotal = $_.vram_total
                        vramFree = $_.vram_free
                    }
                }
            }
        }
        
        $queue = Invoke-RestMethod -Uri "http://localhost:8188/queue" -TimeoutSec 5
        if ($queue) {
            $result.queueSize = ($queue.queue_running | Measure-Object).Count + ($queue.queue_pending | Measure-Object).Count
        }
    }
    catch {
        $result.error = $_.Exception.Message
        $result.responseTimeMs = $stopwatch.ElapsedMilliseconds
    }
    
    return $result
}

function Get-GpuStatus {
    $result = @{
        available = $false
        name = $null
        driverVersion = $null
        cudaVersion = $null
        memoryTotalMB = 0
        memoryUsedMB = 0
        memoryFreeMB = 0
        utilizationPercent = 0
        temperatureC = 0
        powerWatts = 0
        error = $null
    }
    
    try {
        $nvidiaSmi = Get-Command nvidia-smi -ErrorAction Stop
        
        $output = & nvidia-smi --query-gpu=name,driver_version,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu,power.draw --format=csv,noheader,nounits 2>&1
        
        if ($LASTEXITCODE -eq 0 -and $output) {
            $parts = $output -split ","
            $result.available = $true
            $result.name = $parts[0].Trim()
            $result.driverVersion = $parts[1].Trim()
            $result.memoryTotalMB = [int]$parts[2].Trim()
            $result.memoryUsedMB = [int]$parts[3].Trim()
            $result.memoryFreeMB = [int]$parts[4].Trim()
            $result.utilizationPercent = [int]$parts[5].Trim()
            $result.temperatureC = [int]$parts[6].Trim()
            $result.powerWatts = [double]$parts[7].Trim()
        }
        
        $cudaOutput = & nvidia-smi --query-gpu=cuda_version --format=csv,noheader,nounits 2>&1
        if ($cudaOutput) {
            $result.cudaVersion = $cudaOutput.Trim()
        }
    }
    catch {
        $result.error = $_.Exception.Message
    }
    
    return $result
}

function Get-SystemStatus {
    $result = @{
        uptime = $null
        cpuUsagePercent = 0
        memoryTotalGB = 0
        memoryUsedGB = 0
        memoryFreeGB = 0
        memoryUsagePercent = 0
        pythonVersion = $null
        gitVersion = $null
    }
    
    try {
        $uptime = (Get-Date) - (Get-CimInstance -ClassName Win32_OperatingSystem).LastBootUpTime
        $result.uptime = "{0}d {1}h {2}m" -f $uptime.Days, $uptime.Hours, $uptime.Minutes
        
        $cpu = Get-CimInstance -ClassName Win32_Processor | Measure-Object -Property LoadPercentage -Average
        $result.cpuUsagePercent = [int]$cpu.Average
        
        $mem = Get-CimInstance -ClassName Win32_OperatingSystem
        $result.memoryTotalGB = [math]::Round($mem.TotalVisibleMemorySize / 1MB, 2)
        $result.memoryFreeGB = [math]::Round($mem.FreePhysicalMemory / 1MB, 2)
        $result.memoryUsedGB = [math]::Round(($mem.TotalVisibleMemorySize - $mem.FreePhysicalMemory) / 1MB, 2)
        $result.memoryUsagePercent = [int]((1 - ($mem.FreePhysicalMemory / $mem.TotalVisibleMemorySize)) * 100)
        
        try {
            $pythonVer = & python --version 2>&1
            if ($pythonVer -match "Python\s+([\d.]+)") {
                $result.pythonVersion = $Matches[1]
            }
        } catch {}
        
        try {
            $gitVer = & git --version 2>&1
            if ($gitVer -match "git version ([\d.]+)") {
                $result.gitVersion = $Matches[1]
            }
        } catch {}
    }
    catch {
        $script:Status.errors += "System status error: $($_.Exception.Message)"
    }
    
    return $result
}

$script:Status.services.ollama = Test-OllamaService
$script:Status.services.stableDiffusion = Test-StableDiffusionService
$script:Status.services.comfyui = Test-ComfyUIService
$script:Status.gpu = Get-GpuStatus
$script:Status.system = Get-SystemStatus

$onlineCount = 0
$totalServices = 3

if ($script:Status.services.ollama.status -eq "online") { $onlineCount++ }
if ($script:Status.services.stableDiffusion.status -eq "online") { $onlineCount++ }
if ($script:Status.services.comfyui.status -eq "online") { $onlineCount++ }

$script:Status.overall = switch ($onlineCount) {
    3 { "healthy" }
    2 { "degraded" }
    1 { "degraded" }
    0 { "offline" }
}

$script:Status.summary = @{
    servicesOnline = $onlineCount
    servicesTotal = $totalServices
    gpuAvailable = $script:Status.gpu.available
    gpuMemoryUsedPercent = if ($script:Status.gpu.memoryTotalMB -gt 0) {
        [int](($script:Status.gpu.memoryUsedMB / $script:Status.gpu.memoryTotalMB) * 100)
    } else { 0 }
}

switch ($OutputFormat) {
    "json" {
        $script:Status | ConvertTo-Json -Depth 10 -Compress
    }
    "text" {
        Write-Host "="*60
        Write-Host "WINDOWS AI SERVICES STATUS" -ForegroundColor Cyan
        Write-Host "="*60
        Write-Host "Timestamp: $($script:Status.timestamp)"
        Write-Host "Hostname:  $($script:Status.hostname)"
        Write-Host "Overall:   $($script:Status.overall)" -ForegroundColor $(
            switch ($script:Status.overall) {
                "healthy" { "Green" }
                "degraded" { "Yellow" }
                "offline" { "Red" }
                default { "White" }
            }
        )
        Write-Host ""
        
        Write-Host "SERVICES:" -ForegroundColor White
        foreach ($svc in @("ollama", "stableDiffusion", "comfyui")) {
            $s = $script:Status.services.$svc
            $statusColor = if ($s.status -eq "online") { "Green" } else { "Red" }
            $icon = if ($s.status -eq "online") { "[OK]" } else { "[--]" }
            Write-Host "  $icon $($s.name): $($s.status)" -ForegroundColor $statusColor
            if ($s.status -eq "online") {
                if ($s.version) { Write-Host "      Version: $($s.version)" }
                if ($s.model) { Write-Host "      Model: $($s.model)" }
            }
            else {
                if ($s.error) { Write-Host "      Error: $($s.error)" -ForegroundColor DarkGray }
            }
        }
        Write-Host ""
        
        Write-Host "GPU:" -ForegroundColor White
        if ($script:Status.gpu.available) {
            Write-Host "  Name: $($script:Status.gpu.name)"
            Write-Host "  Driver: $($script:Status.gpu.driverVersion) | CUDA: $($script:Status.gpu.cudaVersion)"
            Write-Host "  Memory: $($script:Status.gpu.memoryUsedMB)/$($script:Status.gpu.memoryTotalMB) MB ($($script:Status.summary.gpuMemoryUsedPercent)%)"
            Write-Host "  Utilization: $($script:Status.gpu.utilizationPercent)% | Temp: $($script:Status.gpu.temperatureC)C | Power: $($script:Status.gpu.powerWatts)W"
        }
        else {
            Write-Host "  Not available: $($script:Status.gpu.error)" -ForegroundColor Red
        }
        Write-Host ""
        
        Write-Host "SYSTEM:" -ForegroundColor White
        Write-Host "  Uptime: $($script:Status.system.uptime)"
        Write-Host "  CPU: $($script:Status.system.cpuUsagePercent)%"
        Write-Host "  RAM: $($script:Status.system.memoryUsedGB)/$($script:Status.system.memoryTotalGB) GB ($($script:Status.system.memoryUsagePercent)%)"
        Write-Host "  Python: $($script:Status.system.pythonVersion) | Git: $($script:Status.system.gitVersion)"
        Write-Host "="*60
    }
    "minimal" {
        Write-Host "$($script:Status.overall): Ollama=$($script:Status.services.ollama.status), SD=$($script:Status.services.stableDiffusion.status), ComfyUI=$($script:Status.services.comfyui.status), GPU=$($script:Status.gpu.utilizationPercent)%"
    }
}

if ($script:Status.overall -eq "healthy") {
    exit 0
}
elseif ($script:Status.overall -eq "degraded") {
    exit 1
}
else {
    exit 2
}
