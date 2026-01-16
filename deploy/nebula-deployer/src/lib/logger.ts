import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SUCCESS = 4,
}

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  timestamps?: boolean;
}

class Logger {
  private level: LogLevel;
  private prefix: string;
  private timestamps: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.prefix = options.prefix ?? 'nebula';
    this.timestamps = options.timestamps ?? true;
  }

  private getTimestamp(): string {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  }

  private formatMessage(level: string, message: string, color: chalk.Chalk): string {
    const parts: string[] = [];
    
    if (this.timestamps) {
      parts.push(chalk.gray(`[${this.getTimestamp()}]`));
    }
    
    parts.push(color(`[${level}]`));
    
    if (this.prefix) {
      parts.push(chalk.cyan(`[${this.prefix}]`));
    }
    
    parts.push(message);
    
    return parts.join(' ');
  }

  debug(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(this.formatMessage('DEBUG', message, chalk.gray), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(this.formatMessage('INFO', message, chalk.blue), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message, chalk.yellow), ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(this.formatMessage('ERROR', message, chalk.red), ...args);
    }
  }

  success(message: string, ...args: any[]): void {
    console.log(this.formatMessage('SUCCESS', message, chalk.green), ...args);
  }

  step(step: number, total: number, message: string): void {
    const progress = chalk.cyan(`[${step}/${total}]`);
    console.log(`${progress} ${message}`);
  }

  divider(char: string = '─', length: number = 50): void {
    console.log(chalk.gray(char.repeat(length)));
  }

  header(title: string): void {
    this.divider('═');
    console.log(chalk.bold.cyan(`  ${title}`));
    this.divider('═');
  }

  subheader(title: string): void {
    console.log(chalk.bold.white(`\n▸ ${title}`));
  }

  list(items: string[], bullet: string = '•'): void {
    items.forEach(item => {
      console.log(chalk.gray(`  ${bullet} `) + item);
    });
  }

  table(data: Record<string, string>): void {
    const maxKeyLength = Math.max(...Object.keys(data).map(k => k.length));
    Object.entries(data).forEach(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyLength);
      console.log(`  ${chalk.gray(paddedKey)}  ${value}`);
    });
  }

  blank(): void {
    console.log();
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }

  child(prefix: string): Logger {
    return new Logger({
      level: this.level,
      prefix: `${this.prefix}:${prefix}`,
      timestamps: this.timestamps,
    });
  }
}

export const logger = new Logger();

export function createLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}

export const colors = {
  environment: {
    linode: chalk.magenta,
    'ubuntu-home': chalk.blue,
    'windows-vm': chalk.cyan,
    replit: chalk.yellow,
  },
  status: {
    healthy: chalk.green,
    degraded: chalk.yellow,
    unhealthy: chalk.red,
    unknown: chalk.gray,
  },
  service: {
    running: chalk.green('●'),
    stopped: chalk.red('○'),
    starting: chalk.yellow('◐'),
    unknown: chalk.gray('?'),
  },
};

export function formatEnvironment(env: string): string {
  const colorFn = colors.environment[env as keyof typeof colors.environment] || chalk.white;
  return colorFn(env);
}

export function formatStatus(status: string): string {
  const colorFn = colors.status[status as keyof typeof colors.status] || chalk.gray;
  return colorFn(status);
}

export function formatServiceStatus(running: boolean | null): string {
  if (running === true) return colors.service.running;
  if (running === false) return colors.service.stopped;
  return colors.service.unknown;
}
