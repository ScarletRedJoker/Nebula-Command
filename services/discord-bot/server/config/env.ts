/**
 * Environment Configuration for Discord Bot
 * Auto-detects Replit vs Ubuntu and applies appropriate settings
 */
import { existsSync } from 'fs';

// Environment Detection
export const IS_REPLIT = existsSync('/home/runner') || process.env.REPLIT_WORKSPACE !== undefined;
export const IS_UBUNTU = !IS_REPLIT;

export interface EnvironmentConfig {
  environment: 'replit' | 'ubuntu';
  demoMode: boolean;
  databaseUrl: string;
  port: number;
  discordToken: string | undefined;
}

// Create and export the actual config
export const ENV_CONFIG: EnvironmentConfig = {
  environment: IS_REPLIT ? 'replit' : 'ubuntu',
  demoMode: process.env.DEMO_MODE?.toLowerCase() === 'true' || IS_REPLIT,
  databaseUrl: process.env.DATABASE_URL || '',
  port: parseInt(process.env.PORT || (IS_REPLIT ? '3001' : '5000'), 10),
  discordToken: process.env.DISCORD_BOT_TOKEN
};

export const logEnvironmentConfig = () => {
  console.log('============================================================');
  console.log('🌍 Discord Bot - Environment Detected:', ENV_CONFIG.environment);
  console.log('📊 Configuration Summary:');
  console.log('  environment:', ENV_CONFIG.environment);
  console.log('  demo_mode:', ENV_CONFIG.demoMode);
  console.log('  database:', ENV_CONFIG.databaseUrl ? '[Connected]' : '[Not Configured]');
  console.log('  port:', ENV_CONFIG.port);
  console.log('  discord_token:', ENV_CONFIG.discordToken ? '[Set]' : '[NOT SET - Bot will not connect]');
  console.log('============================================================');
};
