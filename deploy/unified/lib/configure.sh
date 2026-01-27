#!/bin/bash
# Nebula Command - Configuration Generator (Linux)
# Generates per-node configuration based on hardware profile

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="${SCRIPT_DIR}/../templates"
STATE_DIR="${SCRIPT_DIR}/../state"

generate_env_file() {
    local profile_file="$1"
    local output_dir="$2"
    local dashboard_url="${3:-}"
    
    local node_id
    node_id=$(jq -r '.node_id' "$profile_file")
    local platform
    platform=$(jq -r '.platform' "$profile_file")
    local primary_ip
    primary_ip=$(jq -r '.network.primary_ip' "$profile_file")
    local tailscale_ip
    tailscale_ip=$(jq -r '.network.tailscale_ip // empty' "$profile_file")
    local has_gpu
    has_gpu=$(jq -r '.capabilities.has_gpu' "$profile_file")
    local vram_mb
    vram_mb=$(jq -r '.capabilities.vram_mb' "$profile_file")
    local gpu_vendor
    gpu_vendor=$(jq -r '.gpu.vendor' "$profile_file")
    local cuda_version
    cuda_version=$(jq -r '.gpu.cuda_version // empty' "$profile_file")
    
    local advertise_ip="${tailscale_ip:-$primary_ip}"
    
    mkdir -p "$output_dir"
    
    cat > "$output_dir/.env" << EOF
# Nebula Command Node Configuration
# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Node ID: $node_id

# Node Identity
NODE_ID=$node_id
NODE_PLATFORM=$platform
NODE_IP=$advertise_ip
WINDOWS_VM_TAILSCALE_IP=$advertise_ip

# Dashboard Connection
DASHBOARD_URL=${dashboard_url:-http://localhost:5000}

# AI Service URLs (auto-configured based on hardware)
OLLAMA_URL=http://${advertise_ip}:11434
STABLE_DIFFUSION_URL=http://${advertise_ip}:7860
COMFYUI_URL=http://${advertise_ip}:8188

# Hardware Capabilities
HAS_GPU=$has_gpu
GPU_VENDOR=$gpu_vendor
VRAM_MB=$vram_mb
CUDA_VERSION=$cuda_version

# Service Ports
OLLAMA_PORT=11434
COMFYUI_PORT=8188
SD_PORT=7860

# Logging
LOG_LEVEL=info
AI_LOG_LEVEL=info
EOF

    if [[ "$has_gpu" == "true" ]] && [[ "$gpu_vendor" == "nvidia" ]]; then
        cat >> "$output_dir/.env" << EOF

# NVIDIA GPU Settings
CUDA_VISIBLE_DEVICES=all
NVIDIA_VISIBLE_DEVICES=all
EOF
    fi
    
    if [[ "$has_gpu" == "true" ]] && [[ "$gpu_vendor" == "amd" ]]; then
        cat >> "$output_dir/.env" << EOF

# AMD GPU Settings
HSA_OVERRIDE_GFX_VERSION=10.3.0
ROCm_PATH=/opt/rocm
EOF
    fi
    
    echo "[Configure] Generated .env file at: $output_dir/.env"
}

generate_service_config() {
    local profile_file="$1"
    local output_dir="$2"
    local service="$3"
    
    local node_id
    node_id=$(jq -r '.node_id' "$profile_file")
    local has_gpu
    has_gpu=$(jq -r '.capabilities.has_gpu' "$profile_file")
    local vram_mb
    vram_mb=$(jq -r '.capabilities.vram_mb' "$profile_file")
    local ram_mb
    ram_mb=$(jq -r '.ram_mb' "$profile_file")
    local gpu_vendor
    gpu_vendor=$(jq -r '.gpu.vendor' "$profile_file")
    
    mkdir -p "$output_dir"
    
    case "$service" in
        ollama)
            cat > "$output_dir/ollama.conf" << EOF
# Ollama Configuration - Node: $node_id
OLLAMA_HOST=0.0.0.0:11434
OLLAMA_ORIGINS=*
OLLAMA_KEEP_ALIVE=5m
EOF
            
            if [[ "$has_gpu" == "true" ]]; then
                if [[ "$vram_mb" -ge 8000 ]]; then
                    echo "OLLAMA_NUM_GPU=99" >> "$output_dir/ollama.conf"
                else
                    echo "OLLAMA_NUM_GPU=1" >> "$output_dir/ollama.conf"
                fi
            else
                echo "OLLAMA_NUM_GPU=0" >> "$output_dir/ollama.conf"
            fi
            
            echo "[Configure] Generated ollama.conf"
            ;;
            
        comfyui)
            local extra_args=""
            
            if [[ "$has_gpu" != "true" ]]; then
                extra_args="--cpu"
            elif [[ "$gpu_vendor" == "amd" ]]; then
                extra_args="--directml"
            elif [[ "$vram_mb" -lt 6000 ]]; then
                extra_args="--lowvram"
            elif [[ "$vram_mb" -lt 8000 ]]; then
                extra_args="--normalvram"
            else
                extra_args="--highvram"
            fi
            
            cat > "$output_dir/comfyui.conf" << EOF
# ComfyUI Configuration - Node: $node_id
COMFYUI_PORT=8188
COMFYUI_LISTEN=0.0.0.0
COMFYUI_EXTRA_ARGS=$extra_args
EOF
            echo "[Configure] Generated comfyui.conf"
            ;;
            
        sd)
            local extra_args=""
            
            if [[ "$has_gpu" != "true" ]]; then
                extra_args="--skip-torch-cuda-test --use-cpu all --no-half"
            elif [[ "$vram_mb" -lt 4000 ]]; then
                extra_args="--lowvram --opt-sub-quad-attention"
            elif [[ "$vram_mb" -lt 6000 ]]; then
                extra_args="--medvram --opt-sdp-attention"
            else
                extra_args="--xformers"
            fi
            
            cat > "$output_dir/sd.conf" << EOF
# Stable Diffusion Configuration - Node: $node_id
SD_WEBUI_PORT=7860
SD_WEBUI_LISTEN=0.0.0.0
SD_WEBUI_EXTRA_ARGS=$extra_args
SD_WEBUI_API=true
EOF
            echo "[Configure] Generated sd.conf"
            ;;
            
        *)
            echo "[Configure] Unknown service: $service"
            return 1
            ;;
    esac
}

generate_services_manifest() {
    local profile_file="$1"
    local output_dir="$2"
    
    local node_id
    node_id=$(jq -r '.node_id' "$profile_file")
    local can_run_llm
    can_run_llm=$(jq -r '.capabilities.can_run_llm' "$profile_file")
    local can_run_sd
    can_run_sd=$(jq -r '.capabilities.can_run_sd' "$profile_file")
    local can_run_comfyui
    can_run_comfyui=$(jq -r '.capabilities.can_run_comfyui' "$profile_file")
    
    local services="[]"
    
    if [[ "$can_run_llm" == "true" ]]; then
        services=$(echo "$services" | jq '. += [{"name":"ollama","enabled":true,"port":11434}]')
    fi
    
    if [[ "$can_run_sd" == "true" ]]; then
        services=$(echo "$services" | jq '. += [{"name":"stable-diffusion","enabled":true,"port":7860}]')
    fi
    
    if [[ "$can_run_comfyui" == "true" ]]; then
        services=$(echo "$services" | jq '. += [{"name":"comfyui","enabled":true,"port":8188}]')
    fi
    
    local manifest="{
  \"node_id\": \"$node_id\",
  \"generated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"services\": $services
}"
    
    echo "$manifest" > "$output_dir/services.json"
    echo "[Configure] Generated services.json"
}

main() {
    local profile_file="$1"
    local output_dir="${2:-$STATE_DIR}"
    local dashboard_url="${3:-}"
    
    if [[ -z "$profile_file" ]] || [[ ! -f "$profile_file" ]]; then
        echo "Error: Profile file required"
        echo "Usage: $0 <profile.json> [output_dir] [dashboard_url]"
        exit 1
    fi
    
    local node_id
    node_id=$(jq -r '.node_id' "$profile_file")
    local node_dir="$output_dir/$node_id"
    
    mkdir -p "$node_dir"
    
    cp "$profile_file" "$node_dir/hardware-profile.json"
    
    generate_env_file "$profile_file" "$node_dir" "$dashboard_url"
    
    generate_service_config "$profile_file" "$node_dir" "ollama"
    generate_service_config "$profile_file" "$node_dir" "comfyui"
    generate_service_config "$profile_file" "$node_dir" "sd"
    
    generate_services_manifest "$profile_file" "$node_dir"
    
    echo "[Configure] Configuration complete for node: $node_id"
    echo "[Configure] Output directory: $node_dir"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
