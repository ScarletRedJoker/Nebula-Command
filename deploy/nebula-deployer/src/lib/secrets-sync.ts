import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Client, ConnectConfig } from 'ssh2';
import { logger } from './logger';
import type { Environment } from './environment-detector';

export interface SSHConfig {
  user: string;
  keyPath?: string;
  password?: string;
  port?: number;
}

export interface SecretStore {
  name: string;
  type: 'file' | 'env' | 'remote';
  path?: string;
  host?: string;
  sshConfig?: SSHConfig;
}

export interface SecretsDiff {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: string[];
}

export type MergeStrategy = 'source-wins' | 'target-wins' | 'prompt';

export interface SyncOptions {
  dryRun?: boolean;
  backup?: boolean;
  includeKeys?: string[];
  excludeKeys?: string[];
}

export interface EnvironmentSyncConfig {
  name: string;
  environment: Environment;
  host: string;
  envPath: string;
  sshConfig: SSHConfig;
  enabled: boolean;
}

export interface MultiEnvironmentConfig {
  sourceEnvPath: string;
  environments: EnvironmentSyncConfig[];
  defaultSSHConfig?: SSHConfig;
}

export interface SyncResult {
  success: boolean;
  environment: string;
  secretsTransferred: number;
  error?: string;
  diff?: SecretsDiff;
}

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

function parseEnvContent(content: string): Record<string, string> {
  const secrets: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key) {
      secrets[key] = value;
    }
  }

  return secrets;
}

function formatEnvContent(secrets: Record<string, string>): string {
  const lines: string[] = [
    `# Auto-generated secrets file`,
    `# Last synced: ${new Date().toISOString()}`,
    `# Do not edit manually - use nebula secrets sync`,
    '',
  ];

  const sortedKeys = Object.keys(secrets).sort();
  for (const key of sortedKeys) {
    const value = secrets[key];
    const needsQuotes = value.includes(' ') || value.includes('\n') || value.includes('"') || value.includes("'");
    const formattedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
    lines.push(`${key}=${formattedValue}`);
  }

  lines.push('');
  return lines.join('\n');
}

function filterSecrets(
  secrets: Record<string, string>,
  includeKeys?: string[],
  excludeKeys?: string[]
): Record<string, string> {
  let filtered = { ...secrets };

  if (includeKeys && includeKeys.length > 0) {
    filtered = {};
    for (const key of includeKeys) {
      if (secrets[key] !== undefined) {
        filtered[key] = secrets[key];
      }
    }
  }

  if (excludeKeys && excludeKeys.length > 0) {
    for (const key of excludeKeys) {
      delete filtered[key];
    }
  }

  return filtered;
}

export function readLocalSecrets(envPath: string): Record<string, string> {
  logger.debug(`Reading local secrets from: ${envPath}`);

  try {
    if (!fs.existsSync(envPath)) {
      logger.warn(`Secrets file not found: ${envPath}`);
      return {};
    }

    const content = fs.readFileSync(envPath, 'utf-8');
    const secrets = parseEnvContent(content);
    
    logger.info(`Loaded ${Object.keys(secrets).length} secrets from ${envPath}`);
    return secrets;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to read local secrets: ${errorMsg}`);
    throw new Error(`Failed to read local secrets: ${errorMsg}`);
  }
}

export function writeLocalSecrets(
  envPath: string,
  secrets: Record<string, string>,
  backup: boolean = true
): void {
  logger.debug(`Writing ${Object.keys(secrets).length} secrets to: ${envPath}`);

  try {
    const dir = path.dirname(envPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.debug(`Created directory: ${dir}`);
    }

    if (backup && fs.existsSync(envPath)) {
      const backupPath = `${envPath}.backup.${Date.now()}`;
      fs.copyFileSync(envPath, backupPath);
      logger.info(`Created backup: ${backupPath}`);
    }

    const content = formatEnvContent(secrets);
    fs.writeFileSync(envPath, content, { mode: 0o600 });
    
    logger.success(`Wrote ${Object.keys(secrets).length} secrets to ${envPath}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to write local secrets: ${errorMsg}`);
    throw new Error(`Failed to write local secrets: ${errorMsg}`);
  }
}

function createSSHConnection(host: string, sshConfig: SSHConfig): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    
    const connectConfig: ConnectConfig = {
      host,
      port: sshConfig.port || 22,
      username: sshConfig.user,
    };

    if (sshConfig.keyPath) {
      try {
        connectConfig.privateKey = fs.readFileSync(sshConfig.keyPath);
      } catch (error) {
        reject(new Error(`Failed to read SSH key: ${sshConfig.keyPath}`));
        return;
      }
    } else if (sshConfig.password) {
      connectConfig.password = sshConfig.password;
    } else {
      reject(new Error('SSH config must include keyPath or password'));
      return;
    }

    client.on('ready', () => {
      logger.debug(`SSH connection established to ${host}`);
      resolve(client);
    });

    client.on('error', (err) => {
      logger.error(`SSH connection error: ${err.message}`);
      reject(err);
    });

    client.connect(connectConfig);
  });
}

function executeSSHCommand(client: Client, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      let stdout = '';
      let stderr = '';

      stream.on('close', (code: number) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      stream.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    });
  });
}

export async function readRemoteSecrets(
  host: string,
  envPath: string,
  sshConfig: SSHConfig
): Promise<Record<string, string>> {
  logger.info(`Reading remote secrets from ${host}:${envPath}`);
  
  let client: Client | null = null;
  
  try {
    client = await createSSHConnection(host, sshConfig);
    
    const content = await executeSSHCommand(
      client,
      `cat "${envPath}" 2>/dev/null || echo ""`
    );
    
    const secrets = parseEnvContent(content);
    logger.info(`Loaded ${Object.keys(secrets).length} secrets from ${host}:${envPath}`);
    
    return secrets;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to read remote secrets from ${host}: ${errorMsg}`);
    throw new Error(`Failed to read remote secrets: ${errorMsg}`);
  } finally {
    if (client) {
      client.end();
    }
  }
}

export async function writeRemoteSecrets(
  host: string,
  envPath: string,
  secrets: Record<string, string>,
  sshConfig: SSHConfig,
  options: SyncOptions = {}
): Promise<void> {
  logger.info(`Writing ${Object.keys(secrets).length} secrets to ${host}:${envPath}`);
  
  if (options.dryRun) {
    logger.info(`[DRY RUN] Would write ${Object.keys(secrets).length} secrets to ${host}:${envPath}`);
    return;
  }
  
  let client: Client | null = null;
  
  try {
    client = await createSSHConnection(host, sshConfig);
    
    const dir = path.dirname(envPath);
    await executeSSHCommand(client, `mkdir -p "${dir}"`);
    
    if (options.backup) {
      const backupPath = `${envPath}.backup.$(date +%s)`;
      await executeSSHCommand(
        client,
        `if [ -f "${envPath}" ]; then cp "${envPath}" "${backupPath}"; fi`
      );
      logger.debug(`Created backup on ${host}`);
    }
    
    const content = formatEnvContent(secrets);
    const escapedContent = content.replace(/'/g, "'\\''");
    
    await executeSSHCommand(
      client,
      `echo '${escapedContent}' > "${envPath}" && chmod 600 "${envPath}"`
    );
    
    logger.success(`Wrote ${Object.keys(secrets).length} secrets to ${host}:${envPath}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to write remote secrets to ${host}: ${errorMsg}`);
    throw new Error(`Failed to write remote secrets: ${errorMsg}`);
  } finally {
    if (client) {
      client.end();
    }
  }
}

export function compareSecrets(
  source: Record<string, string>,
  target: Record<string, string>
): SecretsDiff {
  const sourceKeys = new Set(Object.keys(source));
  const targetKeys = new Set(Object.keys(target));
  
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];
  
  for (const key of sourceKeys) {
    if (!targetKeys.has(key)) {
      added.push(key);
    } else if (source[key] !== target[key]) {
      changed.push(key);
    } else {
      unchanged.push(key);
    }
  }
  
  for (const key of targetKeys) {
    if (!sourceKeys.has(key)) {
      removed.push(key);
    }
  }
  
  logger.debug(`Comparison: ${added.length} added, ${removed.length} removed, ${changed.length} changed, ${unchanged.length} unchanged`);
  
  return { added, removed, changed, unchanged };
}

export function mergeSecrets(
  source: Record<string, string>,
  target: Record<string, string>,
  strategy: MergeStrategy
): Record<string, string> {
  logger.debug(`Merging secrets with strategy: ${strategy}`);
  
  const merged: Record<string, string> = {};
  const allKeys = new Set([...Object.keys(source), ...Object.keys(target)]);
  
  for (const key of allKeys) {
    const inSource = key in source;
    const inTarget = key in target;
    
    if (inSource && !inTarget) {
      merged[key] = source[key];
    } else if (!inSource && inTarget) {
      merged[key] = target[key];
    } else if (inSource && inTarget) {
      if (source[key] === target[key]) {
        merged[key] = source[key];
      } else {
        switch (strategy) {
          case 'source-wins':
            merged[key] = source[key];
            break;
          case 'target-wins':
            merged[key] = target[key];
            break;
          case 'prompt':
            logger.warn(`Conflict for key "${key}" - using source value (prompt mode requires interactive handling)`);
            merged[key] = source[key];
            break;
        }
      }
    }
  }
  
  logger.info(`Merged ${Object.keys(merged).length} secrets`);
  return merged;
}

export async function syncSecretsToRemote(
  localPath: string,
  remoteHost: string,
  remotePath: string,
  sshConfig: SSHConfig,
  options: SyncOptions = {}
): Promise<SyncResult> {
  logger.subheader(`Syncing secrets to ${remoteHost}`);
  
  try {
    let localSecrets = readLocalSecrets(localPath);
    localSecrets = filterSecrets(localSecrets, options.includeKeys, options.excludeKeys);
    
    const remoteSecrets = await readRemoteSecrets(remoteHost, remotePath, sshConfig);
    const diff = compareSecrets(localSecrets, remoteSecrets);
    
    logger.table({
      'Added': String(diff.added.length),
      'Removed': String(diff.removed.length),
      'Changed': String(diff.changed.length),
      'Unchanged': String(diff.unchanged.length),
    });
    
    if (options.dryRun) {
      logger.info(`[DRY RUN] Would sync ${Object.keys(localSecrets).length} secrets to ${remoteHost}`);
      if (diff.added.length > 0) logger.list(diff.added.map(k => `+ ${k}`));
      if (diff.changed.length > 0) logger.list(diff.changed.map(k => `~ ${k}`));
      if (diff.removed.length > 0) logger.list(diff.removed.map(k => `- ${k}`));
      
      return {
        success: true,
        environment: remoteHost,
        secretsTransferred: 0,
        diff,
      };
    }
    
    await writeRemoteSecrets(remoteHost, remotePath, localSecrets, sshConfig, options);
    
    return {
      success: true,
      environment: remoteHost,
      secretsTransferred: Object.keys(localSecrets).length,
      diff,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      environment: remoteHost,
      secretsTransferred: 0,
      error: errorMsg,
    };
  }
}

export async function syncSecretsFromRemote(
  remoteHost: string,
  remotePath: string,
  localPath: string,
  sshConfig: SSHConfig,
  options: SyncOptions = {}
): Promise<SyncResult> {
  logger.subheader(`Syncing secrets from ${remoteHost}`);
  
  try {
    let remoteSecrets = await readRemoteSecrets(remoteHost, remotePath, sshConfig);
    remoteSecrets = filterSecrets(remoteSecrets, options.includeKeys, options.excludeKeys);
    
    const localSecrets = readLocalSecrets(localPath);
    const diff = compareSecrets(remoteSecrets, localSecrets);
    
    logger.table({
      'Added': String(diff.added.length),
      'Removed': String(diff.removed.length),
      'Changed': String(diff.changed.length),
      'Unchanged': String(diff.unchanged.length),
    });
    
    if (options.dryRun) {
      logger.info(`[DRY RUN] Would sync ${Object.keys(remoteSecrets).length} secrets from ${remoteHost}`);
      if (diff.added.length > 0) logger.list(diff.added.map(k => `+ ${k}`));
      if (diff.changed.length > 0) logger.list(diff.changed.map(k => `~ ${k}`));
      if (diff.removed.length > 0) logger.list(diff.removed.map(k => `- ${k}`));
      
      return {
        success: true,
        environment: remoteHost,
        secretsTransferred: 0,
        diff,
      };
    }
    
    writeLocalSecrets(localPath, remoteSecrets, options.backup ?? true);
    
    return {
      success: true,
      environment: remoteHost,
      secretsTransferred: Object.keys(remoteSecrets).length,
      diff,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      environment: remoteHost,
      secretsTransferred: 0,
      error: errorMsg,
    };
  }
}

export async function syncSecretsBetweenHosts(
  sourceHost: string,
  destHost: string,
  envPath: string,
  sshConfig: SSHConfig,
  options: SyncOptions = {}
): Promise<SyncResult> {
  logger.subheader(`Syncing secrets from ${sourceHost} to ${destHost}`);
  
  try {
    let sourceSecrets = await readRemoteSecrets(sourceHost, envPath, sshConfig);
    sourceSecrets = filterSecrets(sourceSecrets, options.includeKeys, options.excludeKeys);
    
    const destSecrets = await readRemoteSecrets(destHost, envPath, sshConfig);
    const diff = compareSecrets(sourceSecrets, destSecrets);
    
    logger.table({
      'Added': String(diff.added.length),
      'Removed': String(diff.removed.length),
      'Changed': String(diff.changed.length),
      'Unchanged': String(diff.unchanged.length),
    });
    
    if (options.dryRun) {
      logger.info(`[DRY RUN] Would sync ${Object.keys(sourceSecrets).length} secrets from ${sourceHost} to ${destHost}`);
      return {
        success: true,
        environment: `${sourceHost} -> ${destHost}`,
        secretsTransferred: 0,
        diff,
      };
    }
    
    await writeRemoteSecrets(destHost, envPath, sourceSecrets, sshConfig, options);
    
    return {
      success: true,
      environment: `${sourceHost} -> ${destHost}`,
      secretsTransferred: Object.keys(sourceSecrets).length,
      diff,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      environment: `${sourceHost} -> ${destHost}`,
      secretsTransferred: 0,
      error: errorMsg,
    };
  }
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha512');
}

export function encryptSecrets(
  secrets: Record<string, string>,
  key: string
): string {
  logger.debug('Encrypting secrets');
  
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derivedKey = deriveKey(key, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, derivedKey, iv);
  
  const plaintext = JSON.stringify(secrets);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  const payload = {
    version: 1,
    algorithm: ENCRYPTION_ALGORITHM,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted,
  };
  
  const result = Buffer.from(JSON.stringify(payload)).toString('base64');
  logger.info(`Encrypted ${Object.keys(secrets).length} secrets`);
  
  return result;
}

export function decryptSecrets(
  encrypted: string,
  key: string
): Record<string, string> {
  logger.debug('Decrypting secrets');
  
  try {
    const payloadJson = Buffer.from(encrypted, 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson);
    
    if (payload.version !== 1) {
      throw new Error(`Unsupported encryption version: ${payload.version}`);
    }
    
    const salt = Buffer.from(payload.salt, 'hex');
    const iv = Buffer.from(payload.iv, 'hex');
    const authTag = Buffer.from(payload.authTag, 'hex');
    const derivedKey = deriveKey(key, salt);
    
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(payload.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    const secrets = JSON.parse(decrypted);
    logger.info(`Decrypted ${Object.keys(secrets).length} secrets`);
    
    return secrets;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to decrypt secrets: ${errorMsg}`);
    throw new Error(`Failed to decrypt secrets: ${errorMsg}`);
  }
}

export function getDefaultEnvironmentConfigs(): EnvironmentSyncConfig[] {
  return [
    {
      name: 'Linode Production',
      environment: 'linode',
      host: process.env.LINODE_SSH_HOST || 'linode.evindrake.net',
      envPath: '/opt/homelab/.env',
      sshConfig: {
        user: process.env.LINODE_SSH_USER || 'root',
        keyPath: process.env.SSH_KEY_PATH || '~/.ssh/id_rsa',
        port: parseInt(process.env.LINODE_SSH_PORT || '22', 10),
      },
      enabled: true,
    },
    {
      name: 'Ubuntu Home Server',
      environment: 'ubuntu-home',
      host: process.env.HOME_SSH_HOST || 'host.evindrake.net',
      envPath: '/opt/nebula/.env',
      sshConfig: {
        user: process.env.HOME_SSH_USER || 'evin',
        keyPath: process.env.SSH_KEY_PATH || '~/.ssh/id_rsa',
        port: parseInt(process.env.HOME_SSH_PORT || '22', 10),
      },
      enabled: true,
    },
    {
      name: 'Windows VM',
      environment: 'windows-vm',
      host: process.env.WINDOWS_VM_TAILSCALE_IP || '100.118.44.102',
      envPath: 'C:\\NebulaCommand\\.env',
      sshConfig: {
        user: process.env.WINDOWS_SSH_USER || 'evin',
        keyPath: process.env.SSH_KEY_PATH || '~/.ssh/id_rsa',
        port: parseInt(process.env.WINDOWS_SSH_PORT || '22', 10),
      },
      enabled: false,
    },
  ];
}

export async function syncAllEnvironments(
  config: MultiEnvironmentConfig,
  options: SyncOptions = {}
): Promise<SyncResult[]> {
  logger.header('Multi-Environment Secrets Sync');
  
  const results: SyncResult[] = [];
  const enabledEnvs = config.environments.filter(e => e.enabled);
  
  logger.info(`Syncing to ${enabledEnvs.length} environments`);
  
  if (options.dryRun) {
    logger.warn('[DRY RUN MODE] No changes will be made');
  }
  
  const sourceSecrets = readLocalSecrets(config.sourceEnvPath);
  logger.info(`Source has ${Object.keys(sourceSecrets).length} secrets`);
  
  for (let i = 0; i < enabledEnvs.length; i++) {
    const envConfig = enabledEnvs[i];
    logger.step(i + 1, enabledEnvs.length, `Syncing to ${envConfig.name}`);
    
    try {
      const sshConfig = { ...config.defaultSSHConfig, ...envConfig.sshConfig };
      
      const result = await syncSecretsToRemote(
        config.sourceEnvPath,
        envConfig.host,
        envConfig.envPath,
        sshConfig,
        options
      );
      
      results.push({
        ...result,
        environment: envConfig.name,
      });
      
      if (result.success) {
        logger.success(`✓ ${envConfig.name}: ${result.secretsTransferred} secrets synced`);
      } else {
        logger.error(`✗ ${envConfig.name}: ${result.error}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        success: false,
        environment: envConfig.name,
        secretsTransferred: 0,
        error: errorMsg,
      });
      logger.error(`✗ ${envConfig.name}: ${errorMsg}`);
    }
  }
  
  logger.divider();
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  logger.table({
    'Total Environments': String(enabledEnvs.length),
    'Successful': String(successful),
    'Failed': String(failed),
  });
  
  if (failed === 0) {
    logger.success('All environments synced successfully');
  } else {
    logger.warn(`${failed} environment(s) failed to sync`);
  }
  
  return results;
}

export function createSecretStore(config: Partial<SecretStore> & { name: string; type: SecretStore['type'] }): SecretStore {
  return {
    name: config.name,
    type: config.type,
    path: config.path,
    host: config.host,
    sshConfig: config.sshConfig,
  };
}

export async function testSSHConnection(
  host: string,
  sshConfig: SSHConfig
): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  logger.debug(`Testing SSH connection to ${host}`);
  const start = Date.now();
  
  let client: Client | null = null;
  
  try {
    client = await createSSHConnection(host, sshConfig);
    const output = await executeSSHCommand(client, 'echo "connected"');
    const latencyMs = Date.now() - start;
    
    if (output.trim() === 'connected') {
      logger.success(`SSH connection to ${host} successful (${latencyMs}ms)`);
      return { success: true, latencyMs };
    }
    
    return { success: false, latencyMs, error: 'Unexpected response' };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`SSH connection to ${host} failed: ${errorMsg}`);
    return { success: false, latencyMs, error: errorMsg };
  } finally {
    if (client) {
      client.end();
    }
  }
}

export function printSecretsDiff(diff: SecretsDiff): void {
  logger.subheader('Secrets Comparison');
  
  if (diff.added.length > 0) {
    logger.info(`Added (${diff.added.length}):`);
    logger.list(diff.added.map(k => `+ ${k}`));
  }
  
  if (diff.removed.length > 0) {
    logger.info(`Removed (${diff.removed.length}):`);
    logger.list(diff.removed.map(k => `- ${k}`));
  }
  
  if (diff.changed.length > 0) {
    logger.info(`Changed (${diff.changed.length}):`);
    logger.list(diff.changed.map(k => `~ ${k}`));
  }
  
  if (diff.unchanged.length > 0) {
    logger.debug(`Unchanged: ${diff.unchanged.length} keys`);
  }
  
  const totalChanges = diff.added.length + diff.removed.length + diff.changed.length;
  if (totalChanges === 0) {
    logger.success('No differences found');
  }
}

export default {
  readLocalSecrets,
  writeLocalSecrets,
  readRemoteSecrets,
  writeRemoteSecrets,
  compareSecrets,
  mergeSecrets,
  syncSecretsToRemote,
  syncSecretsFromRemote,
  syncSecretsBetweenHosts,
  encryptSecrets,
  decryptSecrets,
  syncAllEnvironments,
  getDefaultEnvironmentConfigs,
  createSecretStore,
  testSSHConnection,
  printSecretsDiff,
};
