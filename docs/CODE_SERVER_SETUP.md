# Code-Server (VS Code in Browser) Setup Guide

## Overview

Code-Server brings Visual Studio Code to your browser, allowing you to code anywhere with a consistent development environment. It's integrated into the HomeLabHub deployment system and provides secure, remote access to your entire `/home/evin/contain` directory.

## Features

### Pre-configured Settings
- **Git Integration**: Fully configured with autofetch and smart commits
- **Auto-save**: Files save automatically after 1 second delay
- **Format on Save**: Code formatting on save enabled
- **Bracket Pair Colorization**: Enhanced code readability
- **Terminal Integration**: Full terminal access with enhanced scrollback

### Recommended Extensions

The following extensions are pre-configured for installation:

#### Essential Development
- **Python**: Full Python language support with Pylance
- **ESLint & Prettier**: Code linting and formatting for JavaScript/TypeScript
- **Docker**: Docker and Docker Compose support
- **GitLens**: Advanced Git integration

#### Web Development
- **Tailwind CSS IntelliSense**: Autocomplete for Tailwind classes
- **Auto Rename Tag**: Automatically rename paired HTML tags
- **ES7 React/Redux Snippets**: React development snippets

#### Productivity
- **Path Intellisense**: Autocomplete for file paths
- **Todo Tree**: Highlight and organize TODOs in code
- **Error Lens**: Inline error highlighting
- **Code Spell Checker**: Catch typos in code

#### UI Enhancements
- **Material Icon Theme**: Better file icons
- **Indent Rainbow**: Visualize indentation levels

## Environment Variables

### Required Secret

Add the following to your `.env` file:

```bash
# ============================================
# Code-Server (VS Code in Browser)
# ============================================
CODE_SERVER_PASSWORD=your_secure_password_here
```

**Security Note**: Choose a strong password. This is the only authentication protecting your code-server instance.

**To generate a secure password:**
```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(24))'
```

## Accessing Code-Server

### URL
```
https://code.evindrake.net
```

### Login
When prompted, enter the password you set in `CODE_SERVER_PASSWORD`.

## File Access

Code-Server has access to the following directories:

### Projects Directory
- **Host Path**: `/home/evin/contain`
- **Container Path**: `/home/coder/projects`
- **Contains**: All your homelab services, configurations, and projects

### Configuration
- **Volume**: `code_server_data`
- **Contains**: VS Code settings, extensions, and workspace data

## Configuration Files

### Location
```
config/code-server/
├── settings.json       # VS Code settings
└── extensions.json     # Recommended extensions
```

### Customizing Settings

Edit `config/code-server/settings.json` to customize:
- Editor preferences (font size, theme, etc.)
- Language-specific settings
- Git configuration
- Terminal settings
- File exclusions

### Adding Extensions

Edit `config/code-server/extensions.json` to add more extension IDs:

```json
{
  "recommendations": [
    "publisher.extension-name"
  ]
}
```

## Docker Service Details

### Container Information
- **Image**: `codercom/code-server:latest`
- **Container Name**: `code-server`
- **Network**: `homelab`
- **Port**: `8080` (internal)
- **Restart Policy**: `unless-stopped`

### Resource Usage
- **User**: coder (UID: 1000, GID: 1000)
- **Timezone**: America/New_York
- **Healthcheck**: Checks `/healthz` endpoint every 30 seconds

## Deployment

### Initial Setup

1. **Add Environment Variable**
   ```bash
   # Edit .env file
   nano .env
   
   # Add:
   CODE_SERVER_PASSWORD=your_secure_password
   ```

2. **Start the Service**
   ```bash
   cd /home/evin/contain/HomeLabHub
   docker-compose -f docker-compose.unified.yml up -d code-server
   ```

3. **Verify Service**
   ```bash
   docker logs code-server
   docker ps | grep code-server
   ```

4. **Access Code-Server**
   - Navigate to: `https://code.evindrake.net`
   - Enter your password
   - Start coding!

### Updating

```bash
docker-compose -f docker-compose.unified.yml pull code-server
docker-compose -f docker-compose.unified.yml up -d code-server
```

## Security Features

### Caddy Configuration
- **Automatic SSL**: Let's Encrypt certificates managed by Caddy
- **HTTPS Only**: All traffic encrypted
- **WebSocket Support**: Required for VS Code features

### Security Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security`: HSTS enabled with preload

### Access Control
- Password-protected access
- No direct port exposure (proxied through Caddy)
- Session management with secure cookies

## Troubleshooting

### Cannot Access Code-Server

1. **Check service status**
   ```bash
   docker logs code-server
   ```

2. **Verify Caddy configuration**
   ```bash
   docker logs caddy | grep code.evindrake.net
   ```

3. **Test internal connectivity**
   ```bash
   docker exec -it caddy wget -O- http://code-server:8080/healthz
   ```

### Password Not Working

1. **Verify environment variable**
   ```bash
   docker exec code-server env | grep PASSWORD
   ```

2. **Restart service**
   ```bash
   docker-compose -f docker-compose.unified.yml restart code-server
   ```

### Extensions Not Installing

1. **Check internet connectivity**
   ```bash
   docker exec -it code-server ping -c 3 8.8.8.8
   ```

2. **Install manually**
   - Access Code-Server
   - Open Extensions panel (Ctrl+Shift+X)
   - Search and install extensions manually

### File Permission Issues

If you cannot edit files:

1. **Check volume mount**
   ```bash
   docker exec -it code-server ls -la /home/coder/projects
   ```

2. **Verify ownership** (should be 1000:1000)

## Best Practices

### File Organization
- Keep projects in `/home/coder/projects`
- Use workspace files (.code-workspace) for multi-root projects
- Exclude large directories (node_modules, venv) from search

### Performance
- Close unused editor tabs
- Disable unnecessary extensions
- Use the integrated terminal instead of external SSH

### Security
- Change CODE_SERVER_PASSWORD regularly
- Don't share your password
- Use strong, unique passwords
- Enable two-factor authentication on your domain registrar

## Advanced Configuration

### Custom Extensions Path

To persist extensions outside the container:

```yaml
volumes:
  - code_server_data:/home/coder/.config
  - /home/evin/contain:/home/coder/projects
  - ./config/code-server:/home/coder/.local/share/code-server
  - ./extensions:/home/coder/.local/share/code-server/extensions  # Add this
```

### Language-Specific Settings

Edit `config/code-server/settings.json`:

```json
{
  "[python]": {
    "editor.defaultFormatter": "ms-python.autopep8",
    "editor.formatOnSave": true
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

### Custom Themes

Install themes via extensions and update settings:

```json
{
  "workbench.colorTheme": "Material Theme Ocean High Contrast",
  "workbench.iconTheme": "material-icon-theme"
}
```

## Integration with Other Services

### Git Configuration

Configure Git inside Code-Server:

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### Docker Integration

Access Docker from within Code-Server:

```bash
# The Docker socket is not mounted by default for security
# If needed, add to docker-compose.unified.yml:
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

**Warning**: Mounting Docker socket gives root access to the host. Only enable if necessary.

### Python Virtual Environments

Create and use virtual environments:

```bash
cd /home/coder/projects/your-project
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Monitoring

### Health Checks

The service includes a healthcheck endpoint:

```bash
curl https://code.evindrake.net/healthz
```

### Logs

Monitor service logs:

```bash
# Real-time logs
docker logs -f code-server

# Last 100 lines
docker logs --tail 100 code-server
```

## Support

### Documentation
- Code-Server Docs: https://coder.com/docs/code-server
- VS Code Docs: https://code.visualstudio.com/docs

### Common Issues
- See Troubleshooting section above
- Check Docker logs for errors
- Verify network connectivity

### Community
- Code-Server GitHub: https://github.com/coder/code-server
- VS Code Extension Marketplace: https://marketplace.visualstudio.com/

---

**Last Updated**: November 14, 2025
**Version**: 1.0.0
