// src/services/evolution.ts
import api from './api';
import { SignalRService } from './signalR';

class EvolutionService {
    private signalR: SignalRService;

    constructor() {
        this.signalR = SignalRService.getInstance();
        this.initializeSignalR();
    }

    private initializeSignalR() {
        this.signalR.connect('/api/hubs/evolution');
        this.signalR.on('AgentEvolved', this.handleAgentEvolved);
        this.signalR.on('SystemMetrics', this.handleSystemMetrics);
        this.signalR.on('EvolutionSuggestion', this.handleEvolutionSuggestion);
    }

    // Discover module updates
    async getAgents(): Promise<Agent[]> {
        const response = await api.get('/evolution/updates');
        const updates = Array.isArray(response?.data) ? response.data : [];
        return updates.map((item: any) => ({
            id: String(item?.id || ''),
            name: String(item?.id || 'module'),
            type: 'module',
            description: `Update available: ${item?.currentVersion || 'unknown'} -> ${item?.version || 'unknown'}`,
            performanceScore: 0,
            status: 'active',
            posts: 0,
            interactions: 0,
            lastActive: new Date().toISOString(),
        }));
    }

    // Get agent by ID
    async getAgent(id: string): Promise<Agent> {
        const response = await api.get(`/evolution/modules/${id}`);
        const module = response?.data || {};
        return {
            id: String(module?.id || id),
            name: String(module?.name || module?.id || id),
            type: 'module',
            description: String(module?.description || ''),
            performanceScore: 0,
            status: 'active',
            posts: 0,
            interactions: 0,
            lastActive: new Date().toISOString(),
        };
    }

    // Get evolution history
    async getEvolutionHistory(agentId?: string): Promise<Evolution[]> {
        const response = await api.get('/evolution/history', {
            params: { agentId },
        });
        return response.data;
    }

    // Get system metrics
    async getSystemMetrics(): Promise<SystemMetrics> {
        const response = await api.get('/evolution/metrics');
        return response.data;
    }

    // Trigger evolution for an agent
    async triggerEvolution(agentId: string): Promise<Evolution> {
        const response = await api.get(`/evolution/modules/${agentId}/latest`);
        const latest = response?.data || {};
        return {
            id: `evolution-${Date.now()}`,
            agentId,
            agentName: String(latest?.id || agentId),
            type: 'module-update',
            description: `Latest module version: ${latest?.version || 'unknown'}`,
            fitnessBefore: 0,
            fitnessAfter: 0,
            timestamp: new Date().toISOString(),
        };
    }

    // Get evolution suggestions
    async getEvolutionSuggestions(): Promise<EvolutionSuggestion[]> {
        const response = await api.get('/evolution/plugins/discover');
        const plugins = Array.isArray(response?.data?.plugins) ? response.data.plugins : [];
        return plugins.map((plugin: any) => ({
            id: String(plugin?.id || `plugin-${Date.now()}`),
            agentId: String(plugin?.id || 'plugin'),
            type: 'plugin',
            description: `Plugin ${plugin?.id || 'unknown'} is available`,
            expectedGain: 0,
            confidence: 0,
        }));
    }

    // Apply evolution suggestion
    async applySuggestion(_suggestionId: string): Promise<void> {
        // No apply endpoint exists yet; keep method for compatibility.
        return;
    }

    // Get self-representation
    async getSelfRepresentation(): Promise<SelfRepresentation> {
        const response = await api.get('/evolution/metrics');
        const metrics = response?.data || {};
        return {
            systemId: 'wiseravenshare-evolution',
            identity: 'module-evolution-service',
            currentState: `agents:${metrics?.activeAgents ?? 0}`,
            capabilities: ['updates', 'metrics', 'history', 'plugins'],
            goals: ['reliability', 'compatibility'],
            constraints: ['no-apply-endpoint'],
            introspection: metrics,
        };
    }

    // Event handlers
    private handleAgentEvolved = (data: any) => {
        // Broadcast to all listeners
        window.dispatchEvent(new CustomEvent('agent-evolved', { detail: data }));
    };

    private handleSystemMetrics = (data: any) => {
        window.dispatchEvent(new CustomEvent('system-metrics', { detail: data }));
    };

    private handleEvolutionSuggestion = (data: any) => {
        window.dispatchEvent(new CustomEvent('evolution-suggestion', { detail: data }));
    };

    // Subscribe to events
    onAgentEvolved(callback: (data: any) => void): void {
        window.addEventListener('agent-evolved', (e: CustomEvent) => callback(e.detail));
    }

    onSystemMetrics(callback: (data: any) => void): void {
        window.addEventListener('system-metrics', (e: CustomEvent) => callback(e.detail));
    }

    onEvolutionSuggestion(callback: (data: any) => void): void {
        window.addEventListener('evolution-suggestion', (e: CustomEvent) => callback(e.detail));
    }
}

export const evolutionService = new EvolutionService();

export interface Agent {
    id: string;
    name: string;
    type: string;
    description: string;
    performanceScore: number;
    status: 'active' | 'idle' | 'evolving';
    posts: number;
    interactions: number;
    lastActive: string;
}

export interface Evolution {
    id: string;
    agentId: string;
    agentName: string;
    type: string;
    description: string;
    fitnessBefore: number;
    fitnessAfter: number;
    timestamp: string;
}

export interface SystemMetrics {
    totalAgents: number;
    activeAgents: number;
    avgFitness: number;
    totalEvolutions: number;
    uptime: string;
}

export interface EvolutionSuggestion {
    id: string;
    agentId: string;
    type: string;
    description: string;
    expectedGain: number;
    confidence: number;
}

export interface SelfRepresentation {
    systemId: string;
    identity: string;
    currentState: string;
    capabilities: string[];
    goals: string[];
    constraints: string[];
    introspection: any;
    timestamp: string;
    agentCount: number;
    totalEvolutions: number;
    averageFitness: number;
    capabilities: any;
}