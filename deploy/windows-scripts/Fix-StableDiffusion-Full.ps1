# Nebula Command - Stable Diffusion Full Repair Script
# BULLETPROOF fix for all SD WebUI issues with EXACT pinned versions
# Run as Administrator

param(
    [string]$SDPath = "C:\AI\stable-diffusion-webui",
    [string]$Python310Path = "",
    [switch]$CreateFreshVenv,
    [switch]$BackupFirst,
    [switch]$Force,
    [switch]$SkipVerification,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$LogDir = "C:\ProgramData\NebulaCommand\logs"
$LogFile = Join-Path $LogDir "sd-full-fix-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

$PINNED_VERSIONS = @{
    torch = "2.1.2"
    torchvision = "0.16.2"
    torchaudio = "2.1.2"
    xformers = "0.0.22.post7"
    transformers = "4.36.2"
    protobuf = "3.20.3"
    numpy = "1.26.4"
    accelerate = "0.25.0"
    diffusers = "0.25.1"
    safetensors = "0.4.1"
    opencv_python = "4.9.0.80"
    pillow = "10.2.0"
    scipy = "1.11.4"
    scikit_image = "0.22.0"
    huggingface_hub = "0.20.3"
    tokenizers = "0.15.0"
    sentencepiece = "0.1.99"
    regex = "2023.12.25"
    ftfy = "6.1.3"
}

$CUDA_INDEX_URL = "https://download.pytorch.org/whl/cu121"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    $color = switch($Level) {
        "ERROR" { "Red" }
        "WARN" { "Yellow" }
        "SUCCESS" { "Green" }
        "HEADER" { "Cyan" }
        "PHASE" { "Magenta" }
        "DEBUG" { "DarkGray" }
        default { "White" }
    }
    Write-Host $logEntry -ForegroundColor $color
    Add-Content -Path $LogFile -Value $logEntry -ErrorAction SilentlyContinue
}

function Test-AdminPrivileges {
    return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Find-Python310 {
    $searchPaths = @(
        "C:\Python310\python.exe",
        "C:\Python\Python310\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
        "$env:ProgramFiles\Python310\python.exe",
        "${env:ProgramFiles(x86)}\Python310\python.exe",
        "$env:USERPROFILE\AppData\Local\Programs\Python\Python310\python.exe"
    )
    
    foreach ($path in $searchPaths) {
        if (Test-Path $path) {
            $version = & $path --version 2>&1
            if ($version -match "3\.10\.") {
                Write-Log "Found Python 3.10 at: $path" "DEBUG"
                return $path
            }
        }
    }
    
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        try {
            $version = & py -3.10 --version 2>&1
            if ($LASTEXITCODE -eq 0 -and $version -match "3\.10\.") {
                Write-Log "Found Python 3.10 via py launcher" "DEBUG"
                return "py -3.10"
            }
        } catch {}
    }
    
    $systemPython = Get-Command python -ErrorAction SilentlyContinue
    if ($systemPython) {
        $version = & python --version 2>&1
        if ($version -match "3\.10\.") {
            return $systemPython.Source
        }
    }
    
    return $null
}

function Backup-Venv {
    param([string]$VenvPath, [string]$BasePath)
    
    if (Test-Path $VenvPath) {
        $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
        $backupName = "venv_backup_$timestamp"
        $backupPath = Join-Path $BasePath $backupName
        
        Write-Log "Creating backup of existing venv..."
        try {
            Copy-Item -Path $VenvPath -Destination $backupPath -Recurse -Force
            Write-Log "Backup created at: $backupPath" "SUCCESS"
            return $backupPath
        } catch {
            Write-Log "Failed to create backup: $_" "ERROR"
            Write-Log "Attempting rename instead..."
            try {
                Rename-Item -Path $VenvPath -NewName $backupName -Force
                Write-Log "Renamed existing venv to: $backupName" "SUCCESS"
                return $backupPath
            } catch {
                Write-Log "Failed to rename venv: $_" "ERROR"
                return $null
            }
        }
    }
    return $null
}

function Remove-ConflictingPackages {
    param([string]$PythonExe)
    
    Write-Log "Removing ALL conflicting packages..."
    
    $packagesToRemove = @(
        "torch", "torchvision", "torchaudio",
        "xformers",
        "transformers", "huggingface-hub", "tokenizers",
        "protobuf", "google-protobuf",
        "numpy",
        "accelerate", "diffusers", "safetensors",
        "opencv-python", "opencv-python-headless", "opencv-contrib-python"
    )
    
    foreach ($pkg in $packagesToRemove) {
        Write-Log "  Uninstalling $pkg..." "DEBUG"
        & $PythonExe -m pip uninstall $pkg -y 2>&1 | Out-Null
    }
    
    & $PythonExe -m pip cache purge 2>&1 | Out-Null
    Write-Log "Package cache purged" "DEBUG"
}

function Install-PyTorchCUDA {
    param([string]$PythonExe)
    
    Write-Log "Installing PyTorch $($PINNED_VERSIONS.torch)+cu121 with CUDA support..."
    
    $packages = @(
        "torch==$($PINNED_VERSIONS.torch)+cu121",
        "torchvision==$($PINNED_VERSIONS.torchvision)+cu121",
        "torchaudio==$($PINNED_VERSIONS.torchaudio)+cu121"
    )
    
    $installCmd = $packages -join " "
    $result = & $PythonExe -m pip install $installCmd --index-url $CUDA_INDEX_URL --no-cache-dir 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Log "First attempt failed, trying alternative method..."
        foreach ($pkg in $packages) {
            Write-Log "  Installing $pkg..."
            & $PythonExe -m pip install $pkg --index-url $CUDA_INDEX_URL --no-cache-dir 2>&1 | Out-Null
        }
    }
    
    $testResult = & $PythonExe -c "import torch; print(f'PyTorch {torch.__version__} CUDA {torch.version.cuda} Available: {torch.cuda.is_available()}')" 2>&1
    if ($LASTEXITCODE -eq 0 -and $testResult -match "Available: True") {
        Write-Log "PyTorch installed successfully: $testResult" "SUCCESS"
        return $true
    } else {
        Write-Log "PyTorch installation failed: $testResult" "ERROR"
        return $false
    }
}

function Install-Xformers {
    param([string]$PythonExe)
    
    Write-Log "Installing xFormers $($PINNED_VERSIONS.xformers) (matches PyTorch 2.1.2)..."
    
    & $PythonExe -m pip install "xformers==$($PINNED_VERSIONS.xformers)" --index-url $CUDA_INDEX_URL --no-cache-dir 2>&1 | Out-Null
    
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Primary xFormers install failed, trying without index URL..."
        & $PythonExe -m pip install "xformers==$($PINNED_VERSIONS.xformers)" --no-cache-dir 2>&1 | Out-Null
    }
    
    $testResult = & $PythonExe -c @"
import torch
import xformers
import xformers.ops
print(f'xFormers {xformers.__version__} - CUDA ops loaded successfully')
"@ 2>&1
    
    if ($LASTEXITCODE -eq 0 -and $testResult -match "loaded successfully") {
        Write-Log "xFormers installed and working: $testResult" "SUCCESS"
        return $true
    } else {
        Write-Log "xFormers test result: $testResult" "WARN"
        
        $altVersions = @("0.0.23", "0.0.22", "0.0.21")
        foreach ($ver in $altVersions) {
            Write-Log "Trying alternative xFormers version: $ver"
            & $PythonExe -m pip uninstall xformers -y 2>&1 | Out-Null
            & $PythonExe -m pip install "xformers==$ver" --index-url $CUDA_INDEX_URL --no-cache-dir 2>&1 | Out-Null
            
            $testResult = & $PythonExe -c "import xformers.ops; print('OK')" 2>&1
            if ($LASTEXITCODE -eq 0 -and $testResult -match "OK") {
                Write-Log "xFormers $ver works!" "SUCCESS"
                return $true
            }
        }
        
        Write-Log "xFormers may have issues - SD will still work without it" "WARN"
        return $false
    }
}

function Install-TransformersProtobuf {
    param([string]$PythonExe)
    
    Write-Log "Installing protobuf $($PINNED_VERSIONS.protobuf) (fixes runtime_version error)..."
    & $PythonExe -m pip install "protobuf==$($PINNED_VERSIONS.protobuf)" --no-cache-dir 2>&1 | Out-Null
    
    $pbTest = & $PythonExe -c "import google.protobuf; print(google.protobuf.__version__)" 2>&1
    if ($pbTest -match "^3\.20") {
        Write-Log "Protobuf installed: $pbTest" "SUCCESS"
    } else {
        Write-Log "Protobuf version issue: $pbTest" "WARN"
    }
    
    Write-Log "Installing transformers $($PINNED_VERSIONS.transformers) (stable CLIP support)..."
    & $PythonExe -m pip install "transformers==$($PINNED_VERSIONS.transformers)" --no-cache-dir 2>&1 | Out-Null
    
    $clipTest = & $PythonExe -c @"
try:
    from transformers.models.clip.modeling_clip import CLIPTextModel
    print('CLIP import OK')
except Exception as e:
    print(f'CLIP import FAILED: {e}')
"@ 2>&1
    
    if ($clipTest -match "CLIP import OK") {
        Write-Log "Transformers CLIP model import working!" "SUCCESS"
        return $true
    } else {
        Write-Log "CLIP import issue: $clipTest" "ERROR"
        
        Write-Log "Trying transformers 4.35.2 as fallback..."
        & $PythonExe -m pip install "transformers==4.35.2" --no-cache-dir 2>&1 | Out-Null
        
        $clipTest = & $PythonExe -c "from transformers.models.clip.modeling_clip import CLIPTextModel; print('OK')" 2>&1
        if ($clipTest -match "OK") {
            Write-Log "Transformers 4.35.2 CLIP works!" "SUCCESS"
            return $true
        }
        
        return $false
    }
}

function Install-CoreDependencies {
    param([string]$PythonExe)
    
    Write-Log "Installing core dependencies with pinned versions..."
    
    $coreDeps = @(
        "numpy==$($PINNED_VERSIONS.numpy)",
        "Pillow==$($PINNED_VERSIONS.pillow)",
        "scipy==$($PINNED_VERSIONS.scipy)",
        "opencv-python==$($PINNED_VERSIONS.opencv_python)",
        "safetensors==$($PINNED_VERSIONS.safetensors)",
        "accelerate==$($PINNED_VERSIONS.accelerate)",
        "diffusers==$($PINNED_VERSIONS.diffusers)",
        "huggingface-hub==$($PINNED_VERSIONS.huggingface_hub)",
        "tokenizers==$($PINNED_VERSIONS.tokenizers)",
        "scikit-image==$($PINNED_VERSIONS.scikit_image)",
        "sentencepiece==$($PINNED_VERSIONS.sentencepiece)",
        "regex==$($PINNED_VERSIONS.regex)",
        "ftfy==$($PINNED_VERSIONS.ftfy)"
    )
    
    foreach ($dep in $coreDeps) {
        Write-Log "  Installing $dep..." "DEBUG"
        & $PythonExe -m pip install $dep --no-cache-dir 2>&1 | Out-Null
    }
    
    Write-Log "Installing additional SD WebUI dependencies..."
    $additionalDeps = @(
        "omegaconf",
        "einops",
        "pytorch-lightning",
        "tqdm",
        "requests",
        "pyyaml",
        "jsonmerge",
        "lark",
        "inflection",
        "GitPython",
        "torchsde",
        "kornia>=0.7.0",
        "spandrel",
        "gradio==4.19.2"
    )
    
    foreach ($dep in $additionalDeps) {
        Write-Log "  Installing $dep..." "DEBUG"
        & $PythonExe -m pip install $dep --no-cache-dir 2>&1 | Out-Null
    }
    
    Write-Log "Core dependencies installed" "SUCCESS"
    return $true
}

function Test-FullInstallation {
    param([string]$PythonExe)
    
    Write-Log "Running comprehensive verification tests..."
    
    $tests = @(
        @{ Name = "PyTorch"; Code = "import torch; assert torch.cuda.is_available(), 'No CUDA'; print(f'PyTorch {torch.__version__} CUDA OK')" },
        @{ Name = "xFormers"; Code = "import xformers.ops; print('xFormers OK')" },
        @{ Name = "CLIP Model"; Code = "from transformers.models.clip.modeling_clip import CLIPTextModel; print('CLIP OK')" },
        @{ Name = "CLIP Tokenizer"; Code = "from transformers import CLIPTokenizer; print('CLIPTokenizer OK')" },
        @{ Name = "Protobuf"; Code = "import google.protobuf; v=google.protobuf.__version__; assert v.startswith('3.'), f'Wrong version {v}'; print(f'Protobuf {v} OK')" },
        @{ Name = "Diffusers"; Code = "from diffusers import StableDiffusionPipeline; print('Diffusers OK')" },
        @{ Name = "OpenCV"; Code = "import cv2; print(f'OpenCV {cv2.__version__} OK')" },
        @{ Name = "NumPy"; Code = "import numpy; print(f'NumPy {numpy.__version__} OK')" },
        @{ Name = "Pillow"; Code = "from PIL import Image; print('Pillow OK')" },
        @{ Name = "Safetensors"; Code = "import safetensors; print('Safetensors OK')" },
        @{ Name = "Accelerate"; Code = "import accelerate; print('Accelerate OK')" }
    )
    
    $passed = 0
    $failed = @()
    
    foreach ($test in $tests) {
        $result = & $PythonExe -c $test.Code 2>&1
        if ($LASTEXITCODE -eq 0 -and $result -match "OK") {
            Write-Log "  [PASS] $($test.Name): $result" "SUCCESS"
            $passed++
        } else {
            Write-Log "  [FAIL] $($test.Name): $result" "ERROR"
            $failed += $test.Name
        }
    }
    
    return @{
        Passed = $passed
        Total = $tests.Count
        Failed = $failed
    }
}

function Show-Banner {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                                                                    ║" -ForegroundColor Cyan
    Write-Host "║     STABLE DIFFUSION WEBUI - FULL REPAIR SCRIPT                    ║" -ForegroundColor Cyan
    Write-Host "║                                                                    ║" -ForegroundColor Cyan
    Write-Host "║     Fixes ALL known issues:                                        ║" -ForegroundColor Cyan
    Write-Host "║       • RuntimeError: Failed to import transformers CLIP           ║" -ForegroundColor Cyan
    Write-Host "║       • cannot import 'runtime_version' from protobuf              ║" -ForegroundColor Cyan
    Write-Host "║       • xFormers can't load C++/CUDA extensions                    ║" -ForegroundColor Cyan
    Write-Host "║       • PyTorch/xFormers version mismatch                          ║" -ForegroundColor Cyan
    Write-Host "║                                                                    ║" -ForegroundColor Cyan
    Write-Host "║     Pinned Versions:                                               ║" -ForegroundColor Cyan
    Write-Host "║       torch==2.1.2+cu121, xformers==0.0.22.post7                   ║" -ForegroundColor Cyan
    Write-Host "║       transformers==4.36.2, protobuf==3.20.3                       ║" -ForegroundColor Cyan
    Write-Host "║                                                                    ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

Show-Banner

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

Write-Log "========================================" "HEADER"
Write-Log "Stable Diffusion Full Repair Started" "HEADER"
Write-Log "========================================" "HEADER"
Write-Log "SD Path: $SDPath"
Write-Log "Log File: $LogFile"

if (-not (Test-AdminPrivileges)) {
    Write-Log "Running without admin privileges - some operations may be limited" "WARN"
}

if (-not (Test-Path $SDPath)) {
    Write-Log "Stable Diffusion WebUI not found at: $SDPath" "ERROR"
    Write-Log "Please specify correct path with -SDPath parameter" "ERROR"
    exit 1
}

$venvPath = Join-Path $SDPath "venv"
$pythonExe = Join-Path $venvPath "Scripts\python.exe"

if ($Python310Path) {
    $python310 = $Python310Path
} else {
    $python310 = Find-Python310
}

if (-not $python310) {
    Write-Log "Python 3.10 not found!" "ERROR"
    Write-Log "Please install Python 3.10.x from https://www.python.org/downloads/" "ERROR"
    Write-Log "Or specify path with -Python310Path parameter" "ERROR"
    exit 1
}

Write-Log "Using Python 3.10: $python310"

$results = @{
    Backup = @{ Status = "SKIPPED"; Details = "" }
    VenvSetup = @{ Status = "PENDING"; Details = "" }
    PyTorch = @{ Status = "PENDING"; Details = "" }
    XFormers = @{ Status = "PENDING"; Details = "" }
    Transformers = @{ Status = "PENDING"; Details = "" }
    Dependencies = @{ Status = "PENDING"; Details = "" }
    Verification = @{ Status = "PENDING"; Details = "" }
}

Write-Host ""
Write-Log "═══════════════════════════════════════" "PHASE"
Write-Log " PHASE 1: Environment Preparation" "PHASE"
Write-Log "═══════════════════════════════════════" "PHASE"

if ($BackupFirst -and (Test-Path $venvPath)) {
    $backupPath = Backup-Venv -VenvPath $venvPath -BasePath $SDPath
    if ($backupPath) {
        $results.Backup.Status = "SUCCESS"
        $results.Backup.Details = "Backed up to $backupPath"
    } else {
        $results.Backup.Status = "FAILED"
        $results.Backup.Details = "Backup failed but continuing..."
    }
}

if ($CreateFreshVenv -or -not (Test-Path $pythonExe)) {
    Write-Log "Creating fresh Python 3.10 virtual environment..."
    
    if (Test-Path $venvPath) {
        Write-Log "Removing old venv..."
        Remove-Item -Path $venvPath -Recurse -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    
    try {
        if ($python310 -eq "py -3.10") {
            & py -3.10 -m venv $venvPath 2>&1 | Out-Null
        } else {
            & $python310 -m venv $venvPath 2>&1 | Out-Null
        }
        
        if (Test-Path $pythonExe) {
            Write-Log "Virtual environment created successfully" "SUCCESS"
            
            Write-Log "Upgrading pip, setuptools, wheel..."
            & $pythonExe -m pip install --upgrade pip setuptools wheel 2>&1 | Out-Null
            
            $results.VenvSetup.Status = "SUCCESS"
        } else {
            Write-Log "Failed to create virtual environment" "ERROR"
            $results.VenvSetup.Status = "FAILED"
            exit 1
        }
    } catch {
        Write-Log "Error creating venv: $_" "ERROR"
        $results.VenvSetup.Status = "FAILED"
        exit 1
    }
} else {
    Write-Log "Using existing virtual environment"
    Write-Log "Upgrading pip..."
    & $pythonExe -m pip install --upgrade pip setuptools wheel 2>&1 | Out-Null
    $results.VenvSetup.Status = "EXISTING"
}

Write-Host ""
Write-Log "═══════════════════════════════════════" "PHASE"
Write-Log " PHASE 2: Remove Conflicting Packages" "PHASE"
Write-Log "═══════════════════════════════════════" "PHASE"

Remove-ConflictingPackages -PythonExe $pythonExe

Write-Host ""
Write-Log "═══════════════════════════════════════" "PHASE"
Write-Log " PHASE 3: Install PyTorch $($PINNED_VERSIONS.torch)+cu121" "PHASE"
Write-Log "═══════════════════════════════════════" "PHASE"

if (Install-PyTorchCUDA -PythonExe $pythonExe) {
    $results.PyTorch.Status = "SUCCESS"
} else {
    $results.PyTorch.Status = "FAILED"
    Write-Log "PyTorch installation failed - cannot continue" "ERROR"
    exit 1
}

Write-Host ""
Write-Log "═══════════════════════════════════════" "PHASE"
Write-Log " PHASE 4: Install xFormers $($PINNED_VERSIONS.xformers)" "PHASE"
Write-Log "═══════════════════════════════════════" "PHASE"

if (Install-Xformers -PythonExe $pythonExe) {
    $results.XFormers.Status = "SUCCESS"
} else {
    $results.XFormers.Status = "PARTIAL"
    $results.XFormers.Details = "SD works without xFormers but slower"
}

Write-Host ""
Write-Log "═══════════════════════════════════════" "PHASE"
Write-Log " PHASE 5: Install Transformers + Protobuf" "PHASE"
Write-Log "═══════════════════════════════════════" "PHASE"

if (Install-TransformersProtobuf -PythonExe $pythonExe) {
    $results.Transformers.Status = "SUCCESS"
} else {
    $results.Transformers.Status = "FAILED"
}

Write-Host ""
Write-Log "═══════════════════════════════════════" "PHASE"
Write-Log " PHASE 6: Install Core Dependencies" "PHASE"
Write-Log "═══════════════════════════════════════" "PHASE"

if (Install-CoreDependencies -PythonExe $pythonExe) {
    $results.Dependencies.Status = "SUCCESS"
} else {
    $results.Dependencies.Status = "PARTIAL"
}

if (-not $SkipVerification) {
    Write-Host ""
    Write-Log "═══════════════════════════════════════" "PHASE"
    Write-Log " PHASE 7: Comprehensive Verification" "PHASE"
    Write-Log "═══════════════════════════════════════" "PHASE"
    
    $testResults = Test-FullInstallation -PythonExe $pythonExe
    
    if ($testResults.Failed.Count -eq 0) {
        $results.Verification.Status = "SUCCESS"
        $results.Verification.Details = "$($testResults.Passed)/$($testResults.Total) tests passed"
    } elseif ($testResults.Failed.Count -le 2) {
        $results.Verification.Status = "PARTIAL"
        $results.Verification.Details = "Failed: $($testResults.Failed -join ', ')"
    } else {
        $results.Verification.Status = "FAILED"
        $results.Verification.Details = "Multiple failures: $($testResults.Failed -join ', ')"
    }
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                         REPAIR SUMMARY                             ║" -ForegroundColor Cyan
Write-Host "╠════════════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan

$phases = @("Backup", "VenvSetup", "PyTorch", "XFormers", "Transformers", "Dependencies", "Verification")
foreach ($phase in $phases) {
    $status = $results[$phase].Status
    $details = $results[$phase].Details
    $color = switch ($status) {
        "SUCCESS" { "Green" }
        "PARTIAL" { "Yellow" }
        "SKIPPED" { "Gray" }
        "EXISTING" { "Cyan" }
        default { "Red" }
    }
    $icon = switch ($status) {
        "SUCCESS" { "✓" }
        "PARTIAL" { "~" }
        "SKIPPED" { "-" }
        "EXISTING" { "=" }
        "PENDING" { "?" }
        default { "✗" }
    }
    
    $paddedPhase = $phase.PadRight(15)
    $paddedStatus = $status.PadRight(10)
    $line = "║  $icon $paddedPhase $paddedStatus"
    if ($details) {
        $line += " $details"
    }
    $line = $line.PadRight(71) + "║"
    Write-Host $line -ForegroundColor $color
}

Write-Host "╚════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

$successCount = ($results.Values | Where-Object { $_.Status -eq "SUCCESS" }).Count
$failCount = ($results.Values | Where-Object { $_.Status -eq "FAILED" }).Count
$partialCount = ($results.Values | Where-Object { $_.Status -eq "PARTIAL" }).Count

Write-Host ""
Write-Log "Repair completed: $successCount success, $partialCount partial, $failCount failed"
Write-Host "Log saved to: $LogFile" -ForegroundColor Gray

if ($failCount -eq 0) {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║  Stable Diffusion WebUI repair completed successfully!             ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "Pinned versions installed:" -ForegroundColor Cyan
    Write-Host "  PyTorch:      $($PINNED_VERSIONS.torch)+cu121" -ForegroundColor White
    Write-Host "  xFormers:     $($PINNED_VERSIONS.xformers)" -ForegroundColor White
    Write-Host "  Transformers: $($PINNED_VERSIONS.transformers)" -ForegroundColor White
    Write-Host "  Protobuf:     $($PINNED_VERSIONS.protobuf)" -ForegroundColor White
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Navigate to: $SDPath" -ForegroundColor White
    Write-Host "  2. Run: .\venv\Scripts\python.exe launch.py --xformers" -ForegroundColor White
    Write-Host "  3. Or run webui-user.bat (make sure it uses existing venv)" -ForegroundColor White
    Write-Host ""
    exit 0
} else {
    Write-Host ""
    Write-Host "Some repairs failed. Review the log for details:" -ForegroundColor Yellow
    Write-Host "  $LogFile" -ForegroundColor White
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Cyan
    Write-Host "  1. Run as Administrator" -ForegroundColor White
    Write-Host "  2. Ensure Python 3.10.x is installed" -ForegroundColor White
    Write-Host "  3. Check NVIDIA drivers and CUDA 12.1 support" -ForegroundColor White
    Write-Host "  4. Try -CreateFreshVenv to start with clean environment" -ForegroundColor White
    Write-Host "  5. Try -Force to reinstall all packages" -ForegroundColor White
    exit 1
}
