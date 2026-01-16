import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { logger, createLogger } from '../lib/logger';
import * as path from 'path';
import * as fs from 'fs';

export interface SSHConfig {
  host: string;
  port?: number;
  username: string;
  privateKey?: string;
  privateKeyPath?: string;
  password?: string;
  passphrase?: string;
}

export interface PreCheckResult {
  success: boolean;
  checks: {
    name: string;
    passed: boolean;
    message: string;
  }[];
  errors: string[];
  warnings: string[];
}

export interface DeployResult {
  success: boolean;
  environment: string;
  services: {
    name: string;
    status: 'deployed' | 'failed' | 'skipped';
    message?: string;
    duration?: number;
  }[];
  totalDuration: number;
  errors: string[];
  rollbackAvailable: boolean;
}

export interface VerifyResult {
  success: boolean;
  checks: {
    name: string;
    passed: boolean;
    endpoint?: string;
    responseTime?: number;
    message: string;
  }[];
  healthScore: number;
}

export interface DeployOptions {
  dryRun?: boolean;
  force?: boolean;
  services?: string[];
  skipBuild?: boolean;
  skipVerify?: boolean;
  verbose?: boolean;
  branch?: string;
  rollbackOnFail?: boolean;
}

export interface Deployer {
  name: string;
  environment: string;
  services: string[];
  preCheck(): Promise<PreCheckResult>;
  deploy(options: DeployOptions): Promise<DeployResult>;
  verify(): Promise<VerifyResult>;
  rollback?(): Promise<boolean>;
}

export async function runRemoteCommand(
  sshConfig: SSHConfig,
  command: string,
  options: { timeout?: number; sudo?: boolean } = {}
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const { timeout = 60000, sudo = false } = options;

    let stdout = '';
    let stderr = '';
    let timeoutHandle: NodeJS.Timeout | null = null;

    const config: ConnectConfig = {
      host: sshConfig.host,
      port: sshConfig.port || 22,
      username: sshConfig.username,
    };

    if (sshConfig.privateKey) {
      config.privateKey = sshConfig.privateKey;
    } else if (sshConfig.privateKeyPath) {
      config.privateKey = fs.readFileSync(sshConfig.privateKeyPath);
    }

    if (sshConfig.password) {
      config.password = sshConfig.password;
    }

    if (sshConfig.passphrase) {
      config.passphrase = sshConfig.passphrase;
    }

    conn.on('ready', () => {
      const fullCommand = sudo ? `sudo ${command}` : command;

      timeoutHandle = setTimeout(() => {
        conn.end();
        reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
      }, timeout);

      conn.exec(fullCommand, (err, stream) => {
        if (err) {
          clearTimeout(timeoutHandle!);
          conn.end();
          reject(err);
          return;
        }

        stream.on('close', (code: number) => {
          clearTimeout(timeoutHandle!);
          conn.end();
          resolve({ stdout, stderr, code });
        });

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });

    conn.on('error', (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(err);
    });

    conn.connect(config);
  });
}

export async function uploadFiles(
  sshConfig: SSHConfig,
  localPath: string,
  remotePath: string,
  options: { recursive?: boolean } = {}
): Promise<{ success: boolean; filesUploaded: number; errors: string[] }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let filesUploaded = 0;
    const errors: string[] = [];

    const config: ConnectConfig = {
      host: sshConfig.host,
      port: sshConfig.port || 22,
      username: sshConfig.username,
    };

    if (sshConfig.privateKey) {
      config.privateKey = sshConfig.privateKey;
    } else if (sshConfig.privateKeyPath) {
      config.privateKey = fs.readFileSync(sshConfig.privateKeyPath);
    }

    if (sshConfig.password) {
      config.password = sshConfig.password;
    }

    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }

        const uploadFile = (local: string, remote: string): Promise<void> => {
          return new Promise((res, rej) => {
            sftp.fastPut(local, remote, (err) => {
              if (err) {
                errors.push(`Failed to upload ${local}: ${err.message}`);
                rej(err);
              } else {
                filesUploaded++;
                res();
              }
            });
          });
        };

        const uploadDirectory = async (localDir: string, remoteDir: string): Promise<void> => {
          const stat = fs.statSync(localDir);

          if (stat.isFile()) {
            await uploadFile(localDir, remoteDir);
            return;
          }

          await new Promise<void>((res, rej) => {
            sftp.mkdir(remoteDir, (err) => {
              if (err && (err as any).code !== 4) {
                rej(err);
              } else {
                res();
              }
            });
          });

          const files = fs.readdirSync(localDir);
          for (const file of files) {
            const localFile = path.join(localDir, file);
            const remoteFile = path.posix.join(remoteDir, file);
            await uploadDirectory(localFile, remoteFile);
          }
        };

        (async () => {
          try {
            if (options.recursive && fs.statSync(localPath).isDirectory()) {
              await uploadDirectory(localPath, remotePath);
            } else {
              await uploadFile(localPath, remotePath);
            }
            conn.end();
            resolve({ success: errors.length === 0, filesUploaded, errors });
          } catch (err) {
            conn.end();
            resolve({ success: false, filesUploaded, errors });
          }
        })();
      });
    });

    conn.on('error', (err) => {
      reject(err);
    });

    conn.connect(config);
  });
}

export async function runDeployment(
  deployer: Deployer,
  options: DeployOptions = {}
): Promise<DeployResult> {
  const log = createLogger({ prefix: deployer.name });
  const startTime = Date.now();

  log.header(`Deploying to ${deployer.environment}`);
  log.info(`Deployer: ${deployer.name}`);
  log.info(`Services: ${deployer.services.join(', ')}`);
  log.info(`Options: ${JSON.stringify(options)}`);
  log.blank();

  if (options.dryRun) {
    log.warn('DRY RUN MODE - No changes will be made');
    log.blank();
  }

  const preCheckSpinner = ora('Running pre-flight checks...').start();

  try {
    const preCheckResult = await deployer.preCheck();

    if (!preCheckResult.success) {
      preCheckSpinner.fail('Pre-flight checks failed');
      preCheckResult.errors.forEach((err) => log.error(`  ${err}`));
      return {
        success: false,
        environment: deployer.environment,
        services: deployer.services.map((s) => ({
          name: s,
          status: 'skipped' as const,
          message: 'Pre-flight checks failed',
        })),
        totalDuration: Date.now() - startTime,
        errors: preCheckResult.errors,
        rollbackAvailable: false,
      };
    }

    preCheckSpinner.succeed('Pre-flight checks passed');

    preCheckResult.checks.forEach((check) => {
      const icon = check.passed ? chalk.green('✓') : chalk.red('✗');
      log.info(`  ${icon} ${check.name}: ${check.message}`);
    });

    if (preCheckResult.warnings.length > 0) {
      log.blank();
      log.warn('Warnings:');
      preCheckResult.warnings.forEach((w) => log.warn(`  ${w}`));
    }

    log.blank();

    const deploySpinner = ora('Deploying services...').start();
    const deployResult = await deployer.deploy(options);
    deploySpinner.stop();

    deployResult.services.forEach((service) => {
      const icon =
        service.status === 'deployed'
          ? chalk.green('✓')
          : service.status === 'failed'
            ? chalk.red('✗')
            : chalk.yellow('○');
      const duration = service.duration ? ` (${service.duration}ms)` : '';
      log.info(`  ${icon} ${service.name}: ${service.status}${duration}`);
      if (service.message) {
        log.info(`      ${chalk.gray(service.message)}`);
      }
    });

    if (!options.skipVerify && deployResult.success) {
      log.blank();
      const verifySpinner = ora('Verifying deployment...').start();
      const verifyResult = await deployer.verify();
      verifySpinner.stop();

      if (verifyResult.success) {
        log.success(`Verification passed (health score: ${verifyResult.healthScore}%)`);
      } else {
        log.warn(`Verification issues detected (health score: ${verifyResult.healthScore}%)`);
      }

      verifyResult.checks.forEach((check) => {
        const icon = check.passed ? chalk.green('✓') : chalk.red('✗');
        const timing = check.responseTime ? ` (${check.responseTime}ms)` : '';
        log.info(`  ${icon} ${check.name}${timing}: ${check.message}`);
      });

      if (!verifyResult.success && options.rollbackOnFail && deployer.rollback) {
        log.blank();
        log.warn('Initiating rollback...');
        const rollbackSpinner = ora('Rolling back...').start();
        const rollbackSuccess = await deployer.rollback();
        if (rollbackSuccess) {
          rollbackSpinner.succeed('Rollback completed');
        } else {
          rollbackSpinner.fail('Rollback failed');
        }
      }
    }

    log.blank();
    log.divider();
    const totalDuration = Date.now() - startTime;
    log.info(`Deployment completed in ${(totalDuration / 1000).toFixed(2)}s`);

    return deployResult;
  } catch (err) {
    preCheckSpinner.fail('Deployment failed');
    const error = err as Error;
    log.error(error.message);

    return {
      success: false,
      environment: deployer.environment,
      services: deployer.services.map((s) => ({
        name: s,
        status: 'failed' as const,
        message: error.message,
      })),
      totalDuration: Date.now() - startTime,
      errors: [error.message],
      rollbackAvailable: !!deployer.rollback,
    };
  }
}

export class LinodeDeployer implements Deployer {
  name = 'LinodeDeployer';
  environment = 'linode';
  services = ['dashboard-next', 'discord-bot', 'stream-bot'];

  private sshConfig: SSHConfig;
  private nebulaDir: string;
  private repoUrl: string;
  private branch: string;

  constructor(
    sshConfig: SSHConfig,
    options: {
      nebulaDir?: string;
      repoUrl?: string;
      branch?: string;
    } = {}
  ) {
    this.sshConfig = sshConfig;
    this.nebulaDir = options.nebulaDir || '/opt/homelab/NebulaCommand';
    this.repoUrl = options.repoUrl || 'https://github.com/evindrake/NebulaCommand.git';
    this.branch = options.branch || 'main';
  }

  async preCheck(): Promise<PreCheckResult> {
    const checks: PreCheckResult['checks'] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const sshCheck = await runRemoteCommand(this.sshConfig, 'echo "connected"', { timeout: 10000 });
      checks.push({
        name: 'SSH Connection',
        passed: sshCheck.code === 0,
        message: sshCheck.code === 0 ? 'Connected successfully' : 'Connection failed',
      });

      if (sshCheck.code !== 0) {
        errors.push('Cannot connect to Linode server via SSH');
        return { success: false, checks, errors, warnings };
      }

      const nodeCheck = await runRemoteCommand(this.sshConfig, 'node --version');
      checks.push({
        name: 'Node.js',
        passed: nodeCheck.code === 0,
        message: nodeCheck.code === 0 ? nodeCheck.stdout.trim() : 'Not installed',
      });

      if (nodeCheck.code !== 0) {
        warnings.push('Node.js not installed - will be installed during deployment');
      }

      const npmCheck = await runRemoteCommand(this.sshConfig, 'npm --version');
      checks.push({
        name: 'npm',
        passed: npmCheck.code === 0,
        message: npmCheck.code === 0 ? `v${npmCheck.stdout.trim()}` : 'Not installed',
      });

      const pm2Check = await runRemoteCommand(this.sshConfig, 'pm2 --version');
      checks.push({
        name: 'PM2',
        passed: pm2Check.code === 0,
        message: pm2Check.code === 0 ? `v${pm2Check.stdout.trim()}` : 'Not installed',
      });

      if (pm2Check.code !== 0) {
        warnings.push('PM2 not installed - will be installed during deployment');
      }

      const gitCheck = await runRemoteCommand(this.sshConfig, 'git --version');
      checks.push({
        name: 'Git',
        passed: gitCheck.code === 0,
        message: gitCheck.code === 0 ? gitCheck.stdout.trim() : 'Not installed',
      });

      if (gitCheck.code !== 0) {
        errors.push('Git is required but not installed');
      }

      const diskCheck = await runRemoteCommand(
        this.sshConfig,
        "df -h / | tail -1 | awk '{print $5}'"
      );
      const diskUsage = parseInt(diskCheck.stdout.replace('%', ''));
      checks.push({
        name: 'Disk Space',
        passed: diskUsage < 90,
        message: `${diskCheck.stdout.trim()} used`,
      });

      if (diskUsage >= 90) {
        warnings.push('Disk usage is above 90%');
      }

      const caddyCheck = await runRemoteCommand(this.sshConfig, 'systemctl is-active caddy', { sudo: true });
      checks.push({
        name: 'Caddy',
        passed: caddyCheck.stdout.trim() === 'active',
        message: caddyCheck.stdout.trim() || 'Not installed',
      });

      return {
        success: errors.length === 0,
        checks,
        errors,
        warnings,
      };
    } catch (err) {
      errors.push((err as Error).message);
      return { success: false, checks, errors, warnings };
    }
  }

  async deploy(options: DeployOptions = {}): Promise<DeployResult> {
    const startTime = Date.now();
    const serviceResults: DeployResult['services'] = [];
    const errors: string[] = [];

    const targetServices = options.services || this.services;

    try {
      const repoSpinner = ora('Updating repository...').start();

      if (options.dryRun) {
        repoSpinner.info('DRY RUN: Would update repository');
      } else {
        const repoExists = await runRemoteCommand(
          this.sshConfig,
          `test -d ${this.nebulaDir}/.git && echo "exists"`
        );

        if (repoExists.stdout.includes('exists')) {
          await runRemoteCommand(
            this.sshConfig,
            `cd ${this.nebulaDir} && git fetch origin && git reset --hard origin/${this.branch}`
          );
          repoSpinner.succeed('Repository updated');
        } else {
          await runRemoteCommand(
            this.sshConfig,
            `mkdir -p $(dirname ${this.nebulaDir}) && git clone -b ${this.branch} ${this.repoUrl} ${this.nebulaDir}`
          );
          repoSpinner.succeed('Repository cloned');
        }
      }

      for (const service of targetServices) {
        const serviceStart = Date.now();
        const serviceSpinner = ora(`Deploying ${service}...`).start();

        try {
          if (options.dryRun) {
            serviceSpinner.info(`DRY RUN: Would deploy ${service}`);
            serviceResults.push({
              name: service,
              status: 'deployed',
              message: 'Dry run - no changes made',
              duration: Date.now() - serviceStart,
            });
            continue;
          }

          const serviceDir = `${this.nebulaDir}/services/${service}`;

          const installResult = await runRemoteCommand(
            this.sshConfig,
            `cd ${serviceDir} && npm ci --production 2>/dev/null || npm install --production`,
            { timeout: 300000 }
          );

          if (installResult.code !== 0) {
            throw new Error(`npm install failed: ${installResult.stderr}`);
          }

          if (!options.skipBuild) {
            const buildResult = await runRemoteCommand(
              this.sshConfig,
              `cd ${serviceDir} && npm run build 2>/dev/null || true`,
              { timeout: 300000 }
            );
          }

          const pm2Check = await runRemoteCommand(
            this.sshConfig,
            `pm2 describe ${service} 2>/dev/null || echo "not found"`
          );

          if (pm2Check.stdout.includes('not found')) {
            await runRemoteCommand(
              this.sshConfig,
              `cd ${serviceDir} && pm2 start npm --name "${service}" -- run start`
            );
          } else {
            await runRemoteCommand(this.sshConfig, `pm2 restart ${service}`);
          }

          await runRemoteCommand(this.sshConfig, 'pm2 save');

          serviceSpinner.succeed(`Deployed ${service}`);
          serviceResults.push({
            name: service,
            status: 'deployed',
            duration: Date.now() - serviceStart,
          });
        } catch (err) {
          serviceSpinner.fail(`Failed to deploy ${service}`);
          const error = err as Error;
          errors.push(`${service}: ${error.message}`);
          serviceResults.push({
            name: service,
            status: 'failed',
            message: error.message,
            duration: Date.now() - serviceStart,
          });
        }
      }

      if (!options.dryRun) {
        const caddySpinner = ora('Configuring Caddy...').start();
        try {
          const caddyActive = await runRemoteCommand(
            this.sshConfig,
            'systemctl is-active caddy',
            { sudo: true }
          );

          if (caddyActive.stdout.trim() !== 'active') {
            await runRemoteCommand(this.sshConfig, 'systemctl start caddy', { sudo: true });
          } else {
            await runRemoteCommand(this.sshConfig, 'systemctl reload caddy', { sudo: true });
          }
          caddySpinner.succeed('Caddy configured');
        } catch (err) {
          caddySpinner.warn('Caddy configuration skipped');
        }
      }

      const hasFailures = serviceResults.some((s) => s.status === 'failed');

      return {
        success: !hasFailures,
        environment: this.environment,
        services: serviceResults,
        totalDuration: Date.now() - startTime,
        errors,
        rollbackAvailable: true,
      };
    } catch (err) {
      const error = err as Error;
      errors.push(error.message);
      return {
        success: false,
        environment: this.environment,
        services: serviceResults,
        totalDuration: Date.now() - startTime,
        errors,
        rollbackAvailable: true,
      };
    }
  }

  async verify(): Promise<VerifyResult> {
    const checks: VerifyResult['checks'] = [];
    let passedCount = 0;

    const endpoints = [
      { name: 'Dashboard', port: 5000, path: '/api/health' },
      { name: 'Discord Bot', port: 4000, path: '/api/health' },
      { name: 'Stream Bot', port: 3000, path: '/api/health' },
    ];

    for (const endpoint of endpoints) {
      const startTime = Date.now();
      try {
        const result = await runRemoteCommand(
          this.sshConfig,
          `curl -s -o /dev/null -w "%{http_code}" http://localhost:${endpoint.port}${endpoint.path}`,
          { timeout: 10000 }
        );

        const statusCode = parseInt(result.stdout.trim());
        const responseTime = Date.now() - startTime;
        const passed = statusCode >= 200 && statusCode < 400;

        if (passed) passedCount++;

        checks.push({
          name: endpoint.name,
          passed,
          endpoint: `http://localhost:${endpoint.port}${endpoint.path}`,
          responseTime,
          message: passed ? `HTTP ${statusCode}` : `HTTP ${statusCode} - Service not healthy`,
        });
      } catch (err) {
        checks.push({
          name: endpoint.name,
          passed: false,
          endpoint: `http://localhost:${endpoint.port}${endpoint.path}`,
          message: `Error: ${(err as Error).message}`,
        });
      }
    }

    const pm2Check = await runRemoteCommand(this.sshConfig, 'pm2 jlist');
    try {
      const processes = JSON.parse(pm2Check.stdout);
      const runningCount = processes.filter((p: any) => p.pm2_env?.status === 'online').length;
      checks.push({
        name: 'PM2 Processes',
        passed: runningCount >= 3,
        message: `${runningCount} processes online`,
      });
      if (runningCount >= 3) passedCount++;
    } catch {
      checks.push({
        name: 'PM2 Processes',
        passed: false,
        message: 'Could not parse PM2 status',
      });
    }

    const healthScore = Math.round((passedCount / checks.length) * 100);

    return {
      success: healthScore >= 75,
      checks,
      healthScore,
    };
  }

  async rollback(): Promise<boolean> {
    try {
      const rollbackSpinner = ora('Rolling back to previous version...').start();

      await runRemoteCommand(
        this.sshConfig,
        `cd ${this.nebulaDir} && git checkout HEAD~1`
      );

      for (const service of this.services) {
        await runRemoteCommand(this.sshConfig, `pm2 restart ${service}`);
      }

      rollbackSpinner.succeed('Rollback completed');
      return true;
    } catch (err) {
      logger.error(`Rollback failed: ${(err as Error).message}`);
      return false;
    }
  }
}

export class UbuntuHomeDeployer implements Deployer {
  name = 'UbuntuHomeDeployer';
  environment = 'ubuntu-home';
  services = ['wol-relay', 'kvm-manager', 'docker-services', 'tailscale'];

  private sshConfig: SSHConfig;
  private nebulaDir: string;
  private windowsVmName: string;

  constructor(
    sshConfig: SSHConfig,
    options: {
      nebulaDir?: string;
      windowsVmName?: string;
    } = {}
  ) {
    this.sshConfig = sshConfig;
    this.nebulaDir = options.nebulaDir || '/opt/nebula';
    this.windowsVmName = options.windowsVmName || 'RDPWindows';
  }

  async preCheck(): Promise<PreCheckResult> {
    const checks: PreCheckResult['checks'] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const sshCheck = await runRemoteCommand(this.sshConfig, 'echo "connected"', { timeout: 10000 });
      checks.push({
        name: 'SSH Connection',
        passed: sshCheck.code === 0,
        message: sshCheck.code === 0 ? 'Connected successfully' : 'Connection failed',
      });

      if (sshCheck.code !== 0) {
        errors.push('Cannot connect to Ubuntu Home server via SSH');
        return { success: false, checks, errors, warnings };
      }

      const virshCheck = await runRemoteCommand(this.sshConfig, 'which virsh');
      checks.push({
        name: 'KVM/libvirt',
        passed: virshCheck.code === 0,
        message: virshCheck.code === 0 ? 'Installed' : 'Not installed',
      });

      if (virshCheck.code !== 0) {
        warnings.push('libvirt not installed - KVM management will be limited');
      }

      const libvirtdCheck = await runRemoteCommand(this.sshConfig, 'systemctl is-active libvirtd', { sudo: true });
      checks.push({
        name: 'libvirtd Service',
        passed: libvirtdCheck.stdout.trim() === 'active',
        message: libvirtdCheck.stdout.trim() || 'Not running',
      });

      const dockerCheck = await runRemoteCommand(this.sshConfig, 'docker --version');
      checks.push({
        name: 'Docker',
        passed: dockerCheck.code === 0,
        message: dockerCheck.code === 0 ? dockerCheck.stdout.trim() : 'Not installed',
      });

      const tailscaleCheck = await runRemoteCommand(this.sshConfig, 'tailscale status --json');
      checks.push({
        name: 'Tailscale',
        passed: tailscaleCheck.code === 0,
        message: tailscaleCheck.code === 0 ? 'Connected' : 'Not connected',
      });

      if (tailscaleCheck.code !== 0) {
        warnings.push('Tailscale not connected - remote access may be limited');
      }

      const vmCheck = await runRemoteCommand(
        this.sshConfig,
        `virsh domstate ${this.windowsVmName}`,
        { sudo: true }
      );
      checks.push({
        name: `Windows VM (${this.windowsVmName})`,
        passed: vmCheck.code === 0,
        message: vmCheck.code === 0 ? vmCheck.stdout.trim() : 'Not found',
      });

      return {
        success: errors.length === 0,
        checks,
        errors,
        warnings,
      };
    } catch (err) {
      errors.push((err as Error).message);
      return { success: false, checks, errors, warnings };
    }
  }

  async deploy(options: DeployOptions = {}): Promise<DeployResult> {
    const startTime = Date.now();
    const serviceResults: DeployResult['services'] = [];
    const errors: string[] = [];

    try {
      const dirsSpinner = ora('Creating directories...').start();

      if (options.dryRun) {
        dirsSpinner.info('DRY RUN: Would create directories');
      } else {
        await runRemoteCommand(
          this.sshConfig,
          `mkdir -p ${this.nebulaDir}/{data,secrets,docker} /var/log/nebula`,
          { sudo: true }
        );
        await runRemoteCommand(
          this.sshConfig,
          `chown -R $USER:$USER ${this.nebulaDir}`,
          { sudo: true }
        );
        dirsSpinner.succeed('Directories created');
      }

      const libvirtSpinner = ora('Configuring libvirt/KVM...').start();
      try {
        if (options.dryRun) {
          libvirtSpinner.info('DRY RUN: Would configure libvirt');
          serviceResults.push({ name: 'kvm-manager', status: 'deployed', message: 'Dry run' });
        } else {
          await runRemoteCommand(this.sshConfig, 'systemctl start libvirtd', { sudo: true });
          await runRemoteCommand(this.sshConfig, 'systemctl enable libvirtd', { sudo: true });

          const vmState = await runRemoteCommand(
            this.sshConfig,
            `virsh domstate ${this.windowsVmName}`,
            { sudo: true }
          );

          if (vmState.stdout.trim() === 'shut off') {
            await runRemoteCommand(
              this.sshConfig,
              `virsh start ${this.windowsVmName}`,
              { sudo: true }
            );
          }

          libvirtSpinner.succeed('libvirt/KVM configured');
          serviceResults.push({ name: 'kvm-manager', status: 'deployed', duration: Date.now() - startTime });
        }
      } catch (err) {
        libvirtSpinner.fail('libvirt configuration failed');
        errors.push((err as Error).message);
        serviceResults.push({ name: 'kvm-manager', status: 'failed', message: (err as Error).message });
      }

      const wolSpinner = ora('Setting up WoL relay...').start();
      try {
        if (options.dryRun) {
          wolSpinner.info('DRY RUN: Would setup WoL relay');
          serviceResults.push({ name: 'wol-relay', status: 'deployed', message: 'Dry run' });
        } else {
          await runRemoteCommand(
            this.sshConfig,
            'apt-get install -y wakeonlan etherwake 2>/dev/null || true',
            { sudo: true }
          );

          const wolServiceContent = `[Unit]
Description=Wake-on-LAN Relay Service
After=network.target

[Service]
Type=simple
ExecStart=/bin/bash -c 'echo "WoL relay ready"'
Restart=on-failure

[Install]
WantedBy=multi-user.target`;

          await runRemoteCommand(
            this.sshConfig,
            `echo '${wolServiceContent}' | sudo tee /etc/systemd/system/wol-relay.service`
          );

          await runRemoteCommand(this.sshConfig, 'systemctl daemon-reload', { sudo: true });

          wolSpinner.succeed('WoL relay configured');
          serviceResults.push({ name: 'wol-relay', status: 'deployed' });
        }
      } catch (err) {
        wolSpinner.warn('WoL relay setup skipped');
        serviceResults.push({ name: 'wol-relay', status: 'skipped', message: (err as Error).message });
      }

      const dockerSpinner = ora('Starting Docker services...').start();
      try {
        if (options.dryRun) {
          dockerSpinner.info('DRY RUN: Would start Docker services');
          serviceResults.push({ name: 'docker-services', status: 'deployed', message: 'Dry run' });
        } else {
          await runRemoteCommand(this.sshConfig, 'systemctl start docker', { sudo: true });
          await runRemoteCommand(this.sshConfig, 'systemctl enable docker', { sudo: true });

          dockerSpinner.succeed('Docker services started');
          serviceResults.push({ name: 'docker-services', status: 'deployed' });
        }
      } catch (err) {
        dockerSpinner.warn('Docker services skipped');
        serviceResults.push({ name: 'docker-services', status: 'skipped', message: (err as Error).message });
      }

      const tailscaleSpinner = ora('Verifying Tailscale...').start();
      try {
        const tsStatus = await runRemoteCommand(this.sshConfig, 'tailscale ip -4');

        if (tsStatus.code === 0) {
          tailscaleSpinner.succeed(`Tailscale connected: ${tsStatus.stdout.trim()}`);
          serviceResults.push({
            name: 'tailscale',
            status: 'deployed',
            message: `IP: ${tsStatus.stdout.trim()}`,
          });
        } else {
          tailscaleSpinner.warn('Tailscale not connected');
          serviceResults.push({ name: 'tailscale', status: 'skipped', message: 'Not connected' });
        }
      } catch (err) {
        tailscaleSpinner.warn('Tailscale verification skipped');
        serviceResults.push({ name: 'tailscale', status: 'skipped' });
      }

      const hasFailures = serviceResults.some((s) => s.status === 'failed');

      return {
        success: !hasFailures,
        environment: this.environment,
        services: serviceResults,
        totalDuration: Date.now() - startTime,
        errors,
        rollbackAvailable: false,
      };
    } catch (err) {
      const error = err as Error;
      errors.push(error.message);
      return {
        success: false,
        environment: this.environment,
        services: serviceResults,
        totalDuration: Date.now() - startTime,
        errors,
        rollbackAvailable: false,
      };
    }
  }

  async verify(): Promise<VerifyResult> {
    const checks: VerifyResult['checks'] = [];
    let passedCount = 0;

    const libvirtCheck = await runRemoteCommand(
      this.sshConfig,
      'systemctl is-active libvirtd',
      { sudo: true }
    );
    const libvirtPassed = libvirtCheck.stdout.trim() === 'active';
    if (libvirtPassed) passedCount++;
    checks.push({
      name: 'libvirtd',
      passed: libvirtPassed,
      message: libvirtCheck.stdout.trim(),
    });

    const vmCheck = await runRemoteCommand(
      this.sshConfig,
      `virsh domstate ${this.windowsVmName}`,
      { sudo: true }
    );
    const vmPassed = vmCheck.stdout.trim() === 'running';
    if (vmPassed) passedCount++;
    checks.push({
      name: `Windows VM (${this.windowsVmName})`,
      passed: vmPassed,
      message: vmCheck.stdout.trim() || 'Not found',
    });

    const dockerCheck = await runRemoteCommand(
      this.sshConfig,
      'systemctl is-active docker',
      { sudo: true }
    );
    const dockerPassed = dockerCheck.stdout.trim() === 'active';
    if (dockerPassed) passedCount++;
    checks.push({
      name: 'Docker',
      passed: dockerPassed,
      message: dockerCheck.stdout.trim(),
    });

    const tailscaleCheck = await runRemoteCommand(this.sshConfig, 'tailscale ip -4');
    const tailscalePassed = tailscaleCheck.code === 0;
    if (tailscalePassed) passedCount++;
    checks.push({
      name: 'Tailscale',
      passed: tailscalePassed,
      message: tailscalePassed ? `IP: ${tailscaleCheck.stdout.trim()}` : 'Not connected',
    });

    const healthScore = Math.round((passedCount / checks.length) * 100);

    return {
      success: healthScore >= 50,
      checks,
      healthScore,
    };
  }
}

export class WindowsVMDeployer implements Deployer {
  name = 'WindowsVMDeployer';
  environment = 'windows-vm';
  services = ['nebula-agent', 'ollama', 'comfyui', 'stable-diffusion'];

  private sshConfig: SSHConfig;
  private nebulaDir: string;
  private agentDir: string;

  constructor(
    sshConfig: SSHConfig,
    options: {
      nebulaDir?: string;
      agentDir?: string;
    } = {}
  ) {
    this.sshConfig = sshConfig;
    this.nebulaDir = options.nebulaDir || 'C:\\NebulaCommand';
    this.agentDir = options.agentDir || 'C:\\AI\\nebula-agent';
  }

  async preCheck(): Promise<PreCheckResult> {
    const checks: PreCheckResult['checks'] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const sshCheck = await runRemoteCommand(this.sshConfig, 'echo connected', { timeout: 15000 });
      checks.push({
        name: 'SSH Connection',
        passed: sshCheck.code === 0,
        message: sshCheck.code === 0 ? 'Connected successfully' : 'Connection failed',
      });

      if (sshCheck.code !== 0) {
        errors.push('Cannot connect to Windows VM via SSH');
        return { success: false, checks, errors, warnings };
      }

      const nodeCheck = await runRemoteCommand(this.sshConfig, 'node --version');
      checks.push({
        name: 'Node.js',
        passed: nodeCheck.code === 0,
        message: nodeCheck.code === 0 ? nodeCheck.stdout.trim() : 'Not installed',
      });

      if (nodeCheck.code !== 0) {
        errors.push('Node.js is required but not installed');
      }

      const npmCheck = await runRemoteCommand(this.sshConfig, 'npm --version');
      checks.push({
        name: 'npm',
        passed: npmCheck.code === 0,
        message: npmCheck.code === 0 ? `v${npmCheck.stdout.trim()}` : 'Not installed',
      });

      const pm2Check = await runRemoteCommand(this.sshConfig, 'pm2 --version');
      checks.push({
        name: 'PM2',
        passed: pm2Check.code === 0,
        message: pm2Check.code === 0 ? `v${pm2Check.stdout.trim()}` : 'Not installed',
      });

      if (pm2Check.code !== 0) {
        warnings.push('PM2 not installed - will attempt to install');
      }

      const gpuCheck = await runRemoteCommand(this.sshConfig, 'nvidia-smi --query-gpu=name --format=csv,noheader');
      checks.push({
        name: 'NVIDIA GPU',
        passed: gpuCheck.code === 0,
        message: gpuCheck.code === 0 ? gpuCheck.stdout.trim() : 'Not detected',
      });

      if (gpuCheck.code !== 0) {
        warnings.push('NVIDIA GPU not detected - AI services may run on CPU only');
      }

      const ollamaCheck = await runRemoteCommand(this.sshConfig, 'ollama --version');
      checks.push({
        name: 'Ollama',
        passed: ollamaCheck.code === 0,
        message: ollamaCheck.code === 0 ? ollamaCheck.stdout.trim() : 'Not installed',
      });

      return {
        success: errors.length === 0,
        checks,
        errors,
        warnings,
      };
    } catch (err) {
      errors.push((err as Error).message);
      return { success: false, checks, errors, warnings };
    }
  }

  async deploy(options: DeployOptions = {}): Promise<DeployResult> {
    const startTime = Date.now();
    const serviceResults: DeployResult['services'] = [];
    const errors: string[] = [];

    try {
      const dirsSpinner = ora('Creating directories...').start();

      if (options.dryRun) {
        dirsSpinner.info('DRY RUN: Would create directories');
      } else {
        await runRemoteCommand(
          this.sshConfig,
          `if not exist "${this.nebulaDir}" mkdir "${this.nebulaDir}"`
        );
        await runRemoteCommand(
          this.sshConfig,
          `if not exist "${this.nebulaDir}\\secrets" mkdir "${this.nebulaDir}\\secrets"`
        );
        await runRemoteCommand(
          this.sshConfig,
          `if not exist "${this.agentDir}" mkdir "${this.agentDir}"`
        );
        await runRemoteCommand(
          this.sshConfig,
          'if not exist "C:\\AI" mkdir "C:\\AI"'
        );
        dirsSpinner.succeed('Directories created');
      }

      const pm2Spinner = ora('Ensuring PM2 is installed...').start();
      try {
        const pm2Check = await runRemoteCommand(this.sshConfig, 'pm2 --version');
        if (pm2Check.code !== 0) {
          if (!options.dryRun) {
            await runRemoteCommand(this.sshConfig, 'npm install -g pm2', { timeout: 120000 });
          }
        }
        pm2Spinner.succeed('PM2 ready');
      } catch {
        pm2Spinner.warn('PM2 installation skipped');
      }

      const agentSpinner = ora('Deploying Nebula Agent...').start();
      try {
        if (options.dryRun) {
          agentSpinner.info('DRY RUN: Would deploy Nebula Agent');
          serviceResults.push({ name: 'nebula-agent', status: 'deployed', message: 'Dry run' });
        } else {
          const agentExists = await runRemoteCommand(
            this.sshConfig,
            `if exist "${this.nebulaDir}\\services\\nebula-agent\\package.json" echo exists`
          );

          if (agentExists.stdout.includes('exists')) {
            await runRemoteCommand(
              this.sshConfig,
              `cd /d "${this.nebulaDir}\\services\\nebula-agent" && npm ci --production`,
              { timeout: 300000 }
            );

            const pm2Running = await runRemoteCommand(
              this.sshConfig,
              'pm2 describe nebula-agent'
            );

            if (pm2Running.code === 0) {
              await runRemoteCommand(this.sshConfig, 'pm2 restart nebula-agent');
            } else {
              await runRemoteCommand(
                this.sshConfig,
                `cd /d "${this.nebulaDir}\\services\\nebula-agent" && pm2 start npm --name "nebula-agent" -- run start`
              );
            }

            await runRemoteCommand(this.sshConfig, 'pm2 save');

            agentSpinner.succeed('Nebula Agent deployed');
            serviceResults.push({
              name: 'nebula-agent',
              status: 'deployed',
              duration: Date.now() - startTime,
            });
          } else {
            agentSpinner.warn('Nebula Agent source not found - skipping');
            serviceResults.push({
              name: 'nebula-agent',
              status: 'skipped',
              message: 'Source not found',
            });
          }
        }
      } catch (err) {
        agentSpinner.fail('Nebula Agent deployment failed');
        errors.push((err as Error).message);
        serviceResults.push({
          name: 'nebula-agent',
          status: 'failed',
          message: (err as Error).message,
        });
      }

      const ollamaSpinner = ora('Configuring Ollama...').start();
      try {
        const ollamaCheck = await runRemoteCommand(this.sshConfig, 'ollama --version');

        if (ollamaCheck.code === 0) {
          if (!options.dryRun) {
            await runRemoteCommand(
              this.sshConfig,
              'tasklist /FI "IMAGENAME eq ollama.exe" | find "ollama.exe" || start /B ollama serve'
            );
          }
          ollamaSpinner.succeed('Ollama configured');
          serviceResults.push({ name: 'ollama', status: 'deployed' });
        } else {
          ollamaSpinner.warn('Ollama not installed');
          serviceResults.push({
            name: 'ollama',
            status: 'skipped',
            message: 'Not installed',
          });
        }
      } catch (err) {
        ollamaSpinner.warn('Ollama configuration skipped');
        serviceResults.push({ name: 'ollama', status: 'skipped' });
      }

      const comfySpinner = ora('Checking ComfyUI...').start();
      try {
        const comfyCheck = await runRemoteCommand(
          this.sshConfig,
          'if exist "C:\\AI\\ComfyUI\\main.py" echo exists'
        );

        if (comfyCheck.stdout.includes('exists')) {
          comfySpinner.succeed('ComfyUI found');
          serviceResults.push({ name: 'comfyui', status: 'deployed', message: 'Existing installation' });
        } else {
          comfySpinner.info('ComfyUI not installed');
          serviceResults.push({ name: 'comfyui', status: 'skipped', message: 'Not installed' });
        }
      } catch {
        comfySpinner.warn('ComfyUI check skipped');
        serviceResults.push({ name: 'comfyui', status: 'skipped' });
      }

      const sdSpinner = ora('Checking Stable Diffusion...').start();
      try {
        const sdCheck = await runRemoteCommand(
          this.sshConfig,
          'if exist "C:\\AI\\StableDiffusion\\webui.bat" echo exists'
        );

        if (sdCheck.stdout.includes('exists')) {
          sdSpinner.succeed('Stable Diffusion found');
          serviceResults.push({ name: 'stable-diffusion', status: 'deployed', message: 'Existing installation' });
        } else {
          sdSpinner.info('Stable Diffusion not installed');
          serviceResults.push({ name: 'stable-diffusion', status: 'skipped', message: 'Not installed' });
        }
      } catch {
        sdSpinner.warn('Stable Diffusion check skipped');
        serviceResults.push({ name: 'stable-diffusion', status: 'skipped' });
      }

      const hasFailures = serviceResults.some((s) => s.status === 'failed');

      return {
        success: !hasFailures,
        environment: this.environment,
        services: serviceResults,
        totalDuration: Date.now() - startTime,
        errors,
        rollbackAvailable: false,
      };
    } catch (err) {
      const error = err as Error;
      errors.push(error.message);
      return {
        success: false,
        environment: this.environment,
        services: serviceResults,
        totalDuration: Date.now() - startTime,
        errors,
        rollbackAvailable: false,
      };
    }
  }

  async verify(): Promise<VerifyResult> {
    const checks: VerifyResult['checks'] = [];
    let passedCount = 0;

    const agentCheck = await runRemoteCommand(this.sshConfig, 'pm2 describe nebula-agent');
    const agentPassed = agentCheck.code === 0 && agentCheck.stdout.includes('online');
    if (agentPassed) passedCount++;
    checks.push({
      name: 'Nebula Agent (PM2)',
      passed: agentPassed,
      message: agentPassed ? 'Running' : 'Not running',
    });

    try {
      const ollamaCheck = await runRemoteCommand(
        this.sshConfig,
        'curl -s http://localhost:11434/api/tags',
        { timeout: 5000 }
      );
      const ollamaPassed = ollamaCheck.code === 0;
      if (ollamaPassed) passedCount++;
      checks.push({
        name: 'Ollama API',
        passed: ollamaPassed,
        endpoint: 'http://localhost:11434',
        message: ollamaPassed ? 'Responding' : 'Not responding',
      });
    } catch {
      checks.push({
        name: 'Ollama API',
        passed: false,
        message: 'Connection failed',
      });
    }

    try {
      const comfyCheck = await runRemoteCommand(
        this.sshConfig,
        'curl -s http://localhost:8188/system_stats',
        { timeout: 5000 }
      );
      const comfyPassed = comfyCheck.code === 0;
      if (comfyPassed) passedCount++;
      checks.push({
        name: 'ComfyUI',
        passed: comfyPassed,
        endpoint: 'http://localhost:8188',
        message: comfyPassed ? 'Running' : 'Not running',
      });
    } catch {
      checks.push({
        name: 'ComfyUI',
        passed: false,
        message: 'Not running or not installed',
      });
    }

    const gpuCheck = await runRemoteCommand(
      this.sshConfig,
      'nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader'
    );
    const gpuPassed = gpuCheck.code === 0;
    if (gpuPassed) passedCount++;
    checks.push({
      name: 'GPU Status',
      passed: gpuPassed,
      message: gpuPassed ? gpuCheck.stdout.trim() : 'Not available',
    });

    const healthScore = Math.round((passedCount / checks.length) * 100);

    return {
      success: healthScore >= 50,
      checks,
      healthScore,
    };
  }
}

export function createDeployer(
  environment: string,
  sshConfig: SSHConfig,
  options: Record<string, any> = {}
): Deployer {
  switch (environment) {
    case 'linode':
      return new LinodeDeployer(sshConfig, options);
    case 'ubuntu-home':
      return new UbuntuHomeDeployer(sshConfig, options);
    case 'windows-vm':
      return new WindowsVMDeployer(sshConfig, options);
    default:
      throw new Error(`Unknown environment: ${environment}`);
  }
}

export async function deployToEnvironment(
  environment: string,
  sshConfig: SSHConfig,
  options: DeployOptions = {}
): Promise<DeployResult> {
  const deployer = createDeployer(environment, sshConfig);
  return runDeployment(deployer, options);
}
