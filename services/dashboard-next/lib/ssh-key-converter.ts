import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Track which keys have already been warned about to reduce log spam
const warnedKeys = new Set<string>();

/**
 * Detects the format of an SSH private key
 */
export function detectSSHKeyFormat(keyInput: Buffer | string): string {
  const keyString = typeof keyInput === 'string' ? keyInput : keyInput.toString('utf-8');
  
  if (keyString.includes('-----BEGIN OPENSSH PRIVATE KEY-----')) {
    return 'OpenSSH';
  } else if (keyString.includes('-----BEGIN PRIVATE KEY-----')) {
    return 'PKCS8';
  } else if (keyString.includes('-----BEGIN RSA PRIVATE KEY-----')) {
    return 'RSA';
  } else if (keyString.includes('-----BEGIN EC PRIVATE KEY-----')) {
    return 'EC';
  } else if (keyString.includes('-----BEGIN ED25519 PRIVATE KEY-----')) {
    return 'ED25519';
  } else if (keyString.includes('-----BEGIN')) {
    return 'Unknown PEM format';
  } else {
    return 'Raw/Binary format';
  }
}

/**
 * Attempts to convert SSH private key from OpenSSH format to PEM format.
 * 
 * The ssh2 library (v1.17.0) does NOT support OpenSSH format private keys
 * (format: -----BEGIN OPENSSH PRIVATE KEY-----). It only supports PEM formats:
 * - PKCS8 (-----BEGIN PRIVATE KEY-----)
 * - RSA (-----BEGIN RSA PRIVATE KEY-----)
 * - EC (-----BEGIN EC PRIVATE KEY-----)
 * 
 * If conversion fails, returns null and logs a helpful message for the user
 * to manually convert their key using: ssh-keygen -p -m pem -f <keyfile>
 */
export function convertSSHKeyToPEM(keyInput: Buffer | string): Buffer | null {
  try {
    const keyString = typeof keyInput === 'string' ? keyInput : keyInput.toString('utf-8');
    
    // If already in a supported PEM format, return as-is
    if (keyString.includes('-----BEGIN') && 
        !keyString.includes('-----BEGIN OPENSSH PRIVATE KEY-----') &&
        keyString.includes('-----END')) {
      return Buffer.from(keyString);
    }
    
    // If it's OpenSSH format, we need to convert it
    if (keyString.includes('-----BEGIN OPENSSH PRIVATE KEY-----')) {
      // Create a unique ID for this key to track warnings
      const keyId = keyString.substring(0, 100);
      const isFirstWarning = !warnedKeys.has(keyId);
      
      if (isFirstWarning) {
        warnedKeys.add(keyId);
        console.log('[SSH Key Converter] Detected OpenSSH format key, attempting conversion...');
      }
      
      // Try to convert
      const result = attemptConversion(keyString, isFirstWarning);
      if (result) {
        if (isFirstWarning) {
          console.log('[SSH Key Converter] Successfully converted key to PEM format');
        }
        return result;
      }
      
      // Conversion failed - log guidance for user (once per key)
      if (isFirstWarning) {
        console.log('[SSH Key Converter] Automatic conversion failed.');
        console.log('[SSH Key Converter] Please convert your SSH key manually using:');
        console.log('[SSH Key Converter]   ssh-keygen -p -m pem -f ~/.ssh/id_rsa');
        console.log('[SSH Key Converter] Or generate a new key in PEM format:');
        console.log('[SSH Key Converter]   ssh-keygen -t rsa -m pem -f ~/.ssh/id_rsa_pem');
      }
      
      return null;
    }
    
    // For other formats, return as-is (might work, might not)
    return Buffer.from(keyString);
  } catch (error) {
    return null;
  }
}

/**
 * Attempts to convert OpenSSH key to PEM format using ssh-keygen
 */
function attemptConversion(keyString: string, verbose: boolean): Buffer | null {
  const tmpDir = tmpdir();
  const tempFile = join(tmpDir, `ssh-key-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  
  try {
    // Write key to temp file with restricted permissions
    writeFileSync(tempFile, keyString, { mode: 0o600 });
    
    // Try ssh-keygen conversion (modifies in-place)
    // -p: change passphrase/rewrite key
    // -N "": set empty passphrase
    // -m pem: output in PEM format
    execSync(
      `ssh-keygen -p -P "" -N "" -m pem -f "${tempFile}" 2>/dev/null`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    
    // Read converted key
    const converted = readFileSync(tempFile, 'utf-8');
    
    // Verify it's now in PEM format
    if (converted.includes('-----BEGIN') && !converted.includes('OPENSSH')) {
      return Buffer.from(converted);
    }
    
    return null;
  } catch (error) {
    // ssh-keygen failed - likely key has passphrase or other issue
    if (verbose) {
      console.log('[SSH Key Converter] ssh-keygen conversion failed (key may have passphrase)');
    }
    return null;
  } finally {
    // Clean up temp file
    try {
      unlinkSync(tempFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}
