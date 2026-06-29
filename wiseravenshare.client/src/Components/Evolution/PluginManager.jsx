import { ModuleRegistry } from './ModuleRegistry';
import api from '../../Services/api';

class PluginManager {
    static plugins = new Map();
    static loadedPlugins = new Set();

    static register(pluginId, config) {
        if (this.plugins.has(pluginId)) {
            return;
        }

        const plugin = {
            id: pluginId,
            ...config,
            loaded: false,
            registeredAt: Date.now(),
            version: config.version || '1.0.0'
        };

        this.plugins.set(pluginId, plugin);

        if (config.autoload) {
            this.loadPlugin(pluginId);
        }
    }

    static async loadPlugin(pluginId) {
        if (this.loadedPlugins.has(pluginId)) {
            return true;
        }

        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            return false;
        }

        try {
            await import(/* webpackIgnore: true */ plugin.entry);

            if (plugin.modules) {
                plugin.modules.forEach((mod) => {
                    ModuleRegistry.register(mod.id, {
                        ...mod,
                        plugin: pluginId
                    });
                });
            }

            plugin.loaded = true;
            plugin.loadedAt = Date.now();
            this.loadedPlugins.add(pluginId);
            return true;
        } catch (error) {
            console.error(`Failed to load plugin ${pluginId}:`, error);
            plugin.error = error.message;
            return false;
        }
    }

    static unloadPlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            return false;
        }

        plugin.loaded = false;
        this.loadedPlugins.delete(pluginId);
        return true;
    }

    static async discoverPlugins() {
        try {
            const response = await api.get('/evolution/plugins/discover');
            const plugins = response?.data?.plugins || [];

            plugins.forEach((plugin) => {
                this.register(plugin.id, plugin);
            });

            return plugins;
        } catch (error) {
            console.error('Failed to discover plugins:', error);
            return [];
        }
    }

    static get(pluginId) {
        return this.plugins.get(pluginId);
    }

    static getAll() {
        return Array.from(this.plugins.values());
    }

    static getLoaded() {
        return Array.from(this.plugins.values()).filter((p) => p.loaded);
    }

    static setEnabled(pluginId, enabled) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            return false;
        }

        plugin.enabled = enabled;
        if (!enabled && plugin.loaded) {
            this.unloadPlugin(pluginId);
        }
        if (enabled) {
            this.loadPlugin(pluginId);
        }
        return true;
    }
}

export { PluginManager };
