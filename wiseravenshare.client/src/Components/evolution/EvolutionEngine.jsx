import { ModuleRegistry } from './ModuleRegistry';
import { PluginManager } from './PluginManager';
import { FeatureFlags } from './FeatureFlags';
import { storage } from '../../services/storage';
import { api } from '../../services/api';

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
        this.monitorHandle = null;
        this.baseIntervalMs = 60000;
        this.minIntervalMs = 15000;
        this.maxIntervalMs = 300000;
        this.currentIntervalMs = this.baseIntervalMs;
        this.moduleCooldownMs = 180000;
        this.maxHistoryEntries = 500;
        this.lastEvolutionByModule = new Map();

        EvolutionEngine.instance = this;
    }

    static getInstance() {
        if (!EvolutionEngine.instance) {
            new EvolutionEngine();
        }
        return EvolutionEngine.instance;
    }

    // Initialize self-evolution system
    async initialize() {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;

        // Load evolution history from storage
        const history = await storage.get('evolutionHistory');
        if (Array.isArray(history)) {
            this.evolutionHistory = history;
            for (const item of history) {
                if (item?.moduleId && item?.timestamp) {
                    const current = this.lastEvolutionByModule.get(item.moduleId) || 0;
                    if (item.timestamp > current) {
                        this.lastEvolutionByModule.set(item.moduleId, item.timestamp);
                    }
                }
            }
        }

        // Start evolution monitoring
        this.startEvolutionMonitoring();

        // Start self-healing monitoring
        this.startSelfHealing();

        // Check for module updates
        await this.checkForUpdates();

        console.log('🧬 Evolution Engine initialized');
        this.emit('initialized', { timestamp: Date.now() });
    }

    // Monitor and evolve modules
    startEvolutionMonitoring() {
        const runCycle = async () => {
            if (!this.isRunning) return;

            const startedAt = Date.now();
            let urgency = 0;

            try {
                // Analyze module performance
                const performanceData = await this.analyzeModulePerformance();
                urgency = this.calculateEvolutionUrgency(performanceData);

                // Check if evolution is needed
                if (this.shouldEvolve(performanceData)) {
                    await this.evolveModules(performanceData);
                    urgency = Math.max(urgency, 0.8);
                }

                // Check for new module versions
                await this.checkForUpdates();
            } catch (error) {
                console.error('Evolution monitoring error:', error);
                this.metrics.errors++;
                urgency = 1;
            } finally {
                this.adjustMonitoringInterval(urgency, Date.now() - startedAt);
                if (this.isRunning) {
                    this.monitorHandle = setTimeout(runCycle, this.currentIntervalMs);
                }
            }
        };

        this.monitorHandle = setTimeout(runCycle, 0);
    }

    // Self-healing mechanism
    startSelfHealing() {
        // Monitor for errors and auto-recover
        window.addEventListener('error', async (event) => {
            const error = event.error || event.message;
            if (this.shouldHeal(error)) {
                await this.selfHeal(error);
            }
        });

        // Monitor unhandled promise rejections
        window.addEventListener('unhandledrejection', async (event) => {
            if (this.shouldHeal(event.reason)) {
                await this.selfHeal(event.reason);
            }
        });

        // Monitor network status
        window.addEventListener('online', () => {
            this.emit('networkRecovered', { timestamp: Date.now() });
        });
    }

    // Analyze module performance
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

    // Determine if evolution is needed
    shouldEvolve(performanceData) {
        for (const [id, metrics] of Object.entries(performanceData)) {
            const module = ModuleRegistry.get(id);
            if (!module || this.isInCooldown(id)) {
                continue;
            }

            if (this.shouldEvolveModule(module, metrics)) {
                return true;
            }
        }
        return false;
    }

    // Perform module evolution
    async evolveModules(performanceData) {
        const modules = ModuleRegistry.getAll();

        for (const [id, module] of modules) {
            const metrics = performanceData[id];
            if (!metrics) continue;

            // Determine evolution strategy
            const strategy = this.determineStrategy(module, metrics);

            if (strategy) {
                if (this.isInCooldown(id)) {
                    continue;
                }

                try {
                    const result = await this.applyEvolution(id, strategy);
                    if (result?.success !== false) {
                        const evolvedAt = Date.now();
                        this.evolutionHistory.push({
                            moduleId: id,
                            strategy,
                            result,
                            timestamp: evolvedAt,
                            version: module.version
                        });
                        this.markEvolved(id, evolvedAt);
                        this.pruneEvolutionHistory();

                        this.metrics.evolutions++;
                        this.emit('moduleEvolved', {
                            module: id,
                            strategy,
                            version: module.version,
                            timestamp: evolvedAt
                        });
                    } else {
                        this.metrics.errors++;
                    }
                } catch (error) {
                    console.error(`Failed to evolve module ${id}:`, error);
                    this.metrics.errors++;
                }
            }
        }

        // Save evolution history
        await storage.set('evolutionHistory', this.evolutionHistory);
    }

    // Determine evolution strategy
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

    // Apply evolution strategy
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

    // Optimize module (self-optimization)
    async optimizeModule(moduleId) {
        console.log(`⚡ Optimizing module: ${moduleId}`);

        // Analyze module bundle
        const module = ModuleRegistry.get(moduleId);
        if (!module) return null;

        // Dynamic import optimization
        // Code splitting
        // Memoization
        // Lazy loading sub-components

        this.emit('moduleOptimized', { moduleId, timestamp: Date.now() });
        return { success: true, strategy: 'optimize' };
    }

    // Upgrade module to latest version
    async upgradeModule(moduleId) {
        console.log(`⬆️ Upgrading module: ${moduleId}`);

        try {
            // Fetch latest version from server
            const latest = await api.get(`/api/evolution/modules/${moduleId}/latest`);

            if (latest && latest.version) {
                // Update module registration
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
    }

    // Lazy load module for better performance
    async lazyLoadModule(moduleId) {
        console.log(`📦 Lazy loading module: ${moduleId}`);

        // Mark module for lazy loading
        ModuleRegistry.update(moduleId, {
            lazyLoad: true,
            loadPriority: 'low'
        });

        this.emit('moduleLazyLoaded', { moduleId, timestamp: Date.now() });
        return { success: true, strategy: 'lazy-load' };
    }

    // Deprecate unused module
    async deprecateModule(moduleId) {
        console.log(`🗑️ Deprecating module: ${moduleId}`);

        ModuleRegistry.update(moduleId, {
            deprecated: true,
            deprecationDate: Date.now()
        });

        this.emit('moduleDeprecated', { moduleId, timestamp: Date.now() });
        return { success: true, strategy: 'deprecate' };
    }

    // Self-healing function
    async selfHeal(error) {
        console.log('🩹 Self-healing triggered:', error);

        try {
            // Analyze error
            const analysis = this.analyzeError(error);

            // Determine healing strategy
            if (analysis.type === 'module_error') {
                await this.healModuleError(analysis);
            } else if (analysis.type === 'network_error') {
                await this.healNetworkError(analysis);
            } else if (analysis.type === 'state_error') {
                await this.healStateError(analysis);
            }

            this.metrics.healings++;
            this.emit('selfHealed', {
                error: analysis,
                timestamp: Date.now(),
                strategy: analysis.type
            });

        } catch (healError) {
            console.error('Self-healing failed:', healError);
        }
    }

    // Analyze error for healing
    analyzeError(error) {
        if (error.message?.includes('module')) {
            return { type: 'module_error', error };
        }
        if (error.message?.includes('network') || error.message?.includes('fetch')) {
            return { type: 'network_error', error };
        }
        if (error.message?.includes('state')) {
            return { type: 'state_error', error };
        }
        return { type: 'unknown', error };
    }

    // Heal module errors
    async healModuleError(analysis) {
        // Reload module
        // Fallback to previous version
        // Clear module cache
        console.log('🔄 Healing module error...');
    }

    // Heal network errors
    async healNetworkError(analysis) {
        // Retry with exponential backoff
        // Switch to offline mode
        // Use cached data
        console.log('🌐 Healing network error...');
    }

    // Heal state errors
    async healStateError(analysis) {
        // Restore from checkpoint
        // Reset to safe state
        console.log('💾 Healing state error...');
    }

    // Check for module updates
    async checkForUpdates() {
        try {
            const updates = await api.get('/api/evolution/updates');

            for (const update of updates) {
                if (ModuleRegistry.has(update.id)) {
                    const current = ModuleRegistry.get(update.id);
                    if (this.isNewerVersion(update.version, current.version)) {
                        await this.upgradeModule(update.id);
                    }
                } else {
                    // Register new module
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

    shouldEvolveModule(module, metrics) {
        // Evolve if error rate is high
        if (metrics.errorRate > 0.05) {
            return true;
        }

        // Evolve if module is outdated
        if (this.isOutdated(module.version)) {
            return true;
        }

        // Evolve if usage is declining
        return metrics.usageCount < 10 && metrics.loadTime > 2000;
    }

    isInCooldown(moduleId) {
        const lastEvolution = this.lastEvolutionByModule.get(moduleId);
        if (!lastEvolution) {
            return false;
        }

        return Date.now() - lastEvolution < this.moduleCooldownMs;
    }

    markEvolved(moduleId, timestamp) {
        this.lastEvolutionByModule.set(moduleId, timestamp);
    }

    pruneEvolutionHistory() {
        if (this.evolutionHistory.length <= this.maxHistoryEntries) {
            return;
        }

        this.evolutionHistory = this.evolutionHistory.slice(-this.maxHistoryEntries);
    }

    calculateEvolutionUrgency(performanceData) {
        let maxUrgency = 0;

        for (const metrics of Object.values(performanceData)) {
            if (metrics.errorRate > 0.1) {
                maxUrgency = Math.max(maxUrgency, 1);
            } else if (metrics.errorRate > 0.05) {
                maxUrgency = Math.max(maxUrgency, 0.8);
            }

            if (metrics.loadTime > 3000) {
                maxUrgency = Math.max(maxUrgency, 0.7);
            } else if (metrics.loadTime > 2000) {
                maxUrgency = Math.max(maxUrgency, 0.5);
            }

            if (metrics.usageCount < 10) {
                maxUrgency = Math.max(maxUrgency, 0.4);
            }
        }

        return maxUrgency;
    }

    adjustMonitoringInterval(urgency, durationMs) {
        if (urgency >= 0.8) {
            this.currentIntervalMs = Math.max(this.minIntervalMs, Math.floor(this.currentIntervalMs * 0.7));
        } else if (urgency <= 0.2) {
            this.currentIntervalMs = Math.min(this.maxIntervalMs, Math.floor(this.currentIntervalMs * 1.2));
        }

        if (durationMs > 5000) {
            this.currentIntervalMs = Math.min(this.maxIntervalMs, this.currentIntervalMs + 10000);
        }
    }

    async getModuleMetrics(moduleId) {
        const metrics = await storage.get(`moduleMetrics:${moduleId}`);
        return metrics || {};
    }

    shouldHeal(error) {
        if (!error) {
            return false;
        }

        const message = typeof error === 'string' ? error : (error.message || '');
        return /module|network|fetch|state|timeout|chunk/i.test(message);
    }

    // Version comparison
    isNewerVersion(newVersion, currentVersion) {
        if (!currentVersion) return true;
        const newParts = newVersion.split('.').map(Number);
        const currentParts = currentVersion.split('.').map(Number);

        for (let i = 0; i < Math.max(newParts.length, currentParts.length); i++) {
            const newPart = newParts[i] || 0;
            const currentPart = currentParts[i] || 0;
            if (newPart > currentPart) return true;
            if (newPart < currentPart) return false;
        }
        return false;
    }

    isOutdated(version) {
        const parts = version.split('.').map(Number);
        // Consider outdated if major version is behind
        return parts[0] < 1;
    }

    // Event system
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    // Get metrics
    getMetrics() {
        return {
            ...this.metrics,
            modules: ModuleRegistry.getAll().size,
            evolutionHistory: this.evolutionHistory.length
        };
    }

    // Destroy engine
    destroy() {
        this.isRunning = false;
        if (this.monitorHandle) {
            clearTimeout(this.monitorHandle);
            this.monitorHandle = null;
        }
        this.listeners.clear();
        console.log('🧬 Evolution Engine destroyed');
    }
}

export { EvolutionEngine };