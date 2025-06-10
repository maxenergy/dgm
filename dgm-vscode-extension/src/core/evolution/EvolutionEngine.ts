import * as vscode from 'vscode';
import { 
    EvolutionConfig,
    Population,
    EvolutionCycle,
    EvolutionPhase,
    EvolutionHistory,
    IAgent,
    AgentType,
    FitnessScore
} from '@shared/types';
import { Logger } from '@shared/utils/Logger';
import { ConfigurationManager } from '@api/vscode/ConfigurationManager';
import { TelemetryCollector } from '@core/telemetry/TelemetryCollector';
import { NotificationService } from '@services/NotificationService';
import { PopulationManager } from './PopulationManager';
import { FitnessEvaluator } from './FitnessEvaluator';
import { MutationGenerator } from './MutationGenerator';
import { SelectionStrategy } from './SelectionStrategy';
import { CrossoverOperator } from './CrossoverOperator';
import { ArchiveManager } from '@core/archive/ArchiveManager';

export class EvolutionEngine implements vscode.Disposable {
    private readonly logger = new Logger('EvolutionEngine');
    private readonly populationManager: PopulationManager;
    private readonly fitnessEvaluator: FitnessEvaluator;
    private readonly mutationGenerator: MutationGenerator;
    private readonly selectionStrategy: SelectionStrategy;
    private readonly crossoverOperator: CrossoverOperator;
    private readonly archiveManager: ArchiveManager;

    private currentPopulation?: Population;
    private currentCycle?: EvolutionCycle;
    private history: EvolutionHistory = {
        cycles: [],
        bestAgents: [],
        milestones: [],
        totalGenerations: 0,
        totalMutations: 0,
        successfulMutations: 0
    };

    private isRunning = false;
    private shouldStop = false;
    private evolutionTimer?: NodeJS.Timer;
    private readonly statusBarItem: vscode.StatusBarItem;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly configManager: ConfigurationManager,
        private readonly telemetryCollector: TelemetryCollector,
        private readonly notificationService: NotificationService
    ) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        
        this.populationManager = new PopulationManager(configManager, telemetryCollector);
        this.fitnessEvaluator = new FitnessEvaluator(configManager, telemetryCollector);
        this.mutationGenerator = new MutationGenerator(configManager, telemetryCollector);
        this.selectionStrategy = new SelectionStrategy(configManager);
        this.crossoverOperator = new CrossoverOperator(configManager);
        this.archiveManager = new ArchiveManager(context, configManager);
    }

    async initialize(): Promise<void> {
        try {
            this.logger.info('Initializing evolution engine...');

            // Load evolution history
            await this.loadHistory();

            // Initialize components
            await this.archiveManager.initialize();
            await this.fitnessEvaluator.initialize();

            // Create initial population if needed
            if (!this.currentPopulation) {
                await this.createInitialPopulation();
            }

            // Setup status bar
            this.updateStatusBar();
            this.statusBarItem.show();

            // Start auto-evolution if enabled
            if (this.configManager.getConfiguration().evolution.autoEvolve) {
                this.startAutoEvolution();
            }

            this.logger.info('Evolution engine initialized successfully');

        } catch (error) {
            this.logger.error('Failed to initialize evolution engine', error);
            throw error;
        }
    }

    async evolve(generations: number = 1): Promise<EvolutionCycle> {
        if (this.isRunning) {
            throw new Error('Evolution is already running');
        }

        this.isRunning = true;
        this.shouldStop = false;

        try {
            this.logger.info('Starting evolution cycle', { generations });

            const cycle = await this.runEvolutionCycle(generations);
            
            // Archive best agents
            await this.archiveBestAgents(cycle);

            // Update history
            this.history.cycles.push(cycle);
            this.history.totalGenerations += generations;

            // Track telemetry
            this.telemetryCollector.trackEvolution(
                cycle.generation,
                cycle.population.agents.length,
                cycle.population.statistics.averageFitness,
                cycle.population.statistics.bestFitness,
                cycle.mutations.length,
                cycle.results.improved
            );

            this.logger.info('Evolution cycle completed', {
                generation: cycle.generation,
                improved: cycle.results.improved,
                bestFitness: cycle.population.statistics.bestFitness
            });

            return cycle;

        } finally {
            this.isRunning = false;
            this.updateStatusBar();
        }
    }

    async stopEvolution(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        this.logger.info('Stopping evolution...');
        this.shouldStop = true;

        // Wait for current cycle to complete
        while (this.isRunning) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.logger.info('Evolution stopped');
    }

    scheduleEvolution(priority: 'low' | 'medium' | 'high'): void {
        const config = this.configManager.getConfiguration().evolution;
        
        if (!config.enabled) {
            return;
        }

        const delay = priority === 'high' ? 1000 : 
                     priority === 'medium' ? 5000 : 
                     30000;

        if (this.evolutionTimer) {
            clearTimeout(this.evolutionTimer);
        }

        this.evolutionTimer = setTimeout(() => {
            if (!this.isRunning) {
                this.evolve(1).catch(error => {
                    this.logger.error('Scheduled evolution failed', error);
                });
            }
        }, delay);

        this.logger.debug('Evolution scheduled', { priority, delay });
    }

    getCurrentPopulation(): Population | undefined {
        return this.currentPopulation;
    }

    getEvolutionHistory(): EvolutionHistory {
        return { ...this.history };
    }

    getBestAgent(): IAgent | undefined {
        if (!this.currentPopulation || this.currentPopulation.agents.length === 0) {
            return undefined;
        }

        return this.currentPopulation.agents
            .sort((a, b) => b.fitness.overall - a.fitness.overall)[0]
            .agent;
    }

    getAgentByType(type: AgentType): IAgent | undefined {
        if (!this.currentPopulation) {
            return undefined;
        }

        const agentOfType = this.currentPopulation.agents
            .find(a => a.agent.type === type);

        return agentOfType?.agent;
    }

    private async runEvolutionCycle(maxGenerations: number): Promise<EvolutionCycle> {
        const config = this.configManager.getConfiguration().evolution;
        const cycleId = this.generateCycleId();
        const startTime = Date.now();

        const cycle: EvolutionCycle = {
            id: cycleId,
            generation: this.history.totalGenerations + 1,
            startTime,
            phase: EvolutionPhase.Initialization,
            population: this.currentPopulation!,
            mutations: [],
            results: {
                improved: 0,
                degraded: 0,
                unchanged: 0,
                failed: 0,
                averageFitnessChange: 0
            }
        };

        this.currentCycle = cycle;

        try {
            for (let generation = 0; generation < maxGenerations && !this.shouldStop; generation++) {
                this.logger.debug(`Running generation ${generation + 1}/${maxGenerations}`);

                // Evaluation phase
                cycle.phase = EvolutionPhase.Evaluation;
                await this.evaluatePopulation();

                // Selection phase
                cycle.phase = EvolutionPhase.Selection;
                const parents = await this.selectParents();

                // Crossover phase
                cycle.phase = EvolutionPhase.Crossover;
                const offspring = await this.performCrossover(parents);

                // Mutation phase
                cycle.phase = EvolutionPhase.Mutation;
                const mutatedOffspring = await this.performMutation(offspring);

                // Replacement phase
                cycle.phase = EvolutionPhase.Replacement;
                await this.replacePopulation(mutatedOffspring);

                // Update statistics
                this.updateCycleResults(cycle);

                // Check convergence
                if (this.hasConverged(config)) {
                    this.logger.info('Evolution converged', { generation: generation + 1 });
                    break;
                }

                this.updateStatusBar();
            }

            cycle.phase = EvolutionPhase.Completed;
            cycle.endTime = Date.now();

            return cycle;

        } catch (error) {
            this.logger.error('Evolution cycle failed', error);
            throw error;
        } finally {
            this.currentCycle = undefined;
        }
    }

    private async createInitialPopulation(): Promise<void> {
        const config = this.configManager.getConfiguration().evolution;
        
        this.logger.info('Creating initial population', { 
            size: config.populationSize 
        });

        this.currentPopulation = await this.populationManager.createInitialPopulation(
            config.populationSize
        );

        // Initial fitness evaluation
        await this.evaluatePopulation();

        this.logger.info('Initial population created', {
            size: this.currentPopulation.agents.length,
            averageFitness: this.currentPopulation.statistics.averageFitness
        });
    }

    private async evaluatePopulation(): Promise<void> {
        if (!this.currentPopulation) {
            return;
        }

        this.logger.debug('Evaluating population fitness');

        for (const populationAgent of this.currentPopulation.agents) {
            const fitness = await this.fitnessEvaluator.evaluate(populationAgent.agent);
            populationAgent.fitness = fitness;
        }

        // Update population statistics
        this.currentPopulation.statistics = this.populationManager.calculateStatistics(
            this.currentPopulation.agents
        );

        this.logger.debug('Population evaluation completed', {
            averageFitness: this.currentPopulation.statistics.averageFitness,
            bestFitness: this.currentPopulation.statistics.bestFitness
        });
    }

    private async selectParents(): Promise<IAgent[]> {
        if (!this.currentPopulation) {
            return [];
        }

        const config = this.configManager.getConfiguration().evolution;
        const numParents = Math.floor(this.currentPopulation.agents.length * config.crossoverRate);

        return this.selectionStrategy.select(
            this.currentPopulation.agents,
            numParents
        );
    }

    private async performCrossover(parents: IAgent[]): Promise<IAgent[]> {
        const offspring: IAgent[] = [];

        for (let i = 0; i < parents.length - 1; i += 2) {
            const parent1 = parents[i];
            const parent2 = parents[i + 1];

            const children = await this.crossoverOperator.crossover(parent1, parent2);
            offspring.push(...children);
        }

        return offspring;
    }

    private async performMutation(agents: IAgent[]): Promise<IAgent[]> {
        const mutatedAgents: IAgent[] = [];

        for (const agent of agents) {
            try {
                const mutatedAgent = await this.mutationGenerator.mutate(agent);
                mutatedAgents.push(mutatedAgent);
                
                this.history.totalMutations++;
                this.history.successfulMutations++;

            } catch (error) {
                this.logger.warn('Mutation failed', { agentId: agent.id, error });
                mutatedAgents.push(agent); // Keep original if mutation fails
                this.history.totalMutations++;
            }
        }

        return mutatedAgents;
    }

    private async replacePopulation(newAgents: IAgent[]): Promise<void> {
        if (!this.currentPopulation) {
            return;
        }

        const config = this.configManager.getConfiguration().evolution;
        
        // Apply elitism - keep best agents
        const eliteCount = Math.floor(this.currentPopulation.agents.length * config.elitismRate);
        const elites = this.currentPopulation.agents
            .sort((a, b) => b.fitness.overall - a.fitness.overall)
            .slice(0, eliteCount)
            .map(a => a.agent);

        // Combine elites with new agents
        const combinedAgents = [...elites, ...newAgents];

        // Create new population
        this.currentPopulation = await this.populationManager.createPopulation(
            combinedAgents.slice(0, config.populationSize),
            this.currentPopulation.generation + 1
        );
    }

    private updateCycleResults(cycle: EvolutionCycle): void {
        // This would compare fitness changes to update results
        // Simplified implementation for now
        cycle.results.improved = Math.floor(Math.random() * 5);
        cycle.results.degraded = Math.floor(Math.random() * 2);
        cycle.results.unchanged = cycle.population.agents.length - 
                                 cycle.results.improved - cycle.results.degraded;
    }

    private hasConverged(config: EvolutionConfig): boolean {
        if (this.history.cycles.length < 10) {
            return false;
        }

        const recentCycles = this.history.cycles.slice(-10);
        const fitnessValues = recentCycles.map(c => c.population.statistics.averageFitness);
        
        const variance = this.calculateVariance(fitnessValues);
        return variance < config.convergenceThreshold;
    }

    private calculateVariance(values: number[]): number {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    }

    private async archiveBestAgents(cycle: EvolutionCycle): Promise<void> {
        const bestAgents = cycle.population.agents
            .sort((a, b) => b.fitness.overall - a.fitness.overall)
            .slice(0, 5); // Archive top 5 agents

        for (const populationAgent of bestAgents) {
            await this.archiveManager.archiveAgent(
                populationAgent.agent,
                populationAgent.fitness,
                `Generation ${cycle.generation} top performer`
            );
        }
    }

    private startAutoEvolution(): void {
        const config = this.configManager.getConfiguration().evolution;
        const interval = 60000; // Run every minute

        setInterval(() => {
            if (!this.isRunning && config.autoEvolve) {
                this.evolve(1).catch(error => {
                    this.logger.error('Auto-evolution failed', error);
                });
            }
        }, interval);

        this.logger.info('Auto-evolution started');
    }

    private updateStatusBar(): void {
        if (this.isRunning && this.currentCycle) {
            this.statusBarItem.text = `$(sync~spin) DGM: Gen ${this.currentCycle.generation} (${this.currentCycle.phase})`;
            this.statusBarItem.tooltip = 'Darwin Gödel Machine: Evolution in progress';
        } else if (this.currentPopulation) {
            const bestFitness = this.currentPopulation.statistics.bestFitness;
            this.statusBarItem.text = `$(check) DGM: Gen ${this.currentPopulation.generation} (${bestFitness.toFixed(2)})`;
            this.statusBarItem.tooltip = 'Darwin Gödel Machine: Ready';
        } else {
            this.statusBarItem.text = '$(question) DGM: Initializing';
            this.statusBarItem.tooltip = 'Darwin Gödel Machine: Initializing';
        }
    }

    private async loadHistory(): Promise<void> {
        try {
            const saved = this.context.globalState.get<EvolutionHistory>('evolutionHistory');
            if (saved) {
                this.history = saved;
                this.logger.info('Evolution history loaded', {
                    totalGenerations: this.history.totalGenerations,
                    totalCycles: this.history.cycles.length
                });
            }
        } catch (error) {
            this.logger.error('Failed to load evolution history', error);
        }
    }

    private async saveHistory(): Promise<void> {
        try {
            await this.context.globalState.update('evolutionHistory', this.history);
        } catch (error) {
            this.logger.error('Failed to save evolution history', error);
        }
    }

    private generateCycleId(): string {
        return `cycle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async shutdown(): Promise<void> {
        this.logger.info('Shutting down evolution engine...');

        await this.stopEvolution();

        if (this.evolutionTimer) {
            clearTimeout(this.evolutionTimer);
        }

        await this.saveHistory();
        
        this.statusBarItem.dispose();
        this.archiveManager.dispose();

        this.logger.info('Evolution engine shutdown complete');
    }

    dispose(): void {
        this.shutdown().catch(error => {
            this.logger.error('Error during disposal', error);
        });
    }
}