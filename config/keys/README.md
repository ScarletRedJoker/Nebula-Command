# Age Encryption Keys

**⚠️ CRITICAL: NEVER COMMIT THIS DIRECTORY TO GIT**

## Public Key
```
age1waux0xs07gnp50xspsspxksvkxdmxfywtj5699ck4kcvcs56rdesdmgclr
```

## Private Key Location
- **Development**: `config/keys/age-key.txt`
- **Production**: Store in secure secrets manager (not in repository)

## Backup Instructions
1. **Make encrypted backup of private key**:
   ```bash
   gpg -c config/keys/age-key.txt
   ```

2. **Store encrypted backup in multiple secure locations**:
   - Password manager (1Password, Bitwarden, etc.)
   - Encrypted USB drive
   - Secure cloud storage (encrypted before upload)

3. **Document key rotation procedure**:
   - Generate new age keypair
   - Re-encrypt all secrets with new key
   - Update .sops.yaml with new public key
   - Securely destroy old private key

## Key Rotation
If compromised or for periodic security:
```bash
# 1. Generate new keypair
age-keygen -o config/keys/age-key-new.txt

# 2. Extract new public key
grep "public key:" config/keys/age-key-new.txt

# 3. Update .sops.yaml with new public key

# 4. Re-encrypt all secrets
./config/scripts/rotate-keys.sh
```

## Recovery
If private key is lost, all encrypted secrets are **PERMANENTLY UNRECOVERABLE**.
Always maintain secure backups!
