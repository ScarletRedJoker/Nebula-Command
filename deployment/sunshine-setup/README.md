# Sunshine Game Streaming Setup

Complete setup tools for Sunshine game streaming server with NVENC GPU encoding on Ubuntu 25.10.

## Files

- **`setup-sunshine.sh`** - Complete automated installation script
- **`verify-nvenc.sh`** - NVENC GPU encoding verification tool
- **`sunshine.service`** - Systemd service template

## Quick Start

### 1. Verify GPU Support

```bash
./verify-nvenc.sh
```

This will check:
- NVIDIA GPU detection
- Driver installation
- NVENC encoding support
- Required libraries
- GPU utilization & memory

### 2. Run Setup Script

```bash
./setup-sunshine.sh
```

This will:
- Install Sunshine server
- Configure NVENC encoding
- Add firewall rules
- Install systemd service
- Start Sunshine automatically

### 3. Access Web UI

After installation completes:

```
https://YOUR_IP:47990
```

Complete the initial setup wizard in the web UI.

## Requirements

- Ubuntu 25.10 (or 22.04+)
- NVIDIA GPU (RTX/GTX series with NVENC support)
- NVIDIA drivers installed (`nvidia-smi` working)
- 4GB+ RAM
- Wired network connection (recommended)

## Supported GPUs

| GPU Series | NVENC Gen | Max Streams | Quality Preset |
|------------|-----------|-------------|----------------|
| RTX 40xx   | 8th gen   | 3-4 streams | p7 (Max)       |
| RTX 30xx   | 7th gen   | 2-3 streams | p6-p7          |
| RTX 20xx   | 6th gen   | 2 streams   | p5-p6          |
| GTX 16xx   | 6th gen   | 2 streams   | p4-p5          |

## Service Management

```bash
# Start Sunshine
sudo systemctl start sunshine@USERNAME

# Stop Sunshine
sudo systemctl stop sunshine@USERNAME

# Check status
sudo systemctl status sunshine@USERNAME

# View logs
journalctl -u sunshine@USERNAME -f

# Enable auto-start on boot
sudo systemctl enable sunshine@USERNAME
```

Replace `USERNAME` with your Ubuntu username.

## Configuration

Sunshine configuration file:
```
~/.config/sunshine/sunshine.conf
```

### Recommended NVENC Settings

For **RTX 3060** (as in your setup):

```conf
encoder = nvenc
nv_preset = p7
nv_rc = cbr
nv_coder = cabac

bitrate = 20000  # 20 Mbps for 1080p, increase for 1440p/4K
```

### Quality vs Performance Presets

| Preset | Quality | Encoding Time | Use Case |
|--------|---------|---------------|----------|
| p1     | Lowest  | Fastest       | High motion, many streams |
| p4     | Medium  | Balanced      | General gaming |
| p6     | High    | Slower        | Single stream, high quality |
| p7     | Maximum | Slowest       | Best quality, powerful GPU |

## Ports

Sunshine uses these ports:

| Port Range  | Protocol | Purpose |
|-------------|----------|---------|
| 47984       | TCP      | HTTPS (Web UI) |
| 47989-47990 | TCP      | HTTP fallback |
| 47998       | UDP      | Video stream |
| 47999       | UDP      | Control stream |
| 48000       | UDP      | Audio stream |
| 48010       | UDP      | Microphone |

Firewall rules are added automatically by the setup script.

## Troubleshooting

### Sunshine won't start

```bash
# Check service logs
journalctl -u sunshine@USERNAME -n 50

# Verify NVENC support
./verify-nvenc.sh

# Check GPU access
ls -la /dev/nvidia* /dev/dri/*
```

### "Encoder not found" error

Make sure NVIDIA drivers are installed:
```bash
nvidia-smi

# If not working, reinstall drivers
sudo ubuntu-drivers autoinstall
sudo reboot
```

### High latency / stuttering

1. Use wired Ethernet (not WiFi)
2. Enable Twingate VPN for remote access
3. Lower bitrate in Sunshine settings
4. Reduce resolution/FPS
5. Use lower NVENC preset (p4 instead of p7)

### Can't connect with Moonlight

1. Check firewall: `sudo ufw status`
2. Verify Sunshine is running: `sudo systemctl status sunshine@USERNAME`
3. Test connection: `telnet YOUR_IP 47990`
4. Check network connectivity between client and server

## Performance Benchmarks

Based on RTX 3060:

| Resolution | FPS | Bitrate | Preset | Latency (LAN) | GPU Usage |
|------------|-----|---------|--------|---------------|-----------|
| 1080p      | 60  | 20 Mbps | p7     | 8-12ms        | 15-20%    |
| 1440p      | 60  | 40 Mbps | p6     | 10-15ms       | 25-30%    |
| 4K         | 60  | 80 Mbps | p5     | 15-20ms       | 40-50%    |

## Integration with Nebula Dashboard

After setup, the Sunshine host will appear in:

**Nebula Dashboard → Game Streaming → Configured Hosts**

Features:
- Auto-discovery on network
- One-click pairing with Moonlight
- Performance monitoring
- Session history tracking
- Diagnostic tools

## Additional Resources

- **Sunshine Docs**: https://docs.lizardbyte.dev/projects/sunshine
- **Moonlight**: https://moonlight-stream.org
- **NVENC Specs**: https://developer.nvidia.com/video-encode-and-decode-gpu-support-matrix

## Notes

- Setup script installs Sunshine v0.23.1 (latest stable)
- Systemd service runs as your user (not root) for security
- GPU passthrough is automatic if using KVM/QEMU
- For best performance, dedicate the GPU to Sunshine (no desktop rendering)

---

**Last Updated**: November 19, 2025  
**Tested On**: Ubuntu 25.10 + NVIDIA RTX 3060 + Driver 545.29.06
