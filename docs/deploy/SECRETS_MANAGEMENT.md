# Centralized Secrets Management Guide

This guide covers options for managing secrets across the Nebula Command Dashboard infrastructure.

## Current Approach

Secrets are currently stored in a `.env` file at the project root:
- `/home/evin/contain/HomeLabHub/.env`
- Never committed to git (in `.gitignore`)
- Must be manually synced between environments

## Recommended Options

### Option 1: Doppler (Recommended for Teams)

Doppler is a secrets management platform that syncs secrets across environments.

#### Setup
```bash
# Install Doppler CLI
curl -Ls https://cli.doppler.com/install.sh | sh

# Login
doppler login

# Create project
doppler projects create homelab

# Import existing secrets
doppler secrets upload --project homelab --config dev .env
```

#### Usage
```bash
# Run command with secrets injected
doppler run -- docker-compose up -d

# Or generate .env file
doppler secrets download --no-file --format env > .env
```

#### Integration with Docker Compose
```yaml
services:
  dashboard:
    environment:
      - DOPPLER_TOKEN=${DOPPLER_TOKEN}
    entrypoint: ["doppler", "run", "--"]
    command: ["python", "main.py"]
```

### Option 2: HashiCorp Vault (Self-Hosted)

For complete control, run Vault in your homelab.

#### Deploy Vault
```yaml
# Add to docker-compose.yml
vault:
  image: hashicorp/vault:latest
  container_name: homelab-vault
  cap_add:
    - IPC_LOCK
  environment:
    - VAULT_ADDR=http://0.0.0.0:8200
  volumes:
    - vault_data:/vault/file
  ports:
    - "8200:8200"
  command: server -dev
```

#### Store Secrets
```bash
# Initialize Vault
export VAULT_ADDR='http://localhost:8200'

# Create secrets
vault kv put secret/homelab \
  POSTGRES_PASSWORD=xxx \
  MINIO_ROOT_PASSWORD=xxx \
  JWT_SECRET_KEY=xxx
```

#### Retrieve in Application
```python
import hvac

client = hvac.Client(url='http://vault:8200')
secret = client.secrets.kv.v2.read_secret_version(path='homelab')
postgres_password = secret['data']['data']['POSTGRES_PASSWORD']
```

### Option 3: SOPS + Age (Git-Friendly)

Encrypt secrets in git using SOPS with Age encryption.

#### Setup
```bash
# Install SOPS and Age
sudo apt install sops
brew install age  # or download from GitHub

# Generate Age key
age-keygen -o ~/.config/sops/age/keys.txt

# Get public key
cat ~/.config/sops/age/keys.txt | grep "public key"
```

#### Create Encrypted Secrets File
```bash
# Create .sops.yaml configuration
cat > .sops.yaml << EOF
creation_rules:
  - path_regex: secrets\.yaml$
    age: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EOF

# Create secrets file
cat > secrets.yaml << EOF
postgres_password: your-password
minio_password: your-password
jwt_secret: your-secret
EOF

# Encrypt
sops -e -i secrets.yaml
```

#### Decrypt in CI/CD
```bash
# Export Age key
export SOPS_AGE_KEY=$(cat ~/.config/sops/age/keys.txt)

# Decrypt
sops -d secrets.yaml > .env
```

### Option 4: GitHub Secrets (CI/CD Only)

For GitHub Actions deployments.

#### Store Secrets
1. Go to GitHub repo → Settings → Secrets → Actions
2. Add secrets: `POSTGRES_PASSWORD`, `MINIO_PASSWORD`, etc.

#### Use in Workflow
```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy
        env:
          POSTGRES_PASSWORD: ${{ secrets.POSTGRES_PASSWORD }}
          MINIO_PASSWORD: ${{ secrets.MINIO_PASSWORD }}
        run: |
          ssh ${{ secrets.DEPLOY_HOST }} "cd /opt/homelab && ./deploy.sh"
```

## Implementation: Simple Secrets Script

For a quick solution, use this script to manage secrets:

### Create Secrets Manager Script

```bash
#!/bin/bash
# scripts/secrets-manager.sh

SECRETS_DIR="${HOME}/.homelab-secrets"
SECRETS_FILE="${SECRETS_DIR}/secrets.enc"
AGE_KEY="${SECRETS_DIR}/age-key.txt"

init() {
    mkdir -p "$SECRETS_DIR"
    chmod 700 "$SECRETS_DIR"
    
    if [ ! -f "$AGE_KEY" ]; then
        echo "Generating new Age encryption key..."
        age-keygen -o "$AGE_KEY"
        chmod 600 "$AGE_KEY"
        echo "Key saved to: $AGE_KEY"
        echo "BACKUP THIS KEY! If lost, secrets cannot be recovered."
    fi
}

encrypt() {
    local input_file="${1:-.env}"
    
    if [ ! -f "$input_file" ]; then
        echo "Error: $input_file not found"
        exit 1
    fi
    
    local pubkey=$(grep "public key" "$AGE_KEY" | awk '{print $NF}')
    age -r "$pubkey" -o "$SECRETS_FILE" "$input_file"
    echo "Encrypted $input_file -> $SECRETS_FILE"
}

decrypt() {
    local output_file="${1:-.env}"
    
    if [ ! -f "$SECRETS_FILE" ]; then
        echo "Error: No encrypted secrets found"
        exit 1
    fi
    
    age -d -i "$AGE_KEY" -o "$output_file" "$SECRETS_FILE"
    chmod 600 "$output_file"
    echo "Decrypted $SECRETS_FILE -> $output_file"
}

sync_to_server() {
    local server="$1"
    local dest_path="${2:-/opt/homelab/HomeLabHub}"
    
    scp "$SECRETS_FILE" "${server}:${dest_path}/.secrets.enc"
    ssh "$server" "cd $dest_path && ./scripts/secrets-manager.sh decrypt"
}

case "$1" in
    init) init ;;
    encrypt) encrypt "$2" ;;
    decrypt) decrypt "$2" ;;
    sync) sync_to_server "$2" "$3" ;;
    *)
        echo "Usage: $0 {init|encrypt|decrypt|sync}"
        echo ""
        echo "Commands:"
        echo "  init              Initialize encryption key"
        echo "  encrypt [file]    Encrypt .env file (default: .env)"
        echo "  decrypt [file]    Decrypt to .env file (default: .env)"
        echo "  sync <host> [path] Sync secrets to remote server"
        ;;
esac
```

### Usage
```bash
# First time setup
./scripts/secrets-manager.sh init

# Encrypt current .env
./scripts/secrets-manager.sh encrypt

# Decrypt on new machine
./scripts/secrets-manager.sh decrypt

# Sync to production server
./scripts/secrets-manager.sh sync evin@host.evindrake.net /opt/homelab/HomeLabHub
```

## Environment Variables Reference

### Required Secrets
| Variable | Description | Used By |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | PostgreSQL admin password | Database |
| `MINIO_ROOT_PASSWORD` | MinIO admin password | Object storage |
| `JWT_SECRET_KEY` | JWT signing key | Dashboard auth |
| `DASHBOARD_API_KEY` | API authentication | External integrations |
| `DISCORD_BOT_TOKEN` | Discord bot token | Discord bot |
| `DISCORD_CLIENT_SECRET` | OAuth client secret | Discord OAuth |
| `TWITCH_CLIENT_SECRET` | Twitch API secret | Stream bot |
| `OPENAI_API_KEY` | OpenAI API key | Jarvis AI |
| `CLOUDFLARE_API_TOKEN` | Cloudflare DNS token | DNS management |

### Non-Secret Configuration
| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://...` |
| `MINIO_ENDPOINT` | MinIO server | `minio:9000` |
| `FLASK_ENV` | Environment | `production` |
| `TZ` | Timezone | `America/New_York` |

## Best Practices

1. **Never commit secrets to git** - Always use `.gitignore`
2. **Rotate secrets regularly** - Especially API keys and tokens
3. **Use different secrets per environment** - Dev vs Production
4. **Backup encryption keys securely** - Store offline or in password manager
5. **Audit secret access** - Know who has access to what
6. **Use least privilege** - Only grant necessary permissions

## Quick Start Recommendation

For the Nebula homelab, the recommended approach is:

1. **Development**: Keep using `.env` file locally
2. **Production Sync**: Use the simple secrets script above
3. **Future**: Consider Doppler for easier team collaboration

```bash
# Install Age for encryption
sudo apt install age

# Create and save the secrets manager script
mkdir -p scripts
# (copy script content above to scripts/secrets-manager.sh)
chmod +x scripts/secrets-manager.sh

# Initialize and encrypt
./scripts/secrets-manager.sh init
./scripts/secrets-manager.sh encrypt

# Sync to production
./scripts/secrets-manager.sh sync evin@host.evindrake.net
```
