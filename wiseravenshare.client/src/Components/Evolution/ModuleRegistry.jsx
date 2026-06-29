class ModuleRegistry {
    static modules = new Map();
    static listeners = new Map();

    static register(id, config) {
        if (this.modules.has(id)) {
            this.update(id, config);
            return;
        }

        if (!config.component) {
            throw new Error(`Module ${id} must have a component`);
        }

        const moduleConfig = {
            id,
            ...config,
            registeredAt: Date.now(),
            lastUpdated: Date.now(),
            version: config.version || '1.0.0',
            enabled: true,
            deprecated: false,
            lazyLoad: false
        };

        this.modules.set(id, moduleConfig);
        this.emit('registered', { id, config: moduleConfig });

        if (config.dependencies) {
            config.dependencies.forEach((dep) => {
                if (!this.modules.has(dep)) {
                    this.loadDependency(dep);
                }
            });
        }
    }

    static update(id, updates) {
        if (!this.modules.has(id)) {
            throw new Error(`Module ${id} not found`);
        }

        const current = this.modules.get(id);
        const updated = {
            ...current,
            ...updates,
            lastUpdated: Date.now()
        };

        this.modules.set(id, updated);
        this.emit('updated', { id, updates });
    }

    static get(id) {
        return this.modules.get(id);
    }

    static has(id) {
        return this.modules.has(id);
    }

    static getAll() {
        return new Map(this.modules);
    }

    static getEnabled() {
        const enabled = [];
        for (const [id, config] of this.modules) {
            if (config.enabled && !config.deprecated) {
                enabled.push({ id, ...config });
            }
        }
        return enabled.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    }

    static setEnabled(id, enabled) {
        if (!this.modules.has(id)) {
            throw new Error(`Module ${id} not found`);
        }

        this.modules.get(id).enabled = enabled;
        this.emit('enabledChanged', { id, enabled });
    }

    static async loadDependency(dep) {
        try {
            const response = await fetch(`/api/evolution/modules/${dep}`);
            if (response.ok) {
                const config = await response.json();
                this.register(dep, config);
                return true;
            }
        } catch (error) {
            console.error(`Failed to load dependency ${dep}:`, error);
        }

        return false;
    }

    static on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }

        this.listeners.get(event).push(callback);
    }

    static emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach((callback) => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }
}

export { ModuleRegistry };
