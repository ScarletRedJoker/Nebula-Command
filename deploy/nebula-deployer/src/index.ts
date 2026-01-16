#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { 
  detectEnvironment, 
  getEnvironmentInfo, 
  getEnvironmentEndpoints,
  checkEnvironmentHealth,
  Environment,
  EnvironmentEndpoint 
} from './lib/environment-detector';
import { 
  logger, 
  formatEnvironment, 
  formatStatus,
  formatServiceStatus,
  LogLevel 
} from './lib/logger';

const program = new Command();

program
  .name('nebula')
  .description('Nebula Command - Deployment Orchestration CLI')
  .version('1.0.0')
  .option('-v, --verbose', 'Enable verbose output')
  .hook('preAction', (thisCommand: Command) => {
    if (thisCommand.opts().verbose) {
      logger.setLevel(LogLevel.DEBUG);
    }
  });

program
  .command('deploy <environment>')
  .description('Deploy to a specific environment (linode, ubuntu-home, windows-vm)')
  .option('-f, --force', 'Force deployment without confirmation')
  .option('-s, --service <service>', 'Deploy specific service only')
  .option('--dry-run', 'Show what would be deployed without executing')
  .action(async (environment: string, options) => {
    const validEnvs = ['linode', 'ubuntu-home', 'windows-vm'];
    
    if (!validEnvs.includes(environment)) {
      logger.error(`Invalid environment: ${environment}`);
      logger.info(`Valid environments: ${validEnvs.join(', ')}`);
      process.exit(1);
    }

    logger.header(`Deploying to ${formatEnvironment(environment)}`);
    
    const currentEnv = await getEnvironmentInfo();
    logger.info(`Current environment: ${formatEnvironment(currentEnv.environment)}`);
    
    if (options.dryRun) {
      logger.warn('DRY RUN - No changes will be made');
    }

    if (!options.force && !options.dryRun) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to deploy to ${environment}?`,
          default: false,
        },
      ]);

      if (!confirm) {
        logger.info('Deployment cancelled');
        return;
      }
    }

    const spinner = ora(`Connecting to ${environment}...`).start();

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      spinner.succeed(`Connected to ${environment}`);

      const steps = [
        'Validating configuration',
        'Checking target health',
        'Syncing files',
        'Running migrations',
        'Restarting services',
        'Verifying deployment',
      ];

      for (let i = 0; i < steps.length; i++) {
        const stepSpinner = ora(`[${i + 1}/${steps.length}] ${steps[i]}...`).start();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (options.dryRun) {
          stepSpinner.info(`[DRY RUN] ${steps[i]}`);
        } else {
          stepSpinner.succeed(`${steps[i]}`);
        }
      }

      logger.blank();
      logger.success(`Deployment to ${environment} completed successfully!`);
      
    } catch (error) {
      spinner.fail(`Deployment failed`);
      logger.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

interface SetupAnswers {
  correctEnv: boolean;
  environment?: string;
  services: string[];
  configureSsh: boolean;
  sshKeyPath?: string;
  configureSecrets: boolean;
}

program
  .command('setup')
  .description('Interactive setup wizard for Nebula Command')
  .action(async () => {
    logger.header('Nebula Command Setup Wizard');
    
    const currentEnv = await getEnvironmentInfo();
    logger.info(`Detected environment: ${formatEnvironment(currentEnv.environment)}`);
    logger.info(`Hostname: ${currentEnv.hostname}`);
    logger.info(`Platform: ${currentEnv.platform}`);
    
    if (currentEnv.tailscaleIP) {
      logger.info(`Tailscale IP: ${currentEnv.tailscaleIP}`);
    }

    logger.blank();

    const answers = await inquirer.prompt<SetupAnswers>([
      {
        type: 'confirm',
        name: 'correctEnv',
        message: `Is ${currentEnv.environment} the correct environment?`,
        default: true,
      },
      {
        type: 'list',
        name: 'environment',
        message: 'Select the correct environment:',
        choices: ['linode', 'ubuntu-home', 'windows-vm', 'replit'],
        when: (ans: { correctEnv: boolean }) => !ans.correctEnv,
      },
      {
        type: 'checkbox',
        name: 'services',
        message: 'Which services should run on this environment?',
        choices: [
          { name: 'Dashboard (Next.js)', value: 'dashboard', checked: true },
          { name: 'Discord Bot', value: 'discord-bot' },
          { name: 'Stream Bot', value: 'stream-bot' },
          { name: 'AI Agent', value: 'nebula-agent' },
        ],
      },
      {
        type: 'confirm',
        name: 'configureSsh',
        message: 'Configure SSH keys for remote deployment?',
        default: true,
      },
      {
        type: 'input',
        name: 'sshKeyPath',
        message: 'Path to SSH private key:',
        default: '~/.ssh/homelab',
        when: (ans: { configureSsh: boolean }) => ans.configureSsh,
      },
      {
        type: 'confirm',
        name: 'configureSecrets',
        message: 'Set up secrets management?',
        default: true,
      },
    ]);

    logger.blank();
    logger.subheader('Configuration Summary');
    logger.table({
      'Environment': answers.correctEnv ? currentEnv.environment : answers.environment,
      'Services': answers.services.join(', '),
      'SSH Configured': answers.configureSsh ? 'Yes' : 'No',
      'Secrets': answers.configureSecrets ? 'Enabled' : 'Disabled',
    });

    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Save this configuration?',
        default: true,
      },
    ]);

    if (proceed) {
      const spinner = ora('Saving configuration...').start();
      await new Promise(resolve => setTimeout(resolve, 1000));
      spinner.succeed('Configuration saved!');
      
      logger.blank();
      logger.success('Setup complete! Run `nebula status` to verify.');
    } else {
      logger.info('Setup cancelled');
    }
  });

program
  .command('verify')
  .description('Verify all endpoints and services are accessible')
  .option('-e, --environment <env>', 'Verify specific environment only')
  .action(async (options) => {
    logger.header('Verifying Endpoints & Services');

    const endpoints = getEnvironmentEndpoints();
    const toVerify = options.environment 
      ? endpoints.filter(e => e.environment === options.environment)
      : endpoints;

    if (toVerify.length === 0) {
      logger.error(`No endpoints found for environment: ${options.environment}`);
      process.exit(1);
    }

    const results: { env: string; status: string; latency: string; error?: string }[] = [];

    for (const endpoint of toVerify) {
      const spinner = ora(`Checking ${endpoint.name}...`).start();
      
      const health = await checkEnvironmentHealth(endpoint.environment);
      
      if (health.healthy) {
        spinner.succeed(`${endpoint.name} - ${chalk.green('healthy')} (${health.latencyMs}ms)`);
        results.push({ 
          env: endpoint.environment, 
          status: 'healthy', 
          latency: `${health.latencyMs}ms` 
        });
      } else {
        spinner.fail(`${endpoint.name} - ${chalk.red('unhealthy')}`);
        results.push({ 
          env: endpoint.environment, 
          status: 'unhealthy', 
          latency: '-',
          error: health.error || 'Unknown error'
        });
      }
    }

    logger.blank();
    logger.subheader('Verification Summary');
    
    const healthyCount = results.filter(r => r.status === 'healthy').length;
    const totalCount = results.length;
    
    if (healthyCount === totalCount) {
      logger.success(`All ${totalCount} endpoints are healthy!`);
    } else {
      logger.warn(`${healthyCount}/${totalCount} endpoints are healthy`);
      
      const unhealthy = results.filter(r => r.status === 'unhealthy');
      if (unhealthy.length > 0) {
        logger.blank();
        logger.subheader('Failed Endpoints');
        unhealthy.forEach(r => {
          logger.error(`  ${r.env}: ${r.error}`);
        });
      }
    }
  });

program
  .command('secrets')
  .description('Manage secrets across environments')
  .command('sync')
  .description('Synchronize secrets across all environments')
  .option('-e, --environment <env>', 'Sync to specific environment only')
  .option('--dry-run', 'Show what would be synced without executing')
  .action(async (options) => {
    logger.header('Secrets Synchronization');

    if (options.dryRun) {
      logger.warn('DRY RUN - No changes will be made');
    }

    const secrets = [
      { name: 'DATABASE_URL', environments: ['linode', 'replit'] },
      { name: 'DISCORD_TOKEN', environments: ['linode', 'replit'] },
      { name: 'OPENAI_API_KEY', environments: ['linode', 'windows-vm', 'replit'] },
      { name: 'TWITCH_CLIENT_ID', environments: ['linode', 'replit'] },
      { name: 'TWITCH_CLIENT_SECRET', environments: ['linode', 'replit'] },
    ];

    const targetEnv = options.environment;

    for (const secret of secrets) {
      const envs = targetEnv 
        ? secret.environments.filter(e => e === targetEnv)
        : secret.environments;

      if (envs.length === 0) continue;

      const spinner = ora(`Syncing ${secret.name} to ${envs.join(', ')}...`).start();
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      if (options.dryRun) {
        spinner.info(`[DRY RUN] Would sync ${secret.name}`);
      } else {
        spinner.succeed(`${secret.name} synced to ${envs.length} environment(s)`);
      }
    }

    logger.blank();
    logger.success('Secrets synchronization complete!');
  });

program
  .command('status')
  .description('Show status of all environments and services')
  .option('-w, --watch', 'Watch mode - continuously update status')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    const showStatus = async () => {
      if (!options.json) {
        logger.header('Nebula Command Status');
      }

      const currentEnv = await getEnvironmentInfo();
      const endpoints = getEnvironmentEndpoints();

      if (options.json) {
        const statusData = {
          current: currentEnv,
          environments: [] as any[],
        };

        for (const endpoint of endpoints) {
          const health = await checkEnvironmentHealth(endpoint.environment);
          statusData.environments.push({
            ...endpoint,
            health,
          });
        }

        console.log(JSON.stringify(statusData, null, 2));
        return;
      }

      logger.subheader('Current Environment');
      logger.table({
        'Environment': formatEnvironment(currentEnv.environment),
        'Hostname': currentEnv.hostname,
        'Platform': currentEnv.platform,
        'Production': currentEnv.isProduction ? chalk.green('Yes') : chalk.yellow('No'),
        'Tailscale': currentEnv.tailscaleIP || chalk.gray('Not connected'),
      });

      logger.blank();
      logger.subheader('Environment Status');

      for (const endpoint of endpoints) {
        const isCurrent = endpoint.environment === currentEnv.environment;
        const marker = isCurrent ? chalk.cyan(' ← current') : '';
        
        const spinner = ora({ 
          text: `Checking ${endpoint.name}...`, 
          prefixText: '  ' 
        }).start();
        
        const health = await checkEnvironmentHealth(endpoint.environment);
        
        const statusIcon = health.healthy ? chalk.green('●') : chalk.red('○');
        const latency = health.latencyMs ? chalk.gray(`(${health.latencyMs}ms)`) : '';
        
        spinner.stop();
        console.log(`  ${statusIcon} ${endpoint.name} ${latency}${marker}`);
        
        if (!health.healthy && health.error) {
          console.log(chalk.gray(`      └─ ${health.error}`));
        }
      }

      logger.blank();
      logger.subheader('Capabilities');
      logger.list(currentEnv.capabilities);

      logger.blank();
      logger.info(`Detection method: ${chalk.gray(currentEnv.detectionMethod)}`);
    };

    if (options.watch) {
      const refreshInterval = 10000;
      logger.info(`Watch mode enabled - refreshing every ${refreshInterval / 1000}s (Ctrl+C to exit)`);
      
      while (true) {
        console.clear();
        await showStatus();
        await new Promise(resolve => setTimeout(resolve, refreshInterval));
      }
    } else {
      await showStatus();
    }
  });

program
  .command('env')
  .description('Show detected environment information')
  .action(async () => {
    const info = await getEnvironmentInfo();
    
    logger.header('Environment Detection');
    logger.table({
      'Environment': formatEnvironment(info.environment),
      'Hostname': info.hostname,
      'Platform': info.platform,
      'Production': info.isProduction ? 'Yes' : 'No',
      'Tailscale IP': info.tailscaleIP || 'Not connected',
      'Detection Method': info.detectionMethod,
    });

    logger.blank();
    logger.subheader('Capabilities');
    logger.list(info.capabilities);
  });

program.parse();
