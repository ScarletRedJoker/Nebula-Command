# Windows KVM Agent - Simple HTTP Server for Remote Control
# Listens on port 8765 and provides endpoints for gaming/desktop mode switching
#
# Endpoints:
#   GET  /health           - Health check with system status
#   GET  /diagnostics      - Full system diagnostics
#   POST /mode/gaming      - Switch to gaming mode (start Sunshine, prepare for streaming)
#   POST /mode/desktop     - Switch to desktop mode (stop Sunshine, enable RDP)
#   POST /restart-sunshine - Restart Sunshine service
#   POST /shutdown         - Initiate system shutdown
#
# Run with: powershell -ExecutionPolicy Bypass -File windows-agent.ps1
# Or install as service using install-windows-agent.ps1

param(
    [int]$Port = 8765,
    [string]$LogPath = "$env:ProgramData\KVMAgent\agent.log"
)

$ErrorActionPreference = "Continue"
$script:StartTime = Get-Date

$LogDir = Split-Path -Parent $LogPath
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "[$timestamp] [$Level] $Message"
    Write-Host $logLine
    Add-Content -Path $LogPath -Value $logLine -ErrorAction SilentlyContinue
}

function Get-SunshineStatus {
    $process = Get-Process -Name "sunshine" -ErrorAction SilentlyContinue
    $service = Get-Service -Name "Sunshine*" -ErrorAction SilentlyContinue | Select-Object -First 1
    
    return @{
        running = $null -ne $process
        pid = if ($process) { $process.Id } else { $null }
        service_name = if ($service) { $service.Name } else { $null }
        service_status = if ($service) { $service.Status.ToString() } else { "not_installed" }
    }
}

function Get-RDPStatus {
    $rdpService = Get-Service -Name "TermService" -ErrorAction SilentlyContinue
    $rdpSessions = query user 2>$null | Where-Object { $_ -match "rdp" }
    $rdpEnabled = (Get-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name "fDenyTSConnections" -ErrorAction SilentlyContinue).fDenyTSConnections -eq 0
    
    return @{
        enabled = $rdpEnabled
        service_running = ($rdpService.Status -eq "Running")
        active_sessions = @($rdpSessions).Count
    }
}

function Get-GPUInfo {
    try {
        $nvidiaSmi = & "nvidia-smi" --query-gpu=name,driver_version,temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>&1
        if ($LASTEXITCODE -eq 0) {
            $parts = $nvidiaSmi -split ","
            return @{
                available = $true
                name = $parts[0].Trim()
                driver_version = $parts[1].Trim()
                temperature = [int]$parts[2].Trim()
                utilization = [int]$parts[3].Trim()
                memory_used_mb = [int]$parts[4].Trim()
                memory_total_mb = [int]$parts[5].Trim()
            }
        }
    } catch { }
    
    return @{
        available = $false
        error = "nvidia-smi not available or failed"
    }
}

function Get-HealthStatus {
    $uptime = (Get-Date) - $script:StartTime
    
    return @{
        status = "healthy"
        hostname = $env:COMPUTERNAME
        agent_version = "1.0.0"
        uptime_seconds = [int]$uptime.TotalSeconds
        timestamp = (Get-Date).ToString("o")
        sunshine = Get-SunshineStatus
        rdp = Get-RDPStatus
        gpu = Get-GPUInfo
    }
}

function Get-FullDiagnostics {
    $diag = Get-HealthStatus
    
    $diag.system = @{
        os_version = [System.Environment]::OSVersion.VersionString
        processor_count = [System.Environment]::ProcessorCount
        total_memory_gb = [math]::Round((Get-CimInstance -ClassName Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 2)
    }
    
    $hags = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers" -Name "HwSchMode" -ErrorAction SilentlyContinue
    $diag.hags_enabled = ($hags.HwSchMode -eq 2)
    
    $gameDvr = Get-ItemProperty -Path "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR" -ErrorAction SilentlyContinue
    $diag.game_dvr_enabled = ($gameDvr.AppCaptureEnabled -eq 1) -or ($gameDvr.GameDVR_Enabled -eq 1)
    
    $diag.firewall_rules = @{
        sunshine_rules = @(Get-NetFirewallRule -DisplayName "Sunshine*" -ErrorAction SilentlyContinue).Count
        kvm_agent_rules = @(Get-NetFirewallRule -DisplayName "KVM Agent*" -ErrorAction SilentlyContinue).Count
    }
    
    $powerPlan = powercfg /getactivescheme 2>$null
    $diag.power_plan = $powerPlan
    $diag.is_high_performance = $powerPlan -match "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"
    
    return $diag
}

function Start-SunshineService {
    Write-Log "Starting Sunshine..."
    
    $service = Get-Service -Name "Sunshine*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($service) {
        if ($service.Status -ne "Running") {
            Start-Service -Name $service.Name -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 3
        }
        $service = Get-Service -Name $service.Name
        if ($service.Status -eq "Running") {
            Write-Log "Sunshine service started successfully" "SUCCESS"
            return @{ success = $true; message = "Sunshine service started" }
        }
    }
    
    $sunshineExe = @(
        "C:\Program Files\Sunshine\sunshine.exe",
        "C:\Program Files (x86)\Sunshine\sunshine.exe",
        "$env:LOCALAPPDATA\Sunshine\sunshine.exe",
        "$env:ProgramFiles\Sunshine\sunshine.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    
    if ($sunshineExe) {
        Start-Process -FilePath $sunshineExe -WindowStyle Hidden
        Start-Sleep -Seconds 3
        
        $process = Get-Process -Name "sunshine" -ErrorAction SilentlyContinue
        if ($process) {
            Write-Log "Sunshine started via executable" "SUCCESS"
            return @{ success = $true; message = "Sunshine started" }
        }
    }
    
    Write-Log "Failed to start Sunshine" "ERROR"
    return @{ success = $false; message = "Failed to start Sunshine - check if it's installed" }
}

function Stop-SunshineService {
    Write-Log "Stopping Sunshine..."
    
    $process = Get-Process -Name "sunshine" -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Name "sunshine" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    
    $service = Get-Service -Name "Sunshine*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($service -and $service.Status -eq "Running") {
        Stop-Service -Name $service.Name -Force -ErrorAction SilentlyContinue
    }
    
    $process = Get-Process -Name "sunshine" -ErrorAction SilentlyContinue
    if (-not $process) {
        Write-Log "Sunshine stopped successfully" "SUCCESS"
        return @{ success = $true; message = "Sunshine stopped" }
    }
    
    Write-Log "Warning: Sunshine may still be running" "WARN"
    return @{ success = $true; message = "Sunshine stop requested (may take a moment)" }
}

function Switch-ToGamingMode {
    Write-Log "Switching to Gaming Mode..."
    $results = @()
    
    $rdpSessions = query user 2>$null | Where-Object { $_ -match "rdp|Active" }
    if ($rdpSessions) {
        Write-Log "Warning: RDP sessions active - they should be disconnected for best performance" "WARN"
        $results += "Warning: Active RDP sessions detected"
    }
    
    $sunshineResult = Start-SunshineService
    $results += $sunshineResult.message
    
    return @{
        success = $sunshineResult.success
        mode = "gaming"
        message = $results -join "; "
        sunshine = Get-SunshineStatus
    }
}

function Switch-ToDesktopMode {
    Write-Log "Switching to Desktop Mode..."
    $results = @()
    
    $sunshineResult = Stop-SunshineService
    $results += $sunshineResult.message
    
    try {
        Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name "fDenyTSConnections" -Value 0 -ErrorAction SilentlyContinue
        $results += "RDP enabled"
    } catch {
        $results += "RDP enable skipped (may require admin)"
    }
    
    return @{
        success = $true
        mode = "desktop"
        message = $results -join "; "
        rdp = Get-RDPStatus
    }
}

function Restart-SunshineService {
    Write-Log "Restarting Sunshine..."
    
    Stop-SunshineService | Out-Null
    Start-Sleep -Seconds 2
    $result = Start-SunshineService
    
    return @{
        success = $result.success
        message = "Sunshine restarted"
        sunshine = Get-SunshineStatus
    }
}

function Send-JsonResponse {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [hashtable]$Data,
        [int]$StatusCode = 200
    )
    
    $json = $Data | ConvertTo-Json -Depth 10 -Compress
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
    
    $Response.StatusCode = $StatusCode
    $Response.ContentType = "application/json"
    $Response.ContentLength64 = $buffer.Length
    $Response.AddHeader("Access-Control-Allow-Origin", "*")
    $Response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $Response.AddHeader("Access-Control-Allow-Headers", "Content-Type")
    
    $Response.OutputStream.Write($buffer, 0, $buffer.Length)
    $Response.Close()
}

function Start-HttpServer {
    param([int]$Port)
    
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://+:$Port/")
    
    try {
        $listener.Start()
        Write-Log "KVM Agent listening on http://0.0.0.0:$Port"
        Write-Log "Endpoints: /health, /diagnostics, /mode/gaming, /mode/desktop, /restart-sunshine, /shutdown"
    } catch {
        Write-Log "Failed to start listener: $_" "ERROR"
        Write-Log "Try running as Administrator or use: netsh http add urlacl url=http://+:$Port/ user=Everyone" "ERROR"
        return
    }
    
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response
            
            $method = $request.HttpMethod
            $path = $request.Url.LocalPath.TrimEnd('/')
            
            Write-Log "$method $path" "REQUEST"
            
            if ($method -eq "OPTIONS") {
                Send-JsonResponse -Response $response -Data @{ ok = $true }
                continue
            }
            
            $result = switch ($path) {
                "/health" {
                    Get-HealthStatus
                }
                "/diagnostics" {
                    Get-FullDiagnostics
                }
                "/mode/gaming" {
                    if ($method -eq "POST") {
                        Switch-ToGamingMode
                    } else {
                        @{ error = "Use POST method"; success = $false }
                    }
                }
                "/mode/desktop" {
                    if ($method -eq "POST") {
                        Switch-ToDesktopMode
                    } else {
                        @{ error = "Use POST method"; success = $false }
                    }
                }
                "/restart-sunshine" {
                    if ($method -eq "POST") {
                        Restart-SunshineService
                    } else {
                        @{ error = "Use POST method"; success = $false }
                    }
                }
                "/shutdown" {
                    if ($method -eq "POST") {
                        Write-Log "Shutdown requested!" "WARN"
                        Start-Process -FilePath "shutdown.exe" -ArgumentList "/s /t 30 /c `"Shutdown requested via KVM Agent`"" -NoNewWindow
                        @{ success = $true; message = "Shutdown initiated (30 second delay)" }
                    } else {
                        @{ error = "Use POST method"; success = $false }
                    }
                }
                "/" {
                    @{
                        service = "KVM Windows Agent"
                        version = "1.0.0"
                        endpoints = @(
                            "GET  /health - Health check",
                            "GET  /diagnostics - Full diagnostics",
                            "POST /mode/gaming - Switch to gaming mode",
                            "POST /mode/desktop - Switch to desktop mode",
                            "POST /restart-sunshine - Restart Sunshine",
                            "POST /shutdown - Shutdown Windows"
                        )
                    }
                }
                default {
                    $response.StatusCode = 404
                    @{ error = "Not found"; path = $path }
                }
            }
            
            Send-JsonResponse -Response $response -Data $result
            
        } catch {
            Write-Log "Request error: $_" "ERROR"
            try {
                Send-JsonResponse -Response $response -Data @{ error = $_.Exception.Message } -StatusCode 500
            } catch { }
        }
    }
}

Write-Log "========================================" "INFO"
Write-Log "KVM Windows Agent Starting" "INFO"
Write-Log "Port: $Port" "INFO"
Write-Log "Log: $LogPath" "INFO"
Write-Log "========================================" "INFO"

Start-HttpServer -Port $Port
