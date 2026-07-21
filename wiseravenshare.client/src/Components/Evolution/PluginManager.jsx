import { ModuleRegistry } from './ModuleRegistry';
import { api } from '../../services/api';

class PluginManager {
    static plugins = new Map();
    static loadedPlugins = new Set();

    // Register plugin
    static register(pluginId, config) {
        if (this.plugins.has(pluginId)) {
            console.warn(`Plugin ${pluginId} already registered`);
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
        console.log(`🔌 Plugin registered: ${pluginId}`);

        // Auto-load plugin if autoload is enabled
        if (config.autoload) {
            this.loadPlugin(pluginId);
        }
    }

    // Load plugin
    static async loadPlugin(pluginId) {
        if (this.loadedPlugins.has(pluginId)) {
            return true;
        }

        const plugin = this.plugins.get(pluginId);
        if (!plugin) {
            console.error(`Plugin ${pluginId} not found`);
            return false;
        }

        try {
            // Load plugin component dynamically
            const module = await import(/* webpackIgnore: true */ plugin.entry);

            // Register plugin modules
            if (plugin.modules) {
                plugin.modules.forEach(mod => {
                    ModuleRegistry.register(mod.id, {
                        ...mod,
                        plugin: pluginId
                    });
                });
            }

            plugin.loaded = true;
            plugin.loadedAt = Date.now();
            this.loadedPlugins.add(pluginId);

            console.log(`✅ Plugin loaded: ${pluginId}`);
            return true;
        } catch (error) {
            console.error(`Failed to load plugin ${pluginId}:`, error);
            plugin.error = error.message;
            return false;
        }
    }

    // Unload plugin
    static unloadPlugin(pluginId) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) return false;

        // Unregister modules
        if (plugin.modules) {
            plugin.modules.forEach(mod => {
                // Remove from registry
            });
        }

        plugin.loaded = false;
        this.loadedPlugins.delete(pluginId);
        console.log(`🔌 Plugin unloaded: ${pluginId}`);
        return true;
    }

    // Discover plugins from server
    static async discoverPlugins() {
        try {
            const response = await api.get('/api/evolution/plugins/discover');
            const plugins = response.plugins || [];

            plugins.forEach(plugin => {
                this.register(plugin.id, plugin);
            });

            return plugins;
        } catch (error) {
            console.error('Failed to discover plugins:', error);
            return [];
        }
    }

    // Get plugin
    static get(pluginId) {
        return this.plugins.get(pluginId);
    }

    // Get all plugins
    static getAll() {
        return Array.from(this.plugins.values());
    }

    // Get loaded plugins
    static getLoaded() {
        return Array.from(this.plugins.values()).filter(p => p.loaded);
    }

    // Enable/disable plugin
    static setEnabled(pluginId, enabled) {
        const plugin = this.plugins.get(pluginId);
        if (!plugin) return false;

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