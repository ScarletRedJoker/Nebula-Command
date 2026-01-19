#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Windows AI Node Setup and Recovery Script
.DESCRIPTION
    Comprehensive script to install, configure, and recover AI services on Windows VM:
    - Python 3.10 installation
    - Ollama LLM service
    - Stable Diffusion WebUI (AUTOMATIC1111)
    - ComfyUI with AnimateDiff support
    - NVIDIA driver and CUDA validation
.PARAMETER SkipPython
    Skip Python installation if already installed
.PARAMETER SkipOllama
    Skip Ollama installation
.PARAMETER SkipSD
    Skip Stable Diffusion WebUI installation
.PARAMETER SkipComfyUI
    Skip ComfyUI installation
.PARAMETER Force
    Force reinstall even if already present
.PARAMETER NonInteractive
    Run without user prompts (use defaults)
.EXAMPLE
    .\windows-ai-setup.ps1 -NonInteractive
.NOTES
    Run as Administrator. Requires internet connection.
#>

[CmdletBinding()]
param(
    [switch]$SkipPython,
    [switch]$SkipOllama,
    [switch]$SkipSD,
    [switch]$SkipComfyUI,
    [switch]$Force,
    [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "Continue"

$script:AI_BASE_PATH = "C:\AI"
$script:SD_PATH = "$AI_BASE_PATH\stable-diffusion-webui"
$script:COMFYUI_PATH = "$AI_BASE_PATH\ComfyUI"
$script:PYTHON_VERSION = "3.10"
$script:PYTHON_FULL_VERSION = "3.10.11"
$script:LOG_FILE = "$AI_BASE_PATH\setup-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

$script:StatusReport = @{
    StartTime = Get-Date
    EndTime = $null
    Success = $true
    Steps = @()
    Errors = @()
    Warnings = @()
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    
    if (-not (Test-Path (Split-Path $script:LOG_FILE -Parent))) {
        New-Item -ItemType Directory -Path (Split-Path $script:LOG_FILE -Parent) -Force | Out-Null
    }
    
    Add-Content -Path $script:LOG_FILE -Value $logEntry -ErrorAction SilentlyContinue
    
    switch ($Level) {
        "ERROR" { Write-Host $logEntry -ForegroundColor Red }
        "WARNING" { Write-Host $logEntry -ForegroundColor Yellow }
        "SUCCESS" { Write-Host $logEntry -ForegroundColor Green }
        default { Write-Host $logEntry }
    }
}

function Add-StepResult {
    param([string]$Step, [bool]$Success, [string]$Message)
    $script:StatusReport.Steps += @{
        Step = $Step
        Success = $Success
        Message = $Message
        Timestamp = Get-Date
    }
    if (-not $Success) {
        $script:StatusReport.Success = $false
        $script:StatusReport.Errors += $Message
    }
}

function Test-NvidiaDriver {
    Write-Log "Checking NVIDIA driver..."
    try {
        $nvidiaSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
        if (-not $nvidiaSmi) {
            return @{ Installed = $false; Message = "nvidia-smi not found in PATH" }
        }
        
        $output = & nvidia-smi --query-gpu=driver_version,cuda_version,name,memory.total --format=csv,noheader,nounits 2>&1
        if ($LASTEXITCODE -ne 0) {
            return @{ Installed = $false; Message = "nvidia-smi failed: $output" }
        }
        
        $parts = $output -split ","
        return @{
            Installed = $true
            DriverVersion = $parts[0].Trim()
            CudaVersion = $parts[1].Trim()
            GpuName = $parts[2].Trim()
            MemoryMB = [int]$parts[3].Trim()
        }
    }
    catch {
        return @{ Installed = $false; Message = $_.Exception.Message }
    }
}

function Test-PythonVersion {
    param([string]$RequiredVersion = "3.10")
    
    $pythonPaths = @(
        "python",
        "py -$RequiredVersion",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
        "C:\Python310\python.exe"
    )
    
    foreach ($path in $pythonPaths) {
        try {
            if ($path -like "py *") {
                $version = & cmd /c "$path --version 2>&1"
            } else {
                $version = & $path --version 2>&1
            }
            
            if ($version -match "Python\s+$RequiredVersion") {
                $actualPath = if ($path -eq "python") { (Get-Command python).Source } 
                              elseif ($path -like "py *") { "py launcher" }
                              else { $path }
                return @{
                    Installed = $true
                    Version = $version
                    Path = $actualPath
                    Command = $path
                }
            }
        }
        catch { continue }
    }
    
    return @{ Installed = $false; Message = "Python $RequiredVersion not found" }
}

function Install-Python310 {
    Write-Log "Installing Python $script:PYTHON_FULL_VERSION..."
    
    $existing = Test-PythonVersion -RequiredVersion $script:PYTHON_VERSION
    if ($existing.Installed -and -not $Force) {
        Write-Log "Python $script:PYTHON_VERSION already installed at $($existing.Path)" -Level "SUCCESS"
        return $true
    }
    
    $installerUrl = "https://www.python.org/ftp/python/$script:PYTHON_FULL_VERSION/python-$script:PYTHON_FULL_VERSION-amd64.exe"
    $installerPath = "$env:TEMP\python-$script:PYTHON_FULL_VERSION-installer.exe"
    
    try {
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            Write-Log "Attempting installation via winget..."
            $result = & winget install Python.Python.3.10 --silent --accept-source-agreements --accept-package-agreements 2>&1
            if ($LASTEXITCODE -eq 0 -or $result -match "already installed") {
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
                Write-Log "Python installed via winget" -Level "SUCCESS"
                return $true
            }
            Write-Log "Winget installation failed, falling back to direct download" -Level "WARNING"
        }
        
        Write-Log "Downloading Python installer from $installerUrl..."
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
        
        Write-Log "Running Python installer (silent mode)..."
        $installArgs = @(
            "/quiet",
            "InstallAllUsers=1",
            "PrependPath=1",
            "Include_test=0",
            "Include_pip=1",
            "Include_launcher=1"
        )
        
        $process = Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -PassThru -NoNewWindow
        
        if ($process.ExitCode -ne 0) {
            throw "Python installer exited with code $($process.ExitCode)"
        }
        
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        
        Write-Log "Python $script:PYTHON_FULL_VERSION installed successfully" -Level "SUCCESS"
        return $true
    }
    catch {
        Write-Log "Failed to install Python: $($_.Exception.Message)" -Level "ERROR"
        return $false
    }
    finally {
        if (Test-Path $installerPath) {
            Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
        }
    }
}

function Install-Ollama {
    Write-Log "Installing/updating Ollama..."
    
    $ollamaInstalled = Get-Command ollama -ErrorAction SilentlyContinue
    
    try {
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            Write-Log "Installing Ollama via winget..."
            $result = & winget install Ollama.Ollama --silent --accept-source-agreements --accept-package-agreements 2>&1
            if ($LASTEXITCODE -eq 0 -or $result -match "already installed") {
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            }
        }
        else {
            Write-Log "Downloading Ollama installer..."
            $installerUrl = "https://ollama.com/download/OllamaSetup.exe"
            $installerPath = "$env:TEMP\OllamaSetup.exe"
            
            Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
            
            Write-Log "Running Ollama installer..."
            Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -NoNewWindow
            
            Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
        }
        
        [System.Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "Machine")
        $env:OLLAMA_HOST = "0.0.0.0:11434"
        
        Write-Log "Starting Ollama service..."
        $ollamaService = Get-Service -Name "Ollama" -ErrorAction SilentlyContinue
        if ($ollamaService) {
            Restart-Service -Name "Ollama" -Force -ErrorAction SilentlyContinue
        }
        else {
            $ollamaExe = Get-Command ollama -ErrorAction SilentlyContinue
            if ($ollamaExe) {
                Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
                Start-Sleep -Seconds 3
            }
        }
        
        Write-Log "Ollama installed successfully" -Level "SUCCESS"
        return $true
    }
    catch {
        Write-Log "Failed to install Ollama: $($_.Exception.Message)" -Level "ERROR"
        return $false
    }
}

function Install-StableDiffusionWebUI {
    Write-Log "Installing Stable Diffusion WebUI..."
    
    if (-not (Test-Path $script:AI_BASE_PATH)) {
        New-Item -ItemType Directory -Path $script:AI_BASE_PATH -Force | Out-Null
    }
    
    try {
        if (Test-Path $script:SD_PATH) {
            if ($Force) {
                Write-Log "Force flag set, updating existing installation..."
                Push-Location $script:SD_PATH
                & git pull origin master 2>&1
                Pop-Location
            }
            else {
                Write-Log "Stable Diffusion WebUI already exists at $script:SD_PATH" -Level "WARNING"
            }
        }
        else {
            if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
                Write-Log "Git not found, attempting to install..."
                if (Get-Command winget -ErrorAction SilentlyContinue) {
                    & winget install Git.Git --silent --accept-source-agreements --accept-package-agreements 2>&1
                    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
                }
                else {
                    throw "Git is required but not installed and winget is not available"
                }
            }
            
            Write-Log "Cloning Stable Diffusion WebUI repository..."
            Push-Location $script:AI_BASE_PATH
            & git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git 2>&1
            Pop-Location
        }
        
        $webuiUserBat = @"
@echo off
set PYTHON=
set GIT=
set VENV_DIR=
set COMMANDLINE_ARGS=--api --listen --enable-insecure-extension-access --xformers --no-half-vae
call webui.bat
"@
        Set-Content -Path "$script:SD_PATH\webui-user.bat" -Value $webuiUserBat -Encoding ASCII
        
        $modelsPath = "$script:SD_PATH\models\Stable-diffusion"
        if (-not (Test-Path $modelsPath)) {
            New-Item -ItemType Directory -Path $modelsPath -Force | Out-Null
        }
        
        Write-Log "Stable Diffusion WebUI installed at $script:SD_PATH" -Level "SUCCESS"
        return $true
    }
    catch {
        Write-Log "Failed to install Stable Diffusion WebUI: $($_.Exception.Message)" -Level "ERROR"
        return $false
    }
}

function Install-ComfyUI {
    Write-Log "Installing ComfyUI with AnimateDiff..."
    
    if (-not (Test-Path $script:AI_BASE_PATH)) {
        New-Item -ItemType Directory -Path $script:AI_BASE_PATH -Force | Out-Null
    }
    
    try {
        if (Test-Path $script:COMFYUI_PATH) {
            if ($Force) {
                Write-Log "Force flag set, updating existing installation..."
                Push-Location $script:COMFYUI_PATH
                & git pull origin master 2>&1
                Pop-Location
            }
            else {
                Write-Log "ComfyUI already exists at $script:COMFYUI_PATH" -Level "WARNING"
            }
        }
        else {
            Write-Log "Cloning ComfyUI repository..."
            Push-Location $script:AI_BASE_PATH
            & git clone https://github.com/comfyanonymous/ComfyUI.git 2>&1
            Pop-Location
        }
        
        $customNodesPath = "$script:COMFYUI_PATH\custom_nodes"
        if (-not (Test-Path $customNodesPath)) {
            New-Item -ItemType Directory -Path $customNodesPath -Force | Out-Null
        }
        
        $extensions = @(
            @{ Name = "ComfyUI-AnimateDiff-Evolved"; Url = "https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git" },
            @{ Name = "ComfyUI-VideoHelperSuite"; Url = "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git" },
            @{ Name = "ComfyUI-Advanced-ControlNet"; Url = "https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet.git" }
        )
        
        foreach ($ext in $extensions) {
            $extPath = "$customNodesPath\$($ext.Name)"
            if (-not (Test-Path $extPath)) {
                Write-Log "Installing $($ext.Name)..."
                Push-Location $customNodesPath
                & git clone $ext.Url 2>&1
                Pop-Location
            }
            else {
                Write-Log "$($ext.Name) already installed" -Level "WARNING"
            }
        }
        
        $startScript = @"
@echo off
cd /d $script:COMFYUI_PATH
python main.py --listen 0.0.0.0 --port 8188
"@
        Set-Content -Path "$script:COMFYUI_PATH\start_comfyui.bat" -Value $startScript -Encoding ASCII
        
        Write-Log "ComfyUI installed at $script:COMFYUI_PATH with AnimateDiff" -Level "SUCCESS"
        return $true
    }
    catch {
        Write-Log "Failed to install ComfyUI: $($_.Exception.Message)" -Level "ERROR"
        return $false
    }
}

function Set-FirewallRules {
    Write-Log "Configuring firewall rules..."
    
    $rules = @(
        @{ Name = "Stable Diffusion WebUI"; Port = 7860 },
        @{ Name = "ComfyUI"; Port = 8188 },
        @{ Name = "Ollama API"; Port = 11434 },
        @{ Name = "Nebula Agent"; Port = 9765 }
    )
    
    foreach ($rule in $rules) {
        try {
            $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
            if (-not $existing) {
                New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Protocol TCP -LocalPort $rule.Port -Action Allow | Out-Null
                Write-Log "Created firewall rule for $($rule.Name) on port $($rule.Port)"
            }
        }
        catch {
            Write-Log "Failed to create firewall rule for $($rule.Name): $($_.Exception.Message)" -Level "WARNING"
        }
    }
}

function Install-PythonDependencies {
    Write-Log "Installing Python dependencies for AI services..."
    
    $pythonInfo = Test-PythonVersion -RequiredVersion $script:PYTHON_VERSION
    if (-not $pythonInfo.Installed) {
        Write-Log "Python $script:PYTHON_VERSION not found, cannot install dependencies" -Level "ERROR"
        return $false
    }
    
    try {
        Write-Log "Upgrading pip..."
        & $pythonInfo.Command -m pip install --upgrade pip 2>&1 | Out-Null
        
        Write-Log "Installing PyTorch with CUDA support..."
        & $pythonInfo.Command -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121 2>&1 | Out-Null
        
        Write-Log "Installing xformers..."
        & $pythonInfo.Command -m pip install xformers 2>&1 | Out-Null
        
        Write-Log "Python dependencies installed successfully" -Level "SUCCESS"
        return $true
    }
    catch {
        Write-Log "Failed to install Python dependencies: $($_.Exception.Message)" -Level "ERROR"
        return $false
    }
}

function Test-Services {
    Write-Log "Testing AI services..."
    
    $results = @{
        Ollama = @{ Status = "unknown"; Endpoint = "http://localhost:11434" }
        StableDiffusion = @{ Status = "unknown"; Endpoint = "http://localhost:7860" }
        ComfyUI = @{ Status = "unknown"; Endpoint = "http://localhost:8188" }
    }
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/version" -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($response) {
            $results.Ollama.Status = "online"
            $results.Ollama.Version = $response.version
            Write-Log "Ollama: ONLINE (v$($response.version))" -Level "SUCCESS"
        }
    }
    catch {
        $results.Ollama.Status = "offline"
        $results.Ollama.Error = $_.Exception.Message
        Write-Log "Ollama: OFFLINE" -Level "WARNING"
    }
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:7860/sdapi/v1/options" -TimeoutSec 10 -ErrorAction SilentlyContinue
        if ($response) {
            $results.StableDiffusion.Status = "online"
            $results.StableDiffusion.Model = $response.sd_model_checkpoint
            Write-Log "Stable Diffusion: ONLINE (Model: $($response.sd_model_checkpoint))" -Level "SUCCESS"
        }
    }
    catch {
        $results.StableDiffusion.Status = "offline"
        $results.StableDiffusion.Error = $_.Exception.Message
        Write-Log "Stable Diffusion: OFFLINE (may need to start webui.bat)" -Level "WARNING"
    }
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8188/system_stats" -TimeoutSec 10 -ErrorAction SilentlyContinue
        if ($response) {
            $results.ComfyUI.Status = "online"
            Write-Log "ComfyUI: ONLINE" -Level "SUCCESS"
        }
    }
    catch {
        $results.ComfyUI.Status = "offline"
        $results.ComfyUI.Error = $_.Exception.Message
        Write-Log "ComfyUI: OFFLINE (may need to start start_comfyui.bat)" -Level "WARNING"
    }
    
    return $results
}

function Show-Summary {
    $script:StatusReport.EndTime = Get-Date
    $duration = $script:StatusReport.EndTime - $script:StatusReport.StartTime
    
    Write-Host "`n" + "="*60 -ForegroundColor Cyan
    Write-Host "WINDOWS AI NODE SETUP SUMMARY" -ForegroundColor Cyan
    Write-Host "="*60 -ForegroundColor Cyan
    
    Write-Host "`nDuration: $($duration.TotalMinutes.ToString('F1')) minutes"
    Write-Host "Log file: $script:LOG_FILE"
    
    Write-Host "`nStep Results:" -ForegroundColor White
    foreach ($step in $script:StatusReport.Steps) {
        $icon = if ($step.Success) { "[OK]" } else { "[FAIL]" }
        $color = if ($step.Success) { "Green" } else { "Red" }
        Write-Host "  $icon $($step.Step): $($step.Message)" -ForegroundColor $color
    }
    
    if ($script:StatusReport.Warnings.Count -gt 0) {
        Write-Host "`nWarnings:" -ForegroundColor Yellow
        foreach ($warning in $script:StatusReport.Warnings) {
            Write-Host "  - $warning" -ForegroundColor Yellow
        }
    }
    
    if ($script:StatusReport.Errors.Count -gt 0) {
        Write-Host "`nErrors:" -ForegroundColor Red
        foreach ($error in $script:StatusReport.Errors) {
            Write-Host "  - $error" -ForegroundColor Red
        }
    }
    
    Write-Host "`n" + "="*60 -ForegroundColor Cyan
    if ($script:StatusReport.Success) {
        Write-Host "Setup completed successfully!" -ForegroundColor Green
    }
    else {
        Write-Host "Setup completed with errors. Check log for details." -ForegroundColor Red
    }
    Write-Host "="*60 -ForegroundColor Cyan
    
    Write-Host "`nNext steps:"
    Write-Host "  1. Start Stable Diffusion: $script:SD_PATH\webui-user.bat"
    Write-Host "  2. Start ComfyUI: $script:COMFYUI_PATH\start_comfyui.bat"
    Write-Host "  3. Pull Ollama models: ollama pull llama3.2"
    Write-Host "  4. Verify services: .\verify-ai-services.ps1"
}

Write-Host @"
 _    _ _           _                      ___   _____   _____      _               
| |  | (_)         | |                    / _ \ |_   _| /  ___|    | |              
| |  | |_ _ __   __| | _____      _____  / /_\ \  | |   \ `--.  ___| |_ _   _ _ __  
| |/\| | | '_ \ / _` |/ _ \ \ /\ / / __| |  _  |  | |    `--. \/ _ \ __| | | | '_ \ 
\  /\  / | | | | (_| | (_) \ V  V /\__ \ | | | | _| |_  /\__/ /  __/ |_| |_| | |_) |
 \/  \/|_|_| |_|\__,_|\___/ \_/\_/ |___/ \_| |_/ \___/  \____/ \___|\__|\__,_| .__/ 
                                                                             | |    
                                                                             |_|    
"@ -ForegroundColor Cyan

Write-Log "Starting Windows AI Node Setup..."
Write-Log "Base path: $script:AI_BASE_PATH"

$gpuInfo = Test-NvidiaDriver
if ($gpuInfo.Installed) {
    Write-Log "GPU: $($gpuInfo.GpuName) | Driver: $($gpuInfo.DriverVersion) | CUDA: $($gpuInfo.CudaVersion) | Memory: $($gpuInfo.MemoryMB)MB" -Level "SUCCESS"
    Add-StepResult -Step "NVIDIA Driver Check" -Success $true -Message "Driver v$($gpuInfo.DriverVersion), CUDA $($gpuInfo.CudaVersion)"
}
else {
    Write-Log "NVIDIA GPU not detected: $($gpuInfo.Message)" -Level "ERROR"
    Add-StepResult -Step "NVIDIA Driver Check" -Success $false -Message $gpuInfo.Message
    Write-Log "AI services require NVIDIA GPU with CUDA support" -Level "ERROR"
    if (-not $NonInteractive) {
        Write-Host "Continue anyway? (y/n): " -NoNewline
        $continue = Read-Host
        if ($continue -ne "y") { exit 1 }
    }
}

if (-not $SkipPython) {
    $pythonResult = Install-Python310
    Add-StepResult -Step "Python 3.10 Installation" -Success $pythonResult -Message $(if ($pythonResult) { "Installed successfully" } else { "Installation failed" })
}

if (-not $SkipOllama) {
    $ollamaResult = Install-Ollama
    Add-StepResult -Step "Ollama Installation" -Success $ollamaResult -Message $(if ($ollamaResult) { "Installed successfully" } else { "Installation failed" })
}

if (-not $SkipSD) {
    $sdResult = Install-StableDiffusionWebUI
    Add-StepResult -Step "Stable Diffusion WebUI" -Success $sdResult -Message $(if ($sdResult) { "Installed at $script:SD_PATH" } else { "Installation failed" })
}

if (-not $SkipComfyUI) {
    $comfyResult = Install-ComfyUI
    Add-StepResult -Step "ComfyUI Installation" -Success $comfyResult -Message $(if ($comfyResult) { "Installed at $script:COMFYUI_PATH" } else { "Installation failed" })
}

Set-FirewallRules
Add-StepResult -Step "Firewall Configuration" -Success $true -Message "Rules configured for ports 7860, 8188, 11434, 9765"

if (-not $SkipPython) {
    $depsResult = Install-PythonDependencies
    Add-StepResult -Step "Python Dependencies" -Success $depsResult -Message $(if ($depsResult) { "PyTorch + xformers installed" } else { "Some dependencies failed" })
}

$serviceStatus = Test-Services
Add-StepResult -Step "Service Verification" -Success $true -Message "Ollama: $($serviceStatus.Ollama.Status), SD: $($serviceStatus.StableDiffusion.Status), ComfyUI: $($serviceStatus.ComfyUI.Status)"

Show-Summary

$script:StatusReport | ConvertTo-Json -Depth 5 | Set-Content -Path "$script:AI_BASE_PATH\last-setup-result.json"
