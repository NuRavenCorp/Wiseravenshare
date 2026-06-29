import { ModuleRegistry } from './ModuleRegistry';
import { PluginManager } from './PluginManager';
import { storage } from '../../Services/storage';
import api from '../../Services/api';

class EvolutionEngine {
    static instance = null;

    constructor() {
        if (EvolutionEngine.instance) {
            return EvolutionEngine.instance;
        }

        this.listeners = new Map();
        this.evolutionHistory = [];
        this.metrics = {
            moduleLoads: 0,
            evolutions: 0,
            healings: 0,
            errors: 0
        };
        this.isRunning = false;

        EvolutionEngine.instance = this;
    }

    static getInstance() {
        if (!EvolutionEngine.instance) {
            new EvolutionEngine();
        }
        return EvolutionEngine.instance;
    }

    async initialize() {
        this.isRunning = true;

        const history = storage.get('evolutionHistory');
        if (history) {
            this.evolutionHistory = history;
        }

        this.startEvolutionMonitoring();
        this.startSelfHealing();
        await this.checkForUpdates();
        await PluginManager.discoverPlugins();

        this.emit('initialized', { timestamp: Date.now() });
    }

    startEvolutionMonitoring() {
        setInterval(async () => {
            if (!this.isRunning) {
                return;
            }

            try {
                const performanceData = await this.analyzeModulePerformance();

                if (this.shouldEvolve(performanceData)) {
                    await this.evolveModules(performanceData);
                }

                await this.checkForUpdates();
            } catch (error) {
                console.error('Evolution monitoring error:', error);
                this.metrics.errors += 1;
            }
        }, 60000);
    }

    startSelfHealing() {
        window.addEventListener('error', async (event) => {
            const error = event.error || event.message;
            if (this.shouldHeal(error)) {
                await this.selfHeal(error);
            }
        });

        window.addEventListener('unhandledrejection', async (event) => {
            if (this.shouldHeal(event.reason)) {
                await this.selfHeal(event.reason);
            }
        });

        window.addEventListener('online', () => {
            this.emit('networkRecovered', { timestamp: Date.now() });
        });
    }

    shouldHeal(error) {
        if (!error) {
            return false;
        }

        const message = String(error.message || error);
        return /module|network|fetch|state|chunk|load/i.test(message);
    }

    async getModuleMetrics(id) {
        const key = `evolution_metrics_${id}`;
        const cached = storage.get(key);
        return cached || {
            loadTime: 0,
            errorRate: 0,
            usageCount: 0,
            lastEvolved: null
        };
    }

    async analyzeModulePerformance() {
        const modules = ModuleRegistry.getAll();
        const performance = {};

        for (const [id, module] of modules) {
            const metrics = await this.getModuleMetrics(id);
            performance[id] = {
                loadTime: metrics.loadTime || 0,
                errorRate: metrics.errorRate || 0,
                usageCount: metrics.usageCount || 0,
                lastEvolved: metrics.lastEvolved || null,
                version: module.version
            };
        }

        return performance;
    }

    shouldEvolve(performanceData) {
        for (const [id, metrics] of Object.entries(performanceData)) {
            if (metrics.errorRate > 0.05) {
                return true;
            }

            const module = ModuleRegistry.get(id);
            if (module && this.isOutdated(module.version)) {
                return true;
            }

            if (metrics.usageCount < 10 && metrics.loadTime > 2000) {
                return true;
            }
        }
        return false;
    }

    async evolveModules(performanceData) {
        const modules = ModuleRegistry.getAll();

        for (const [id, module] of modules) {
            const metrics = performanceData[id];
            if (!metrics) {
                continue;
            }

            const strategy = this.determineStrategy(module, metrics);

            if (strategy) {
                try {
                    const result = await this.applyEvolution(id, strategy);
                    this.evolutionHistory.push({
                        moduleId: id,
                        strategy,
                        result,
                        timestamp: Date.now(),
                        version: module.version
                    });

                    this.metrics.evolutions += 1;
                    this.emit('moduleEvolved', {
                        module: id,
                        strategy,
                        version: module.version,
                        timestamp: Date.now()
                    });
                } catch (error) {
                    console.error(`Failed to evolve module ${id}:`, error);
                }
            }
        }

        storage.set('evolutionHistory', this.evolutionHistory);
    }

    determineStrategy(module, metrics) {
        if (metrics.errorRate > 0.05) {
            return 'optimize';
        }
        if (this.isOutdated(module.version)) {
            return 'upgrade';
        }
        if (metrics.loadTime > 2000) {
            return 'lazy-load';
        }
        if (metrics.usageCount < 10) {
            return 'deprecate';
        }
        return null;
    }

    async applyEvolution(moduleId, strategy) {
        switch (strategy) {
            case 'optimize':
                return this.optimizeModule(moduleId);
            case 'upgrade':
                return this.upgradeModule(moduleId);
            case 'lazy-load':
                return this.lazyLoadModule(moduleId);
            case 'deprecate':
                return this.deprecateModule(moduleId);
            default:
                throw new Error(`Unknown strategy: ${strategy}`);
        }
    }

    async optimizeModule(moduleId) {
        const module = ModuleRegistry.get(moduleId);
        if (!module) {
            return null;
        }

        this.emit('moduleOptimized', { moduleId, timestamp: Date.now() });
        return { success: true, strategy: 'optimize' };
    }

    async upgradeModule(moduleId) {
        try {
            const response = await api.get(`/evolution/modules/${moduleId}/latest`);
            const latest = response?.data || response;

            if (latest && latest.version) {
                ModuleRegistry.update(moduleId, {
                    version: latest.version,
                    component: latest.component,
                    updatedAt: Date.now()
                });

                this.emit('moduleUpgraded', {
                    moduleId,
                    version: latest.version,
                    timestamp: Date.now()
                });

                return { success: true, version: latest.version, strategy: 'upgrade' };
            }
        } catch (error) {
            console.error(`Failed to upgrade module ${moduleId}:`, error);
            return { success: false, error: error.message };
        }

        return { success: false, error: 'No update payload returned.' };
    }

    async lazyLoadModule(moduleId) {
        ModuleRegistry.update(moduleId, {
            lazyLoad: true,
            loadPriority: 'low'
        });

        this.emit('moduleLazyLoaded', { moduleId, timestamp: Date.now() });
        return { success: true, strategy: 'lazy-load' };
    }

    async deprecateModule(moduleId) {
        ModuleRegistry.update(moduleId, {
            deprecated: true,
            deprecationDate: Date.now()
        });

        this.emit('moduleDeprecated', { moduleId, timestamp: Date.now() });
        return { success: true, strategy: 'deprecate' };
    }

    async selfHeal(error) {
        try {
            const analysis = this.analyzeError(error);

            if (analysis.type === 'module_error') {
                await this.healModuleError(analysis);
            } else if (analysis.type === 'network_error') {
                await this.healNetworkError(analysis);
            } else if (analysis.type === 'state_error') {
                await this.healStateError(analysis);
            }

            this.metrics.healings += 1;
            this.emit('selfHealed', {
                error: analysis,
                timestamp: Date.now(),
                strategy: analysis.type
            });
        } catch (healError) {
            console.error('Self-healing failed:', healError);
        }
    }

    analyzeError(error) {
        if (error?.message?.includes('module')) {
            return { type: 'module_error', error };
        }
        if (error?.message?.includes('network') || error?.message?.includes('fetch')) {
            return { type: 'network_error', error };
        }
        if (error?.message?.includes('state')) {
            return { type: 'state_error', error };
        }
        return { type: 'unknown', error };
    }

    async healModuleError() {
        return Promise.resolve();
    }

    async healNetworkError() {
        return Promise.resolve();
    }

    async healStateError() {
        return Promise.resolve();
    }

    async checkForUpdates() {
        try {
            const response = await api.get('/evolution/updates');
            const updates = response?.data || [];

            for (const update of updates) {
                if (ModuleRegistry.has(update.id)) {
                    const current = ModuleRegistry.get(update.id);
                    if (this.isNewerVersion(update.version, current.version)) {
                        await this.upgradeModule(update.id);
                    }
                } else {
                    ModuleRegistry.register(update.id, update);
                    this.emit('moduleAdded', {
                        moduleId: update.id,
                        version: update.version,
                        timestamp: Date.now()
                    });
                }
            }
        } catch (error) {
            console.error('Failed to check for updates:', error);
        }
    }

    isNewerVersion(newVersion, currentVersion) {
        if (!currentVersion) {
            return true;
        }

        const newParts = newVersion.split('.').map(Number);
        const currentParts = currentVersion.split('.').map(Number);

        for (let i = 0; i < Math.max(newParts.length, currentParts.length); i += 1) {
            const newPart = newParts[i] || 0;
            const currentPart = currentParts[i] || 0;
            if (newPart > currentPart) {
                return true;
            }
            if (newPart < currentPart) {
                return false;
            }
        }

        return false;
    }

    isOutdated(version) {
        const parts = version.split('.').map(Number);
        return parts[0] < 1;
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
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

    getMetrics() {
        return {
            ...this.metrics,
            modules: ModuleRegistry.getAll().size,
            evolutionHistory: this.evolutionHistory.length
        };
    }

    destroy() {
        this.isRunning = false;
        this.listeners.clear();
    }
}

export { EvolutionEngine };
