# Nebula Command - Marketplace Packages

This directory contains pre-built Docker container packages that can be installed with one click through the Nebula Command dashboard.

## Package Format

Each package is defined as a YAML file with the following structure:

```yaml
name: package-name           # Unique identifier (lowercase, hyphens)
version: 1.0.0               # Semantic version
displayName: Package Name    # Human-readable name
description: |               # Markdown description
  What this package does...
category: web|database|ai|media|tools|monitoring
icon: https://...            # URL to icon image
repository: docker.io/...    # Base Docker image

compose:
  services:
    main:
      image: ...
      ports:
        - "${PORT:-8080}:80"
      environment:
        - KEY=${VALUE}
      volumes:
        - data:/path

variables:
  - name: PORT
    description: Port to expose
    default: "8080"
  - name: PASSWORD
    description: Admin password
    required: true
    secret: true             # Will be stored encrypted

health_checks:
  - name: web
    url: "http://localhost:${PORT}/"
    interval: 30s

hooks:
  post_install:
    - echo "Installation complete!"
  pre_uninstall:
    - echo "Backing up data..."
```

## Available Categories

- **web** - Web applications, CMS, static sites
- **database** - Databases, caches, data stores
- **ai** - AI/ML tools, model servers
- **media** - Media servers, streaming, editing
- **tools** - Developer tools, utilities
- **monitoring** - Metrics, logging, observability

## Contributing

1. Create a new YAML file in this directory
2. Follow the package format above
3. Test locally with `docker compose up`
4. Submit a pull request

## Built-in Packages

| Package | Category | Description |
|---------|----------|-------------|
| wordpress | web | Popular CMS |
| ghost | web | Modern publishing platform |
| postgres | database | PostgreSQL database |
| redis | database | In-memory data store |
| ollama | ai | Local LLM server |
| stable-diffusion | ai | Image generation |
| plex | media | Media server |
| grafana | monitoring | Metrics dashboards |
| prometheus | monitoring | Metrics collection |
| uptime-kuma | monitoring | Uptime monitoring |
| code-server | tools | VS Code in browser |
| n8n | tools | Workflow automation |
