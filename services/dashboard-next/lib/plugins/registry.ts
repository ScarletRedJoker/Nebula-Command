/**
 * Plugin Registry
 * Nebula Command - In-memory plugin registry with event emitter
 */

import { EventEmitter } from 'events';
import type { 
  LoadedPlugin, 
  PluginManifest, 
  PluginStatus, 
  PluginEvent,
  PluginEventType,
  PluginHook
} from './types';
import { PLUGIN_EVENTS } from './types';

class PluginRegistry extends EventEmitter {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private hooks: Map<string, Array<{ pluginId: string; handler: string }>> = new Map();

  getPlugin(id: string): LoadedPlugin | undefined {
    return this.plugins.get(id);
  }

  getAllPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  getActivePlugins(): LoadedPlugin[] {
    return this.getAllPlugins().filter(p => p.status === 'active');
  }

  getPluginsByStatus(status: PluginStatus): LoadedPlugin[] {
    return this.getAllPlugins().filter(p => p.status === status);
  }

  hasPlugin(id: string): boolean {
    return this.plugins.has(id);
  }

  registerPlugin(manifest: PluginManifest, config: Record<string, any> = {}): LoadedPlugin {
    const plugin: LoadedPlugin = {
      manifest,
      status: manifest.enabled ? 'active' : 'disabled',
      loadedAt: new Date(),
      config,
    };

    this.plugins.set(manifest.id, plugin);

    if (manifest.hooks) {
      this.registerHooks(manifest.id, manifest.hooks);
    }

    this.emitPluginEvent(PLUGIN_EVENTS.LOADED, manifest.id);
    return plugin;
  }

  updatePlugin(id: string, updates: Partial<LoadedPlugin>): LoadedPlugin | undefined {
    const plugin = this.plugins.get(id);
    if (!plugin) return undefined;

    const updatedPlugin = { ...plugin, ...updates };
    this.plugins.set(id, updatedPlugin);

    return updatedPlugin;
  }

  unregisterPlugin(id: string): boolean {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;

    this.unregisterHooks(id);

    this.plugins.delete(id);

    this.emitPluginEvent(PLUGIN_EVENTS.UNINSTALLED, id);
    return true;
  }

  enablePlugin(id: string): boolean {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;

    plugin.status = 'active';
    plugin.manifest.enabled = true;
    plugin.error = undefined;
    this.plugins.set(id, plugin);

    this.emitPluginEvent(PLUGIN_EVENTS.ENABLED, id);
    return true;
  }

  disablePlugin(id: string): boolean {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;

    plugin.status = 'disabled';
    plugin.manifest.enabled = false;
    this.plugins.set(id, plugin);

    this.emitPluginEvent(PLUGIN_EVENTS.DISABLED, id);
    return true;
  }

  setPluginError(id: string, error: string): void {
    const plugin = this.plugins.get(id);
    if (!plugin) return;

    plugin.status = 'error';
    plugin.error = error;
    this.plugins.set(id, plugin);

    this.emitPluginEvent(PLUGIN_EVENTS.ERROR, id, { error });
  }

  updatePluginConfig(id: string, config: Record<string, any>): boolean {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;

    plugin.config = { ...plugin.config, ...config };
    this.plugins.set(id, plugin);

    this.emitPluginEvent(PLUGIN_EVENTS.CONFIG_UPDATED, id, { config });
    return true;
  }

  private registerHooks(pluginId: string, hooks: PluginHook[]): void {
    for (const hook of hooks) {
      const existing = this.hooks.get(hook.event) || [];
      existing.push({ pluginId, handler: hook.handler });
      this.hooks.set(hook.event, existing);
    }
  }

  private unregisterHooks(pluginId: string): void {
    for (const [event, handlers] of Array.from(this.hooks.entries())) {
      const filtered = handlers.filter((h: { pluginId: string; handler: string }) => h.pluginId !== pluginId);
      if (filtered.length === 0) {
        this.hooks.delete(event);
      } else {
        this.hooks.set(event, filtered);
      }
    }
  }

  getHooksForEvent(event: string): Array<{ pluginId: string; handler: string }> {
    return this.hooks.get(event) || [];
  }

  async triggerHook(event: string, data?: any): Promise<void> {
    const handlers = this.getHooksForEvent(event);
    
    for (const { pluginId, handler } of handlers) {
      const plugin = this.plugins.get(pluginId);
      if (plugin && plugin.status === 'active') {
        this.emitPluginEvent(PLUGIN_EVENTS.HOOK_TRIGGERED, pluginId, { event, handler, data });
      }
    }
  }

  private emitPluginEvent(type: PluginEventType, pluginId: string, data?: any): void {
    const event: PluginEvent = {
      type,
      pluginId,
      timestamp: new Date(),
      data,
    };
    this.emit(type, event);
    this.emit('plugin:*', event);
  }

  getStats(): {
    total: number;
    active: number;
    disabled: number;
    error: number;
    hooks: number;
  } {
    const plugins = this.getAllPlugins();
    return {
      total: plugins.length,
      active: plugins.filter(p => p.status === 'active').length,
      disabled: plugins.filter(p => p.status === 'disabled').length,
      error: plugins.filter(p => p.status === 'error').length,
      hooks: this.hooks.size,
    };
  }

  clear(): void {
    this.plugins.clear();
    this.hooks.clear();
    this.removeAllListeners();
  }
}

export const pluginRegistry = new PluginRegistry();
export default pluginRegistry;
