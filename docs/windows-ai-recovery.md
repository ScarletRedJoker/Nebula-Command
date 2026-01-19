# Windows AI Node Recovery Guide

This document provides recovery procedures for the Windows AI Node when services fail or need to be reinstalled. For initial setup, see [WINDOWS_VM_AI_SETUP.md](./WINDOWS_VM_AI_SETUP.md).

## Quick Diagnosis

Run the verification script to check service status:

```powershell
cd C:\HomeLabHub\scripts
.\verify-ai-services.ps1 -OutputFormat text
```

This will show the status of all AI services and GPU.

## Automated Recovery

For most issues, run the automated setup script as Administrator:

```powershell
cd C:\HomeLabHub\scripts
.\windows-ai-setup.ps1 -NonInteractive
```

### Selective Recovery

Skip components that are working:

```powershell
# Only reinstall Stable Diffusion
.\windows-ai-setup.ps1 -SkipPython -SkipOllama -SkipComfyUI

# Only reinstall Ollama
.\windows-ai-setup.ps1 -SkipPython -SkipSD -SkipComfyUI

# Force reinstall everything
.\windows-ai-setup.ps1 -Force -NonInteractive
```

---

## Manual Recovery Procedures

### 1. Ollama Not Responding

**Symptoms:** Port 11434 not listening, API timeout

**Quick Fix:**
```powershell
# Check if Ollama is running
Get-Process ollama -ErrorAction SilentlyContinue

# Restart Ollama service
Stop-Service "Ollama" -Force -ErrorAction SilentlyContinue
Start-Service "Ollama"

# Or start manually
ollama serve
```

**Verify network binding:**
```powershell
# Check OLLAMA_HOST environment variable
[System.Environment]::GetEnvironmentVariable("OLLAMA_HOST", "Machine")

# Should be: 0.0.0.0:11434
# If not set:
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "Machine")
Restart-Service "Ollama"
```

**Complete reinstall:**
```powershell
winget uninstall Ollama.Ollama
winget install Ollama.Ollama
[System.Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "Machine")
```

### 2. Stable Diffusion WebUI Not Starting

**Symptoms:** Port 7860 not listening, Python errors

**Check Python version:**
```powershell
python --version
# Must be 3.10.x - NOT 3.11, 3.12, or 3.14
```

**Common fixes:**

```powershell
cd C:\AI\stable-diffusion-webui

# Clear venv and reinstall
Remove-Item -Recurse -Force venv
.\webui-user.bat
```

**Fix CUDA/PyTorch issues:**
```powershell
cd C:\AI\stable-diffusion-webui
.\venv\Scripts\activate

# Reinstall PyTorch with correct CUDA version
pip uninstall torch torchvision torchaudio -y
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Reinstall xformers
pip uninstall xformers -y
pip install xformers
```

**Verify webui-user.bat configuration:**
```batch
@echo off
set PYTHON=
set GIT=
set VENV_DIR=
set COMMANDLINE_ARGS=--api --listen --enable-insecure-extension-access --xformers --no-half-vae
call webui.bat
```

**Low VRAM mode (for GPUs with < 8GB):**
```batch
set COMMANDLINE_ARGS=--api --listen --medvram --xformers
```

### 3. ComfyUI Not Starting

**Symptoms:** Port 8188 not listening

**Quick start:**
```powershell
cd C:\AI\ComfyUI
python main.py --listen 0.0.0.0 --port 8188
```

**Fix missing dependencies:**
```powershell
cd C:\AI\ComfyUI
pip install -r requirements.txt
```

**AnimateDiff nodes not working:**
```powershell
cd C:\AI\ComfyUI\custom_nodes

# Remove and reinstall
Remove-Item -Recurse -Force ComfyUI-AnimateDiff-Evolved
git clone https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git

# Install dependencies
cd ComfyUI-AnimateDiff-Evolved
pip install -r requirements.txt
```

### 4. GPU Not Detected / CUDA Errors

**Verify NVIDIA driver:**
```powershell
nvidia-smi
```

If this fails, reinstall NVIDIA drivers:
1. Download from https://www.nvidia.com/drivers
2. Select "Clean Installation" during install
3. Reboot

**Verify CUDA is working with Python:**
```python
import torch
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"GPU: {torch.cuda.get_device_name(0)}")
print(f"CUDA version: {torch.version.cuda}")
```

**Common CUDA fixes:**
```powershell
# Check CUDA version in nvidia-smi output
nvidia-smi
# Look for "CUDA Version: 12.x"

# Reinstall PyTorch with matching CUDA version
pip install torch --index-url https://download.pytorch.org/whl/cu121
```

### 5. Firewall Blocking Connections

**Verify firewall rules:**
```powershell
Get-NetFirewallRule -DisplayName "*Stable*","*Ollama*","*ComfyUI*" | 
    Select-Object DisplayName, Enabled, Direction, Action
```

**Create missing rules:**
```powershell
# Stable Diffusion
netsh advfirewall firewall add rule name="Stable Diffusion WebUI" dir=in action=allow protocol=tcp localport=7860

# ComfyUI
netsh advfirewall firewall add rule name="ComfyUI" dir=in action=allow protocol=tcp localport=8188

# Ollama
netsh advfirewall firewall add rule name="Ollama API" dir=in action=allow protocol=tcp localport=11434

# Nebula Agent
netsh advfirewall firewall add rule name="Nebula Agent" dir=in action=allow protocol=tcp localport=9765
```

### 6. Services Not Listening on Correct Interface

**Check which interfaces services are bound to:**
```powershell
netstat -an | findstr "LISTENING" | findstr "7860 8188 11434"
```

Should show `0.0.0.0:PORT` not `127.0.0.1:PORT`.

**Fix for each service:**

| Service | Fix |
|---------|-----|
| Ollama | Set `OLLAMA_HOST=0.0.0.0:11434` environment variable |
| SD WebUI | Add `--listen` to COMMANDLINE_ARGS in webui-user.bat |
| ComfyUI | Add `--listen 0.0.0.0` to start command |

### 7. Python Version Conflicts

**Problem:** Multiple Python versions installed, wrong one being used

**Solution:**
```powershell
# Check all Python installations
py -0

# Force use of Python 3.10
py -3.10 -m venv venv

# Or set PATH to prefer 3.10
$env:Path = "C:\Python310;C:\Python310\Scripts;" + $env:Path
```

**Create dedicated launcher for SD WebUI:**
```batch
@echo off
set PYTHON=C:\Python310\python.exe
set COMMANDLINE_ARGS=--api --listen --xformers
call webui.bat
```

### 8. VRAM Out of Memory Errors

**Symptoms:** CUDA out of memory errors during generation

**Immediate fixes:**
1. Close other GPU-intensive apps (games, video editors, other AI tools)
2. Reduce image resolution (512x512 instead of 1024x1024)
3. Use smaller batch size (1 instead of 4)

**Configuration changes for SD WebUI:**
```batch
# For 8GB VRAM
set COMMANDLINE_ARGS=--api --listen --medvram --xformers

# For 6GB VRAM
set COMMANDLINE_ARGS=--api --listen --lowvram --xformers

# For 4GB VRAM (very slow)
set COMMANDLINE_ARGS=--api --listen --lowvram --no-half
```

---

## Verification Checklist

After recovery, verify each component:

### 1. Check GPU
```powershell
nvidia-smi
# Should show GPU name, memory, driver version
```

### 2. Check Ollama
```powershell
# API test
curl http://localhost:11434/api/version

# From Tailscale network
curl http://100.118.44.102:11434/api/version

# List models
ollama list
```

### 3. Check Stable Diffusion
```powershell
# API test
curl http://localhost:7860/sdapi/v1/options

# Should return JSON with sd_model_checkpoint
```

### 4. Check ComfyUI
```powershell
# API test
curl http://localhost:8188/system_stats

# Should return JSON with device info
```

### 5. Run Full Verification
```powershell
.\verify-ai-services.ps1 -OutputFormat text
```

Expected output when healthy:
```
WINDOWS AI SERVICES STATUS
============================================================
Overall:   healthy

SERVICES:
  [OK] Ollama: online
      Version: 0.5.x
  [OK] Stable Diffusion WebUI: online
      Model: v1-5-pruned-emaonly.safetensors
  [OK] ComfyUI: online

GPU:
  Name: NVIDIA GeForce RTX 3060
  Memory: 2048/12288 MB (16%)
  Utilization: 5% | Temp: 45C
```

---

## Service URLs Reference

| Service | Local URL | Tailscale URL | Health Endpoint |
|---------|-----------|---------------|-----------------|
| Ollama | http://localhost:11434 | http://100.118.44.102:11434 | /api/version |
| SD WebUI | http://localhost:7860 | http://100.118.44.102:7860 | /sdapi/v1/options |
| ComfyUI | http://localhost:8188 | http://100.118.44.102:8188 | /system_stats |
| Nebula Agent | http://localhost:9765 | http://100.118.44.102:9765 | /api/health |

---

## Log Files

- Setup script log: `C:\AI\setup-*.log`
- Last setup result: `C:\AI\last-setup-result.json`
- SD WebUI logs: Check console window or Task Scheduler history
- Windows Event Viewer: Application and System logs

---

## Emergency Contacts / Escalation

If automated and manual recovery fails:

1. Check Tailscale connection: `tailscale status`
2. Verify VM is accessible via RDP or Sunshine
3. Check Windows Event Viewer for system errors
4. Review the dashboard's AI Nodes page for connection diagnostics
5. If GPU issues persist, consider driver rollback or clean reinstall
