import { 
    IAgent, 
    FitnessScore, 
    Task, 
    TaskResult,
    TaskType,
    TaskPriority
} from '@shared/types';
import { Logger } from '@shared/utils/Logger';
import { ConfigurationManager } from '@api/vscode/ConfigurationManager';
import { TelemetryCollector } from '@core/telemetry/TelemetryCollector';
import { PerformanceMonitor } from '@core/telemetry/PerformanceMonitor';

export interface FitnessWeights {
    codeQuality: number;
    performance: number;
    reliability: number;
    userSatisfaction: number;
    resourceEfficiency: number;
}

export interface BenchmarkSuite {
    name: string;
    tasks: Task[];
    weight: number;
}

export class FitnessEvaluator {
    private readonly logger = new Logger('FitnessEvaluator');
    private readonly performanceMonitor: PerformanceMonitor;
    private readonly benchmarkSuites: BenchmarkSuite[] = [];
    private readonly weights: FitnessWeights = {
        codeQuality: 0.25,
        performance: 0.20,
        reliability: 0.25,
        userSatisfaction: 0.15,
        resourceEfficiency: 0.15
    };

    constructor(
        private readonly configManager: ConfigurationManager,
        private readonly telemetryCollector: TelemetryCollector
    ) {
        this.performanceMonitor = new PerformanceMonitor(telemetryCollector);
    }

    async initialize(): Promise<void> {
        this.logger.info('Initializing fitness evaluator...');
        
        // Initialize benchmark suites
        this.initializeBenchmarkSuites();
        
        // Start performance monitoring
        this.performanceMonitor.startSystemMonitoring();
        
        this.logger.info('Fitness evaluator initialized');
    }

    async evaluate(agent: IAgent): Promise<FitnessScore> {
        const traceId = this.performanceMonitor.startTrace(`fitness_evaluation_${agent.type}`);
        
        try {
            this.logger.debug('Evaluating agent fitness', { 
                agentId: agent.id, 
                agentType: agent.type 
            });

            const components = await this.evaluateComponents(agent);
            const overall = this.calculateOverallFitness(components);

            const fitness: FitnessScore = {
                overall,
                components,
                timestamp: Date.now()
            };

            this.telemetryCollector.trackMetric(
                `fitness.${agent.type}.overall`,
                overall
            );

            this.performanceMonitor.endTrace(traceId);
            
            return fitness;

        } catch (error) {
            this.logger.error('Fitness evaluation failed', { agentId: agent.id, error });
            this.performanceMonitor.endTrace(traceId, 'failed');
            
            // Return minimal fitness on error
            return this.createMinimalFitness();
        }
    }

    async evaluateBatch(agents: IAgent[]): Promise<Map<string, FitnessScore>> {
        const results = new Map<string, FitnessScore>();
        const batchId = this.performanceMonitor.startTrace('batch_fitness_evaluation');

        try {
            // Evaluate agents in parallel batches to avoid overwhelming the system
            const batchSize = 5;
            for (let i = 0; i < agents.length; i += batchSize) {
                const batch = agents.slice(i, i + batchSize);
                const batchPromises = batch.map(agent => 
                    this.evaluate(agent).then(fitness => ({ agent, fitness }))
                );

                const batchResults = await Promise.all(batchPromises);
                batchResults.forEach(({ agent, fitness }) => {
                    results.set(agent.id, fitness);
                });

                // Small delay between batches to prevent system overload
                if (i + batchSize < agents.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            this.performanceMonitor.endTrace(batchId);
            return results;

        } catch (error) {
            this.logger.error('Batch fitness evaluation failed', error);
            this.performanceMonitor.endTrace(batchId, 'failed');
            throw error;
        }
    }

    async benchmarkAgent(agent: IAgent, suiteName?: string): Promise<{ 
        score: number; 
        details: Record<string, number> 
    }> {
        const suites = suiteName ? 
            this.benchmarkSuites.filter(s => s.name === suiteName) :
            this.benchmarkSuites;

        if (suites.length === 0) {
            throw new Error(`Benchmark suite not found: ${suiteName}`);
        }

        const results: Record<string, number> = {};
        let totalScore = 0;
        let totalWeight = 0;

        for (const suite of suites) {
            const suiteScore = await this.runBenchmarkSuite(agent, suite);
            results[suite.name] = suiteScore;
            totalScore += suiteScore * suite.weight;
            totalWeight += suite.weight;
        }

        return {
            score: totalWeight > 0 ? totalScore / totalWeight : 0,
            details: results
        };
    }

    setFitnessWeights(weights: Partial<FitnessWeights>): void {
        Object.assign(this.weights, weights);
        this.logger.info('Fitness weights updated', this.weights);
    }

    addBenchmarkSuite(suite: BenchmarkSuite): void {
        this.benchmarkSuites.push(suite);
        this.logger.info('Benchmark suite added', { name: suite.name, tasks: suite.tasks.length });
    }

    private async evaluateComponents(agent: IAgent): Promise<FitnessScore['components']> {
        const [
            codeQuality,
            performance,
            reliability,
            userSatisfaction,
            resourceEfficiency
        ] = await Promise.all([
            this.evaluateCodeQuality(agent),
            this.evaluatePerformance(agent),
            this.evaluateReliability(agent),
            this.evaluateUserSatisfaction(agent),
            this.evaluateResourceEfficiency(agent)
        ]);

        return {
            codeQuality,
            performance,
            reliability,
            userSatisfaction,
            resourceEfficiency
        };
    }

    private async evaluateCodeQuality(agent: IAgent): Promise<number> {
        // Run code quality benchmarks
        const qualityTasks = this.createCodeQualityTasks();
        let totalScore = 0;
        let completedTasks = 0;

        for (const task of qualityTasks) {
            try {
                const result = await agent.execute(task);
                if (result.success) {
                    // Evaluate code quality metrics
                    const score = this.scoreCodeQuality(result);
                    totalScore += score;
                }
                completedTasks++;
            } catch (error) {
                this.logger.debug('Code quality task failed', { agentId: agent.id, error });
                completedTasks++;
            }
        }

        return completedTasks > 0 ? totalScore / completedTasks : 0;
    }

    private async evaluatePerformance(agent: IAgent): Promise<number> {
        const performanceTasks = this.createPerformanceTasks();
        let totalScore = 0;
        let completedTasks = 0;

        for (const task of performanceTasks) {
            const taskTraceId = this.performanceMonitor.startTrace(`task_${task.type}`);
            
            try {
                const result = await agent.execute(task);
                const executionTime = this.performanceMonitor.endTrace(taskTraceId);
                
                if (result.success) {
                    // Score based on execution time and efficiency
                    const score = this.scorePerformance(result, executionTime);
                    totalScore += score;
                }
                completedTasks++;
            } catch (error) {
                this.performanceMonitor.endTrace(taskTraceId, 'failed');
                completedTasks++;
            }
        }

        return completedTasks > 0 ? totalScore / completedTasks : 0;
    }

    private async evaluateReliability(agent: IAgent): Promise<number> {
        const reliabilityTasks = this.createReliabilityTasks();
        let successCount = 0;
        let totalTasks = reliabilityTasks.length;

        for (const task of reliabilityTasks) {
            try {
                const result = await agent.execute(task);
                if (result.success) {
                    successCount++;
                }
            } catch (error) {
                // Task failure counts against reliability
            }
        }

        return totalTasks > 0 ? successCount / totalTasks : 0;
    }

    private async evaluateUserSatisfaction(agent: IAgent): Promise<number> {
        // This would integrate with user feedback data
        // For now, use a heuristic based on agent state
        const baseScore = 0.7;
        const fitnessHistory = agent.state.fitness;
        
        if (fitnessHistory) {
            // Agents that consistently perform well get higher user satisfaction scores
            return Math.min(1.0, baseScore + (fitnessHistory.overall - 0.5) * 0.4);
        }

        return baseScore;
    }

    private async evaluateResourceEfficiency(agent: IAgent): Promise<number> {
        // Evaluate based on resource usage patterns
        const metrics = this.performanceMonitor.getSystemMetrics();
        const memoryEfficiency = 1 - (metrics.memory.percentage / 100);
        const cpuEfficiency = 1 - (metrics.cpu.usage / 100);
        
        return (memoryEfficiency + cpuEfficiency) / 2;
    }

    private calculateOverallFitness(components: FitnessScore['components']): number {
        const { weights } = this;
        
        return (
            components.codeQuality * weights.codeQuality +
            components.performance * weights.performance +
            components.reliability * weights.reliability +
            components.userSatisfaction * weights.userSatisfaction +
            components.resourceEfficiency * weights.resourceEfficiency
        );
    }

    private createCodeQualityTasks(): Task[] {
        return [
            {
                id: 'code-quality-1',
                type: TaskType.GenerateCode,
                priority: TaskPriority.Medium,
                context: {
                    workspaceFolder: '/tmp/test',
                    language: 'typescript'
                },
                requirements: [
                    {
                        type: 'style-guide',
                        value: 'typescript-eslint',
                        isMandatory: true
                    }
                ]
            },
            {
                id: 'code-quality-2',
                type: TaskType.Refactor,
                priority: TaskPriority.Medium,
                context: {
                    workspaceFolder: '/tmp/test',
                    language: 'typescript'
                },
                requirements: []
            }
        ];
    }

    private createPerformanceTasks(): Task[] {
        return [
            {
                id: 'performance-1',
                type: TaskType.OptimizePerformance,
                priority: TaskPriority.High,
                context: {
                    workspaceFolder: '/tmp/test'
                },
                requirements: [
                    {
                        type: 'performance-target',
                        value: 100, // ms
                        isMandatory: true
                    }
                ],
                timeout: 5000
            }
        ];
    }

    private createReliabilityTasks(): Task[] {
        return [
            {
                id: 'reliability-1',
                type: TaskType.WriteTests,
                priority: TaskPriority.Medium,
                context: {
                    workspaceFolder: '/tmp/test'
                },
                requirements: []
            },
            {
                id: 'reliability-2',
                type: TaskType.FixBug,
                priority: TaskPriority.High,
                context: {
                    workspaceFolder: '/tmp/test'
                },
                requirements: []
            }
        ];
    }

    private scoreCodeQuality(result: TaskResult): number {
        // Analyze the result for code quality indicators
        if (result.metrics?.qualityScore) {
            return result.metrics.qualityScore;
        }

        // Fallback scoring based on basic metrics
        let score = 0.5;
        
        if (result.metrics?.executionTime && result.metrics.executionTime < 1000) {
            score += 0.2;
        }
        
        if (result.error === undefined) {
            score += 0.3;
        }

        return Math.min(1.0, score);
    }

    private scorePerformance(result: TaskResult, executionTime: number): number {
        const baseScore = result.success ? 0.7 : 0.3;
        
        // Penalize slow execution
        const timeScore = Math.max(0, 1 - (executionTime / 5000)); // 5 second baseline
        
        return (baseScore + timeScore) / 2;
    }

    private async runBenchmarkSuite(agent: IAgent, suite: BenchmarkSuite): Promise<number> {
        let totalScore = 0;
        let completedTasks = 0;

        for (const task of suite.tasks) {
            try {
                const result = await agent.execute(task);
                if (result.success) {
                    totalScore += this.scoreTaskResult(result);
                }
                completedTasks++;
            } catch (error) {
                this.logger.debug('Benchmark task failed', { 
                    suiteName: suite.name, 
                    taskId: task.id, 
                    error 
                });
                completedTasks++;
            }
        }

        return completedTasks > 0 ? totalScore / completedTasks : 0;
    }

    private scoreTaskResult(result: TaskResult): number {
        if (!result.success) {
            return 0;
        }

        let score = 0.7; // Base score for success

        // Bonus for good performance
        if (result.metrics?.executionTime && result.metrics.executionTime < 1000) {
            score += 0.2;
        }

        // Bonus for low resource usage
        if (result.metrics?.memoryUsed && result.metrics.memoryUsed < 100 * 1024 * 1024) {
            score += 0.1;
        }

        return Math.min(1.0, score);
    }

    private createMinimalFitness(): FitnessScore {
        return {
            overall: 0.1,
            components: {
                codeQuality: 0.1,
                performance: 0.1,
                reliability: 0.1,
                userSatisfaction: 0.1,
                resourceEfficiency: 0.1
            },
            timestamp: Date.now()
        };
    }

    private initializeBenchmarkSuites(): void {
        // Add standard benchmark suites
        this.addBenchmarkSuite({
            name: 'code-generation',
            tasks: [
                ...this.createCodeQualityTasks(),
                {
                    id: 'generate-function',
                    type: TaskType.GenerateCode,
                    priority: TaskPriority.Medium,
                    context: {
                        workspaceFolder: '/tmp/benchmark',
                        language: 'typescript'
                    },
                    requirements: []
                }
            ],
            weight: 1.0
        });

        this.addBenchmarkSuite({
            name: 'performance',
            tasks: this.createPerformanceTasks(),
            weight: 0.8
        });

        this.addBenchmarkSuite({
            name: 'reliability',
            tasks: this.createReliabilityTasks(),
            weight: 0.9
        });
    }

    dispose(): void {
        this.performanceMonitor.dispose();
    }
}