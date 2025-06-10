import { IAgent, AgentType, FitnessScore } from './Agent';

export interface EvolutionConfig {
    populationSize: number;
    mutationRate: number;
    crossoverRate: number;
    elitismRate: number;
    selectionStrategy: SelectionStrategy;
    mutationStrategy: MutationStrategy;
    fitnessThreshold: number;
    maxGenerations: number;
    convergenceThreshold: number;
    diversityThreshold: number;
    adaptiveParameters: boolean;
}

export enum SelectionStrategy {
    Tournament = 'tournament',
    RouletteWheel = 'roulette-wheel',
    Rank = 'rank',
    TruncationSelection = 'truncation',
    StochasticUniversalSampling = 'stochastic-universal-sampling'
}

export enum MutationStrategy {
    Random = 'random',
    Adaptive = 'adaptive',
    Guided = 'guided',
    Semantic = 'semantic',
    Hybrid = 'hybrid'
}

export interface Population {
    id: string;
    generation: number;
    agents: PopulationAgent[];
    statistics: PopulationStatistics;
    timestamp: number;
}

export interface PopulationAgent {
    agent: IAgent;
    fitness: FitnessScore;
    age: number;
    isElite: boolean;
}

export interface PopulationStatistics {
    size: number;
    averageFitness: number;
    bestFitness: number;
    worstFitness: number;
    diversity: number;
    convergence: number;
    mutationSuccessRate: number;
}

export interface Mutation {
    id: string;
    type: MutationType;
    target: MutationTarget;
    changes: CodeChange[];
    expectedImpact: MutationImpact;
    constraints: MutationConstraint[];
    metadata: MutationMetadata;
}

export enum MutationType {
    ParameterTuning = 'parameter-tuning',
    MethodModification = 'method-modification',
    StructuralChange = 'structural-change',
    BehaviorAlteration = 'behavior-alteration',
    CapabilityAddition = 'capability-addition',
    OptimizationRefactor = 'optimization-refactor'
}

export interface MutationTarget {
    agentId: string;
    agentType: AgentType;
    componentPath: string;
    targetType: TargetType;
}

export enum TargetType {
    Method = 'method',
    Class = 'class',
    Module = 'module',
    Configuration = 'configuration',
    Algorithm = 'algorithm'
}

export interface CodeChange {
    type: ChangeType;
    location: CodeLocation;
    oldValue: string;
    newValue: string;
    description: string;
}

export enum ChangeType {
    Addition = 'addition',
    Deletion = 'deletion',
    Modification = 'modification',
    Refactoring = 'refactoring',
    Optimization = 'optimization'
}

export interface CodeLocation {
    file: string;
    startLine: number;
    endLine: number;
    startColumn?: number;
    endColumn?: number;
}

export interface MutationImpact {
    expectedFitnessChange: number;
    riskLevel: RiskLevel;
    affectedCapabilities: string[];
    performanceImpact: PerformanceImpact;
}

export enum RiskLevel {
    Low = 'low',
    Medium = 'medium',
    High = 'high',
    Critical = 'critical'
}

export interface PerformanceImpact {
    cpuChange: number;
    memoryChange: number;
    executionTimeChange: number;
}

export interface MutationConstraint {
    type: ConstraintType;
    value: unknown;
    description: string;
}

export enum ConstraintType {
    PreserveInterface = 'preserve-interface',
    MaintainBackwardCompatibility = 'maintain-backward-compatibility',
    RespectResourceLimits = 'respect-resource-limits',
    FollowCodingStandards = 'follow-coding-standards',
    EnsureSecurity = 'ensure-security'
}

export interface MutationMetadata {
    createdAt: number;
    createdBy: string;
    reason: string;
    parentMutationId?: string;
    tags: string[];
}

export interface EvolutionCycle {
    id: string;
    generation: number;
    startTime: number;
    endTime?: number;
    phase: EvolutionPhase;
    population: Population;
    mutations: AppliedMutation[];
    results: CycleResults;
}

export enum EvolutionPhase {
    Initialization = 'initialization',
    Evaluation = 'evaluation',
    Selection = 'selection',
    Crossover = 'crossover',
    Mutation = 'mutation',
    Replacement = 'replacement',
    Completed = 'completed'
}

export interface AppliedMutation {
    mutation: Mutation;
    targetAgent: string;
    resultingAgent?: string;
    success: boolean;
    fitnessChange?: number;
    error?: string;
}

export interface CycleResults {
    improved: number;
    degraded: number;
    unchanged: number;
    failed: number;
    newBestFitness?: number;
    averageFitnessChange: number;
}

export interface EvolutionHistory {
    cycles: EvolutionCycle[];
    bestAgents: HistoricalBest[];
    milestones: EvolutionMilestone[];
    totalGenerations: number;
    totalMutations: number;
    successfulMutations: number;
}

export interface HistoricalBest {
    agentId: string;
    fitness: FitnessScore;
    generation: number;
    timestamp: number;
}

export interface EvolutionMilestone {
    type: MilestoneType;
    generation: number;
    description: string;
    value: unknown;
    timestamp: number;
}

export enum MilestoneType {
    FitnessThresholdReached = 'fitness-threshold-reached',
    NewCapabilityDiscovered = 'new-capability-discovered',
    PerformanceBreakthrough = 'performance-breakthrough',
    StabilityAchieved = 'stability-achieved',
    DiversityPeak = 'diversity-peak'
}

export interface CrossoverOperation {
    type: CrossoverType;
    parent1: string;
    parent2: string;
    offspring: string[];
    crossoverPoints?: number[];
}

export enum CrossoverType {
    SinglePoint = 'single-point',
    TwoPoint = 'two-point',
    Uniform = 'uniform',
    Arithmetic = 'arithmetic',
    Semantic = 'semantic'
}

export interface FitnessMetrics {
    codeQuality: number;
    performance: number;
    userSatisfaction: number;
    testCoverage: number;
    errorRate: number;
    resourceEfficiency: number;
    maintainability: number;
    security: number;
}

export interface EvolutionParameters {
    temperature: number;  // For simulated annealing
    learningRate: number;  // For adaptive strategies
    explorationRate: number;  // Balance exploration vs exploitation
    convergenceRate: number;  // How fast to converge
    mutationAmplitude: number;  // Size of mutations
}

// Type guards
export function isMutation(obj: unknown): obj is Mutation {
    return typeof obj === 'object' && 
           obj !== null && 
           'id' in obj && 
           'type' in obj && 
           'changes' in obj;
}

export function isEvolutionCycle(obj: unknown): obj is EvolutionCycle {
    return typeof obj === 'object' && 
           obj !== null && 
           'generation' in obj && 
           'phase' in obj && 
           'population' in obj;
}

// Helper functions
export function calculateDiversity(population: Population): number {
    // Placeholder for actual diversity calculation
    // This would compare genetic similarity between agents
    return population.statistics.diversity;
}

export function isConverged(history: EvolutionHistory, threshold: number): boolean {
    if (history.cycles.length < 10) {
        return false;
    }
    
    const recentCycles = history.cycles.slice(-10);
    const fitnessValues = recentCycles.map(c => c.results.averageFitnessChange);
    const avgChange = fitnessValues.reduce((a, b) => a + b, 0) / fitnessValues.length;
    
    return Math.abs(avgChange) < threshold;
}