// src/services/evolution.ts
import { api } from './api';
import { SignalRService } from './signalR';

class EvolutionService {
    private signalR: SignalRService;

    constructor() {
        this.signalR = SignalRService.getInstance();
        this.initializeSignalR();
    }

    private initializeSignalR() {
        this.signalR.connect('/hubs/evolution');
        this.signalR.on('AgentEvolved', this.handleAgentEvolved);
        this.signalR.on('SystemMetrics', this.handleSystemMetrics);
        this.signalR.on('EvolutionSuggestion', this.handleEvolutionSuggestion);
    }

    // Get all agents
    async getAgents(): Promise<Agent[]> {
        const response = await api.get('/evolution/agents');
        return response.data;
    }

    // Get agent by ID
    async getAgent(id: string): Promise<Agent> {
        const response = await api.get(`/evolution/agents/${id}`);
        return response.data;
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
        const response = await api.post(`/evolution/agents/${agentId}/evolve`);
        return response.data;
    }

    // Get evolution suggestions
    async getEvolutionSuggestions(): Promise<EvolutionSuggestion[]> {
        const response = await api.get('/evolution/suggestions');
        return response.data;
    }

    // Apply evolution suggestion
    async applySuggestion(suggestionId: string): Promise<void> {
        await api.post(`/evolution/suggestions/${suggestionId}/apply`);
    }

    // Get self-representation
    async getSelfRepresentation(): Promise<SelfRepresentation> {
        const response = await api.get('/evolution/self-representation');
        return response.data;
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
    timestamp: string;
    agentCount: number;
    totalEvolutions: number;
    averageFitness: number;
    capabilities: any;
}