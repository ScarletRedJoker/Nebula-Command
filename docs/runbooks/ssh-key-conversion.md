# SSH Key Conversion Runbook

## Overview
This runbook covers converting SSH keys between OpenSSH and PEM formats, which is required for compatibility with Node.js `ssh2` library and other tools.

---

## Quick Reference

### The Problem
Modern SSH keys (OpenSSH format) look like:
```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAA...
-----END OPENSSH PRIVATE KEY-----
```

The `ssh2` Node.js library (used by the dashboard) requires PEM format:
```
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA...
-----END RSA PRIVATE KEY-----
```

---

## Conversion Commands

### Convert OpenSSH to PEM (RSA)

```bash
# Convert existing OpenSSH key to PEM format
ssh-keygen -p -m PEM -f ~/.ssh/homelab

# This will:
# 1. Prompt for current passphrase (if any)
# 2. Prompt for new passphrase (leave empty for no passphrase)
# 3. Overwrite the key file in-place with PEM format
```

### Convert Without Modifying Original

```bash
# Create a PEM copy without modifying original
cp ~/.ssh/homelab ~/.ssh/homelab.bak
ssh-keygen -p -m PEM -f ~/.ssh/homelab

# Or create a new PEM file
openssl rsa -in ~/.ssh/homelab -out ~/.ssh/homelab.pem
```

### Generate New Key in PEM Format

```bash
# Generate new RSA key directly in PEM format
ssh-keygen -t rsa -b 4096 -m PEM -f ~/.ssh/homelab -N ""

# The -m PEM flag ensures PEM format
# -N "" sets empty passphrase
```

### Verify Key Format

```bash
# Check key format
head -1 ~/.ssh/homelab

# OpenSSH format shows:
# -----BEGIN OPENSSH PRIVATE KEY-----

# PEM/RSA format shows:
# -----BEGIN RSA PRIVATE KEY-----
```

---

## Update Replit Secrets

### Option 1: Using Replit UI

1. Open your Replit project
2. Go to **Tools** → **Secrets**
3. Find or create `SSH_PRIVATE_KEY`
4. Paste the entire contents of your PEM key:

```bash
# Copy key content to clipboard (macOS)
cat ~/.ssh/homelab | pbcopy

# Copy key content to clipboard (Linux)
cat ~/.ssh/homelab | xclip -selection clipboard

# Or just display it
cat ~/.ssh/homelab
```

### Option 2: Base64 Encoding (Safer)

If the key has special characters:

```bash
# Encode key as base64
cat ~/.ssh/homelab | base64 -w0

# In your code, decode before use:
const key = Buffer.from(process.env.SSH_PRIVATE_KEY_B64, 'base64');
```

### Verify Secret Is Set

In Replit shell:
```bash
# Check if secret exists (don't print the actual key!)
echo ${SSH_PRIVATE_KEY:0:50}...
```

---

## Test SSH Connection

### From Command Line

```bash
# Test SSH to Linode
ssh -i ~/.ssh/homelab -o StrictHostKeyChecking=no root@linode.evindrake.net "echo 'SSH OK'"

# Test SSH to Home Server
ssh -i ~/.ssh/homelab -o StrictHostKeyChecking=no evin@host.evindrake.net "echo 'SSH OK'"
```

### From Node.js

```javascript
const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection successful!');
  conn.exec('uptime', (err, stream) => {
    if (err) throw err;
    stream.on('data', (data) => console.log('STDOUT:', data.toString()));
    stream.on('close', () => conn.end());
  });
}).on('error', (err) => {
  console.error('SSH connection failed:', err.message);
}).connect({
  host: 'linode.evindrake.net',
  port: 22,
  username: 'root',
  privateKey: process.env.SSH_PRIVATE_KEY,
});
```

### Test API Endpoint

```bash
# Test the servers API endpoint
curl -s https://dash.evindrake.net/api/servers | jq '.servers[].status'
```

---

## Automation Script

Use the provided script at `scripts/convert-ssh-key.sh`:

```bash
# Make executable
chmod +x scripts/convert-ssh-key.sh

# Run conversion
./scripts/convert-ssh-key.sh ~/.ssh/homelab
```

---

## Troubleshooting

### Error: "Unsupported key format"

**Cause**: Key is in OpenSSH format, not PEM

**Fix**:
```bash
ssh-keygen -p -m PEM -f ~/.ssh/homelab
```

### Error: "Invalid key" after conversion

**Cause**: Key may have been corrupted or has passphrase

**Fix**:
```bash
# Remove passphrase during conversion
ssh-keygen -p -m PEM -f ~/.ssh/homelab -N ""

# Verify key is valid
ssh-keygen -y -f ~/.ssh/homelab  # Should print public key
```

### Error: "Permission denied (publickey)"

**Cause**: Public key not on remote server

**Fix**:
```bash
# Copy public key to server
ssh-copy-id -i ~/.ssh/homelab root@linode.evindrake.net

# Or manually add to authorized_keys
cat ~/.ssh/homelab.pub | ssh root@linode.evindrake.net "cat >> ~/.ssh/authorized_keys"
```

### Newlines in Environment Variable

**Cause**: Key wasn't properly pasted into Replit secrets

**Fix**:
- Ensure you copy the ENTIRE key including headers
- In Replit secrets, the key should include:
  ```
  -----BEGIN RSA PRIVATE KEY-----
  [base64 content on multiple lines]
  -----END RSA PRIVATE KEY-----
  ```

### Key Works in CLI but Not in Code

**Cause**: Environment variable formatting issues

**Debug**:
```javascript
// Debug key format
const key = process.env.SSH_PRIVATE_KEY;
console.log('Key starts with:', key?.substring(0, 50));
console.log('Key ends with:', key?.substring(key.length - 50));
console.log('Key length:', key?.length);
console.log('Has newlines:', key?.includes('\n'));
```

---

## Key Format Comparison

| Format | Header | Compatible With |
|--------|--------|-----------------|
| OpenSSH | `-----BEGIN OPENSSH PRIVATE KEY-----` | OpenSSH 7.8+, modern ssh clients |
| PEM/RSA | `-----BEGIN RSA PRIVATE KEY-----` | ssh2 (Node.js), older tools |
| PKCS#8 | `-----BEGIN PRIVATE KEY-----` | Most modern libraries |

---

## Security Notes

1. **Never commit private keys to git**
   ```bash
   # Add to .gitignore
   echo "*.pem" >> .gitignore
   echo "*_rsa" >> .gitignore
   ```

2. **Use restrictive permissions**
   ```bash
   chmod 600 ~/.ssh/homelab
   chmod 700 ~/.ssh
   ```

3. **Rotate keys periodically**
   ```bash
   # Generate new key
   ssh-keygen -t rsa -b 4096 -m PEM -f ~/.ssh/homelab_new -N ""
   
   # Copy to servers
   ssh-copy-id -i ~/.ssh/homelab_new root@linode.evindrake.net
   
   # Update secrets
   # Then remove old key from authorized_keys
   ```

4. **Use ssh-agent for local development**
   ```bash
   eval $(ssh-agent)
   ssh-add ~/.ssh/homelab
   ```

---

## Quick Verification Checklist

- [ ] Key file starts with `-----BEGIN RSA PRIVATE KEY-----`
- [ ] Key has no passphrase (or code handles passphrase)
- [ ] File permissions are 600
- [ ] Public key is on remote servers
- [ ] Replit secret `SSH_PRIVATE_KEY` is set
- [ ] Test SSH connection works from dashboard

---

## Related Files

- Key conversion script: `scripts/convert-ssh-key.sh`
- SSH key handler: `services/dashboard-next/lib/ssh-key-converter.ts`
- Server config: `services/dashboard-next/lib/server-config-store.ts`
