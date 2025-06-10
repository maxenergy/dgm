import { 
    IAgent, 
    AgentType, 
    AgentCapability, 
    AgentState, 
    AgentMetadata,
    Task,
    TaskResult,
    ValidationResult,
    AgentSnapshot,
    Mutation,
    FitnessScore
} from '@shared/types';
import { Logger } from '@shared/utils/Logger';

export class BaseAgent implements IAgent {
    private readonly logger: Logger;
    
    public readonly capabilities: AgentCapability[] = [];
    public readonly state: AgentState;
    public readonly metadata: AgentMetadata;

    constructor(
        public readonly id: string,
        public readonly type: AgentType,
        public readonly version: string
    ) {
        this.logger = new Logger(`Agent[${type}]`);
        
        this.state = {
            isActive: true,
            isEvolving: false,
            executionCount: 0,
            errorCount: 0,
            fitness: this.createInitialFitness()
        };

        this.metadata = {
            createdAt: Date.now(),
            updatedAt: Date.now(),
            generation: 0,
            mutationHistory: [],
            tags: [type]
        };
    }

    async execute(task: Task): Promise<TaskResult> {
        this.logger.debug('Executing task', { taskId: task.id, taskType: task.type });
        
        const startTime = Date.now();
        this.state.executionCount++;

        try {
            // Basic task execution - to be overridden by specific agent types
            const result = await this.performTask(task);
            
            const metrics = {
                executionTime: Date.now() - startTime,
                memoryUsed: process.memoryUsage().heapUsed,
                qualityScore: 0.7
            };

            this.logger.debug('Task completed successfully', { 
                taskId: task.id, 
                executionTime: metrics.executionTime 
            });

            return {
                success: true,
                output: result,
                metrics
            };

        } catch (error) {
            this.state.errorCount++;
            this.logger.error('Task execution failed', { taskId: task.id, error });

            return {
                success: false,
                error: {
                    code: 'EXECUTION_FAILED',
                    message: error instanceof Error ? error.message : 'Unknown error',
                    details: error
                },
                metrics: {
                    executionTime: Date.now() - startTime,
                    memoryUsed: process.memoryUsage().heapUsed
                }
            };
        }
    }

    async evolve(mutation: Mutation): Promise<IAgent> {
        this.logger.info('Applying evolution mutation', { 
            mutationId: mutation.id, 
            mutationType: mutation.type 
        });

        // Create evolved agent - simplified implementation
        const evolvedAgent = new BaseAgent(
            this.generateEvolvedId(),
            this.type,
            this.incrementVersion()
        );

        // Copy and evolve capabilities
        evolvedAgent.capabilities.push(...this.capabilities);
        
        // Update metadata
        evolvedAgent.metadata.parentId = this.id;
        evolvedAgent.metadata.generation = this.metadata.generation + 1;
        evolvedAgent.metadata.mutationHistory = [...this.metadata.mutationHistory, mutation.id];

        return evolvedAgent;
    }

    async validate(): Promise<ValidationResult> {
        const errors = [];
        const warnings = [];

        // Basic validation
        if (!this.id) {
            errors.push({
                field: 'id',
                message: 'Agent ID is required',
                code: 'MISSING_ID'
            });
        }

        if (this.capabilities.length === 0) {
            warnings.push({
                field: 'capabilities',
                message: 'Agent has no capabilities defined',
                severity: 'medium' as const
            });
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    serialize(): AgentSnapshot {
        return {
            id: this.id,
            type: this.type,
            version: this.version,
            code: this.serializeCode(),
            configuration: {
                capabilities: this.capabilities,
                parameters: {},
                permissions: [],
                resourceLimits: {
                    maxMemoryMB: 256,
                    maxCPUPercent: 50,
                    maxExecutionTimeMs: 30000,
                    maxNetworkRequests: 10
                }
            },
            dependencies: [],
            hash: this.calculateHash(),
            timestamp: Date.now()
        };
    }

    protected async performTask(task: Task): Promise<unknown> {
        // Default implementation - to be overridden by specific agent types
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
        return { message: `Task ${task.type} completed by ${this.type} agent` };
    }

    protected createInitialFitness(): FitnessScore {
        return {
            overall: 0.5,
            components: {
                codeQuality: 0.5,
                performance: 0.5,
                reliability: 0.5,
                userSatisfaction: 0.5,
                resourceEfficiency: 0.5
            },
            timestamp: Date.now()
        };
    }

    private serializeCode(): string {
        // Simplified code serialization
        return `// Agent ${this.type} v${this.version}\n// Generated code placeholder`;
    }

    private calculateHash(): string {
        const data = JSON.stringify({
            id: this.id,
            type: this.type,
            version: this.version,
            capabilities: this.capabilities
        });
        
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }

    private generateEvolvedId(): string {
        return `${this.id}_evolved_${Date.now()}`;
    }

    private incrementVersion(): string {
        const parts = this.version.split('.');
        const patch = parseInt(parts[2] || '0') + 1;
        return `${parts[0]}.${parts[1]}.${patch}`;
    }
}