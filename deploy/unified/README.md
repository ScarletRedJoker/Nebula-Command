# Unified Deployment System

One-command deployment for Windows and Linux nodes with automatic hardware detection, service configuration, and supervision.

## Node Bootstrap (New!)

### Linux
```bash
./deploy/unified/bootstrap.sh
```

### Windows (PowerShell as Administrator)
```powershell
.\deploy\unified\bootstrap.ps1
```

See [Bootstrap Options](#bootstrap-options) below for all options.

---

## Deployment Orchestrator

Deploy to Local Ubuntu, Windows VM, and Linode from a single control plane.

## Quick Start

```bash
# From Local Ubuntu (the control plane):
cd /opt/homelab/HomeLabHub

# Deploy to local and Linode (default)
./deploy/unified/deploy-all.sh

# Check status of all nodes
./deploy/unified/deploy-all.sh status

# Deploy to specific targets
./deploy/unified/deploy-all.sh -t local,windows,linode
```

## Commands

| Command | Description |
|---------|-------------|
| `deploy` | Deploy to specified targets (default) |
| `status` | Show status of all nodes |
| `health` | Run health checks on all nodes |
| `sync` | Sync code to all nodes without deploying |

## Options

| Option | Description |
|--------|-------------|
| `-t, --targets` | Comma-separated targets: local,linode,windows |
| `-p, --parallel` | Run deployments in parallel |
| `-s, --skip-health` | Skip post-deployment health checks |
| `-v, --verbose` | Verbose output |
| `-n, --dry-run` | Show what would be done |

## Examples

```bash
# Standard deployment (sequential, safer)
./deploy/unified/deploy-all.sh

# Parallel deployment (faster)
./deploy/unified/deploy-all.sh -p

# Deploy only to Linode
./deploy/unified/deploy-all.sh -t linode

# Include Windows AI node
./deploy/unified/deploy-all.sh -t local,linode,windows

# Preview without executing
./deploy/unified/deploy-all.sh -n -t local,linode,windows

# Just sync code without full deploy
./deploy/unified/deploy-all.sh sync
```

## Node Configuration

The orchestrator uses these defaults (override via environment variables):

```bash
export LINODE_HOST="69.164.211.205"
export LINODE_USER="root"
export WINDOWS_HOST="100.118.44.102"
export WINDOWS_USER="Evin"
```

## Prerequisites

### Local Ubuntu (Control Plane)
- SSH key access to Linode (`~/.ssh/homelab`)
- Tailscale connected (for Windows VM)
- Docker running

### Linode
- SSH key-based auth configured
- Repository at `/opt/homelab/HomeLabHub`

### Windows VM
- Tailscale connected
- SSH enabled (OpenSSH Server)
- Key-based auth recommended (password works but slower)

## Architecture

```
Local Ubuntu (Control Plane)
    │
    ├── deploy/local/deploy.sh → Local Docker services
    │
    ├── SSH → Linode
    │         └── deploy/linode/deploy.sh → Cloud services
    │
    └── SSH/Tailscale → Windows VM
                        └── Ollama, SD, ComfyUI
```

## State Management

Deployment state is tracked in:
- `deploy/shared/state/deploy-status.json` - Last deployment status per target
- `deploy/shared/state/local-ai.json` - Windows AI services state
- `deploy/unified/logs/deploy-all.log` - Orchestrator logs

## Troubleshooting

### Windows SSH fails
```bash
# Use password auth with identity limiting
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no Evin@100.118.44.102

# Or set up key-based auth:
ssh-copy-id -i ~/.ssh/homelab Evin@100.118.44.102
```

### Linode unreachable
```bash
# Test SSH connectivity
ssh -o ConnectTimeout=5 root@69.164.211.205 "echo ok"

# Check if key is loaded
ssh-add -l
```

### Health checks failing
```bash
# Run health checks in verbose mode
./deploy/unified/deploy-all.sh health -v

# Check specific service
curl -sf http://localhost:9091/api/health
```

---

## Bootstrap Options

### Hardware Detection
The bootstrap automatically detects:
- **GPU**: NVIDIA (CUDA), AMD (ROCm), Intel (integrated)
- **VRAM**: Amount and optimization settings
- **RAM**: Memory availability
- **Disk**: Available storage
- **Network**: Primary IP, Tailscale IP

### Auto-Configuration
| Hardware | Ollama | ComfyUI | Stable Diffusion |
|----------|--------|---------|------------------|
| GPU 8GB+ VRAM | ✅ GPU | ✅ High VRAM | ✅ XFormers |
| GPU 4-8GB VRAM | ✅ GPU | ✅ Normal | ✅ Med VRAM |
| CPU only (8GB+ RAM) | ✅ CPU | ⚠️ CPU | ❌ Skipped |

### Linux Options
```bash
./bootstrap.sh [options]
  --dashboard-url URL   Dashboard URL for node registration
  --no-ollama           Skip Ollama installation
  --no-comfyui          Skip ComfyUI installation
  --force-comfyui       Install ComfyUI even without GPU
  --dry-run             Show what would be done
```

### Windows Options
```powershell
.\bootstrap.ps1 [options]
  -DashboardUrl URL     Dashboard URL for node registration
  -NoOllama             Skip Ollama installation
  -NoComfyUI            Skip ComfyUI installation
  -ForceComfyUI         Install ComfyUI even without GPU
  -DryRun               Show what would be done
```

### Generated Files
```
state/<node-id>/
├── hardware-profile.json   # Detected hardware
├── .env                    # Environment variables
├── ollama.conf             # Ollama configuration
├── comfyui.conf            # ComfyUI configuration
├── sd.conf                 # Stable Diffusion config
└── services.json           # Enabled services manifest
```
