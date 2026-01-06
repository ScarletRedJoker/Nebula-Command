# Nebula Command - Platform Architecture

## Vision

Nebula Command is a comprehensive development and automation platform designed for homelab enthusiasts who want full control over their infrastructure. Think Replit, but self-hosted, distributed, and optimized for general-purpose computing with local GPU acceleration.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXPERIENCE LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  Dashboard   │  │  IDE/Editor  │  │ Creative     │  │  Terminal    │    │
│  │  (Next.js)   │  │  (Monaco)    │  │ Studio       │  │  (xterm.js)  │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONTROL PLANE                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ API Gateway  │  │  Identity &  │  │  Workflow    │  │ Observability│    │
│  │  (Routing)   │  │  Secrets     │  │ Orchestrator │  │  (Metrics)   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  Resource    │  │ Marketplace  │  │   Agent      │  │ Remediation  │    │
│  │  Manager     │  │  Service     │  │ Orchestrator │  │   Engine     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXECUTION PLANE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────┐  ┌────────────────────────────────┐    │
│  │        LINODE (Cloud)          │  │     HOMELAB (Local GPU)        │    │
│  │  ┌──────────┐ ┌──────────┐    │  │  ┌──────────┐ ┌──────────┐    │    │
│  │  │Dashboard │ │ Discord  │    │  │  │  Ollama  │ │ Stable   │    │    │
│  │  │  Bot     │ │   Bot    │    │  │  │ (LLM)    │ │ Diffusion│    │    │
│  │  └──────────┘ └──────────┘    │  │  └──────────┘ └──────────┘    │    │
│  │  ┌──────────┐ ┌──────────┐    │  │  ┌──────────┐ ┌──────────┐    │    │
│  │  │ Stream   │ │ Postgres │    │  │  │   Plex   │ │  MinIO   │    │    │
│  │  │   Bot    │ │  Redis   │    │  │  │          │ │          │    │    │
│  │  └──────────┘ └──────────┘    │  │  └──────────┘ └──────────┘    │    │
│  └────────────────────────────────┘  └────────────────────────────────┘    │
│                         CONNECTED VIA TAILSCALE                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Services

### 1. API Gateway
Central routing and authentication layer for all platform services.

**Responsibilities:**
- Request routing to appropriate microservices
- JWT authentication and session management
- Rate limiting and throttling
- Request/response logging
- WebSocket connection management

**Technology:** Next.js API Routes + Middleware

### 2. Identity & Secrets
Secure identity and secrets management.

**Responsibilities:**
- User authentication (local, OAuth, SSO)
- API key management
- Secret encryption and rotation
- Service-to-service authentication
- Audit logging

**Technology:** PostgreSQL + AES-256 encryption

### 3. Resource Manager
Manages infrastructure resources including domains, DNS, and SSL.

**Responsibilities:**
- Domain registration and DNS management (Cloudflare API)
- SSL certificate provisioning (Let's Encrypt/Caddy)
- Reverse proxy configuration
- Network routing rules

**API:**
```typescript
POST /api/resources/domains       // Register/link domain
GET  /api/resources/domains       // List domains
POST /api/resources/dns           // Create DNS record
POST /api/resources/ssl           // Provision certificate
```

### 4. Marketplace Service
Docker container marketplace for one-click installations.

**Responsibilities:**
- Package catalog management
- Dependency resolution
- Installation orchestration
- Version management
- Health check integration

**Package Format:**
```yaml
# marketplace/packages/wordpress.yml
name: wordpress
version: 6.4.2
description: Popular CMS for websites and blogs
category: web
icon: https://example.com/wordpress.png
repository: docker.io/library/wordpress

compose:
  services:
    wordpress:
      image: wordpress:6.4-apache
      ports:
        - "${PORT:-8080}:80"
      environment:
        - WORDPRESS_DB_HOST=${DB_HOST}
        - WORDPRESS_DB_USER=${DB_USER}
        - WORDPRESS_DB_PASSWORD=${DB_PASSWORD}
      volumes:
        - wordpress_data:/var/www/html
    
    mysql:
      image: mysql:8.0
      environment:
        - MYSQL_ROOT_PASSWORD=${DB_PASSWORD}
        - MYSQL_DATABASE=wordpress
      volumes:
        - db_data:/var/lib/mysql

variables:
  - name: PORT
    description: HTTP port to expose
    default: "8080"
  - name: DB_PASSWORD
    description: MySQL root password
    required: true
    secret: true

health_checks:
  - name: web
    url: "http://localhost:${PORT}/"
    interval: 30s
    timeout: 10s

hooks:
  post_install:
    - echo "WordPress installed! Access at http://localhost:${PORT}"
```

### 5. Agent Orchestrator
AI agent management with function calling capabilities.

**Responsibilities:**
- Agent profile management (system prompts, tools, context)
- Function/tool registry
- Execution planning (ReAct pattern)
- Multi-model routing (OpenAI, Ollama, Anthropic)
- Guardrails and validation

**API:**
```typescript
POST /api/agents                  // Create agent profile
GET  /api/agents                  // List agents
POST /api/agents/:id/execute      // Execute agent task
GET  /api/agents/:id/history      // Get execution history

POST /api/functions               // Register function
GET  /api/functions               // List functions
POST /api/functions/:id/invoke    // Invoke function
```

**Agent Profile Schema:**
```typescript
interface AgentProfile {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: "gpt-4o" | "gpt-4o-mini" | "ollama:llama3.2" | "ollama:codellama";
  temperature: number;
  tools: string[];  // Function IDs
  context: {
    maxTokens: number;
    includeHistory: boolean;
  };
  guardrails: {
    maxExecutionTime: number;
    blockedPatterns: string[];
    requireApproval: boolean;
  };
}
```

### 6. Remediation Engine
Automatic troubleshooting and self-healing.

**Responsibilities:**
- Health monitoring and alerting
- Incident detection and classification
- Runbook execution
- Auto-recovery actions
- Incident timeline and audit

**Runbook Format:**
```yaml
# runbooks/restart-unhealthy-service.yml
name: restart-unhealthy-service
trigger:
  type: alert
  condition: "service.health == 'unhealthy' && service.restart_count < 3"

steps:
  - name: Log incident
    action: log
    params:
      level: warn
      message: "Service {{ service.name }} is unhealthy"
  
  - name: Attempt restart
    action: docker
    params:
      command: restart
      container: "{{ service.container_id }}"
  
  - name: Wait for health
    action: wait
    params:
      duration: 30s
  
  - name: Check health
    action: health_check
    params:
      url: "{{ service.health_endpoint }}"
      expected_status: 200
  
  - name: Notify on failure
    action: notify
    condition: "{{ steps.check_health.failed }}"
    params:
      channel: discord
      message: "Failed to recover {{ service.name }}"

escalation:
  after_failures: 3
  notify:
    - discord
    - email
```

### 7. Workflow Orchestrator
Long-running workflow and pipeline management.

**Responsibilities:**
- DAG-based workflow execution
- Step orchestration and retry logic
- Cron scheduling
- Event-driven triggers
- State persistence

**Technology Options:**
- Temporal (recommended for complex workflows)
- n8n (visual workflow builder)
- Custom implementation with Redis

### 8. IDE Workspace
Full-featured development environment.

**Responsibilities:**
- Multi-file project management
- Language server protocol (LSP) integration
- Build system execution
- Git integration
- Real-time collaboration

**Components:**
- Monaco Editor (already implemented)
- File tree navigator (already implemented)
- Terminal (already implemented)
- Git panel (new)
- Debug panel (new)

## Database Schema

### Core Tables

```sql
-- Projects and workspaces
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  git_url VARCHAR(500),
  language VARCHAR(50),
  framework VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Deployments
CREATE TABLE deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  environment VARCHAR(50) NOT NULL, -- 'development', 'staging', 'production'
  status VARCHAR(50) NOT NULL,      -- 'pending', 'building', 'deploying', 'live', 'failed'
  version VARCHAR(50),
  deployed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Marketplace packages
CREATE TABLE marketplace_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  icon_url VARCHAR(500),
  repository VARCHAR(500),
  version VARCHAR(50),
  manifest JSONB NOT NULL,        -- Full package definition
  downloads INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Package installations
CREATE TABLE installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID REFERENCES marketplace_packages(id),
  project_id UUID REFERENCES projects(id),
  status VARCHAR(50) NOT NULL,    -- 'installing', 'running', 'stopped', 'error'
  config JSONB,                   -- User-provided configuration
  container_ids TEXT[],           -- Docker container IDs
  installed_at TIMESTAMP DEFAULT NOW()
);

-- AI Agents
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  model VARCHAR(100) NOT NULL,
  temperature DECIMAL(3,2) DEFAULT 0.7,
  tools TEXT[],                   -- Function IDs
  config JSONB,                   -- Additional configuration
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Function registry
CREATE TABLE functions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  parameters JSONB NOT NULL,      -- JSON Schema for parameters
  implementation TEXT,            -- Code or endpoint URL
  implementation_type VARCHAR(50), -- 'code', 'http', 'docker'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent executions
CREATE TABLE agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),
  input TEXT NOT NULL,
  output TEXT,
  status VARCHAR(50) NOT NULL,    -- 'running', 'completed', 'failed'
  tokens_used INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Incidents for remediation
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name VARCHAR(255) NOT NULL,
  severity VARCHAR(50) NOT NULL,  -- 'info', 'warning', 'critical'
  status VARCHAR(50) NOT NULL,    -- 'open', 'acknowledged', 'resolved'
  title VARCHAR(500) NOT NULL,
  description TEXT,
  runbook_id VARCHAR(255),
  resolution TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

-- Runbook executions
CREATE TABLE runbook_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id),
  runbook_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  steps_completed INTEGER DEFAULT 0,
  steps_total INTEGER,
  output JSONB,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Domains and DNS
CREATE TABLE domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  provider VARCHAR(50),           -- 'cloudflare', 'route53', 'manual'
  zone_id VARCHAR(255),
  ssl_status VARCHAR(50),         -- 'pending', 'active', 'expired'
  ssl_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dns_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID REFERENCES domains(id),
  record_type VARCHAR(10) NOT NULL, -- 'A', 'AAAA', 'CNAME', 'TXT', 'MX'
  name VARCHAR(255) NOT NULL,
  content VARCHAR(500) NOT NULL,
  ttl INTEGER DEFAULT 3600,
  proxied BOOLEAN DEFAULT false,
  provider_id VARCHAR(255),       -- ID from DNS provider
  created_at TIMESTAMP DEFAULT NOW()
);
```

## API Design

### REST Endpoints

```
/api/v1/
├── auth/
│   ├── login              POST   - Authenticate user
│   ├── logout             POST   - End session
│   └── refresh            POST   - Refresh token
│
├── projects/
│   ├── /                  GET    - List projects
│   ├── /                  POST   - Create project
│   ├── /:id               GET    - Get project
│   ├── /:id               PUT    - Update project
│   ├── /:id               DELETE - Delete project
│   ├── /:id/files         GET    - List files
│   ├── /:id/files/*       GET    - Read file
│   ├── /:id/files/*       PUT    - Write file
│   └── /:id/deploy        POST   - Deploy project
│
├── marketplace/
│   ├── /packages          GET    - List packages
│   ├── /packages/:id      GET    - Get package details
│   ├── /install           POST   - Install package
│   ├── /installations     GET    - List installations
│   └── /installations/:id DELETE - Uninstall package
│
├── agents/
│   ├── /                  GET    - List agents
│   ├── /                  POST   - Create agent
│   ├── /:id               GET    - Get agent
│   ├── /:id               PUT    - Update agent
│   ├── /:id/execute       POST   - Execute agent
│   └── /:id/history       GET    - Execution history
│
├── functions/
│   ├── /                  GET    - List functions
│   ├── /                  POST   - Register function
│   ├── /:id               GET    - Get function
│   └── /:id/invoke        POST   - Invoke function
│
├── resources/
│   ├── /domains           GET    - List domains
│   ├── /domains           POST   - Add domain
│   ├── /domains/:id/dns   GET    - List DNS records
│   ├── /domains/:id/dns   POST   - Create DNS record
│   └── /domains/:id/ssl   POST   - Provision SSL
│
├── incidents/
│   ├── /                  GET    - List incidents
│   ├── /:id               GET    - Get incident
│   ├── /:id/acknowledge   POST   - Acknowledge incident
│   └── /:id/resolve       POST   - Resolve incident
│
└── ai/
    ├── /chat              POST   - Chat completion
    ├── /image             POST   - Generate image
    ├── /status            GET    - Provider status
    └── /diagnostics       GET    - Detailed diagnostics
```

## Implementation Phases

### Phase 1: Foundation (Weeks 1-6)
**Goal:** Solidify core infrastructure

- [ ] Formalize API Gateway with proper routing
- [ ] Implement secrets vault with encryption
- [ ] Create service registry backed by Postgres
- [ ] Deploy observability stack (Prometheus + Grafana)
- [ ] Document all infrastructure as code

### Phase 2: Automation Core (Weeks 6-12)
**Goal:** Enable automatic management

- [ ] Build Resource Manager (domains, DNS, SSL)
- [ ] Integrate Cloudflare API for DNS
- [ ] Create Remediation Engine MVP
- [ ] Implement basic runbook execution
- [ ] Add health check infrastructure

### Phase 3: Developer Experience (Weeks 12-20)
**Goal:** Full development environment

- [ ] IDE workspace management
- [ ] Multi-language build runners
- [ ] Git integration and GitHub apps
- [ ] Deployment pipelines
- [ ] Marketplace installer

### Phase 4: AI & Creative (Weeks 20-28)
**Goal:** Intelligent automation

- [ ] Agent Orchestrator with function registry
- [ ] Creative studio enhancements (image/video)
- [ ] Agent marketplace
- [ ] Advanced remediation with AI
- [ ] Team collaboration features

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14, React, Tailwind | Dashboard, IDE |
| API | Next.js API Routes | REST/WebSocket endpoints |
| Database | PostgreSQL (Neon) | Primary data store |
| Cache | Redis | Sessions, queues, cache |
| Container | Docker, Docker Compose | Service deployment |
| Networking | Tailscale, Caddy | Mesh network, reverse proxy |
| Observability | Prometheus, Grafana, Loki | Metrics, dashboards, logs |
| AI | OpenAI, Ollama | LLM, image generation |
| Storage | MinIO | Object storage |

## Security Considerations

1. **Authentication:** JWT with short expiry, refresh tokens in httpOnly cookies
2. **Secrets:** AES-256 encryption at rest, never logged
3. **Network:** Tailscale for service mesh, no public endpoints except Caddy
4. **Audit:** All mutations logged with user, timestamp, and diff
5. **Sandboxing:** Container isolation for user code execution
