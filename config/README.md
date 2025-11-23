# Configuration Management System

**SOPS + Age Encrypted Configuration for Multi-Host Deployment**

---

## 🎯 Overview

This configuration management system replaces the monolithic `.env` file with:

- **Encrypted secrets** using SOPS + Age (industry-standard tools)
- **Host-aware configuration** for multi-domain deployments
- **Environment separation** (dev, staging, production)
- **Template-based generation** using Jinja2
- **Validation** to catch misconfigurations before deployment

---

## 📁 Directory Structure

```
config/
├── keys/                    # Age encryption keys (NEVER commit)
│   ├── age-key.txt         # Private key (gitignored)
│   └── README.md           # Key management docs
├── secrets/                 # Encrypted secrets (commit only .enc.yaml)
│   ├── base.enc.yaml       # Base secrets (encrypted) ✓ commit
│   ├── base.yaml           # Unencrypted template (gitignored)
│   ├── dev.enc.yaml        # Dev overrides (optional)
│   └── prod.enc.yaml       # Prod overrides (optional)
├── templates/               # Jinja2 templates
│   ├── shared.env.j2       # Shared configuration
│   ├── dashboard.env.j2    # Dashboard-specific
│   ├── discord-bot.env.j2  # Discord bot
│   ├── stream-bot.env.j2   # Stream bot
│   └── postgres.env.j2     # PostgreSQL
├── overlays/                # Environment-specific configs
│   ├── dev.yaml            # Development (localhost)
│   ├── staging.yaml        # Staging environment
│   └── prod.yaml           # Production (parameterized by HOST)
└── scripts/
    ├── generate-config.py  # Config generator
    ├── validate-config.py  # Config validator
    └── encrypt-secrets.sh  # SOPS encryption helper

deployment/                  # Generated configs (gitignored)
├── dev/
│   └── localhost/
│       ├── .env            # Main config
│       ├── .env.dashboard
│       └── ...
├── prod/
│   ├── evindrake_net/
│   └── rig-city_com/
└── staging/

.sops.yaml                   # SOPS encryption rules
```

---

## 🚀 Quick Start

### 1. Generate Config for Development

```bash
# Using Makefile
make config ENV=dev HOST=localhost

# Or directly
python config/scripts/generate-config.py --env dev --host localhost

# Or via homelab script
./homelab config generate dev localhost
```

### 2. Generate Config for Production

```bash
# For evindrake.net
make config ENV=prod HOST=evindrake.net

# For rig-city.com  
make config ENV=prod HOST=rig-city.com
```

### 3. Validate Generated Config

```bash
make validate ENV=prod HOST=evindrake.net

# Or
python config/scripts/validate-config.py --env prod --host evindrake.net
```

### 4. Deploy Config

```bash
# Development (symlink)
ln -sf deployment/dev/localhost/.env .env

# Production (copy to server)
scp deployment/prod/evindrake_net/.env evin@host:/home/evin/contain/HomeLabHub/.env
```

---

## 📋 Migration from .env

### Step 1: Copy Your Secrets

1. Open your current `.env` file
2. Copy values to `config/secrets/base.yaml`:

```yaml
# Example mapping
postgres_password: YOUR_ACTUAL_PASSWORD      # from POSTGRES_PASSWORD
discord_db_password: YOUR_ACTUAL_PASSWORD    # from DISCORD_DB_PASSWORD
openai_api_key: sk-proj-YOUR_KEY             # from OPENAI_API_KEY
# ... etc
```

3. **IMPORTANT**: Replace all `CHANGE_ME` placeholders with actual values

### Step 2: Encrypt Secrets

```bash
./config/scripts/encrypt-secrets.sh
```

This will:
- Encrypt `base.yaml` → `base.enc.yaml`
- Delete unencrypted `base.yaml` (security)
- Only `base.enc.yaml` is committed to git

### Step 3: Generate Config

```bash
# Generate dev config
make config ENV=dev HOST=localhost

# Validate it
make validate ENV=dev HOST=localhost
```

### Step 4: Test

```bash
# Backup current .env
cp .env .env.backup

# Use generated config
ln -sf deployment/dev/localhost/.env .env

# Test your services
./homelab fix
./homelab health
```

### Step 5: Deploy to Production

```bash
# Generate production config
make config ENV=prod HOST=evindrake.net

# Validate
make validate ENV=prod HOST=evindrake.net

# Deploy to server
scp deployment/prod/evindrake_net/.env evin@host:/home/evin/contain/HomeLabHub/.env

# On server, restart services
ssh evin@host 'cd /home/evin/contain/HomeLabHub && ./homelab fix'
```

---

## 🔐 Security Best Practices

### Encryption Keys

**⚠️ CRITICAL: The private key (`config/keys/age-key.txt`) is the ONLY way to decrypt your secrets!**

1. **Backup the private key**:
   ```bash
   # Encrypt with GPG
   gpg -c config/keys/age-key.txt
   
   # Store encrypted backup in:
   # - Password manager (1Password, Bitwarden)
   # - Encrypted USB drive
   # - Secure cloud storage (encrypted before upload)
   ```

2. **Never commit private key to git** (already in .gitignore)

3. **Production deployment**: Store key in secure secrets manager, not in repository

### Secret Rotation

Rotate secrets periodically (recommended: every 90 days):

```bash
# 1. Edit encrypted secrets
export SOPS_AGE_KEY_FILE=config/keys/age-key.txt
sops config/secrets/base.enc.yaml

# 2. Update the secret values
# 3. Save (SOPS will re-encrypt)

# 4. Regenerate configs
make config ENV=prod HOST=evindrake.net

# 5. Deploy new config
```

### Key Rotation

If encryption key is compromised:

```bash
# 1. Generate new keypair
age-keygen -o config/keys/age-key-new.txt

# 2. Extract public key
grep "public key:" config/keys/age-key-new.txt

# 3. Update .sops.yaml with new public key

# 4. Re-encrypt all secrets
for file in config/secrets/*.enc.yaml; do
    sops -d "$file" > temp.yaml
    sops --encrypt temp.yaml > "$file"
    rm temp.yaml
done

# 5. Replace old key
mv config/keys/age-key-new.txt config/keys/age-key.txt

# 6. Securely delete old key
shred -uvz config/keys/age-key-old.txt
```

---

## 🛠️ Common Operations

### Adding a New Secret

1. **Decrypt secrets**:
   ```bash
   export SOPS_AGE_KEY_FILE=config/keys/age-key.txt
   sops config/secrets/base.enc.yaml
   ```

2. **Add the secret**:
   ```yaml
   new_api_key: your-new-secret-value
   ```

3. **Save** (SOPS auto-encrypts on save)

4. **Update templates** to use the new secret:
   ```jinja2
   NEW_API_KEY={{ secrets.new_api_key }}
   ```

5. **Regenerate configs**:
   ```bash
   make config ENV=dev HOST=localhost
   ```

### Adding a New Service

1. **Create template** `config/templates/myservice.env.j2`:
   ```jinja2
   # My Service Configuration
   DATABASE_URL={{ secrets.myservice_db_password }}@{{ config.postgres_host }}
   API_KEY={{ secrets.myservice_api_key }}
   ```

2. **Add to overlays** (`config/overlays/dev.yaml` and `prod.yaml`):
   ```yaml
   domains:
     myservice: myservice.${HOST}
   
   myservice_url: https://myservice.${HOST}
   ```

3. **Update generator** script to include new template (in `service_templates` dict)

4. **Regenerate**:
   ```bash
   make config ENV=dev HOST=localhost
   ```

### Multi-Host Deployment

Deploy to multiple domains:

```bash
# Primary domain
make config ENV=prod HOST=evindrake.net

# Secondary domain
make config ENV=prod HOST=rig-city.com

# Custom host
make config ENV=prod HOST=custom-domain.com
```

Each generates to `deployment/prod/<hostname>/`

---

## 🧪 Testing & Validation

### Validate All Generated Configs

```bash
# Validate dev
make validate ENV=dev HOST=localhost

# Validate production
make validate ENV=prod HOST=evindrake.net
```

### Check for Common Issues

The validator checks:
- ✅ All required variables present
- ✅ No placeholder values (`CHANGE_ME`, `YOUR_*`)
- ✅ Valid URL formats
- ✅ Database URL syntax
- ✅ Secret length requirements
- ✅ No plain-text passwords

### Manual Testing

```bash
# 1. Generate config
make config ENV=dev HOST=localhost

# 2. Check generated files
ls -la deployment/dev/localhost/

# 3. Inspect a config
cat deployment/dev/localhost/.env

# 4. Test with Docker Compose
docker compose --env-file deployment/dev/localhost/.env config
```

---

## 📚 Command Reference

### Makefile Commands

```bash
make config ENV=<env> HOST=<host>    # Generate configs
make validate ENV=<env> HOST=<host>  # Validate configs
make encrypt-secrets                 # Encrypt secret files
make clean-configs                   # Remove all generated configs
make install-deps                    # Install Python dependencies
make test                            # Test configuration system
```

### Homelab Script Commands

```bash
./homelab config generate <env> <host>   # Generate configs
./homelab config validate <env> <host>   # Validate configs
./homelab config encrypt                 # Encrypt secrets
```

### Direct Script Usage

```bash
# Generate
python config/scripts/generate-config.py --env prod --host evindrake.net

# Validate
python config/scripts/validate-config.py --env prod --host evindrake.net

# Encrypt
./config/scripts/encrypt-secrets.sh
```

---

## 🐛 Troubleshooting

### "Age private key not found"

```bash
# Generate new key
age-keygen -o config/keys/age-key.txt

# Or restore from backup
gpg -d config/keys/age-key.txt.gpg > config/keys/age-key.txt
chmod 600 config/keys/age-key.txt
```

### "Failed to decrypt secrets"

Check that `SOPS_AGE_KEY_FILE` points to correct key:
```bash
export SOPS_AGE_KEY_FILE=config/keys/age-key.txt
sops -d config/secrets/base.enc.yaml
```

### "Placeholder values found"

Edit secrets and replace `CHANGE_ME` values:
```bash
sops config/secrets/base.enc.yaml
# Update all CHANGE_ME values
# Save and exit
```

### "Missing required variable"

Check validation output for specific missing vars:
```bash
make validate ENV=prod HOST=evindrake.net
```

Add missing secrets to `base.enc.yaml`

### "Template not found"

Ensure all templates exist in `config/templates/`:
```bash
ls config/templates/
```

---

## 🔄 Workflow Examples

### Daily Development

```bash
# Make changes to code
git pull

# Need to update a secret?
sops config/secrets/base.enc.yaml  # Edit and save

# Regenerate config
make config ENV=dev HOST=localhost

# Restart services
./homelab fix
```

### Production Deployment

```bash
# 1. Update secrets if needed
sops config/secrets/base.enc.yaml

# 2. Generate production configs
make config ENV=prod HOST=evindrake.net

# 3. Validate
make validate ENV=prod HOST=evindrake.net

# 4. Commit encrypted secrets (if changed)
git add config/secrets/base.enc.yaml
git commit -m "Update production secrets"
git push

# 5. Deploy to server
scp deployment/prod/evindrake_net/.env evin@host:/home/evin/contain/HomeLabHub/.env
ssh evin@host 'cd /home/evin/contain/HomeLabHub && ./homelab fix'
```

### Adding a New Host

```bash
# 1. Generate config for new host
make config ENV=prod HOST=newhost.com

# 2. Validate
make validate ENV=prod HOST=newhost.com

# 3. Deploy
scp deployment/prod/newhost_com/.env user@newhost:/path/to/homelab/.env
```

---

## 📖 Additional Resources

- **SOPS Documentation**: https://github.com/mozilla/sops
- **Age Encryption**: https://age-encryption.org/
- **Jinja2 Templates**: https://jinja.palletsprojects.com/
- **12-Factor App Config**: https://12factor.net/config

---

## 🆘 Support

If you encounter issues:

1. Check this README for troubleshooting steps
2. Validate your config: `make validate ENV=<env> HOST=<host>`
3. Check generated files: `ls deployment/<env>/<host>/`
4. Verify secrets are encrypted: `file config/secrets/base.enc.yaml`
5. Test decryption: `sops -d config/secrets/base.enc.yaml`

---

**Last Updated**: 2025-11-23  
**Version**: 1.0.0
