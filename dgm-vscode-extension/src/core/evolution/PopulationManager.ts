import { 
    Population, 
    PopulationAgent, 
    PopulationStatistics, 
    IAgent,
    AgentType,
    FitnessScore,
    EvolutionConfig
} from '@shared/types';
import { Logger } from '@shared/utils/Logger';
import { ConfigurationManager } from '@api/vscode/ConfigurationManager';
import { TelemetryCollector } from '@core/telemetry/TelemetryCollector';
import { BaseAgent } from '@core/agents/BaseAgent';

export class PopulationManager {
    private readonly logger = new Logger('PopulationManager');

    constructor(
        private readonly configManager: ConfigurationManager,
        private readonly telemetryCollector: TelemetryCollector
    ) {}

    async createInitialPopulation(size: number): Promise<Population> {
        this.logger.info('Creating initial population', { size });

        const agents: PopulationAgent[] = [];

        // Create diverse initial population
        const agentTypes = Object.values(AgentType);
        const agentsPerType = Math.floor(size / agentTypes.length);
        const remainder = size % agentTypes.length;

        for (let i = 0; i < agentTypes.length; i++) {
            const agentType = agentTypes[i];
            const count = agentsPerType + (i < remainder ? 1 : 0);

            for (let j = 0; j < count; j++) {
                const agent = await this.createRandomAgent(agentType);
                agents.push({
                    agent,
                    fitness: this.createInitialFitness(),
                    age: 0,
                    isElite: false
                });
            }
        }

        const population: Population = {
            id: this.generatePopulationId(),
            generation: 0,
            agents,
            statistics: this.calculateStatistics(agents),
            timestamp: Date.now()
        };

        this.logger.info('Initial population created', {
            id: population.id,
            size: agents.length,
            agentTypes: agentTypes.length
        });

        return population;
    }

    async createPopulation(agents: IAgent[], generation: number): Promise<Population> {
        const populationAgents: PopulationAgent[] = agents.map((agent, index) => ({
            agent,
            fitness: this.createInitialFitness(),
            age: 0,
            isElite: index < Math.floor(agents.length * 0.1) // Top 10% are elite
        }));

        const population: Population = {
            id: this.generatePopulationId(),
            generation,
            agents: populationAgents,
            statistics: this.calculateStatistics(populationAgents),
            timestamp: Date.now()
        };

        return population;
    }

    calculateStatistics(agents: PopulationAgent[]): PopulationStatistics {
        if (agents.length === 0) {
            return {
                size: 0,
                averageFitness: 0,
                bestFitness: 0,
                worstFitness: 0,
                diversity: 0,
                convergence: 0,
                mutationSuccessRate: 0
            };
        }

        const fitnessValues = agents.map(a => a.fitness.overall);
        const sum = fitnessValues.reduce((a, b) => a + b, 0);
        const averageFitness = sum / fitnessValues.length;
        const bestFitness = Math.max(...fitnessValues);
        const worstFitness = Math.min(...fitnessValues);

        // Calculate diversity (simplified)
        const diversity = this.calculateDiversity(agents);

        // Calculate convergence (how similar the population is)
        const variance = fitnessValues.reduce((acc, val) => acc + Math.pow(val - averageFitness, 2), 0) / fitnessValues.length;
        const convergence = 1 - Math.sqrt(variance) / (bestFitness - worstFitness || 1);

        return {
            size: agents.length,
            averageFitness,
            bestFitness,
            worstFitness,
            diversity,
            convergence: Math.max(0, Math.min(1, convergence)),
            mutationSuccessRate: 0.5 // Will be updated based on actual mutation results
        };
    }

    maintainDiversity(population: Population, threshold: number = 0.1): Population {
        if (population.statistics.diversity > threshold) {
            return population;
        }

        this.logger.info('Diversity below threshold, introducing new agents', {
            currentDiversity: population.statistics.diversity,
            threshold
        });

        // Replace bottom 20% with new random agents
        const sortedAgents = [...population.agents].sort((a, b) => b.fitness.overall - a.fitness.overall);
        const keepCount = Math.floor(sortedAgents.length * 0.8);
        const replaceCount = sortedAgents.length - keepCount;

        const keptAgents = sortedAgents.slice(0, keepCount);
        const newAgents: PopulationAgent[] = [];

        // Create new diverse agents
        const agentTypes = Object.values(AgentType);
        for (let i = 0; i < replaceCount; i++) {
            const agentType = agentTypes[i % agentTypes.length];
            const agent = this.createRandomAgent(agentType);
            newAgents.push({
                agent: await agent,
                fitness: this.createInitialFitness(),
                age: 0,
                isElite: false
            });
        }

        const diversifiedPopulation: Population = {
            ...population,
            agents: [...keptAgents, ...newAgents],
            timestamp: Date.now()
        };

        diversifiedPopulation.statistics = this.calculateStatistics(diversifiedPopulation.agents);

        return diversifiedPopulation;
    }

    removeStagnantAgents(population: Population, maxAge: number = 50): Population {
        const activeAgents = population.agents.filter(agent => 
            agent.age < maxAge || agent.isElite
        );

        if (activeAgents.length === population.agents.length) {
            return population;
        }

        this.logger.info('Removing stagnant agents', {
            removed: population.agents.length - activeAgents.length,
            maxAge
        });

        // Fill gaps with new agents if needed
        const targetSize = population.agents.length;
        const needNew = targetSize - activeAgents.length;

        const newAgents: PopulationAgent[] = [];
        if (needNew > 0) {
            const agentTypes = Object.values(AgentType);
            for (let i = 0; i < needNew; i++) {
                const agentType = agentTypes[i % agentTypes.length];
                const agent = await this.createRandomAgent(agentType);
                newAgents.push({
                    agent,
                    fitness: this.createInitialFitness(),
                    age: 0,
                    isElite: false
                });
            }
        }

        const refreshedPopulation: Population = {
            ...population,
            agents: [...activeAgents, ...newAgents],
            timestamp: Date.now()
        };

        refreshedPopulation.statistics = this.calculateStatistics(refreshedPopulation.agents);

        return refreshedPopulation;
    }

    updateAgentAges(population: Population): Population {
        const updatedAgents = population.agents.map(agent => ({
            ...agent,
            age: agent.age + 1
        }));

        return {
            ...population,
            agents: updatedAgents,
            timestamp: Date.now()
        };
    }

    markElites(population: Population, eliteRatio: number = 0.1): Population {
        const eliteCount = Math.floor(population.agents.length * eliteRatio);
        
        // Sort by fitness and mark top performers as elite
        const sortedAgents = [...population.agents].sort((a, b) => b.fitness.overall - a.fitness.overall);
        
        const updatedAgents = sortedAgents.map((agent, index) => ({
            ...agent,
            isElite: index < eliteCount
        }));

        return {
            ...population,
            agents: updatedAgents,
            timestamp: Date.now()
        };
    }

    private async createRandomAgent(type: AgentType): Promise<IAgent> {
        // Create a basic agent instance
        // This would be replaced with actual agent creation logic
        const agent: IAgent = new BaseAgent(
            this.generateAgentId(),
            type,
            '1.0.0'
        );

        return agent;
    }

    private createInitialFitness(): FitnessScore {
        // Random initial fitness with some bias towards mediocrity
        const overall = 0.3 + Math.random() * 0.4; // 0.3 to 0.7 range

        return {
            overall,
            components: {
                codeQuality: overall + (Math.random() - 0.5) * 0.2,
                performance: overall + (Math.random() - 0.5) * 0.2,
                reliability: overall + (Math.random() - 0.5) * 0.2,
                userSatisfaction: overall + (Math.random() - 0.5) * 0.2,
                resourceEfficiency: overall + (Math.random() - 0.5) * 0.2
            },
            timestamp: Date.now()
        };
    }

    private calculateDiversity(agents: PopulationAgent[]): number {
        if (agents.length < 2) {
            return 1.0;
        }

        // Calculate diversity based on agent type distribution
        const typeCounts = new Map<AgentType, number>();
        agents.forEach(agent => {
            const count = typeCounts.get(agent.agent.type) || 0;
            typeCounts.set(agent.agent.type, count + 1);
        });

        // Shannon diversity index
        const total = agents.length;
        let diversity = 0;

        for (const count of typeCounts.values()) {
            const proportion = count / total;
            if (proportion > 0) {
                diversity -= proportion * Math.log2(proportion);
            }
        }

        // Normalize to 0-1 range
        const maxDiversity = Math.log2(Math.min(agents.length, Object.values(AgentType).length));
        return maxDiversity > 0 ? diversity / maxDiversity : 0;
    }

    private generatePopulationId(): string {
        return `pop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateAgentId(): string {
        return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}