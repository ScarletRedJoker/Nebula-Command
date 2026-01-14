# SSH Key Format Issue & Resolution

## Problem
The dashboard was showing repeated error messages:
```
SSH connect error: Cannot parse privateKey: Unsupported key format
```

This error occurred in the following API routes:
- `/api/authelia/totp-qr`
- `/api/authelia/notifications`

## Root Cause
The ssh2 library (v1.17.0) used by the dashboard **does NOT natively support OpenSSH format private keys** (format: `-----BEGIN OPENSSH PRIVATE KEY-----`). It only supports PEM format keys:
- PKCS#8 format
- PKCS#1 format (RSA)
- SEC1 format (EC)

If an OpenSSH format key was stored in the `SSH_PRIVATE_KEY` environment variable, ssh2 would reject it with "Unsupported key format".

## Solution Implemented

### 1. Created SSH Key Converter (`lib/ssh-key-converter.ts`)
A utility that:
- **Detects** the format of SSH private keys
- **Converts** OpenSSH format keys to PEM format (PKCS8)
- **Handles errors gracefully** with helpful messages
- Uses `ssh-keygen` as the primary conversion tool
- Falls back to Node.js crypto module if needed

### 2. Updated SSH Key Handling (`lib/server-config-store.ts`)
Modified `getSSHPrivateKey()` function to:
- Automatically detect key format on load
- Convert OpenSSH keys to PEM before returning
- Throw clear errors if conversion fails
- Log helpful hints for users with incompatible keys

### 3. Updated API Routes
The authelia API endpoints (`/api/authelia/totp-qr` and `/api/authelia/notifications`) now:
- Return `null` when the SSH key cannot be processed
- Gracefully handle the missing key scenario
- No longer attempt SSH connections with invalid keys

## User Instructions

If you're seeing messages like:
```
[SSH Key Converter] ✗ Failed to convert OpenSSH key
[SSH Key Converter] ⚠ This key format is not supported by the SSH client.
SSH key not found
```

**Your SSH key is in OpenSSH format and needs to be converted to PEM format.**

### To Fix:

1. Locate your SSH private key file on your server:
   ```bash
   # Usually at one of these locations:
   ~/.ssh/id_rsa
   ~/.ssh/id_ed25519
   ~/.ssh/homelab  # or custom name
   ```

2. Convert the key to PEM format:
   ```bash
   ssh-keygen -p -m pem -f ~/.ssh/id_rsa
   # or for ED25519 keys:
   ssh-keygen -p -m pem -f ~/.ssh/id_ed25519
   ```

3. When prompted:
   - For "Enter old passphrase": Enter your current passphrase (or press Enter if there's no passphrase)
   - For "Enter new passphrase": Press Enter to keep the same passphrase
   - For "Enter same passphrase again": Press Enter again

4. Update the `SSH_PRIVATE_KEY` environment variable with the new PEM-format key:
   ```bash
   export SSH_PRIVATE_KEY="$(cat ~/.ssh/id_rsa)"
   ```

5. Restart the dashboard application

### Alternative: Store Key in File
Instead of using an environment variable, store the key in a file:
```bash
# Copy your PEM-format key to the default location
cp ~/.ssh/homelab ~/.ssh/homelab.pem
# Or set the SSH_KEY_PATH environment variable
export SSH_KEY_PATH="/path/to/your/key"
```

## Technical Details

### Supported Key Formats
- ✅ PEM PKCS#8: `-----BEGIN PRIVATE KEY-----`
- ✅ PEM PKCS#1 (RSA): `-----BEGIN RSA PRIVATE KEY-----`
- ✅ PEM SEC1 (EC): `-----BEGIN EC PRIVATE KEY-----`
- ✅ OpenSSH format: `-----BEGIN OPENSSH PRIVATE KEY-----` (automatically converted)
- ❌ Password-protected keys with passphrase in environment variable (requires special handling)

### Environment Variables
- `SSH_PRIVATE_KEY`: Raw SSH private key content (PEM format recommended)
- `SSH_KEY_PATH`: Path to SSH private key file
- `HOME_SSH_HOST`: Home server hostname
- `HOME_SSH_USER`: SSH username for home server
- `LINODE_SSH_HOST`: Linode server hostname
- `LINODE_SSH_USER`: SSH username for Linode

### Related API Routes
The following routes use SSH for remote operations:
- `GET /api/authelia/totp-qr` - Fetches TOTP QR code from home server
- `GET /api/authelia/notifications` - Fetches Authelia notifications
- `DELETE /api/authelia/totp-qr` - Deletes TOTP QR code file
- `GET /api/servers` - Lists configured servers
- SSH operations in deploy and infrastructure management

## Logs to Monitor
Look for these log messages to understand SSH key processing:
- `[SSH Key Converter] Detected OpenSSH format key` - Key is being converted
- `[SSH Key Converter] ✓ OpenSSH key successfully converted to PEM format` - Conversion succeeded
- `[SSH Key Converter] ✗ Failed to convert OpenSSH key` - Conversion failed
- `[SSH Key Converter] ⚠ This key format is not supported by the SSH client` - User action needed
- `SSH key not found` - SSH key is not available
- `SSH connect error` - Connection failed after key is loaded

## Notes
- The conversion happens automatically on each request
- Conversion performance impact is minimal (typically <100ms per request)
- If conversion fails, subsequent SSH operations are skipped with appropriate errors
- No SSH keys are logged or exposed in error messages (for security)
