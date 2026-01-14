# Windows AI Health Daemon - Enhanced Continuous Health Reporting
# Sends health updates with package versions and error detection to Nebula Command dashboard
# 
# Usage: .\start-health-daemon.ps1 -WebhookUrl "https://your-dashboard.com/api/ai/health-webhook"
# Or set environment variable: $env:NEBULA_HEALTH_WEBHOOK

param(
    [int]$IntervalSeconds = 30,
    [string]$WebhookUrl = $env:NEBULA_HEALTH_WEBHOOK,
    [switch]$DeepScan
)

$Script:Version = "1.1.0"
$Script:LogDir = "C:\ProgramData\NebulaCommand\logs"

if (-not $WebhookUrl) {
    Write-Host "ERROR: Webhook URL is required. Set NEBULA_HEALTH_WEBHOOK environment variable or pass -WebhookUrl parameter." -ForegroundColor Red
    Write-Host "Example: .\start-health-daemon.ps1 -WebhookUrl 'https://your-dashboard.com/api/ai/health-webhook'" -ForegroundColor Yellow
    exit 1
}

Write-Host "===== Nebula Command - Windows AI Health Daemon v$($Script:Version) =====" -ForegroundColor Cyan
Write-Host "Webhook URL: $WebhookUrl" -ForegroundColor Yellow
Write-Host "Interval: ${IntervalSeconds}s" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop"
Write-Host ""

$Script:KnownIssuePatterns = @(
    @{ id = "numpy_2x"; pattern = "numpy>=2.0.0|numpy 2\."; severity = "critical"; title = "NumPy 2.x Incompatibility" }
    @{ id = "torch_custom_op"; pattern = "torch\.library.*custom_op|has no attribute 'custom_op'"; severity = "critical"; title = "torch.library custom_op Error" }
    @{ id = "triton_missing"; pattern = "No module named 'triton'"; severity = "warning"; title = "Triton Module Missing" }
    @{ id = "xformers_mismatch"; pattern = "xformers.*built for|xFormers.*can't load"; severity = "warning"; title = "xformers Version Mismatch" }
    @{ id = "protobuf_conflict"; pattern = "cannot import name 'runtime_version'|protobuf.*conflict"; severity = "warning"; title = "Protobuf Version Conflict" }
    @{ id = "comfy_kitchen"; pattern = "comfy_kitchen|comfy-kitchen"; severity = "info"; title = "comfy_kitchen Incompatibility" }
    @{ id = "cuda_oom"; pattern = "CUDA out of memory|OutOfMemoryError"; severity = "critical"; title = "GPU Out of Memory" }
)

function Get-OllamaModels {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5
        return ($response.models | ForEach-Object { $_.name }) -join ","
    } catch {
        return $null
    }
}

function Test-ServicePort {
    param([int]$Port, [string]$Path = "/")
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port$Path" -TimeoutSec 3 -UseBasicParsing
        return $true
    } catch {
        return $false
    }
}

function Get-GpuInfo {
    try {
        $nvsmi = & nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits 2>$null
        if ($nvsmi) {
            $parts = $nvsmi -split ","
            return @{
                name = $parts[0].Trim()
                memory_used_mb = [int]$parts[1].Trim()
                memory_total_mb = [int]$parts[2].Trim()
                utilization_percent = [int]$parts[3].Trim()
                temperature_c = [int]$parts[4].Trim()
                status = "online"
            }
        }
    } catch {}
    return @{ status = "unknown"; error = "nvidia-smi not available" }
}

function Get-PythonPackageVersion {
    param([string]$PackageName)
    try {
        $result = & python -c "import $($PackageName.Replace('-', '_')); print($($PackageName.Replace('-', '_')).__version__)" 2>&1
        if ($LASTEXITCODE -eq 0) {
            return $result.Trim()
        }
    } catch {}
    try {
        $pipOutput = & python -m pip show $PackageName 2>&1
        if ($pipOutput -match "Version:\s*(.+)") {
            return $Matches[1].Trim()
        }
    } catch {}
    return $null
}

function Get-PackageVersions {
    $packages = @{}
    $targetPackages = @("numpy", "torch", "protobuf", "xformers", "transformers", "diffusers")
    
    foreach ($pkg in $targetPackages) {
        $version = Get-PythonPackageVersion -PackageName $pkg
        if ($version) {
            $packages[$pkg] = $version
        }
    }
    
    return $packages
}

function Scan-RecentLogs {
    $issues = @()
    $logFiles = @()
    
    if (Test-Path $Script:LogDir) {
        $logFiles += Get-ChildItem -Path $Script:LogDir -Filter "*.log" -ErrorAction SilentlyContinue | 
                     Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-1) }
    }
    
    $comfyLogPath = "C:\AI\ComfyUI\comfyui.log"
    if (Test-Path $comfyLogPath) {
        $logFiles += Get-Item $comfyLogPath
    }
    
    foreach ($logFile in $logFiles) {
        try {
            $content = Get-Content $logFile.FullName -Tail 200 -ErrorAction SilentlyContinue
            $contentStr = $content -join "`n"
            
            foreach ($issuePattern in $Script:KnownIssuePatterns) {
                if ($contentStr -match $issuePattern.pattern) {
                    if (-not ($issues | Where-Object { $_.id -eq $issuePattern.id })) {
                        $issues += @{
                            id = $issuePattern.id
                            severity = $issuePattern.severity
                            title = $issuePattern.title
                            source = $logFile.Name
                            detected_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                        }
                    }
                }
            }
        } catch {}
    }
    
    return $issues
}

function Detect-PackageIssues {
    param([hashtable]$Packages)
    
    $issues = @()
    
    if ($Packages.numpy -and $Packages.numpy -match "^2\.") {
        $issues += @{
            id = "numpy_2x_installed"
            severity = "critical"
            title = "NumPy 2.x Installed"
            description = "NumPy $($Packages.numpy) installed but PyTorch requires 1.x"
        }
    }
    
    if ($Packages.torch -and $Packages.xformers) {
        $torchMajorMinor = $Packages.torch -replace "(\d+\.\d+).*", '$1'
        if ($Packages.xformers -match "0\.0\.25|0\.0\.26" -and $torchMajorMinor -ne "2.2") {
            $issues += @{
                id = "xformers_torch_mismatch"
                severity = "warning"
                title = "xformers/PyTorch Version Mismatch"
                description = "xformers $($Packages.xformers) may not be compatible with PyTorch $($Packages.torch)"
            }
        }
    }
    
    return $issues
}

function Send-HealthReport {
    param([bool]$IncludeDeepScan = $false)
    
    $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    
    # Check Ollama
    $ollamaOnline = Test-ServicePort -Port 11434 -Path "/api/version"
    $ollamaModels = if ($ollamaOnline) { Get-OllamaModels } else { $null }
    
    # Check Stable Diffusion
    $sdOnline = Test-ServicePort -Port 7860 -Path "/"
    
    # Check ComfyUI
    $comfyOnline = Test-ServicePort -Port 8188 -Path "/system_stats"
    
    # Check Whisper
    $whisperOnline = Test-ServicePort -Port 8765 -Path "/health"
    
    # Get GPU info
    $gpu = Get-GpuInfo
    
    # Get package versions (every 5 minutes or on deep scan)
    $packages = @{}
    $detectedIssues = @()
    
    if ($IncludeDeepScan -or ((Get-Date).Minute % 5 -eq 0)) {
        $packages = Get-PackageVersions
        $detectedIssues += Detect-PackageIssues -Packages $packages
        $detectedIssues += Scan-RecentLogs
    }
    
    # Build report
    $report = @{
        timestamp = $timestamp
        hostname = $env:COMPUTERNAME
        node_type = "windows_gpu"
        daemon_version = $Script:Version
        tailscale_ip = "100.118.44.102"
        services = @{
            ollama = @{
                name = "Ollama"
                status = if ($ollamaOnline) { "online" } else { "offline" }
                port = 11434
                url = "http://100.118.44.102:11434"
                details = @{ models = $ollamaModels }
            }
            stable_diffusion = @{
                name = "Stable Diffusion WebUI"
                status = if ($sdOnline) { "online" } else { "offline" }
                port = 7860
                url = "http://100.118.44.102:7860"
            }
            comfyui = @{
                name = "ComfyUI"
                status = if ($comfyOnline) { "online" } else { "offline" }
                port = 8188
                url = "http://100.118.44.102:8188"
            }
            whisper = @{
                name = "Whisper STT"
                status = if ($whisperOnline) { "online" } else { "offline" }
                port = 8765
                url = "http://100.118.44.102:8765"
            }
        }
        gpu = $gpu
        packages = $packages
        detected_issues = $detectedIssues
        health = @{
            status = if ($ollamaOnline -and $comfyOnline) { "healthy" } elseif ($ollamaOnline -or $sdOnline -or $comfyOnline) { "degraded" } else { "offline" }
            services_online = @($ollamaOnline, $sdOnline, $comfyOnline, $whisperOnline).Where({$_}).Count
            services_total = 4
            issues_count = $detectedIssues.Count
            critical_issues = ($detectedIssues | Where-Object { $_.severity -eq "critical" }).Count
        }
    }
    
    # Send report
    try {
        $body = $report | ConvertTo-Json -Depth 6
        Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10 | Out-Null
        
        $onlineCount = $report.health.services_online
        $issueCount = $report.health.issues_count
        $statusColor = if ($onlineCount -eq 4 -and $issueCount -eq 0) { "Green" } elseif ($onlineCount -gt 0) { "Yellow" } else { "Red" }
        
        $gpuInfo = if ($gpu.memory_used_mb) { "GPU: $($gpu.memory_used_mb)MB / $($gpu.memory_total_mb)MB" } else { "GPU: N/A" }
        $issueInfo = if ($issueCount -gt 0) { " | Issues: $issueCount" } else { "" }
        
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Sent: $onlineCount/4 services online | $gpuInfo$issueInfo" -ForegroundColor $statusColor
        
        return $true
    } catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Failed: $_" -ForegroundColor Red
        return $false
    }
}

# Send initial report with deep scan
Write-Host "Sending initial health report with full diagnostics..." -ForegroundColor Yellow
Send-HealthReport -IncludeDeepScan $true | Out-Null

# Continuous loop
$loopCount = 0
while ($true) {
    Start-Sleep -Seconds $IntervalSeconds
    $loopCount++
    
    # Deep scan every 10 iterations (5 minutes at 30s intervals) or if requested
    $doDeepScan = $DeepScan -or ($loopCount % 10 -eq 0)
    Send-HealthReport -IncludeDeepScan $doDeepScan | Out-Null
}
