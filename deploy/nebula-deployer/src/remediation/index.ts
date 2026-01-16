import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { logger } from '../lib/logger';
import { detectEnvironment, type Environment } from '../lib/environment-detector';

const execAsync = promisify(exec);

export interface RemediationResult {
  success: boolean;
  message: string;
  actions: string[];
  needsManualIntervention?: boolean;
  manualInstructions?: string;
}

export interface Remediation {
  name: string;
  description: string;
  canRun(): Promise<boolean>;
  run(): Promise<RemediationResult>;
  rollback?(): Promise<boolean>;
}

export interface RemediationOptions {
  dryRun?: boolean;
  timeout?: number;
  retries?: number;
  logPrefix?: string;
}

export interface EnvSchema {
  [key: string]: {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'url';
    pattern?: RegExp;
    minLength?: number;
  };
}

function isWindows(): boolean {
  return process.platform === 'win32';
}

function isLinux(): boolean {
  return process.platform === 'linux';
}

async function commandExists(command: string): Promise<boolean> {
  try {
    if (isWindows()) {
      await execAsync(`where ${command}`);
    } else {
      await execAsync(`which ${command}`);
    }
    return true;
  } catch {
    return false;
  }
}

export async function restartPm2Process(serviceName: string): Promise<RemediationResult> {
  const actions: string[] = [];
  const log = logger.child('pm2-restart');

  try {
    const pm2Exists = await commandExists('pm2');
    if (!pm2Exists) {
      return {
        success: false,
        message: 'PM2 is not installed',
        actions: [],
        needsManualIntervention: true,
        manualInstructions: 'Install PM2 globally: npm install -g pm2',
      };
    }

    log.info(`Attempting to restart PM2 process: ${serviceName}`);
    actions.push(`Checking PM2 process status for ${serviceName}`);

    const { stdout: listOutput } = await execAsync('pm2 jlist');
    const processes = JSON.parse(listOutput);
    const processExists = processes.some((p: any) => p.name === serviceName);

    if (!processExists) {
      return {
        success: false,
        message: `PM2 process '${serviceName}' not found`,
        actions,
        needsManualIntervention: true,
        manualInstructions: `Start the process with: pm2 start <script> --name ${serviceName}`,
      };
    }

    actions.push(`Restarting PM2 process: ${serviceName}`);
    await execAsync(`pm2 restart ${serviceName}`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));

    const { stdout: statusOutput } = await execAsync('pm2 jlist');
    const updatedProcesses = JSON.parse(statusOutput);
    const process = updatedProcesses.find((p: any) => p.name === serviceName);
    
    if (process && process.pm2_env?.status === 'online') {
      actions.push(`PM2 process ${serviceName} is now online`);
      log.success(`Successfully restarted PM2 process: ${serviceName}`);
      return {
        success: true,
        message: `PM2 process '${serviceName}' restarted successfully`,
        actions,
      };
    }

    return {
      success: false,
      message: `PM2 process '${serviceName}' failed to restart`,
      actions,
      needsManualIntervention: true,
      manualInstructions: `Check logs with: pm2 logs ${serviceName}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to restart PM2 process: ${errorMessage}`);
    return {
      success: false,
      message: `Failed to restart PM2 process: ${errorMessage}`,
      actions,
      needsManualIntervention: true,
      manualInstructions: 'Check PM2 status with: pm2 status',
    };
  }
}

export async function restartSystemdService(serviceName: string): Promise<RemediationResult> {
  const actions: string[] = [];
  const log = logger.child('systemd-restart');

  if (isWindows()) {
    return {
      success: false,
      message: 'systemd is not available on Windows',
      actions: [],
      needsManualIntervention: true,
      manualInstructions: 'Use restartWindowsService() for Windows services',
    };
  }

  try {
    log.info(`Attempting to restart systemd service: ${serviceName}`);
    actions.push(`Checking systemd service: ${serviceName}`);

    const { stdout: statusOutput } = await execAsync(`systemctl is-active ${serviceName} 2>/dev/null || echo "inactive"`);
    const wasActive = statusOutput.trim() === 'active';
    actions.push(`Service was ${wasActive ? 'active' : 'inactive'}`);

    actions.push(`Restarting systemd service: ${serviceName}`);
    await execAsync(`sudo systemctl restart ${serviceName}`);

    await new Promise(resolve => setTimeout(resolve, 3000));

    const { stdout: newStatus } = await execAsync(`systemctl is-active ${serviceName}`);
    
    if (newStatus.trim() === 'active') {
      actions.push(`Service ${serviceName} is now active`);
      log.success(`Successfully restarted systemd service: ${serviceName}`);
      return {
        success: true,
        message: `Systemd service '${serviceName}' restarted successfully`,
        actions,
      };
    }

    const { stdout: journalOutput } = await execAsync(`journalctl -u ${serviceName} -n 10 --no-pager 2>/dev/null || echo "No logs available"`);
    
    return {
      success: false,
      message: `Systemd service '${serviceName}' failed to start`,
      actions,
      needsManualIntervention: true,
      manualInstructions: `Check logs:\njournalctl -u ${serviceName} -f\n\nRecent logs:\n${journalOutput}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to restart systemd service: ${errorMessage}`);
    return {
      success: false,
      message: `Failed to restart systemd service: ${errorMessage}`,
      actions,
      needsManualIntervention: true,
      manualInstructions: `Check service status: sudo systemctl status ${serviceName}`,
    };
  }
}

export async function restartWindowsService(serviceName: string): Promise<RemediationResult> {
  const actions: string[] = [];
  const log = logger.child('windows-service');

  if (!isWindows()) {
    return {
      success: false,
      message: 'Windows services not available on this platform',
      actions: [],
      needsManualIntervention: true,
      manualInstructions: 'Use restartSystemdService() for Linux services',
    };
  }

  try {
    log.info(`Attempting to restart Windows service: ${serviceName}`);
    actions.push(`Checking Windows service: ${serviceName}`);

    const checkCmd = `powershell -Command "Get-Service -Name '${serviceName}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status"`;
    const { stdout: statusOutput } = await execAsync(checkCmd);
    const currentStatus = statusOutput.trim();

    if (!currentStatus) {
      return {
        success: false,
        message: `Windows service '${serviceName}' not found`,
        actions,
        needsManualIntervention: true,
        manualInstructions: `Verify service name: Get-Service | Where-Object { $_.Name -like '*${serviceName}*' }`,
      };
    }

    actions.push(`Service status: ${currentStatus}`);
    actions.push(`Restarting Windows service: ${serviceName}`);

    const restartCmd = `powershell -Command "Restart-Service -Name '${serviceName}' -Force"`;
    await execAsync(restartCmd);

    await new Promise(resolve => setTimeout(resolve, 3000));

    const { stdout: newStatus } = await execAsync(checkCmd);
    
    if (newStatus.trim() === 'Running') {
      actions.push(`Service ${serviceName} is now running`);
      log.success(`Successfully restarted Windows service: ${serviceName}`);
      return {
        success: true,
        message: `Windows service '${serviceName}' restarted successfully`,
        actions,
      };
    }

    return {
      success: false,
      message: `Windows service '${serviceName}' is not running after restart`,
      actions,
      needsManualIntervention: true,
      manualInstructions: `Check service status in PowerShell:\nGet-Service -Name '${serviceName}'\nGet-EventLog -LogName System -Source "Service Control Manager" -Newest 10`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to restart Windows service: ${errorMessage}`);
    return {
      success: false,
      message: `Failed to restart Windows service: ${errorMessage}`,
      actions,
      needsManualIntervention: true,
      manualInstructions: 'Run PowerShell as Administrator and check service status',
    };
  }
}

export async function rebuildService(serviceName: string, serviceDir?: string): Promise<RemediationResult> {
  const actions: string[] = [];
  const log = logger.child('rebuild-service');

  const directory = serviceDir || path.join(process.cwd(), 'services', serviceName);

  try {
    if (!fs.existsSync(directory)) {
      return {
        success: false,
        message: `Service directory not found: ${directory}`,
        actions: [],
        needsManualIntervention: true,
        manualInstructions: `Verify the service directory exists at: ${directory}`,
      };
    }

    const packageJsonPath = path.join(directory, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return {
        success: false,
        message: 'package.json not found',
        actions: [],
        needsManualIntervention: true,
        manualInstructions: 'This does not appear to be a Node.js service',
      };
    }

    log.info(`Rebuilding service: ${serviceName} in ${directory}`);
    
    actions.push('Cleaning node_modules');
    const nodeModulesPath = path.join(directory, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      fs.rmSync(nodeModulesPath, { recursive: true, force: true });
    }

    actions.push('Running npm install');
    log.info('Installing dependencies...');
    await execAsync('npm install', { cwd: directory, timeout: 300000 });

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    if (packageJson.scripts?.build) {
      actions.push('Running npm run build');
      log.info('Building service...');
      await execAsync('npm run build', { cwd: directory, timeout: 300000 });
    }

    actions.push('Rebuild completed successfully');
    log.success(`Successfully rebuilt service: ${serviceName}`);

    return {
      success: true,
      message: `Service '${serviceName}' rebuilt successfully`,
      actions,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to rebuild service: ${errorMessage}`);
    return {
      success: false,
      message: `Failed to rebuild service: ${errorMessage}`,
      actions,
      needsManualIntervention: true,
      manualInstructions: `Manually rebuild:\ncd ${directory}\nrm -rf node_modules\nnpm install\nnpm run build`,
    };
  }
}

export async function installMissingNpmPackages(directory: string): Promise<RemediationResult> {
  const actions: string[] = [];
  const log = logger.child('npm-install');

  try {
    if (!fs.existsSync(directory)) {
      return {
        success: false,
        message: `Directory not found: ${directory}`,
        actions: [],
        needsManualIntervention: true,
        manualInstructions: 'Verify the directory path',
      };
    }

    const packageJsonPath = path.join(directory, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return {
        success: false,
        message: 'package.json not found',
        actions: [],
        needsManualIntervention: true,
        manualInstructions: `Create package.json with: npm init -y`,
      };
    }

    log.info(`Installing npm packages in: ${directory}`);
    actions.push(`Checking for package-lock.json`);

    const lockFile = path.join(directory, 'package-lock.json');
    const installCmd = fs.existsSync(lockFile) ? 'npm ci' : 'npm install';

    actions.push(`Running ${installCmd}`);
    await execAsync(installCmd, { cwd: directory, timeout: 300000 });

    actions.push('NPM packages installed successfully');
    log.success('Successfully installed npm packages');

    return {
      success: true,
      message: 'NPM packages installed successfully',
      actions,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to install npm packages: ${errorMessage}`);
    return {
      success: false,
      message: `Failed to install npm packages: ${errorMessage}`,
      actions,
      needsManualIntervention: true,
      manualInstructions: `Manually install:\ncd ${directory}\nnpm install`,
    };
  }
}

export async function installMissingSystemPackages(packages: string[]): Promise<RemediationResult> {
  const actions: string[] = [];
  const log = logger.child('system-packages');

  if (packages.length === 0) {
    return {
      success: true,
      message: 'No packages to install',
      actions: [],
    };
  }

  try {
    if (isWindows()) {
      log.info(`Installing Windows packages: ${packages.join(', ')}`);
      actions.push('Checking winget availability');

      const wingetExists = await commandExists('winget');
      if (!wingetExists) {
        return {
          success: false,
          message: 'winget is not available',
          actions,
          needsManualIntervention: true,
          manualInstructions: 'Install packages manually or install winget from Microsoft Store',
        };
      }

      for (const pkg of packages) {
        actions.push(`Installing: ${pkg}`);
        try {
          await execAsync(`winget install ${pkg} --accept-package-agreements --accept-source-agreements`, { timeout: 300000 });
          actions.push(`Successfully installed: ${pkg}`);
        } catch (error) {
          actions.push(`Failed to install: ${pkg}`);
        }
      }
    } else if (isLinux()) {
      log.info(`Installing Linux packages: ${packages.join(', ')}`);
      
      const aptExists = await commandExists('apt-get');
      if (!aptExists) {
        return {
          success: false,
          message: 'apt-get is not available (non-Debian system?)',
          actions,
          needsManualIntervention: true,
          manualInstructions: 'Install packages using your system package manager',
        };
      }

      actions.push('Updating package list');
      await execAsync('sudo apt-get update', { timeout: 120000 });

      const packageList = packages.join(' ');
      actions.push(`Installing: ${packageList}`);
      await execAsync(`sudo apt-get install -y ${packageList}`, { timeout: 300000 });
      actions.push('Packages installed successfully');
    } else {
      return {
        success: false,
        message: 'Unsupported platform for system package installation',
        actions: [],
        needsManualIntervention: true,
        manualInstructions: 'Install packages manually using your system package manager',
      };
    }

    log.success('System packages installed successfully');
    return {
      success: true,
      message: 'System packages installed successfully',
      actions,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to install system packages: ${errorMessage}`);
    return {
      success: false,
      message: `Failed to install system packages: ${errorMessage}`,
      actions,
      needsManualIntervention: true,
      manualInstructions: `Install manually: ${packages.join(' ')}`,
    };
  }
}

export async function createMissingDirectories(paths: string[], permissions: string = '0755'): Promise<RemediationResult> {
  const actions: string[] = [];
  const log = logger.child('create-dirs');
  const createdDirs: string[] = [];

  try {
    for (const dirPath of paths) {
      if (fs.existsSync(dirPath)) {
        actions.push(`Directory exists: ${dirPath}`);
        continue;
      }

      log.info(`Creating directory: ${dirPath}`);
      actions.push(`Creating: ${dirPath}`);
      
      fs.mkdirSync(dirPath, { 
        recursive: true, 
        mode: parseInt(permissions, 8) 
      });
      createdDirs.push(dirPath);
    }

    if (createdDirs.length > 0) {
      log.success(`Created ${createdDirs.length} directories`);
    }

    return {
      success: true,
      message: `Created ${createdDirs.length} directories`,
      actions,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to create directories: ${errorMessage}`);
    return {
      success: false,
      message: `Failed to create directories: ${errorMessage}`,
      actions,
      needsManualIntervention: true,
      manualInstructions: `Create directories manually:\nmkdir -p ${paths.join(' ')}`,
    };
  }
}

export async function generateSecretValue(varName: string, length: number = 64): Promise<RemediationResult> {
  const actions: string[] = [];
  const log = logger.child('generate-secret');

  try {
    log.info(`Generating secret for: ${varName}`);
    actions.push(`Generating ${length}-character secret for ${varName}`);

    const secret = crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
    
    actions.push('Secret generated successfully');
    log.success(`Generated secret for ${varName}`);

    return {
      success: true,
      message: `Generated secret for ${varName}`,
      actions,
      manualInstructions: `Add to your .env file:\n${varName}=${secret}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to generate secret: ${errorMessage}`);
    return {
      success: false,
      message: `Failed to generate secret: ${errorMessage}`,
      actions,
      needsManualIntervention: true,
      manualInstructions: `Generate manually:\nopenssl rand -hex ${length}`,
    };
  }
}

export async function copyEnvTemplate(source: string, dest: string): Promise<RemediationResult> {
  const actions: string[] = [];
  const log = logger.child('copy-env');

  try {
    if (!fs.existsSync(source)) {
      return {
        success: false,
        message: `Template file not found: ${source}`,
        actions: [],
        needsManualIntervention: true,
        manualInstructions: `Create template at ${source} or create ${dest} manually`,
      };
    }

    if (fs.existsSync(dest)) {
      const backupPath = `${dest}.backup.${Date.now()}`;
      actions.push(`Backing up existing .env to: ${backupPath}`);
      fs.copyFileSync(dest, backupPath);
    }

    log.info(`Copying ${source} to ${dest}`);
    actions.push(`Copying ${source} to ${dest}`);
    
    fs.copyFileSync(source, dest);

    actions.push('Environment file created successfully');
    log.success('Environment template copied');

    return {
      success: true,
      message: 'Environment file created from template',
      actions,
      needsManualIntervention: true,
      manualInstructions: `Review and update values in ${dest}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to copy env template: ${errorMessage}`);
    return {
      success: false,
      message: `Failed to copy env template: ${errorMessage}`,
      actions,
      needsManualIntervention: true,
      manualInstructions: `Copy manually:\ncp ${source} ${dest}`,
    };
  }
}

export async function validateEnvFile(envPath: string, schema: EnvSchema): Promise<RemediationResult> {
  const actions: string[] = [];
  const log = logger.child('validate-env');
  const errors: string[] = [];

  try {
    if (!fs.existsSync(envPath)) {
      return {
        success: false,
        message: `Env file not found: ${envPath}`,
        actions: [],
        needsManualIntervention: true,
        manualInstructions: 'Create the .env file from .env.example template',
      };
    }

    log.info(`Validating env file: ${envPath}`);
    actions.push(`Reading ${envPath}`);

    const content = fs.readFileSync(envPath, 'utf-8');
    const envVars: Record<string, string> = {};

    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key) {
          envVars[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
        }
      }
    });

    for (const [key, rules] of Object.entries(schema)) {
      const value = envVars[key];
      
      if (rules.required && (!value || value.trim() === '')) {
        errors.push(`Missing required variable: ${key}`);
        continue;
      }

      if (value && rules.type) {
        switch (rules.type) {
          case 'number':
            if (isNaN(Number(value))) {
              errors.push(`${key} must be a number`);
            }
            break;
          case 'boolean':
            if (!['true', 'false', '0', '1'].includes(value.toLowerCase())) {
              errors.push(`${key} must be a boolean (true/false)`);
            }
            break;
          case 'url':
            try {
              new URL(value);
            } catch {
              errors.push(`${key} must be a valid URL`);
            }
            break;
        }
      }

      if (value && rules.pattern && !rules.pattern.test(value)) {
        errors.push(`${key} does not match required pattern`);
      }

      if (value && rules.minLength && value.length < rules.minLength) {
        errors.push(`${key} must be at least ${rules.minLength} characters`);
      }
    }

    actions.push(`Validated ${Object.keys(schema).length} variables`);

    if (errors.length > 0) {
      log.warn(`Validation found ${errors.length} issues`);
      return {
        success: false,
        message: `Validation failed with ${errors.length} errors`,
        actions,
        needsManualIntervention: true,
        manualInstructions: `Fix these issues in ${envPath}:\n${errors.map(e => `- ${e}`).join('\n')}`,
      };
    }

    log.success('Environment file validation passed');
    return {
      success: true,
      message: 'Environment file is valid',
      actions,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to validate env file: ${errorMessage}`);
    return {
      success: false,
      message: `Failed to validate env file: ${errorMessage}`,
      actions,
      needsManualIntervention: true,
      manualInstructions: 'Check the env file format and permissions',
    };
  }
}

export async function restartTailscale(): Promise<RemediationResult> {
  const actions: string[] = [];
  const log = logger.child('tailscale');

  try {
    log.info('Attempting to restart Tailscale');
    
    if (isWindows()) {
      actions.push('Restarting Tailscale Windows service');
      await execAsync('powershell -Command "Restart-Service -Name Tailscale -Force"');
    } else {
      actions.push('Restarting Tailscale daemon');
      await execAsync('sudo systemctl restart tailscaled');
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    actions.push('Checking Tailscale status');
    const { stdout: status } = await execAsync('tailscale status --json');
    const statusJson = JSON.parse(status);

    if (statusJson.BackendState === 'Running') {
      actions.push('Tailscale is running');
      log.success('Tailscale restarted successfully');
      return {
        success: true,
        message: 'Tailscale restarted successfully',
        actions,
      };
    }

    return {
      success: false,
      message: `Tailscale state: ${statusJson.BackendState}`,
      actions,
      needsManualIntervention: true,
      manualInstructions: 'Run: tailscale up\nIf auth required: tailscale login',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to restart Tailscale: ${errorMessage}`);
    return {
      success: false,
      message: `Failed to restart Tailscale: ${errorMessage}`,
      actions,
      needsManualIntervention: true,
      manualInstructions: 'Check Tailscale installation:\ntailscale version\ntailscale status',
    };
  }
}

export async function checkAndFixFirewall(port: number): Promise<RemediationResult> {
  const actions: string[] = [];
  const log = logger.child('firewall');

  try {
    log.info(`Checking firewall for port ${port}`);

    if (isWindows()) {
      actions.push(`Checking Windows Firewall for port ${port}`);
      
      const checkCmd = `powershell -Command "Get-NetFirewallRule | Where-Object { $_.LocalPort -eq ${port} -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' }"`;
      
      try {
        const { stdout } = await execAsync(checkCmd);
        if (stdout.trim()) {
          actions.push('Firewall rule already exists');
          return {
            success: true,
            message: `Port ${port} is already allowed`,
            actions,
          };
        }
      } catch {
        // Rule doesn't exist, continue to create
      }

      actions.push(`Creating firewall rule for port ${port}`);
      const createCmd = `powershell -Command "New-NetFirewallRule -DisplayName 'Nebula Port ${port}' -Direction Inbound -LocalPort ${port} -Protocol TCP -Action Allow"`;
      await execAsync(createCmd);
      
      actions.push('Firewall rule created successfully');
      log.success(`Opened port ${port} in Windows Firewall`);

    } else {
      actions.push(`Checking Linux firewall for port ${port}`);

      const ufwExists = await commandExists('ufw');
      const firewalldExists = await commandExists('firewall-cmd');

      if (ufwExists) {
        actions.push('Using UFW');
        
        const { stdout: ufwStatus } = await execAsync('sudo ufw status | grep -w "^Status:"');
        if (ufwStatus.includes('inactive')) {
          actions.push('UFW is inactive, port is likely open');
          return {
            success: true,
            message: 'Firewall is inactive',
            actions,
          };
        }

        await execAsync(`sudo ufw allow ${port}/tcp`);
        actions.push(`Allowed port ${port}/tcp in UFW`);
        
      } else if (firewalldExists) {
        actions.push('Using firewalld');
        await execAsync(`sudo firewall-cmd --permanent --add-port=${port}/tcp`);
        await execAsync('sudo firewall-cmd --reload');
        actions.push(`Allowed port ${port}/tcp in firewalld`);
        
      } else {
        actions.push('No supported firewall found');
        return {
          success: true,
          message: 'No firewall detected (iptables may be in use)',
          actions,
          needsManualIntervention: true,
          manualInstructions: `Check iptables: sudo iptables -L -n | grep ${port}\nAdd rule: sudo iptables -A INPUT -p tcp --dport ${port} -j ACCEPT`,
        };
      }

      log.success(`Opened port ${port} in firewall`);
    }

    return {
      success: true,
      message: `Port ${port} opened in firewall`,
      actions,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Failed to configure firewall: ${errorMessage}`);
    return {
      success: false,
      message: `Failed to configure firewall: ${errorMessage}`,
      actions,
      needsManualIntervention: true,
      manualInstructions: `Manually open port ${port}:\n- Windows: New-NetFirewallRule -DisplayName 'Port ${port}' -Direction Inbound -LocalPort ${port} -Protocol TCP -Action Allow\n- Linux (ufw): sudo ufw allow ${port}/tcp\n- Linux (firewalld): sudo firewall-cmd --permanent --add-port=${port}/tcp && sudo firewall-cmd --reload`,
    };
  }
}

export async function runRemediation(
  handler: () => Promise<RemediationResult>,
  options: RemediationOptions = {}
): Promise<RemediationResult> {
  const {
    dryRun = false,
    timeout = 300000,
    retries = 0,
    logPrefix = 'remediation',
  } = options;

  const log = logger.child(logPrefix);
  let lastError: Error | null = null;
  let attempts = 0;

  while (attempts <= retries) {
    attempts++;

    try {
      if (dryRun) {
        log.info('[DRY RUN] Would execute remediation');
        return {
          success: true,
          message: 'Dry run - no changes made',
          actions: ['[DRY RUN] Remediation would be executed'],
        };
      }

      log.info(`Executing remediation (attempt ${attempts}/${retries + 1})`);

      const timeoutPromise = new Promise<RemediationResult>((_, reject) => {
        setTimeout(() => reject(new Error('Remediation timed out')), timeout);
      });

      const result = await Promise.race([handler(), timeoutPromise]);

      if (result.success) {
        log.success('Remediation completed successfully');
      } else {
        log.warn('Remediation completed with issues');
      }

      return result;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log.error(`Remediation attempt ${attempts} failed: ${lastError.message}`);

      if (attempts <= retries) {
        const delay = Math.min(1000 * Math.pow(2, attempts - 1), 30000);
        log.info(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  return {
    success: false,
    message: lastError?.message || 'Unknown error',
    actions: [`Failed after ${attempts} attempts`],
    needsManualIntervention: true,
    manualInstructions: 'Check logs for details and attempt manual remediation',
  };
}

export interface ManualSteps {
  title: string;
  steps: string[];
  commands?: string[];
  links?: string[];
}

export function suggestManualSteps(issue: string): ManualSteps {
  const issuePatterns: Record<string, ManualSteps> = {
    'connection refused': {
      title: 'Service Connection Issues',
      steps: [
        'Check if the service is running',
        'Verify the correct port is being used',
        'Check firewall rules',
        'Verify network connectivity',
      ],
      commands: [
        'netstat -tlnp | grep <port>',
        'systemctl status <service>',
        'sudo ufw status',
        'curl -v http://localhost:<port>',
      ],
    },
    'permission denied': {
      title: 'Permission Issues',
      steps: [
        'Check file/directory ownership',
        'Verify user permissions',
        'Check SELinux/AppArmor status if applicable',
      ],
      commands: [
        'ls -la <path>',
        'sudo chown -R $USER:$USER <path>',
        'chmod 755 <path>',
        'getenforce (SELinux)',
      ],
    },
    'port already in use': {
      title: 'Port Conflict Resolution',
      steps: [
        'Identify the process using the port',
        'Stop the conflicting process or use a different port',
        'Update service configuration if needed',
      ],
      commands: [
        'lsof -i :<port>',
        'netstat -tlnp | grep <port>',
        'kill -9 <pid>',
      ],
    },
    'module not found': {
      title: 'Missing Dependencies',
      steps: [
        'Check if node_modules exists',
        'Verify package.json has required dependencies',
        'Run npm install',
        'Check for peer dependency warnings',
      ],
      commands: [
        'npm ls',
        'npm install',
        'npm ci',
        'rm -rf node_modules && npm install',
      ],
    },
    'database connection': {
      title: 'Database Connection Issues',
      steps: [
        'Verify database service is running',
        'Check connection string/credentials',
        'Verify network access to database',
        'Check database user permissions',
      ],
      commands: [
        'systemctl status postgresql',
        'pg_isready -h localhost -p 5432',
        'psql -h localhost -U <user> -d <database>',
      ],
    },
    'ssl certificate': {
      title: 'SSL/TLS Certificate Issues',
      steps: [
        'Check certificate expiration',
        'Verify certificate chain is complete',
        'Ensure private key matches certificate',
        'Check certificate file permissions',
      ],
      commands: [
        'openssl x509 -enddate -noout -in <cert.pem>',
        'openssl verify -CAfile chain.pem cert.pem',
        'openssl s_client -connect <host>:443',
      ],
    },
    'out of memory': {
      title: 'Memory Issues',
      steps: [
        'Check available system memory',
        'Review application memory usage',
        'Consider increasing Node.js heap size',
        'Look for memory leaks',
      ],
      commands: [
        'free -h',
        'htop',
        'node --max-old-space-size=4096 <script>',
        'pm2 monit',
      ],
    },
    'disk full': {
      title: 'Disk Space Issues',
      steps: [
        'Check available disk space',
        'Find large files/directories',
        'Clean up logs and temporary files',
        'Consider log rotation',
      ],
      commands: [
        'df -h',
        'du -sh /* | sort -h',
        'journalctl --vacuum-size=100M',
        'docker system prune -a',
      ],
    },
    'tailscale': {
      title: 'Tailscale Connectivity Issues',
      steps: [
        'Check Tailscale daemon status',
        'Verify authentication',
        'Check network connectivity',
        'Review ACL rules in admin console',
      ],
      commands: [
        'tailscale status',
        'tailscale ping <host>',
        'tailscale netcheck',
        'sudo systemctl restart tailscaled',
      ],
      links: [
        'https://tailscale.com/kb/1023/troubleshooting',
        'https://login.tailscale.com/admin/machines',
      ],
    },
    default: {
      title: 'General Troubleshooting',
      steps: [
        'Check application logs',
        'Verify all dependencies are installed',
        'Check service status',
        'Review recent configuration changes',
        'Consult documentation',
      ],
      commands: [
        'journalctl -u <service> -f',
        'pm2 logs',
        'docker logs <container>',
        'cat /var/log/syslog | tail -100',
      ],
    },
  };

  const lowerIssue = issue.toLowerCase();
  
  for (const [pattern, steps] of Object.entries(issuePatterns)) {
    if (pattern !== 'default' && lowerIssue.includes(pattern)) {
      return steps;
    }
  }

  return issuePatterns.default;
}

export function createRemediation(
  name: string,
  description: string,
  canRunFn: () => Promise<boolean>,
  runFn: () => Promise<RemediationResult>,
  rollbackFn?: () => Promise<boolean>
): Remediation {
  return {
    name,
    description,
    canRun: canRunFn,
    run: runFn,
    rollback: rollbackFn,
  };
}

export const ServiceRemediations = {
  restartPm2Process,
  restartSystemdService,
  restartWindowsService,
  rebuildService,
};

export const DependencyRemediations = {
  installMissingNpmPackages,
  installMissingSystemPackages,
  createMissingDirectories,
};

export const ConfigRemediations = {
  generateSecretValue,
  copyEnvTemplate,
  validateEnvFile,
};

export const NetworkRemediations = {
  restartTailscale,
  checkAndFixFirewall,
};

export {
  runRemediation as executeRemediation,
  suggestManualSteps as getManualInstructions,
};
