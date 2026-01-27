# Nebula Command

## Overview
Nebula Command is a creation engine for comprehensive homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming. It provides a unified solution for digital creators and homelab enthusiasts, streamlining content generation, distribution, and community engagement. The platform is optimized for distributed deployment across cloud and local infrastructure, aiming to be a central hub for digital creation and homelab operations.

## User Preferences
- **Development Workflow:** Edit locally → Push to GitHub → Pull on servers
- **Database:** Shared PostgreSQL (Neon in dev, self-hosted in prod)
- **Secrets:** .env file (never commit)

## System Architecture

### Core Services
- **Dashboard (Next.js 14):** Web interface for homelab management, Docker controls, SSH metrics, deployment pipelines, code editor, visual website designer, and Jarvis AI assistant.
- **Discord Bot (Node.js/React):** Customizable bot for community management with per-server identity and granular feature toggles.
- **Stream Bot (Node.js/React/Vite):** Multi-platform content posting across Twitch, YouTube, and Kick.
- **Nebula Agent (Node.js/Express):** Runs on Windows VM for health monitoring, command execution, model management, and service control.

### Cross-Service Integration and Deployment
Services share a PostgreSQL database and Redis for caching, communicating via webhooks and APIs. The system employs a three-tier distributed deployment model:
- **Ubuntu Host (Home)**: Windows 11 VM with GPU passthrough for AI services.
- **Linode (Cloud)**: Hosts the Dashboard, Discord bot, and Stream bot.
- **Tailscale**: Provides secure mesh networking between all nodes.

### Platform Architecture
A three-layer design (Experience, Control Plane, Execution Plane) supports:
- A Marketplace API for Docker packages.
- An Agent Orchestrator API for managing AI agents.
- Service Discovery facilitated by `service-map.yml`.
- A Creative Studio for AI content generation.

### AI Node Management
The system monitors service health, GPU statistics, and package versions on AI nodes. It includes APIs for Speech, Job Scheduling, Training, and Embeddings/RAG, with unified model management via the dashboard and a Windows Model Agent.

### Creative Engine
The Creative Studio (`/creative-studio`) supports:
- Text-to-image, Image-to-image, and Inpainting.
- ControlNet, Upscaling, and Face Swap features.
- A database-backed pipeline ensures job persistence.

### Jarvis AI Orchestrator
This multi-agent AI system manages a job queue and subagents, supporting local-first resource selection, progress tracking, and integration with OpenCode for autonomous code development.

### Key Features
- **OOTB Setup Wizard** (`/setup`): Guided configuration for environment, secrets, database, AI, and platform connections.
- **Command Center** (`/command-center`): Unified control across all environments.
- **Deploy Center** (`/deploy`): Remote deployment and verification.
- **Services Manager** (`/services`): Container and service management.
- **Secrets Manager** (`/secrets-manager`): Secure credential management.
- **Jarvis AI** (`/jarvis`): AI chat assistant with tool calling.
- **Creative Studio** (`/creative`): AI image generation with ComfyUI/SD.
- **AI Models** (`/ai-models`): Model marketplace and management.
- **Workflows** (`/workflows`): Multi-step AI automation.
- **Agent Builder** (`/agents`): Custom AI agent configuration.
- **Pipelines** (`/pipelines`): Deployment automation.
- **Bot Editor** (`/bot-editor`): Discord bot customization.
- **Servers** (`/servers`): Server monitoring and control.
- **Windows VM** (`/windows`): GPU server management.
- **Domains** (`/domains`): DNS and SSL management.
- **Marketplace** (`/marketplace`): Docker package installation.

## External Dependencies
- **PostgreSQL:** Primary relational database.
- **Redis:** Caching and session management.
- **OpenAI API:** Cloud-based AI services (fallback).
- **Discord API (discord.js):** Discord Bot functionality.
- **Twitch/YouTube/Kick APIs:** Stream Bot integration.
- **Spotify API:** Music bot features.
- **Plex API:** "Now Playing" status.
- **Home Assistant API:** Homelab automation.
- **Cloudflare API:** DNS management.
- **Tailscale:** Secure network connectivity.
- **Caddy:** Reverse proxy.
- **Ollama:** Local LLM inference.
- **Stable Diffusion/ComfyUI:** Local image generation.