import { Permission } from './Agent';
import { SelectionStrategy, MutationStrategy } from './Evolution';

export interface ExtensionConfiguration {
    evolution: EvolutionConfiguration;
    security: SecurityConfiguration;
    telemetry: TelemetryConfiguration;
    llm: LLMConfiguration;
    ui: UIConfiguration;
    performance: PerformanceConfiguration;
    experimental: ExperimentalFeatures;
}

export interface EvolutionConfiguration {
    enabled: boolean;
    populationSize: number;
    mutationRate: number;
    crossoverRate: number;
    elitismRate: number;
    selectionStrategy: SelectionStrategy;
    mutationStrategy: MutationStrategy;
    maxGenerations: number;
    fitnessThreshold: number;
    autoEvolve: boolean;
    evolveOnSave: boolean;
    preserveElites: boolean;
}

export interface SecurityConfiguration {
    sandboxEnabled: boolean;
    permissionLevel: PermissionLevel;
    allowedPermissions: Permission[];
    deniedPermissions: Permission[];
    maxExecutionTime: number;
    maxMemoryMB: number;
    validateMutations: boolean;
    auditLogging: boolean;
    encryptSensitiveData: boolean;
}

export enum PermissionLevel {
    Strict = 'strict',
    Moderate = 'moderate',
    Permissive = 'permissive'
}

export interface TelemetryConfiguration {
    enabled: boolean;
    anonymize: boolean;
    sampleRate: number;
    excludeEvents: string[];
    includeStackTraces: boolean;
    endpoint?: string;
    batchSize: number;
    flushInterval: number;
}

export interface LLMConfiguration {
    provider: LLMProvider;
    apiKey?: string;
    model?: string;
    temperature: number;
    maxTokens: number;
    timeout: number;
    retryAttempts: number;
    fallbackProvider?: LLMProvider;
    customEndpoint?: string;
}

export enum LLMProvider {
    OpenAI = 'openai',
    Anthropic = 'anthropic',
    OpenRouter = 'openrouter',
    Custom = 'custom',
    Auto = 'auto'
}

export interface UIConfiguration {
    theme: UITheme;
    showEvolutionIndicator: boolean;
    showMetricsPanel: boolean;
    autoOpenDashboard: boolean;
    compactMode: boolean;
    animations: boolean;
    notificationLevel: NotificationLevel;
}

export enum UITheme {
    Auto = 'auto',
    Light = 'light',
    Dark = 'dark',
    HighContrast = 'high-contrast'
}

export enum NotificationLevel {
    All = 'all',
    Important = 'important',
    Errors = 'errors',
    None = 'none'
}

export interface PerformanceConfiguration {
    maxConcurrentOperations: number;
    cacheSize: number;
    enableCaching: boolean;
    backgroundProcessing: boolean;
    throttleEvolution: boolean;
    memoryLimit: number;
    cpuLimit: number;
}

export interface ExperimentalFeatures {
    enableQuantumEvolution: boolean;
    enableNeuralMutations: boolean;
    enableDistributedEvolution: boolean;
    enableAutoRepair: boolean;
    enablePredictiveEvolution: boolean;
}

export interface ConfigurationSchema {
    [key: string]: ConfigurationProperty;
}

export interface ConfigurationProperty {
    type: ConfigurationType;
    default: unknown;
    description: string;
    enum?: unknown[];
    minimum?: number;
    maximum?: number;
    pattern?: string;
    items?: ConfigurationProperty;
    properties?: ConfigurationSchema;
    required?: string[];
}

export enum ConfigurationType {
    String = 'string',
    Number = 'number',
    Boolean = 'boolean',
    Array = 'array',
    Object = 'object'
}

export interface ConfigurationValidationResult {
    valid: boolean;
    errors: ConfigurationError[];
    warnings: ConfigurationWarning[];
}

export interface ConfigurationError {
    path: string;
    message: string;
    value: unknown;
    expected: unknown;
}

export interface ConfigurationWarning {
    path: string;
    message: string;
    suggestion?: string;
}

export interface ConfigurationMigration {
    fromVersion: string;
    toVersion: string;
    migrate(config: unknown): unknown;
}

export interface ConfigurationPreset {
    name: string;
    description: string;
    configuration: Partial<ExtensionConfiguration>;
    tags: string[];
}

export const CONFIGURATION_PRESETS: ConfigurationPreset[] = [
    {
        name: 'conservative',
        description: 'Safe and stable evolution with minimal risk',
        configuration: {
            evolution: {
                mutationRate: 0.05,
                populationSize: 30,
                selectionStrategy: SelectionStrategy.Tournament
            },
            security: {
                permissionLevel: PermissionLevel.Strict,
                sandboxEnabled: true
            }
        },
        tags: ['safe', 'stable', 'beginner']
    },
    {
        name: 'balanced',
        description: 'Balanced approach for most use cases',
        configuration: {
            evolution: {
                mutationRate: 0.1,
                populationSize: 50,
                selectionStrategy: SelectionStrategy.RouletteWheel
            },
            security: {
                permissionLevel: PermissionLevel.Moderate,
                sandboxEnabled: true
            }
        },
        tags: ['default', 'recommended']
    },
    {
        name: 'aggressive',
        description: 'Fast evolution with higher risk tolerance',
        configuration: {
            evolution: {
                mutationRate: 0.2,
                populationSize: 100,
                selectionStrategy: SelectionStrategy.Rank
            },
            security: {
                permissionLevel: PermissionLevel.Permissive,
                sandboxEnabled: true
            }
        },
        tags: ['fast', 'experimental', 'advanced']
    }
];

// Helper functions
export function validateConfiguration(
    config: unknown,
    schema: ConfigurationSchema
): ConfigurationValidationResult {
    const errors: ConfigurationError[] = [];
    const warnings: ConfigurationWarning[] = [];

    // Implementation would validate config against schema
    // This is a placeholder
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

export function mergeConfigurations(
    base: ExtensionConfiguration,
    override: Partial<ExtensionConfiguration>
): ExtensionConfiguration {
    return {
        evolution: { ...base.evolution, ...override.evolution },
        security: { ...base.security, ...override.security },
        telemetry: { ...base.telemetry, ...override.telemetry },
        llm: { ...base.llm, ...override.llm },
        ui: { ...base.ui, ...override.ui },
        performance: { ...base.performance, ...override.performance },
        experimental: { ...base.experimental, ...override.experimental }
    };
}

export function getDefaultConfiguration(): ExtensionConfiguration {
    return {
        evolution: {
            enabled: true,
            populationSize: 50,
            mutationRate: 0.1,
            crossoverRate: 0.7,
            elitismRate: 0.1,
            selectionStrategy: SelectionStrategy.Tournament,
            mutationStrategy: MutationStrategy.Adaptive,
            maxGenerations: 1000,
            fitnessThreshold: 0.9,
            autoEvolve: true,
            evolveOnSave: false,
            preserveElites: true
        },
        security: {
            sandboxEnabled: true,
            permissionLevel: PermissionLevel.Moderate,
            allowedPermissions: [
                Permission.FileSystemRead,
                Permission.WorkspaceModification
            ],
            deniedPermissions: [
                Permission.ProcessExecution
            ],
            maxExecutionTime: 30000,
            maxMemoryMB: 512,
            validateMutations: true,
            auditLogging: true,
            encryptSensitiveData: true
        },
        telemetry: {
            enabled: true,
            anonymize: true,
            sampleRate: 0.1,
            excludeEvents: [],
            includeStackTraces: false,
            batchSize: 100,
            flushInterval: 60000
        },
        llm: {
            provider: LLMProvider.Auto,
            temperature: 0.7,
            maxTokens: 4096,
            timeout: 30000,
            retryAttempts: 3
        },
        ui: {
            theme: UITheme.Auto,
            showEvolutionIndicator: true,
            showMetricsPanel: true,
            autoOpenDashboard: false,
            compactMode: false,
            animations: true,
            notificationLevel: NotificationLevel.Important
        },
        performance: {
            maxConcurrentOperations: 4,
            cacheSize: 100,
            enableCaching: true,
            backgroundProcessing: true,
            throttleEvolution: false,
            memoryLimit: 1024,
            cpuLimit: 80
        },
        experimental: {
            enableQuantumEvolution: false,
            enableNeuralMutations: false,
            enableDistributedEvolution: false,
            enableAutoRepair: false,
            enablePredictiveEvolution: false
        }
    };
}