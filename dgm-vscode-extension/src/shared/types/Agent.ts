// Forward declaration to avoid circular dependency
export interface Mutation {
    id: string;
    type: string;
    target: unknown;
    changes: unknown[];
}

export interface IAgent {
    id: string;
    type: AgentType;
    version: string;
    capabilities: AgentCapability[];
    state: AgentState;
    metadata: AgentMetadata;
    execute(task: Task): Promise<TaskResult>;
    evolve(mutation: Mutation): Promise<IAgent>;
    validate(): Promise<ValidationResult>;
    serialize(): AgentSnapshot;
}

export enum AgentType {
    Requirements = 'requirements',
    Architecture = 'architecture',
    CodeGeneration = 'code-generation',
    Testing = 'testing',
    Deployment = 'deployment'
}

export interface AgentCapability {
    name: string;
    description: string;
    parameters: ParameterDefinition[];
    requiredPermissions: Permission[];
    version: string;
}

export interface ParameterDefinition {
    name: string;
    type: ParameterType;
    required: boolean;
    default?: unknown;
    description: string;
    validation?: ValidationRule;
}

export enum ParameterType {
    String = 'string',
    Number = 'number',
    Boolean = 'boolean',
    Object = 'object',
    Array = 'array',
    Function = 'function'
}

export interface ValidationRule {
    pattern?: string;
    min?: number;
    max?: number;
    enum?: unknown[];
    custom?: (value: unknown) => boolean;
}

export enum Permission {
    FileSystemRead = 'filesystem.read',
    FileSystemWrite = 'filesystem.write',
    NetworkAccess = 'network.access',
    ProcessExecution = 'process.execution',
    WorkspaceModification = 'workspace.modification',
    ExtensionConfiguration = 'extension.configuration'
}

export interface AgentState {
    isActive: boolean;
    isEvolving: boolean;
    lastExecutionTime?: number;
    executionCount: number;
    errorCount: number;
    fitness: FitnessScore;
}

export interface AgentMetadata {
    createdAt: number;
    updatedAt: number;
    parentId?: string;
    generation: number;
    mutationHistory: string[];
    tags: string[];
}

export interface Task {
    id: string;
    type: TaskType;
    priority: TaskPriority;
    context: TaskContext;
    requirements: TaskRequirement[];
    timeout?: number;
}

export enum TaskType {
    AnalyzeRequirements = 'analyze-requirements',
    DesignArchitecture = 'design-architecture',
    GenerateCode = 'generate-code',
    WriteTests = 'write-tests',
    Deploy = 'deploy',
    Refactor = 'refactor',
    FixBug = 'fix-bug',
    OptimizePerformance = 'optimize-performance'
}

export enum TaskPriority {
    Critical = 'critical',
    High = 'high',
    Medium = 'medium',
    Low = 'low'
}

export interface TaskContext {
    workspaceFolder: string;
    currentFile?: string;
    selection?: TextSelection;
    language?: string;
    projectType?: string;
    additionalContext?: Record<string, unknown>;
}

export interface TextSelection {
    start: Position;
    end: Position;
    text: string;
}

export interface Position {
    line: number;
    character: number;
}

export interface TaskRequirement {
    type: RequirementType;
    value: unknown;
    isMandatory: boolean;
}

export enum RequirementType {
    InputFormat = 'input-format',
    OutputFormat = 'output-format',
    PerformanceTarget = 'performance-target',
    SecurityConstraint = 'security-constraint',
    StyleGuide = 'style-guide'
}

export interface TaskResult {
    success: boolean;
    output?: unknown;
    error?: TaskError;
    metrics: TaskMetrics;
    artifacts?: TaskArtifact[];
}

export interface TaskError {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
}

export interface TaskMetrics {
    executionTime: number;
    memoryUsed: number;
    tokensConsumed?: number;
    qualityScore?: number;
}

export interface TaskArtifact {
    type: ArtifactType;
    path: string;
    content?: string;
    metadata?: Record<string, unknown>;
}

export enum ArtifactType {
    SourceCode = 'source-code',
    TestCase = 'test-case',
    Documentation = 'documentation',
    Configuration = 'configuration',
    Diagram = 'diagram'
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    field: string;
    message: string;
    code: string;
}

export interface ValidationWarning {
    field: string;
    message: string;
    severity: WarningSeverity;
}

export enum WarningSeverity {
    Low = 'low',
    Medium = 'medium',
    High = 'high'
}

export interface AgentSnapshot {
    id: string;
    type: AgentType;
    version: string;
    code: string;
    configuration: AgentConfiguration;
    dependencies: string[];
    hash: string;
    timestamp: number;
}

export interface AgentConfiguration {
    capabilities: AgentCapability[];
    parameters: Record<string, unknown>;
    permissions: Permission[];
    resourceLimits: ResourceLimits;
}

export interface ResourceLimits {
    maxMemoryMB: number;
    maxCPUPercent: number;
    maxExecutionTimeMs: number;
    maxNetworkRequests: number;
}

export interface FitnessScore {
    overall: number;
    components: {
        codeQuality: number;
        performance: number;
        reliability: number;
        userSatisfaction: number;
        resourceEfficiency: number;
    };
    timestamp: number;
}

// Type guards
export function isAgent(obj: unknown): obj is IAgent {
    return typeof obj === 'object' && 
           obj !== null && 
           'id' in obj && 
           'type' in obj && 
           'execute' in obj &&
           'evolve' in obj;
}

export function isTaskResult(obj: unknown): obj is TaskResult {
    return typeof obj === 'object' && 
           obj !== null && 
           'success' in obj && 
           'metrics' in obj;
}

