import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { logger } from '../lib/logger';
import { detectEnvironment, Environment } from '../lib/environment-detector';

export interface VariableConfig {
  type: string;
  description: string;
  required?: boolean;
  example?: string;
  validation?: string;
  instructions?: string;
  default?: string | number | boolean;
  minLength?: number;
  enum?: string[];
  category?: string;
}

export interface EnvSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: string;
  properties: Record<string, VariableConfig>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  invalid: { name: string; value: string; reason: string }[];
  warnings: { name: string; message: string }[];
}

export interface WizardOptions {
  environment?: string;
  schemaPath?: string;
  outputPath?: string;
  interactive?: boolean;
  skipExisting?: boolean;
  force?: boolean;
}

const SCHEMA_DIR = path.join(process.cwd(), 'config', 'env-schemas');

const CATEGORY_ORDER = [
  'Database',
  'Authentication',
  'Core',
  'Discord',
  'Twitch',
  'YouTube',
  'Spotify',
  'AI Services',
  'SSH',
  'Tailscale',
  'Cloudflare',
  'Media',
  'Webhooks',
  'Logging',
  'Other',
];

const VARIABLE_CATEGORIES: Record<string, string> = {
  DATABASE_URL: 'Database',
  POSTGRES_URL: 'Database',
  DISCORD_DATABASE_URL: 'Database',
  STREAMBOT_DATABASE_URL: 'Database',
  
  SESSION_SECRET: 'Authentication',
  ADMIN_USERNAME: 'Authentication',
  ADMIN_PASSWORD: 'Authentication',
  NEBULA_AGENT_TOKEN: 'Authentication',
  SERVICE_AUTH_TOKEN: 'Authentication',
  KVM_AGENT_TOKEN: 'Authentication',
  
  DISCORD_BOT_TOKEN: 'Discord',
  DISCORD_CLIENT_ID: 'Discord',
  DISCORD_CLIENT_SECRET: 'Discord',
  DISCORD_APP_ID: 'Discord',
  DISCORD_CALLBACK_URL: 'Discord',
  DISCORD_PRIMARY_GUILD_ID: 'Discord',
  VITE_DISCORD_CLIENT_ID: 'Discord',
  
  TWITCH_CLIENT_ID: 'Twitch',
  TWITCH_CLIENT_SECRET: 'Twitch',
  TWITCH_CHANNEL: 'Twitch',
  TWITCH_REDIRECT_URI: 'Twitch',
  
  YOUTUBE_CLIENT_ID: 'YouTube',
  YOUTUBE_CLIENT_SECRET: 'YouTube',
  YOUTUBE_REDIRECT_URI: 'YouTube',
  YOUTUBE_REFRESH_TOKEN: 'YouTube',
  
  SPOTIFY_CLIENT_ID: 'Spotify',
  SPOTIFY_CLIENT_SECRET: 'Spotify',
  SPOTIFY_REFRESH_TOKEN: 'Spotify',
  SPOTIFY_REDIRECT_URI: 'Spotify',
  
  OPENAI_API_KEY: 'AI Services',
  AI_INTEGRATIONS_OPENAI_API_KEY: 'AI Services',
  OLLAMA_HOST: 'AI Services',
  OLLAMA_PORT: 'AI Services',
  STABLE_DIFFUSION_API_URL: 'AI Services',
  COMFYUI_API_URL: 'AI Services',
  WHISPER_MODEL: 'AI Services',
  
  SSH_PRIVATE_KEY: 'SSH',
  SSH_KEY_PATH: 'SSH',
  LINODE_SSH_HOST: 'SSH',
  LINODE_SSH_USER: 'SSH',
  HOME_SSH_HOST: 'SSH',
  HOME_SSH_USER: 'SSH',
  
  WINDOWS_VM_TAILSCALE_IP: 'Tailscale',
  UBUNTU_TAILSCALE_IP: 'Tailscale',
  LINODE_TAILSCALE_IP: 'Tailscale',
  LOCAL_TAILSCALE_IP: 'Tailscale',
  
  CLOUDFLARE_API_TOKEN: 'Cloudflare',
  CLOUDFLARE_ZONE_ID_EVINDRAKE: 'Cloudflare',
  
  PLEX_TOKEN: 'Media',
  PLEX_URL: 'Media',
  
  GITHUB_WEBHOOK_SECRET: 'Webhooks',
  STREAM_BOT_WEBHOOK_SECRET: 'Webhooks',
  
  LOG_LEVEL: 'Logging',
  NODE_ENV: 'Core',
  PORT: 'Core',
  APP_URL: 'Core',
  DASHBOARD_URL: 'Core',
};

const SECRET_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /key/i,
  /credential/i,
  /private/i,
];

function isSecretVariable(name: string): boolean {
  return SECRET_PATTERNS.some(pattern => pattern.test(name));
}

function getVariableCategory(name: string): string {
  return VARIABLE_CATEGORIES[name] || 'Other';
}

function escapeEnvValue(value: string): string {
  if (!value) return '';
  
  if (value.includes('\n') || value.includes('"') || value.includes("'") || 
      value.includes(' ') || value.includes('#') || value.includes('$')) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }
  
  return value;
}

function unescapeEnvValue(value: string): string {
  if (!value) return '';
  
  if ((value.startsWith('"') && value.endsWith('"')) || 
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  
  return value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

export async function loadSchema(schemaPath: string): Promise<EnvSchema> {
  try {
    const absolutePath = path.isAbsolute(schemaPath) 
      ? schemaPath 
      : path.join(process.cwd(), schemaPath);
    
    const content = await fs.promises.readFile(absolutePath, 'utf-8');
    const schema = JSON.parse(content) as EnvSchema;
    
    if (!schema.properties) {
      throw new Error('Invalid schema: missing properties object');
    }
    
    const requiredSet = new Set(schema.required || []);
    for (const [name, config] of Object.entries(schema.properties)) {
      if (requiredSet.has(name)) {
        config.required = true;
      }
      if (!config.category) {
        config.category = getVariableCategory(name);
      }
    }
    
    return schema;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }
    throw error;
  }
}

export function loadExistingEnv(envPath: string): Record<string, string> {
  const env: Record<string, string> = {};
  
  try {
    if (!fs.existsSync(envPath)) {
      return env;
    }
    
    const content = fs.readFileSync(envPath, 'utf-8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      
      if (key) {
        env[key] = unescapeEnvValue(value);
      }
    }
  } catch (error) {
    logger.warn(`Failed to load existing .env file: ${(error as Error).message}`);
  }
  
  return env;
}

export async function promptForVariable(
  name: string,
  config: VariableConfig,
  existingValue?: string
): Promise<string | null> {
  console.log();
  console.log(chalk.bold.cyan(`▸ ${name}`));
  console.log(chalk.gray(`  ${config.description || 'No description available'}`));
  
  if (config.instructions) {
    console.log();
    console.log(chalk.yellow('  Instructions:'));
    config.instructions.split('\n').forEach(line => {
      console.log(chalk.gray(`    ${line}`));
    });
  }
  
  if (config.example) {
    console.log(chalk.gray(`  Example: ${chalk.white(config.example)}`));
  }
  
  if (config.enum && config.enum.length > 0) {
    console.log(chalk.gray(`  Options: ${config.enum.join(', ')}`));
  }
  
  if (config.validation) {
    console.log(chalk.gray(`  Pattern: ${config.validation}`));
  }
  
  if (existingValue) {
    const displayValue = isSecretVariable(name) 
      ? `${existingValue.substring(0, 4)}${'*'.repeat(Math.min(existingValue.length - 4, 20))}`
      : existingValue;
    console.log(chalk.green(`  Current: ${displayValue}`));
  }
  
  console.log();
  
  const isRequired = config.required === true;
  const isSecret = isSecretVariable(name);
  const defaultValue = existingValue || (config.default !== undefined ? String(config.default) : undefined);
  
  let promptType: 'input' | 'password' | 'list' | 'editor' = 'input';
  
  if (isSecret) {
    promptType = 'password';
  } else if (config.enum && config.enum.length > 0) {
    promptType = 'list';
  } else if (name === 'SSH_PRIVATE_KEY' || config.type === 'string' && config.validation?.includes('BEGIN')) {
    promptType = 'editor';
  }
  
  const choices: any[] | undefined = config.enum ? [...config.enum] : undefined;
  if (choices && !isRequired) {
    choices.push(new inquirer.Separator());
    choices.push({ name: chalk.gray('(skip)'), value: '__SKIP__' });
  }
  
  const questions: any[] = [];
  
  if (!isRequired && promptType !== 'list') {
    questions.push({
      type: 'confirm',
      name: 'configure',
      message: `Configure ${name}?`,
      default: !!existingValue,
    });
  }
  
  const valueQuestion: any = {
    type: promptType,
    name: 'value',
    message: `Enter value for ${name}:`,
    default: promptType !== 'password' ? defaultValue : undefined,
    choices,
    mask: isSecret ? '*' : undefined,
    when: (answers: any) => isRequired || answers.configure !== false,
    validate: (input: string) => {
      if (!input && isRequired) {
        return `${name} is required`;
      }
      
      if (input === '__SKIP__') {
        return true;
      }
      
      if (input && config.minLength && input.length < config.minLength) {
        return `Minimum length is ${config.minLength} characters (current: ${input.length})`;
      }
      
      if (input && config.validation) {
        try {
          const regex = new RegExp(config.validation);
          if (!regex.test(input)) {
            return `Value does not match required pattern: ${config.validation}`;
          }
        } catch {
          // Invalid regex in schema, skip validation
        }
      }
      
      return true;
    },
  };
  
  questions.push(valueQuestion);
  
  try {
    const answers = await inquirer.prompt(questions);
    
    if (answers.configure === false) {
      return null;
    }
    
    if (answers.value === '__SKIP__' || answers.value === undefined) {
      return null;
    }
    
    return answers.value;
  } catch (error) {
    if ((error as Error).message?.includes('User force closed')) {
      throw new Error('Setup cancelled by user');
    }
    throw error;
  }
}

export async function promptForAllVariables(
  schema: EnvSchema,
  existingEnv: Record<string, string> = {},
  options: { skipExisting?: boolean } = {}
): Promise<Record<string, string>> {
  const result: Record<string, string> = { ...existingEnv };
  const properties = schema.properties;
  const propertyNames = Object.keys(properties);
  
  const grouped: Record<string, string[]> = {};
  for (const name of propertyNames) {
    const category = properties[name].category || getVariableCategory(name);
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(name);
  }
  
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a);
    const bIndex = CATEGORY_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
  
  let configured = 0;
  let skipped = 0;
  const total = propertyNames.length;
  
  for (const category of sortedCategories) {
    const variables = grouped[category];
    
    const requiredVars = variables.filter(name => properties[name].required);
    const optionalVars = variables.filter(name => !properties[name].required);
    const sortedVars = [...requiredVars, ...optionalVars];
    
    const varsToPrompt = sortedVars.filter(name => {
      if (options.skipExisting && existingEnv[name]) {
        return false;
      }
      return true;
    });
    
    if (varsToPrompt.length === 0) {
      skipped += sortedVars.length;
      continue;
    }
    
    console.log();
    logger.divider('─');
    console.log(chalk.bold.magenta(`  📁 ${category}`));
    console.log(chalk.gray(`     ${varsToPrompt.length} variable(s) to configure`));
    logger.divider('─');
    
    for (const name of varsToPrompt) {
      const config = properties[name];
      const existingValue = existingEnv[name];
      
      if (options.skipExisting && existingValue) {
        console.log(chalk.gray(`  ✓ ${name} - using existing value`));
        skipped++;
        continue;
      }
      
      const progress = `[${configured + skipped + 1}/${total}]`;
      console.log(chalk.cyan(progress));
      
      try {
        const value = await promptForVariable(name, config, existingValue);
        
        if (value !== null) {
          result[name] = value;
          configured++;
          console.log(chalk.green(`  ✓ ${name} configured`));
        } else if (existingValue) {
          console.log(chalk.yellow(`  ⊘ ${name} - keeping existing value`));
          skipped++;
        } else {
          console.log(chalk.gray(`  ⊘ ${name} - skipped`));
          skipped++;
        }
      } catch (error) {
        if ((error as Error).message?.includes('cancelled')) {
          throw error;
        }
        logger.warn(`Failed to configure ${name}: ${(error as Error).message}`);
        skipped++;
      }
    }
  }
  
  console.log();
  logger.divider('═');
  console.log(chalk.bold(`  Configuration Summary`));
  console.log(chalk.green(`    ✓ ${configured} variable(s) configured`));
  console.log(chalk.gray(`    ⊘ ${skipped} variable(s) skipped`));
  logger.divider('═');
  
  return result;
}

export function validateEnvironment(
  schema: EnvSchema,
  env: Record<string, string>
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    missing: [],
    invalid: [],
    warnings: [],
  };
  
  for (const [name, config] of Object.entries(schema.properties)) {
    const value = env[name];
    const isRequired = config.required === true;
    
    if (isRequired && (!value || value.trim() === '')) {
      result.missing.push(name);
      result.valid = false;
      continue;
    }
    
    if (!value || value.trim() === '') {
      const isRecommended = name.includes('API_KEY') || 
                           name.includes('TOKEN') || 
                           name.includes('DATABASE');
      if (isRecommended) {
        result.warnings.push({
          name,
          message: `Optional but recommended: ${config.description || 'No description'}`,
        });
      }
      continue;
    }
    
    if (config.minLength && value.length < config.minLength) {
      result.invalid.push({
        name,
        value: isSecretVariable(name) ? '***' : value,
        reason: `Minimum length is ${config.minLength} characters (current: ${value.length})`,
      });
      result.valid = false;
    }
    
    if (config.validation) {
      try {
        const regex = new RegExp(config.validation);
        if (!regex.test(value)) {
          result.invalid.push({
            name,
            value: isSecretVariable(name) ? '***' : value.substring(0, 20) + '...',
            reason: `Does not match pattern: ${config.validation}`,
          });
          result.valid = false;
        }
      } catch {
        // Invalid regex in schema, skip validation
      }
    }
    
    if (config.enum && config.enum.length > 0) {
      if (!config.enum.includes(value)) {
        result.invalid.push({
          name,
          value,
          reason: `Must be one of: ${config.enum.join(', ')}`,
        });
        result.valid = false;
      }
    }
  }
  
  return result;
}

export async function generateEnvFile(
  variables: Record<string, string>,
  outputPath: string,
  schema?: EnvSchema
): Promise<void> {
  if (fs.existsSync(outputPath)) {
    const backupPath = `${outputPath}.backup.${Date.now()}`;
    await fs.promises.copyFile(outputPath, backupPath);
    logger.info(`Backed up existing .env to ${path.basename(backupPath)}`);
  }
  
  const lines: string[] = [];
  lines.push(`# Environment configuration`);
  lines.push(`# Generated by Nebula Command Setup Wizard`);
  lines.push(`# Date: ${new Date().toISOString()}`);
  lines.push('');
  
  const grouped: Record<string, string[]> = {};
  for (const name of Object.keys(variables)) {
    const category = schema?.properties[name]?.category || getVariableCategory(name);
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(name);
  }
  
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a);
    const bIndex = CATEGORY_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
  
  for (const category of sortedCategories) {
    const names = grouped[category].sort();
    
    lines.push(`# ═══════════════════════════════════════════════════════`);
    lines.push(`# ${category.toUpperCase()}`);
    lines.push(`# ═══════════════════════════════════════════════════════`);
    lines.push('');
    
    for (const name of names) {
      const value = variables[name];
      const config = schema?.properties[name];
      
      if (config?.description) {
        lines.push(`# ${config.description}`);
      }
      
      lines.push(`${name}=${escapeEnvValue(value)}`);
      lines.push('');
    }
  }
  
  await fs.promises.writeFile(outputPath, lines.join('\n'), 'utf-8');
}

function getSchemaForEnvironment(environment: Environment): string {
  const schemaMap: Record<Environment, string> = {
    'linode': 'dashboard.schema.json',
    'ubuntu-home': 'dashboard.schema.json',
    'windows-vm': 'windows-vm.schema.json',
    'replit': 'dashboard.schema.json',
    'unknown': 'dashboard.schema.json',
  };
  
  return path.join(SCHEMA_DIR, schemaMap[environment] || 'dashboard.schema.json');
}

function listAvailableSchemas(): string[] {
  try {
    const files = fs.readdirSync(SCHEMA_DIR);
    return files
      .filter(f => f.endsWith('.schema.json'))
      .map(f => f.replace('.schema.json', ''));
  } catch {
    return [];
  }
}

export async function runSetupWizard(options: WizardOptions = {}): Promise<void> {
  logger.header('Environment Variable Setup Wizard');
  
  const environment = options.environment 
    ? options.environment as Environment
    : detectEnvironment();
  
  console.log(chalk.cyan(`  Detected environment: ${chalk.bold(environment)}`));
  console.log();
  
  let schemaPath = options.schemaPath;
  
  if (!schemaPath) {
    const availableSchemas = listAvailableSchemas();
    
    if (availableSchemas.length === 0) {
      logger.error('No schema files found in config/env-schemas/');
      throw new Error('No schema files available');
    }
    
    if (options.interactive !== false) {
      const { selectedSchema } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedSchema',
          message: 'Select the service to configure:',
          choices: availableSchemas.map(name => ({
            name: name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' '),
            value: path.join(SCHEMA_DIR, `${name}.schema.json`),
          })),
          default: getSchemaForEnvironment(environment),
        },
      ]);
      schemaPath = selectedSchema;
    } else {
      schemaPath = getSchemaForEnvironment(environment);
    }
  }
  
  const spinner = ora('Loading schema...').start();
  let schema: EnvSchema;
  
  const finalSchemaPath = schemaPath as string;
  
  try {
    schema = await loadSchema(finalSchemaPath);
    spinner.succeed(`Loaded schema: ${schema.title || path.basename(finalSchemaPath)}`);
  } catch (error) {
    spinner.fail(`Failed to load schema: ${(error as Error).message}`);
    throw error;
  }
  
  if (schema.description) {
    console.log(chalk.gray(`  ${schema.description}`));
  }
  console.log();
  
  const outputPath = options.outputPath || path.join(process.cwd(), '.env');
  const existingEnv = loadExistingEnv(outputPath);
  
  const existingCount = Object.keys(existingEnv).length;
  if (existingCount > 0) {
    console.log(chalk.yellow(`  Found ${existingCount} existing variable(s) in .env`));
    console.log();
    
    if (options.interactive !== false && !options.force) {
      const { mode } = await inquirer.prompt([
        {
          type: 'list',
          name: 'mode',
          message: 'How would you like to proceed?',
          choices: [
            { name: 'Configure missing variables only', value: 'missing' },
            { name: 'Reconfigure all variables', value: 'all' },
            { name: 'Cancel', value: 'cancel' },
          ],
        },
      ]);
      
      if (mode === 'cancel') {
        logger.info('Setup cancelled');
        return;
      }
      
      options.skipExisting = mode === 'missing';
    }
  }
  
  const totalVars = Object.keys(schema.properties).length;
  const requiredVars = Object.values(schema.properties).filter(v => v.required).length;
  
  console.log(chalk.cyan(`  Variables to configure: ${totalVars} (${requiredVars} required)`));
  console.log();
  
  if (options.interactive !== false) {
    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Ready to start configuration?',
        default: true,
      },
    ]);
    
    if (!proceed) {
      logger.info('Setup cancelled');
      return;
    }
  }
  
  const configuredVars = await promptForAllVariables(schema, existingEnv, {
    skipExisting: options.skipExisting,
  });
  
  const validation = validateEnvironment(schema, configuredVars);
  
  console.log();
  logger.subheader('Validation Results');
  
  if (validation.valid) {
    console.log(chalk.green('  ✓ All required variables are configured correctly'));
  } else {
    if (validation.missing.length > 0) {
      console.log(chalk.red(`  ✗ Missing required variables:`));
      validation.missing.forEach(name => {
        console.log(chalk.red(`      - ${name}`));
      });
    }
    
    if (validation.invalid.length > 0) {
      console.log(chalk.red(`  ✗ Invalid values:`));
      validation.invalid.forEach(({ name, reason }) => {
        console.log(chalk.red(`      - ${name}: ${reason}`));
      });
    }
  }
  
  if (validation.warnings.length > 0) {
    console.log(chalk.yellow(`  ⚠ Warnings:`));
    validation.warnings.forEach(({ name, message }) => {
      console.log(chalk.yellow(`      - ${name}: ${message}`));
    });
  }
  
  console.log();
  
  if (!validation.valid && options.interactive !== false) {
    const { continueAnyway } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueAnyway',
        message: 'Configuration has issues. Save anyway?',
        default: false,
      },
    ]);
    
    if (!continueAnyway) {
      logger.info('Setup cancelled - fix issues and try again');
      return;
    }
  }
  
  const saveSpinner = ora('Saving configuration...').start();
  
  try {
    await generateEnvFile(configuredVars, outputPath, schema);
    saveSpinner.succeed(`Configuration saved to ${outputPath}`);
  } catch (error) {
    saveSpinner.fail(`Failed to save configuration: ${(error as Error).message}`);
    throw error;
  }
  
  console.log();
  logger.header('Setup Complete');
  
  const configuredCount = Object.keys(configuredVars).length;
  console.log(chalk.green(`  ✓ ${configuredCount} environment variable(s) configured`));
  console.log(chalk.gray(`    File: ${outputPath}`));
  console.log();
  
  if (!validation.valid) {
    console.log(chalk.yellow('  ⚠ Some issues were detected. Review the .env file and fix as needed.'));
    console.log();
  }
  
  console.log(chalk.cyan('  Next steps:'));
  console.log(chalk.gray('    1. Review the generated .env file'));
  console.log(chalk.gray('    2. Restart the application to apply changes'));
  console.log(chalk.gray('    3. Run `nebula verify` to check connectivity'));
  console.log();
}

export default {
  loadSchema,
  loadExistingEnv,
  promptForVariable,
  promptForAllVariables,
  validateEnvironment,
  generateEnvFile,
  runSetupWizard,
};
