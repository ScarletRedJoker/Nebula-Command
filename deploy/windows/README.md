# Windows AI Deployment

Deploy and manage GPU-accelerated AI services on Windows 11 with RTX 3060 (or similar NVIDIA GPU).

## Overview

This deployment bundle turns your Windows machine into a powerful AI inference and training node that integrates with the Nebula Command dashboard via Tailscale.

### Capabilities

| Category | Service | VRAM | Description |
|----------|---------|------|-------------|
| **Inference** | Ollama | 4-10GB | LLM inference (Llama, Qwen, Mistral, CodeLlama) |
| **Inference** | Stable Diffusion WebUI | 4-8GB | Image generation (SDXL, SD 1.5) |
| **Inference** | ComfyUI | 4-10GB | Video generation, advanced workflows |
| **Inference** | Whisper | 1-4GB | Speech-to-text transcription |
| **Training** | kohya_ss | 8-12GB | LoRA/SDXL fine-tuning |
| **Training** | Unsloth | 10-12GB | LLM fine-tuning (QLoRA) |

## Prerequisites

1. **Windows 11** (Windows 10 may work but untested)
2. **NVIDIA GPU** with 8GB+ VRAM (RTX 3060 12GB recommended)
3. **NVIDIA Drivers** (535+ for CUDA 12.x support)
4. **Tailscale** installed and joined to your mesh network
5. **Git for Windows** (for cloning repositories)
6. **Python 3.10+** (for Stable Diffusion, training tools)
7. **Administrator PowerShell** access

## Quick Start

### 1. Install Tailscale
```powershell
# Download from https://tailscale.com/download/windows
# Or via winget:
winget install Tailscale.Tailscale

# Join your Tailscale network
tailscale up --accept-routes
```

### 2. Clone This Repository
```powershell
git clone https://github.com/YOUR_ORG/nebula-command.git C:\NebulaCommand
cd C:\NebulaCommand\deploy\windows
```

### 3. Configure Environment
```powershell
# Copy and edit the environment template
Copy-Item configs\environment.ps1.example configs\environment.ps1
notepad configs\environment.ps1

# Required settings:
# $env:NEBULA_HEALTH_WEBHOOK = "https://your-dashboard.com/api/ai/health-webhook"
# $env:KVM_AGENT_TOKEN = "your-secure-token-from-openssl"
# $env:TAILSCALE_IP = "100.x.x.x"  # Your Windows machine's Tailscale IP
```

### 4. Run Setup Script
```powershell
# Run as Administrator
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
.\scripts\setup-windows-ai.ps1
```

This will:
- Install Ollama and pull recommended models
- Set up Stable Diffusion WebUI (AUTOMATIC1111)
- Configure ComfyUI with AnimateDiff/SVD nodes
- Register Windows services for auto-start
- Start the health daemon

### 5. Verify Installation
```powershell
# Check service status
.\scripts\windows-ai-supervisor.ps1 -Action status

# Test Ollama
Invoke-RestMethod -Uri "http://localhost:11434/api/tags"

# Test Stable Diffusion
Start-Process "http://localhost:7860"
```

## Folder Structure

```
deploy/windows/
├── scripts/           # PowerShell automation scripts
│   ├── setup-windows-ai.ps1      # Main installer
│   ├── windows-ai-supervisor.ps1 # Service manager
│   ├── vm-ai-health-daemon.ps1   # Health reporting daemon
│   ├── windows-agent.ps1         # Remote control agent
│   └── *.ps1                     # Other utility scripts
├── services/          # Docker/native service configurations
│   ├── ollama/        # Ollama configuration
│   ├── stable-diffusion/  # SD WebUI setup
│   ├── comfyui/       # ComfyUI configuration
│   └── whisper/       # Whisper.cpp setup
├── configs/           # Environment and configuration templates
│   ├── environment.ps1.example
│   ├── models.json    # Recommended model list
│   └── scheduled-tasks.xml  # Windows Task Scheduler exports
├── training/          # AI training pipelines
│   ├── lora/          # LoRA fine-tuning scripts
│   ├── sdxl/          # SDXL training configs
│   └── llm/           # LLM fine-tuning (Unsloth)
└── docs/              # Documentation
    └── TRAINING_GUIDE.md
```

## Scripts Reference

### windows-ai-supervisor.ps1
Manages AI service lifecycle:
```powershell
.\scripts\windows-ai-supervisor.ps1 -Action start   # Start all services
.\scripts\windows-ai-supervisor.ps1 -Action stop    # Stop all services
.\scripts\windows-ai-supervisor.ps1 -Action restart # Restart all services
.\scripts\windows-ai-supervisor.ps1 -Action status  # Check service status
```

### vm-ai-health-daemon.ps1
Reports health to dashboard:
```powershell
# Run continuously (as scheduled task)
.\scripts\vm-ai-health-daemon.ps1 -IntervalSeconds 30

# One-time status
.\scripts\vm-ai-health-daemon.ps1 -IntervalSeconds 0
```

### windows-agent.ps1
Receives commands from dashboard:
```powershell
# Start agent (listens on port 8765)
.\scripts\windows-agent.ps1 -Port 8765
```

## VRAM Management

With 12GB VRAM on RTX 3060, only run **one major model at a time**:

| Scenario | Active Services | VRAM Usage |
|----------|-----------------|------------|
| Chat Only | Ollama (8B model) | ~6GB |
| Image Gen | Stable Diffusion | ~6-8GB |
| Video Gen | ComfyUI + AnimateDiff | ~8-10GB |
| Transcription | Whisper + Ollama (small) | ~4GB |
| Training | kohya_ss only | 10-12GB |

### Model Hot-Swapping

The dashboard can request model unloads before starting new tasks:
```powershell
# Unload Ollama model to free VRAM
Invoke-RestMethod -Uri "http://localhost:11434/api/unload"

# ComfyUI automatically manages VRAM
# Stable Diffusion: Use the "Unload Checkpoint" button or API
```

## Dashboard Integration

### Health Webhook
The health daemon POSTs status to your dashboard every 30 seconds:
```json
{
  "timestamp": "2026-01-13T14:30:00Z",
  "hostname": "GAMING-PC",
  "services": {
    "ollama": { "status": "online", "models": ["llama3.2:8b"] },
    "stable_diffusion": { "status": "online" },
    "comfyui": { "status": "offline" }
  },
  "gpu": {
    "memory_used_mb": 4096,
    "memory_total_mb": 12288,
    "utilization_percent": 45
  }
}
```

### Remote Control API
Dashboard can send commands:
- `POST /api/ai/control` → `{"action": "restart", "service": "ollama"}`
- Requires `KVM_AGENT_TOKEN` environment variable on both sides

## Training Pipelines (Future)

### LoRA Training
```powershell
# Prepare dataset
.\training\lora\prepare-dataset.ps1 -InputDir "C:\Training\Images" -OutputDir "C:\Training\Dataset"

# Train LoRA
.\training\lora\train.ps1 -Dataset "C:\Training\Dataset" -OutputName "my-style-lora"
```

### LLM Fine-tuning
```powershell
# Uses Unsloth for efficient QLoRA training
.\training\llm\finetune.ps1 -BaseModel "llama3.2:8b" -Dataset "C:\Training\conversations.jsonl"
```

## Troubleshooting

### Service won't start
```powershell
# Check Windows Event Log
Get-EventLog -LogName Application -Source "NebulaAI" -Newest 20

# Check service-specific logs
Get-Content C:\ProgramData\NebulaCommand\logs\ollama.log -Tail 50
```

### VRAM exhausted
```powershell
# Force unload all models
.\scripts\windows-ai-supervisor.ps1 -Action unload-all

# Check GPU status
nvidia-smi
```

### Health daemon not reporting
```powershell
# Test webhook manually
$body = @{ test = $true } | ConvertTo-Json
Invoke-RestMethod -Uri $env:NEBULA_HEALTH_WEBHOOK -Method Post -Body $body -ContentType "application/json"
```

## Security Notes

1. **Token Management**: Generate secure tokens with `openssl rand -hex 32`
2. **Firewall**: Only Tailscale traffic should reach AI service ports
3. **Updates**: Regularly update NVIDIA drivers and AI frameworks
4. **Isolation**: Consider Windows Sandbox for untrusted model testing

## Next Steps

- [ ] Configure scheduled tasks for auto-start on boot
- [ ] Set up the training pipelines for your use case
- [ ] Add your Windows machine to the dashboard's node registry
- [ ] Test remote control from dashboard
