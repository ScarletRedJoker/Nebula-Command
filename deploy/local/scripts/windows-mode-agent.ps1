# Windows KVM Mode Agent
# Manages Sunshine/RDP services for seamless mode switching
# Install: Run as Administrator, save to C:\Scripts\kvm-mode-agent.ps1

$AgentPort = 8765
$LogFile = "C:\Scripts\kvm-agent.log"

# SECURITY: Set KVM_AGENT_TOKEN environment variable for production!
# The default token is for initial setup only
$AuthToken = $env:KVM_AGENT_TOKEN
if (-not $AuthToken) {
    Write-Host "WARNING: Using default auth token. Set KVM_AGENT_TOKEN env var for security!" -ForegroundColor Yellow
    $AuthToken = "kvm-mode-switch-2024"
}

# Bind to VM's private IP only (192.168.122.x) for security
# Change this if your VM has a different IP range
$ListenIP = "192.168.122.10"  # Adjust to your VM's IP

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $Message" | Out-File -Append -FilePath $LogFile
    Write-Host $Message
}

function Get-ServiceStatus {
    param([string]$ServiceName)
    try {
        $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($service) {
            return $service.Status.ToString()
        }
        return "NotFound"
    } catch {
        return "Error"
    }
}

function Set-GamingMode {
    Write-Log "Switching to GAMING mode..."
    
    # Stop RDP-related services (optional, may not be needed)
    # Stop-Service -Name "TermService" -Force -ErrorAction SilentlyContinue
    
    # Ensure Sunshine is running
    $sunshineService = Get-Service -Name "Sunshine" -ErrorAction SilentlyContinue
    if ($sunshineService) {
        if ($sunshineService.Status -ne "Running") {
            Start-Service -Name "Sunshine"
            Write-Log "Started Sunshine service"
        } else {
            Write-Log "Sunshine already running"
        }
    } else {
        # Sunshine might run as a startup app, not a service
        $sunshineProcess = Get-Process -Name "sunshine" -ErrorAction SilentlyContinue
        if (-not $sunshineProcess) {
            $sunshinePath = "C:\Program Files\Sunshine\sunshine.exe"
            if (Test-Path $sunshinePath) {
                Start-Process -FilePath $sunshinePath -WindowStyle Hidden
                Write-Log "Started Sunshine process"
            } else {
                Write-Log "WARNING: Sunshine not found at $sunshinePath"
            }
        } else {
            Write-Log "Sunshine process already running"
        }
    }
    
    # Ensure firewall allows Sunshine
    $firewallRule = Get-NetFirewallRule -DisplayName "Sunshine" -ErrorAction SilentlyContinue
    if (-not $firewallRule) {
        New-NetFirewallRule -DisplayName "Sunshine" -Direction Inbound -Protocol TCP -LocalPort 47984,47989,48010 -Action Allow
        New-NetFirewallRule -DisplayName "Sunshine UDP" -Direction Inbound -Protocol UDP -LocalPort 47998,47999,48000,48002,48010 -Action Allow
        Write-Log "Created Sunshine firewall rules"
    }
    
    return @{
        success = $true
        mode = "gaming"
        sunshine = Get-ServiceStatus "Sunshine"
    }
}

function Invoke-Shutdown {
    Write-Log "Initiating graceful shutdown..."
    
    # Give any running apps 30 seconds to save
    shutdown.exe /s /t 30 /c "KVM Orchestrator requested shutdown"
    
    return @{
        success = $true
        message = "Shutdown initiated (30s delay)"
    }
}

function Set-DesktopMode {
    Write-Log "Switching to DESKTOP mode..."
    
    # Ensure RDP is enabled
    Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name "fDenyTSConnections" -Value 0
    
    # Start RDP service if not running
    $rdpService = Get-Service -Name "TermService" -ErrorAction SilentlyContinue
    if ($rdpService -and $rdpService.Status -ne "Running") {
        Start-Service -Name "TermService"
        Write-Log "Started Terminal Services"
    }
    
    # Optionally stop Sunshine to free GPU resources
    $sunshineProcess = Get-Process -Name "sunshine" -ErrorAction SilentlyContinue
    if ($sunshineProcess) {
        # Keep Sunshine running - it doesn't interfere with RDP
        Write-Log "Sunshine running (keeping active for hybrid mode)"
    }
    
    # Ensure firewall allows RDP
    Enable-NetFirewallRule -DisplayGroup "Remote Desktop" -ErrorAction SilentlyContinue
    
    return @{
        success = $true
        mode = "desktop"
        rdp = Get-ServiceStatus "TermService"
    }
}

function Get-AgentStatus {
    $sunshineStatus = Get-ServiceStatus "Sunshine"
    $rdpStatus = Get-ServiceStatus "TermService"
    
    # Check if Sunshine is running as a process
    $sunshineProcess = Get-Process -Name "sunshine" -ErrorAction SilentlyContinue
    $sunshineRunning = $sunshineProcess -ne $null
    
    # Check if RDP is accepting connections
    $rdpEnabled = (Get-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name "fDenyTSConnections").fDenyTSConnections -eq 0
    
    return @{
        agent = "running"
        hostname = $env:COMPUTERNAME
        sunshine_service = $sunshineStatus
        sunshine_running = $sunshineRunning
        rdp_service = $rdpStatus
        rdp_enabled = $rdpEnabled
        timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
    }
}

function Test-AuthToken {
    param([System.Net.HttpListenerRequest]$Request)
    $authHeader = $Request.Headers["Authorization"]
    if ($authHeader -eq "Bearer $AuthToken") {
        return $true
    }
    $tokenParam = $Request.QueryString["token"]
    if ($tokenParam -eq $AuthToken) {
        return $true
    }
    return $false
}

function Start-HttpListener {
    $listener = New-Object System.Net.HttpListener
    # Bind to private IP only for security (not exposed to external network)
    # Use http://+:$AgentPort/ if you need to bind to all interfaces
    try {
        $listener.Prefixes.Add("http://${ListenIP}:$AgentPort/")
    } catch {
        Write-Log "Could not bind to $ListenIP, falling back to all interfaces"
        $listener.Prefixes.Add("http://+:$AgentPort/")
    }
    
    try {
        $listener.Start()
        Write-Log "KVM Mode Agent listening on port $AgentPort"
        
        while ($listener.IsListening) {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response
            
            $path = $request.Url.LocalPath
            $method = $request.HttpMethod
            
            Write-Log "Request: $method $path"
            
            $result = @{ error = "Unknown endpoint" }
            
            # Health/status don't require auth, mode changes and shutdown do
            $requiresAuth = @("/gaming", "/desktop", "/shutdown")
            
            if ($requiresAuth -contains $path) {
                if (-not (Test-AuthToken $request)) {
                    $result = @{ error = "Unauthorized"; code = 401 }
                    Write-Log "Unauthorized request to $path"
                } else {
                    switch ($path) {
                        "/gaming" { $result = Set-GamingMode }
                        "/desktop" { $result = Set-DesktopMode }
                        "/shutdown" { $result = Invoke-Shutdown }
                    }
                }
            } else {
                switch ($path) {
                    "/status" { $result = Get-AgentStatus }
                    "/health" { $result = @{ status = "ok" } }
                    default { $result = @{ error = "Not found: $path" } }
                }
            }
            
            $json = $result | ConvertTo-Json -Depth 3
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
            
            $response.ContentType = "application/json"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            $response.OutputStream.Close()
        }
    }
    catch {
        Write-Log "Error: $_"
    }
    finally {
        $listener.Stop()
    }
}

# Main
Write-Log "=== KVM Mode Agent Starting ==="
Start-HttpListener
