#!/bin/bash
# Nebula Command - Hardware Detection Module (Linux)
# Detects GPU, VRAM, CUDA/ROCm, RAM, disk, and network interfaces

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${STATE_DIR:-$SCRIPT_DIR/../state}"

detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        echo "$ID"
    elif [[ -f /etc/redhat-release ]]; then
        echo "rhel"
    else
        echo "unknown"
    fi
}

detect_arch() {
    uname -m
}

detect_ram() {
    local total_kb
    total_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    echo $((total_kb / 1024))
}

detect_disk() {
    local root_available
    root_available=$(df -BM / | tail -1 | awk '{print $4}' | tr -d 'M')
    echo "$root_available"
}

detect_nvidia_gpu() {
    local gpu_info=""
    local gpu_count=0
    local total_vram=0
    local cuda_version=""
    
    if command -v nvidia-smi &> /dev/null; then
        gpu_count=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | wc -l)
        
        if [[ "$gpu_count" -gt 0 ]]; then
            local gpu_names
            gpu_names=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | tr '\n' ',' | sed 's/,$//')
            
            local vram_list
            vram_list=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null)
            
            while IFS= read -r vram; do
                total_vram=$((total_vram + vram))
            done <<< "$vram_list"
            
            cuda_version=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1 || echo "")
            
            if command -v nvcc &> /dev/null; then
                cuda_version=$(nvcc --version 2>/dev/null | grep "release" | sed 's/.*release \([0-9.]*\).*/\1/' || echo "$cuda_version")
            fi
            
            gpu_info="{\"vendor\":\"nvidia\",\"count\":$gpu_count,\"names\":\"$gpu_names\",\"vram_mb\":$total_vram,\"cuda_version\":\"$cuda_version\"}"
        fi
    fi
    
    echo "$gpu_info"
}

detect_amd_gpu() {
    local gpu_info=""
    local gpu_count=0
    local total_vram=0
    local rocm_version=""
    
    if command -v rocm-smi &> /dev/null; then
        gpu_count=$(rocm-smi --showcount 2>/dev/null | grep "GPU count" | awk '{print $NF}' || echo "0")
        
        if [[ "$gpu_count" -gt 0 ]]; then
            local gpu_names
            gpu_names=$(rocm-smi --showproductname 2>/dev/null | grep "Card series" | cut -d':' -f2 | tr '\n' ',' | sed 's/,$//' | xargs)
            
            local vram_info
            vram_info=$(rocm-smi --showmeminfo vram 2>/dev/null | grep "Total Memory" | awk '{print $NF}')
            total_vram=$(echo "$vram_info" | awk '{sum += $1} END {print int(sum/1024/1024)}')
            
            if [[ -f /opt/rocm/.info/version ]]; then
                rocm_version=$(cat /opt/rocm/.info/version)
            fi
            
            gpu_info="{\"vendor\":\"amd\",\"count\":$gpu_count,\"names\":\"$gpu_names\",\"vram_mb\":$total_vram,\"rocm_version\":\"$rocm_version\"}"
        fi
    else
        if lspci 2>/dev/null | grep -i "VGA.*AMD\|Radeon" &> /dev/null; then
            local gpu_names
            gpu_names=$(lspci 2>/dev/null | grep -i "VGA.*AMD\|Radeon" | cut -d':' -f3 | tr '\n' ',' | sed 's/,$//' | xargs)
            gpu_count=$(lspci 2>/dev/null | grep -i "VGA.*AMD\|Radeon" | wc -l)
            
            gpu_info="{\"vendor\":\"amd\",\"count\":$gpu_count,\"names\":\"$gpu_names\",\"vram_mb\":0,\"rocm_version\":\"\"}"
        fi
    fi
    
    echo "$gpu_info"
}

detect_intel_gpu() {
    local gpu_info=""
    
    if lspci 2>/dev/null | grep -i "VGA.*Intel" &> /dev/null; then
        local gpu_name
        gpu_name=$(lspci 2>/dev/null | grep -i "VGA.*Intel" | cut -d':' -f3 | head -1 | xargs)
        gpu_info="{\"vendor\":\"intel\",\"count\":1,\"names\":\"$gpu_name\",\"vram_mb\":0,\"driver\":\"integrated\"}"
    fi
    
    echo "$gpu_info"
}

detect_gpu() {
    local nvidia_gpu
    local amd_gpu
    local intel_gpu
    
    nvidia_gpu=$(detect_nvidia_gpu)
    if [[ -n "$nvidia_gpu" ]]; then
        echo "$nvidia_gpu"
        return
    fi
    
    amd_gpu=$(detect_amd_gpu)
    if [[ -n "$amd_gpu" ]]; then
        echo "$amd_gpu"
        return
    fi
    
    intel_gpu=$(detect_intel_gpu)
    if [[ -n "$intel_gpu" ]]; then
        echo "$intel_gpu"
        return
    fi
    
    echo "{\"vendor\":\"none\",\"count\":0,\"names\":\"\",\"vram_mb\":0}"
}

detect_network() {
    local interfaces=""
    local primary_ip=""
    local tailscale_ip=""
    
    primary_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
    
    if command -v tailscale &> /dev/null; then
        tailscale_ip=$(tailscale ip -4 2>/dev/null || echo "")
    fi
    
    interfaces=$(ip -o link show 2>/dev/null | awk -F': ' '{print $2}' | grep -v "lo" | tr '\n' ',' | sed 's/,$//')
    
    echo "{\"primary_ip\":\"$primary_ip\",\"tailscale_ip\":\"$tailscale_ip\",\"interfaces\":\"$interfaces\"}"
}

detect_services() {
    local ollama_installed=false
    local comfyui_installed=false
    local sd_installed=false
    local docker_installed=false
    
    command -v ollama &> /dev/null && ollama_installed=true
    command -v docker &> /dev/null && docker_installed=true
    [[ -d /opt/ComfyUI ]] || [[ -d ~/ComfyUI ]] && comfyui_installed=true
    [[ -d /opt/stable-diffusion-webui ]] || [[ -d ~/stable-diffusion-webui ]] && sd_installed=true
    
    echo "{\"ollama\":$ollama_installed,\"comfyui\":$comfyui_installed,\"stable_diffusion\":$sd_installed,\"docker\":$docker_installed}"
}

generate_node_id() {
    local hostname
    hostname=$(hostname)
    local mac
    mac=$(ip link show 2>/dev/null | grep "link/ether" | head -1 | awk '{print $2}' | tr -d ':' | tail -c 6)
    echo "${hostname}-${mac:-$(date +%s | tail -c 6)}"
}

main() {
    local output_file="${1:-}"
    
    local os
    os=$(detect_os)
    local arch
    arch=$(detect_arch)
    local ram_mb
    ram_mb=$(detect_ram)
    local disk_mb
    disk_mb=$(detect_disk)
    local gpu
    gpu=$(detect_gpu)
    local network
    network=$(detect_network)
    local services
    services=$(detect_services)
    local node_id
    node_id=$(generate_node_id)
    
    local has_gpu=false
    local is_gpu_capable=false
    local vram_mb=0
    
    if echo "$gpu" | grep -q '"count":[1-9]'; then
        has_gpu=true
        vram_mb=$(echo "$gpu" | grep -o '"vram_mb":[0-9]*' | cut -d':' -f2)
        [[ "$vram_mb" -ge 4000 ]] && is_gpu_capable=true
    fi
    
    local profile="{
  \"node_id\": \"$node_id\",
  \"detected_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"platform\": \"linux\",
  \"os\": \"$os\",
  \"arch\": \"$arch\",
  \"ram_mb\": $ram_mb,
  \"disk_available_mb\": $disk_mb,
  \"gpu\": $gpu,
  \"network\": $network,
  \"services\": $services,
  \"capabilities\": {
    \"has_gpu\": $has_gpu,
    \"is_gpu_capable\": $is_gpu_capable,
    \"vram_mb\": $vram_mb,
    \"can_run_llm\": $([ "$ram_mb" -ge 8000 ] && echo true || echo false),
    \"can_run_sd\": $is_gpu_capable,
    \"can_run_comfyui\": $is_gpu_capable
  }
}"

    if [[ -n "$output_file" ]]; then
        mkdir -p "$(dirname "$output_file")"
        echo "$profile" > "$output_file"
        echo "[Detect] Hardware profile saved to: $output_file"
    else
        echo "$profile"
    fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
