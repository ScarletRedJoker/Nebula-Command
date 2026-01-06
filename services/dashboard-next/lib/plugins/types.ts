/**
 * Plugin Manifest System Types
 * Nebula Command - Dynamic Feature Loading
 */

export interface PluginApiEntry {
  route: string;
  handler: string;
}

export interface PluginUiEntry {
  path: string;
  component: string;
  icon?: string;
  sidebar?: boolean;
}

export interface PluginHook {
  event: string;
  handler: string;
}

export interface PluginDependency {
  plugin: string;
  version: string;
}

export interface PluginPeerDependency {
  package: string;
  version: string;
}

export type PluginPermission = 'database' | 'filesystem' | 'network' | 'shell' | 'secrets';

export interface PluginConfigSchema {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default?: any;
  required?: boolean;
  description?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  repository?: string;
  license?: string;
  enabled: boolean;

  api?: PluginApiEntry[];
  ui?: PluginUiEntry[];
  hooks?: PluginHook[];

  dependencies?: PluginDependency[];
  peerDependencies?: PluginPeerDependency[];

  permissions?: PluginPermission[];

  config?: PluginConfigSchema[];
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  status: PluginStatus;
  loadedAt: Date;
  config: Record<string, any>;
  error?: string;
}

export type PluginStatus = 'loading' | 'active' | 'disabled' | 'error' | 'uninstalled';

export interface PluginInstallOptions {
  url?: string;
  manifest?: PluginManifest;
  config?: Record<string, any>;
  autoEnable?: boolean;
}

export interface PluginExecutionContext {
  pluginId: string;
  permissions: PluginPermission[];
  config: Record<string, any>;
  timeout: number;
}

export interface PluginExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  durationMs: number;
}

export interface PluginEvent {
  type: string;
  pluginId: string;
  timestamp: Date;
  data?: any;
}

export interface PluginLogEntry {
  id: string;
  pluginId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export const PLUGIN_EVENTS = {
  LOADED: 'plugin:loaded',
  ENABLED: 'plugin:enabled',
  DISABLED: 'plugin:disabled',
  ERROR: 'plugin:error',
  UNINSTALLED: 'plugin:uninstalled',
  CONFIG_UPDATED: 'plugin:config_updated',
  HOOK_TRIGGERED: 'plugin:hook_triggered',
} as const;

export type PluginEventType = typeof PLUGIN_EVENTS[keyof typeof PLUGIN_EVENTS];

export function validateManifest(manifest: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('id is required and must be a string');
  }
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('name is required and must be a string');
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    errors.push('version is required and must be a string');
  }
  if (!manifest.description || typeof manifest.description !== 'string') {
    errors.push('description is required and must be a string');
  }
  if (!manifest.author || typeof manifest.author !== 'string') {
    errors.push('author is required and must be a string');
  }

  if (manifest.api && !Array.isArray(manifest.api)) {
    errors.push('api must be an array');
  } else if (manifest.api) {
    manifest.api.forEach((entry: any, i: number) => {
      if (!entry.route) errors.push(`api[${i}].route is required`);
      if (!entry.handler) errors.push(`api[${i}].handler is required`);
    });
  }

  if (manifest.ui && !Array.isArray(manifest.ui)) {
    errors.push('ui must be an array');
  } else if (manifest.ui) {
    manifest.ui.forEach((entry: any, i: number) => {
      if (!entry.path) errors.push(`ui[${i}].path is required`);
      if (!entry.component) errors.push(`ui[${i}].component is required`);
    });
  }

  if (manifest.hooks && !Array.isArray(manifest.hooks)) {
    errors.push('hooks must be an array');
  } else if (manifest.hooks) {
    manifest.hooks.forEach((entry: any, i: number) => {
      if (!entry.event) errors.push(`hooks[${i}].event is required`);
      if (!entry.handler) errors.push(`hooks[${i}].handler is required`);
    });
  }

  const validPermissions: PluginPermission[] = ['database', 'filesystem', 'network', 'shell', 'secrets'];
  if (manifest.permissions) {
    if (!Array.isArray(manifest.permissions)) {
      errors.push('permissions must be an array');
    } else {
      manifest.permissions.forEach((p: any, i: number) => {
        if (!validPermissions.includes(p)) {
          errors.push(`permissions[${i}] "${p}" is not a valid permission`);
        }
      });
    }
  }

  if (manifest.config && !Array.isArray(manifest.config)) {
    errors.push('config must be an array');
  } else if (manifest.config) {
    manifest.config.forEach((entry: any, i: number) => {
      if (!entry.key) errors.push(`config[${i}].key is required`);
      if (!entry.type) errors.push(`config[${i}].type is required`);
    });
  }

  return { valid: errors.length === 0, errors };
}
