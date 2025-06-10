import { 
    PopulationAgent, 
    IAgent, 
    SelectionStrategy as SelectionStrategyType
} from '@shared/types';
import { ConfigurationManager } from '@api/vscode/ConfigurationManager';

export class SelectionStrategy {
    constructor(private readonly configManager: ConfigurationManager) {}

    select(agents: PopulationAgent[], count: number): IAgent[] {
        const config = this.configManager.getConfiguration().evolution;
        
        switch (config.selectionStrategy) {
            case SelectionStrategyType.Tournament:
                return this.tournamentSelection(agents, count);
            case SelectionStrategyType.RouletteWheel:
                return this.rouletteWheelSelection(agents, count);
            case SelectionStrategyType.Rank:
                return this.rankSelection(agents, count);
            default:
                return this.tournamentSelection(agents, count);
        }
    }

    private tournamentSelection(agents: PopulationAgent[], count: number): IAgent[] {
        const selected: IAgent[] = [];
        const tournamentSize = Math.max(2, Math.floor(agents.length * 0.1));

        for (let i = 0; i < count; i++) {
            const tournament = this.selectRandomAgents(agents, tournamentSize);
            const winner = tournament.reduce((best, current) => 
                current.fitness.overall > best.fitness.overall ? current : best
            );
            selected.push(winner.agent);
        }

        return selected;
    }

    private rouletteWheelSelection(agents: PopulationAgent[], count: number): IAgent[] {
        const selected: IAgent[] = [];
        const totalFitness = agents.reduce((sum, agent) => sum + agent.fitness.overall, 0);

        for (let i = 0; i < count; i++) {
            let randomValue = Math.random() * totalFitness;
            
            for (const agent of agents) {
                randomValue -= agent.fitness.overall;
                if (randomValue <= 0) {
                    selected.push(agent.agent);
                    break;
                }
            }
        }

        return selected;
    }

    private rankSelection(agents: PopulationAgent[], count: number): IAgent[] {
        const sortedAgents = [...agents].sort((a, b) => b.fitness.overall - a.fitness.overall);
        return sortedAgents.slice(0, count).map(a => a.agent);
    }

    private selectRandomAgents(agents: PopulationAgent[], count: number): PopulationAgent[] {
        const shuffled = [...agents].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }
}