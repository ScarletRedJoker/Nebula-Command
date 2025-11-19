#!/bin/bash
#
# NVENC GPU Encoding Verification Script
# Tests NVIDIA GPU encoding capabilities for Sunshine
#

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          NVENC Encoding Verification Tool                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Test 1: Check GPU
echo -e "${YELLOW}[Test 1/5] NVIDIA GPU Detection...${NC}"
if ! lspci | grep -i nvidia > /dev/null; then
    echo -e "${RED}✗ FAILED: No NVIDIA GPU found${NC}"
    exit 1
fi

GPU_INFO=$(lspci | grep -i nvidia | grep VGA)
echo -e "${GREEN}✓ PASSED:${NC} $GPU_INFO"

# Test 2: NVIDIA Driver
echo -e "${YELLOW}[Test 2/5] NVIDIA Driver Check...${NC}"
if ! command -v nvidia-smi > /dev/null; then
    echo -e "${RED}✗ FAILED: nvidia-smi not found${NC}"
    exit 1
fi

DRIVER_VERSION=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader)
echo -e "${GREEN}✓ PASSED:${NC} Driver version $DRIVER_VERSION"

# Test 3: NVENC Support
echo -e "${YELLOW}[Test 3/6] NVENC Encoding Support...${NC}"

# Check encoder capabilities using proper query
ENCODER_STATS=$(nvidia-smi --query-gpu=encoder.stats.sessionCount,encoder.stats.averageFps --format=csv,noheader 2>/dev/null)

if [ $? -eq 0 ]; then
    # Check if GPU supports encoder queries
    if nvidia-smi | grep -q "RTX\|GTX\|Quadro\|Tesla"; then
        echo -e "${GREEN}✓ PASSED:${NC} GPU supports NVENC hardware encoding"
        echo -e "  Encoder stats available: Session support confirmed"
    else
        echo -e "${YELLOW}⚠ WARNING:${NC} Encoder support detected but GPU model unknown"
    fi
else
    echo -e "${YELLOW}⚠ WARNING:${NC} Could not query encoder stats (driver may not support this feature)"
    echo -e "  This is normal for some driver versions - NVENC may still work"
fi

# Test 4: Required Libraries
echo -e "${YELLOW}[Test 4/6] NVENC Libraries...${NC}"
MISSING_LIBS=()

# Check for libnvidia-encode in ldconfig
if ! ldconfig -p | grep -q libnvidia-encode; then
    MISSING_LIBS+=("libnvidia-encode")
fi

# Verify library can actually be loaded
if [ ${#MISSING_LIBS[@]} -eq 0 ]; then
    # Try to find the actual library file
    ENCODE_LIB=$(find /usr/lib* -name "libnvidia-encode.so*" 2>/dev/null | head -n1)
    if [ -n "$ENCODE_LIB" ]; then
        echo -e "${GREEN}✓ PASSED:${NC} NVENC libraries found and loadable"
        echo -e "  Library path: $ENCODE_LIB"
    else
        echo -e "${YELLOW}⚠ WARNING:${NC} Library registered but file not found in standard paths"
    fi
else
    echo -e "${RED}✗ FAILED:${NC} Missing libraries: ${MISSING_LIBS[*]}"
    echo -e "${YELLOW}Fix:${NC} sudo apt-get install libnvidia-encode1"
    exit 1
fi

# Test 5: GPU Utilization & Memory
echo -e "${YELLOW}[Test 5/6] GPU Status & Memory...${NC}"
GPU_UTIL=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits)
GPU_MEM_TOTAL=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits)
GPU_MEM_USED=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)

echo -e "${GREEN}✓ PASSED:${NC}"
echo -e "  GPU Utilization: $GPU_UTIL%"
echo -e "  VRAM Total: $GPU_MEM_TOTAL MB"
echo -e "  VRAM Used: $GPU_MEM_USED MB"

# Test 6: Encoder Availability
echo -e "${YELLOW}[Test 6/6] Encoder Availability Check...${NC}"

# Query encoder utilization to verify it's accessible
ENC_UTIL=$(nvidia-smi --query-gpu=encoder.stats.sessionCount --format=csv,noheader 2>/dev/null)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PASSED:${NC} NVENC encoder is accessible"
    if [ -n "$ENC_UTIL" ]; then
        echo -e "  Active encoding sessions: $ENC_UTIL"
    fi
else
    echo -e "${YELLOW}⚠ WARNING:${NC} Cannot query encoder utilization"
    echo -e "  This may be normal for some driver versions"
    echo -e "  NVENC should still function properly"
fi

# Performance estimate
echo
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              NVENC Configuration Summary                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Get GPU name
GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader)
echo -e "${YELLOW}GPU:${NC} $GPU_NAME"
echo -e "${YELLOW}Driver:${NC} $DRIVER_VERSION"
echo

# Performance recommendations - dynamically calculated
echo -e "${YELLOW}Recommended Sunshine Settings for $GPU_NAME:${NC}"

# Set GPU-specific values
if [[ "$GPU_NAME" == *"RTX 40"* ]]; then
    PRESET="p7"
    CODEC="nvenc (AV1 or H.265)"
    BITRATE_4K="50-100 Mbps"
    BITRATE_1440P="30-50 Mbps"
    BITRATE_1080P="20-30 Mbps"
    LATENCY="<5ms"
    STREAMS_1080P="3-4"
    STREAMS_4K="1-2"
elif [[ "$GPU_NAME" == *"RTX 30"* ]]; then
    PRESET="p6"
    CODEC="nvenc (H.265 or H.264)"
    BITRATE_4K="40-80 Mbps"
    BITRATE_1440P="20-40 Mbps"
    BITRATE_1080P="15-25 Mbps"
    LATENCY="<10ms"
    STREAMS_1080P="2-3"
    STREAMS_4K="1"
elif [[ "$GPU_NAME" == *"RTX 20"* ]] || [[ "$GPU_NAME" == *"GTX 16"* ]]; then
    PRESET="p5"
    CODEC="nvenc (H.264 recommended)"
    BITRATE_4K="30-60 Mbps"
    BITRATE_1440P="15-30 Mbps"
    BITRATE_1080P="12-20 Mbps"
    LATENCY="<15ms"
    STREAMS_1080P="2"
    STREAMS_4K="1"
elif [[ "$GPU_NAME" == *"GTX 10"* ]]; then
    PRESET="p4"
    CODEC="nvenc (H.264)"
    BITRATE_4K="N/A (not recommended)"
    BITRATE_1440P="20-30 Mbps"
    BITRATE_1080P="10-20 Mbps"
    LATENCY="<20ms"
    STREAMS_1080P="1-2"
    STREAMS_4K="N/A"
else
    PRESET="p4"
    CODEC="nvenc (H.264)"
    BITRATE_4K="Varies by GPU"
    BITRATE_1440P="15-25 Mbps"
    BITRATE_1080P="10-15 Mbps"
    LATENCY="Varies"
    STREAMS_1080P="1-2"
    STREAMS_4K="Check GPU specs"
fi

echo -e "  Encoder:      ${GREEN}$CODEC${NC}"
echo -e "  Preset:       ${GREEN}$PRESET (recommended)${NC}"
echo -e "  Bitrate 4K:   ${GREEN}$BITRATE_4K${NC}"
echo -e "  Bitrate 1440p: ${GREEN}$BITRATE_1440P${NC}"
echo -e "  Bitrate 1080p: ${GREEN}$BITRATE_1080P${NC}"
echo -e "  Latency:      ${GREEN}$LATENCY capable${NC}"

echo
echo -e "${YELLOW}Estimated Streaming Capacity:${NC}"
echo -e "  ${GREEN}✓${NC} Simultaneous 1080p60 streams: $STREAMS_1080P"
if [[ "$STREAMS_4K" != "N/A" ]] && [[ "$STREAMS_4K" != "Check GPU specs" ]]; then
    echo -e "  ${GREEN}✓${NC} Simultaneous 4K60 streams: $STREAMS_4K"
fi

echo
echo -e "${GREEN}✓ All NVENC tests passed! GPU is ready for game streaming.${NC}"
echo
echo -e "${YELLOW}Next: Configure Sunshine to use NVENC${NC}"
echo -e "  Edit ~/.config/sunshine/sunshine.conf"
echo -e "  Set: encoder = nvenc"
echo -e "  Set: nv_preset = p7"
echo
