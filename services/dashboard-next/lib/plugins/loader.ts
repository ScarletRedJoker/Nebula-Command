/**
 * Plugin Loader
 * Nebula Command - Load and manage plugins from filesystem and database
 */

import fs from 'fs/promises';
import path from 'path';
import { 
  PluginManifest, 
  LoadedPlugin, 
  PluginInstallOptions,
  validateManifest 
} from './types';
import { pluginRegistry } from './registry';
import { db } from '@/lib/db';
import { plugins as pluginsTable, pluginLogs } from '@/lib/db/plugin-schema';
import { eq } from 'drizzle-orm';

const PLUGINS_DIR = path.join(process.cwd(), 'plugins');

export async function loadPluginsFromDirectory(): Promise<LoadedPlugin[]> {
  const loadedPlugins: LoadedPlugin[] = [];
  
  try {
    await fs.access(PLUGINS_DIR);
  } catch {
    console.log('[PluginLoader] No plugins directory found, creating...');
    await fs.mkdir(PLUGINS_DIR, { recursive: true });
    return loadedPlugins;
  }

  const entries = await fs.readdir(PLUGINS_DIR, { withFileTypes: true });
  const pluginDirs = entries.filter(e => e.isDirectory());

  for (const dir of pluginDirs) {
    try {
      const plugin = await loadPluginFromPath(path.join(PLUGINS_DIR, dir.name));
      if (plugin) {
        loadedPlugins.push(plugin);
      }
    } catch (error: any) {
      console.error(`[PluginLoader] Failed to load plugin ${dir.name}:`, error.message);
    }
  }

  return loadedPlugins;
}

export async function loadPluginFromPath(pluginPath: string): Promise<LoadedPlugin | null> {
  const manifestPath = path.join(pluginPath, 'manifest.json');
  
  try {
    await fs.access(manifestPath);
  } catch {
    console.warn(`[PluginLoader] No manifest.json found in ${pluginPath}`);
    return null;
  }

  const manifestContent = await fs.readFile(manifestPath, 'utf-8');
  const manifest: PluginManifest = JSON.parse(manifestContent);

  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Invalid manifest: ${validation.errors.join(', ')}`);
  }

  const dependencyCheck = await checkDependencies(manifest);
  if (!dependencyCheck.satisfied) {
    throw new Error(`Missing dependencies: ${dependencyCheck.missing.join(', ')}`);
  }

  let dbConfig: Record<string, any> = {};
  try {
    const [dbPlugin] = await db
      .select()
      .from(pluginsTable)
      .where(eq(pluginsTable.pluginId, manifest.id))
      .limit(1);
    
    if (dbPlugin) {
      dbConfig = (dbPlugin.config as Record<string, any>) || {};
      manifest.enabled = dbPlugin.enabled ?? manifest.enabled;
    }
  } catch (error) {
    console.warn(`[PluginLoader] Could not load config from database for ${manifest.id}`);
  }

  const config = buildPluginConfig(manifest, dbConfig);

  const plugin = pluginRegistry.registerPlugin(manifest, config);

  await logPluginEvent(manifest.id, 'info', `Plugin loaded: ${manifest.name} v${manifest.version}`);

  return plugin;
}

export async function installPlugin(options: PluginInstallOptions): Promise<LoadedPlugin> {
  let manifest: PluginManifest;

  if (options.manifest) {
    manifest = options.manifest;
  } else if (options.url) {
    manifest = await fetchManifestFromUrl(options.url);
  } else {
    throw new Error('Either manifest or url is required');
  }

  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Invalid manifest: ${validation.errors.join(', ')}`);
  }

  if (pluginRegistry.hasPlugin(manifest.id)) {
    throw new Error(`Plugin ${manifest.id} is already installed`);
  }

  const dependencyCheck = await checkDependencies(manifest);
  if (!dependencyCheck.satisfied) {
    throw new Error(`Missing dependencies: ${dependencyCheck.missing.join(', ')}`);
  }

  const pluginDir = path.join(PLUGINS_DIR, manifest.id);
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  const config = buildPluginConfig(manifest, options.config || {});

  await db.insert(pluginsTable).values({
    pluginId: manifest.id,
    manifest: manifest as any,
    enabled: options.autoEnable ?? manifest.enabled ?? false,
    config: config as any,
    status: options.autoEnable ? 'active' : 'disabled',
  });

  if (options.autoEnable) {
    manifest.enabled = true;
  }

  const plugin = pluginRegistry.registerPlugin(manifest, config);

  await logPluginEvent(manifest.id, 'info', `Plugin installed: ${manifest.name} v${manifest.version}`);

  return plugin;
}

export async function uninstallPlugin(pluginId: string): Promise<boolean> {
  const plugin = pluginRegistry.getPlugin(pluginId);
  if (!plugin) {
    throw new Error(`Plugin ${pluginId} not found`);
  }

  pluginRegistry.unregisterPlugin(pluginId);

  await db.delete(pluginsTable).where(eq(pluginsTable.pluginId, pluginId));

  const pluginDir = path.join(PLUGINS_DIR, pluginId);
  try {
    await fs.rm(pluginDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`[PluginLoader] Could not remove plugin directory: ${pluginDir}`);
  }

  await logPluginEvent(pluginId, 'info', `Plugin uninstalled: ${pluginId}`);

  return true;
}

export async function enablePlugin(pluginId: string): Promise<boolean> {
  const plugin = pluginRegistry.getPlugin(pluginId);
  if (!plugin) {
    throw new Error(`Plugin ${pluginId} not found`);
  }

  const dependencyCheck = await checkDependencies(plugin.manifest);
  if (!dependencyCheck.satisfied) {
    throw new Error(`Cannot enable: missing dependencies: ${dependencyCheck.missing.join(', ')}`);
  }

  pluginRegistry.enablePlugin(pluginId);

  await db
    .update(pluginsTable)
    .set({ enabled: true, status: 'active', updatedAt: new Date() })
    .where(eq(pluginsTable.pluginId, pluginId));

  await logPluginEvent(pluginId, 'info', `Plugin enabled: ${pluginId}`);

  return true;
}

export async function disablePlugin(pluginId: string): Promise<boolean> {
  const plugin = pluginRegistry.getPlugin(pluginId);
  if (!plugin) {
    throw new Error(`Plugin ${pluginId} not found`);
  }

  const dependents = getDependentPlugins(pluginId);
  if (dependents.length > 0) {
    const activeDependent = dependents.find(d => d.status === 'active');
    if (activeDependent) {
      throw new Error(
        `Cannot disable: plugin is required by ${activeDependent.manifest.id}`
      );
    }
  }

  pluginRegistry.disablePlugin(pluginId);

  await db
    .update(pluginsTable)
    .set({ enabled: false, status: 'disabled', updatedAt: new Date() })
    .where(eq(pluginsTable.pluginId, pluginId));

  await logPluginEvent(pluginId, 'info', `Plugin disabled: ${pluginId}`);

  return true;
}

export async function updatePluginConfig(
  pluginId: string,
  config: Record<string, any>
): Promise<boolean> {
  const plugin = pluginRegistry.getPlugin(pluginId);
  if (!plugin) {
    throw new Error(`Plugin ${pluginId} not found`);
  }

  const mergedConfig = { ...plugin.config, ...config };
  const validation = validateConfigAgainstSchema(mergedConfig, plugin.manifest.config || []);
  if (!validation.valid) {
    throw new Error(`Invalid config: ${validation.errors.join(', ')}`);
  }

  pluginRegistry.updatePluginConfig(pluginId, mergedConfig);

  await db
    .update(pluginsTable)
    .set({ config: mergedConfig as any, updatedAt: new Date() })
    .where(eq(pluginsTable.pluginId, pluginId));

  await logPluginEvent(pluginId, 'info', `Plugin config updated: ${pluginId}`);

  return true;
}

async function fetchManifestFromUrl(url: string): Promise<PluginManifest> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch manifest: ${response.statusText}`);
  }
  return await response.json();
}

async function checkDependencies(manifest: PluginManifest): Promise<{
  satisfied: boolean;
  missing: string[];
}> {
  const missing: string[] = [];

  if (manifest.dependencies) {
    for (const dep of manifest.dependencies) {
      const plugin = pluginRegistry.getPlugin(dep.plugin);
      if (!plugin || plugin.status !== 'active') {
        missing.push(`${dep.plugin}@${dep.version}`);
      }
    }
  }

  return {
    satisfied: missing.length === 0,
    missing,
  };
}

function getDependentPlugins(pluginId: string): LoadedPlugin[] {
  return pluginRegistry.getAllPlugins().filter(plugin => {
    return plugin.manifest.dependencies?.some(dep => dep.plugin === pluginId);
  });
}

function buildPluginConfig(
  manifest: PluginManifest,
  providedConfig: Record<string, any>
): Record<string, any> {
  const config: Record<string, any> = {};

  if (manifest.config) {
    for (const schema of manifest.config) {
      if (schema.key in providedConfig) {
        config[schema.key] = providedConfig[schema.key];
      } else if (schema.default !== undefined) {
        config[schema.key] = schema.default;
      }
    }
  }

  for (const [key, value] of Object.entries(providedConfig)) {
    if (!(key in config)) {
      config[key] = value;
    }
  }

  return config;
}

function validateConfigAgainstSchema(
  config: Record<string, any>,
  schema: PluginManifest['config']
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!schema) return { valid: true, errors: [] };

  for (const field of schema) {
    if (field.required && !(field.key in config)) {
      errors.push(`Missing required config: ${field.key}`);
      continue;
    }

    if (field.key in config) {
      const value = config[field.key];
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      
      if (actualType !== field.type) {
        errors.push(`Config ${field.key} should be ${field.type}, got ${actualType}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

async function logPluginEvent(
  pluginId: string,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await db.insert(pluginLogs).values({
      pluginId,
      level,
      message,
      metadata: metadata as any,
    });
  } catch (error) {
    console.error(`[PluginLoader] Failed to log event:`, error);
  }
}

export async function syncPluginsWithDatabase(): Promise<void> {
  try {
    const dbPlugins = await db.select().from(pluginsTable);
    
    for (const dbPlugin of dbPlugins) {
      const manifest = dbPlugin.manifest as PluginManifest;
      const config = (dbPlugin.config as Record<string, any>) || {};
      
      if (!pluginRegistry.hasPlugin(dbPlugin.pluginId)) {
        manifest.enabled = dbPlugin.enabled ?? false;
        pluginRegistry.registerPlugin(manifest, config);
      }
    }
  } catch (error) {
    console.error('[PluginLoader] Failed to sync with database:', error);
  }
}

export async function initializePluginSystem(): Promise<void> {
  console.log('[PluginLoader] Initializing plugin system...');
  
  const filesystemPlugins = await loadPluginsFromDirectory();
  console.log(`[PluginLoader] Loaded ${filesystemPlugins.length} plugins from filesystem`);
  
  await syncPluginsWithDatabase();
  
  const stats = pluginRegistry.getStats();
  console.log(`[PluginLoader] Plugin system ready: ${stats.total} plugins, ${stats.active} active`);
}
