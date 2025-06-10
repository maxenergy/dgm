import { AgentSnapshot, FitnessScore, IAgent } from './Agent';
import { Mutation } from './Evolution';

export interface ArchiveEntry {
    id: string;
    parentId?: string;
    agentSnapshot: AgentSnapshot;
    mutationDelta: CodeDiff;
    fitnessMetrics: FitnessScore;
    timestamp: number;
    metadata: ArchiveMetadata;
    tags: string[];
}

export interface CodeDiff {
    additions: DiffChunk[];
    deletions: DiffChunk[];
    modifications: DiffChunk[];
    summary: DiffSummary;
}

export interface DiffChunk {
    file: string;
    startLine: number;
    endLine: number;
    content: string;
    type: DiffType;
}

export enum DiffType {
    Added = 'added',
    Deleted = 'deleted',
    Modified = 'modified',
    Renamed = 'renamed',
    Moved = 'moved'
}

export interface DiffSummary {
    filesChanged: number;
    insertions: number;
    deletions: number;
    totalChanges: number;
}

export interface ArchiveMetadata {
    createdBy: string;
    reason: string;
    environment: EnvironmentInfo;
    performance: PerformanceMetrics;
    qualityMetrics: QualityMetrics;
}

export interface EnvironmentInfo {
    nodeVersion: string;
    vscodeVersion: string;
    extensionVersion: string;
    platform: string;
    architecture: string;
}

export interface PerformanceMetrics {
    evolutionTime: number;
    compilationTime: number;
    testExecutionTime: number;
    memoryPeakMB: number;
    cpuPeakPercent: number;
}

export interface QualityMetrics {
    codeComplexity: number;
    testCoverage: number;
    lintScore: number;
    securityScore: number;
    maintainabilityIndex: number;
}

export interface Archive {
    id: string;
    name: string;
    description: string;
    createdAt: number;
    updatedAt: number;
    entries: Map<string, ArchiveEntry>;
    index: ArchiveIndex;
    statistics: ArchiveStatistics;
}

export interface ArchiveIndex {
    byFitness: Map<number, string[]>;
    byGeneration: Map<number, string[]>;
    byAgentType: Map<string, string[]>;
    byTag: Map<string, string[]>;
    byParent: Map<string, string[]>;
}

export interface ArchiveStatistics {
    totalEntries: number;
    uniqueAgents: number;
    averageFitness: number;
    bestFitness: number;
    totalMutations: number;
    successfulMutations: number;
    compressionRatio: number;
    sizeBytes: number;
}

export interface ArchiveQuery {
    agentType?: string;
    minFitness?: number;
    maxFitness?: number;
    tags?: string[];
    parentId?: string;
    dateRange?: DateRange;
    limit?: number;
    offset?: number;
    sortBy?: SortCriteria;
}

export interface DateRange {
    start: number;
    end: number;
}

export enum SortCriteria {
    FitnessDesc = 'fitness-desc',
    FitnessAsc = 'fitness-asc',
    DateDesc = 'date-desc',
    DateAsc = 'date-asc',
    GenerationDesc = 'generation-desc',
    GenerationAsc = 'generation-asc'
}

export interface ArchiveSearchResult {
    entries: ArchiveEntry[];
    totalCount: number;
    hasMore: boolean;
    query: ArchiveQuery;
}

export interface CompressionResult {
    originalSize: number;
    compressedSize: number;
    ratio: number;
    algorithm: CompressionAlgorithm;
}

export enum CompressionAlgorithm {
    Gzip = 'gzip',
    Brotli = 'brotli',
    Zstd = 'zstd',
    Lz4 = 'lz4'
}

export interface ArchiveExport {
    version: string;
    exportDate: number;
    archive: SerializedArchive;
    checksum: string;
}

export interface SerializedArchive {
    id: string;
    name: string;
    entries: SerializedEntry[];
    metadata: Record<string, unknown>;
}

export interface SerializedEntry {
    id: string;
    data: string;  // Base64 encoded compressed data
    compression: CompressionAlgorithm;
}

export interface ArchiveImportOptions {
    merge: boolean;
    overwrite: boolean;
    validateChecksum: boolean;
    preserveIds: boolean;
}

export interface ArchiveMaintenanceOptions {
    pruneOldEntries: boolean;
    maxAge?: number;
    compactDatabase: boolean;
    rebuildIndex: boolean;
    validateIntegrity: boolean;
}

export interface LineageTree {
    rootId: string;
    nodes: Map<string, LineageNode>;
    edges: LineageEdge[];
    depth: number;
}

export interface LineageNode {
    id: string;
    entry: ArchiveEntry;
    children: string[];
    parent?: string;
    generation: number;
}

export interface LineageEdge {
    from: string;
    to: string;
    mutation: Mutation;
    fitnessChange: number;
}

// Type guards
export function isArchiveEntry(obj: unknown): obj is ArchiveEntry {
    return typeof obj === 'object' && 
           obj !== null && 
           'id' in obj && 
           'agentSnapshot' in obj && 
           'fitnessMetrics' in obj;
}

export function isArchive(obj: unknown): obj is Archive {
    return typeof obj === 'object' && 
           obj !== null && 
           'entries' in obj && 
           'index' in obj && 
           'statistics' in obj;
}

// Helper functions
export function calculateCompressionRatio(original: number, compressed: number): number {
    if (original === 0) return 0;
    return (1 - (compressed / original)) * 100;
}

export function buildLineageTree(entries: ArchiveEntry[]): LineageTree {
    const nodes = new Map<string, LineageNode>();
    const edges: LineageEdge[] = [];
    let maxGeneration = 0;

    // Build nodes
    entries.forEach(entry => {
        const generation = entry.agentSnapshot.configuration?.parameters?.generation as number || 0;
        maxGeneration = Math.max(maxGeneration, generation);
        
        nodes.set(entry.id, {
            id: entry.id,
            entry,
            children: [],
            parent: entry.parentId,
            generation
        });
    });

    // Build edges and update children
    nodes.forEach(node => {
        if (node.parent && nodes.has(node.parent)) {
            const parentNode = nodes.get(node.parent)!;
            parentNode.children.push(node.id);
            
            // Create edge
            edges.push({
                from: node.parent,
                to: node.id,
                mutation: {} as Mutation, // Would be populated from entry metadata
                fitnessChange: node.entry.fitnessMetrics.overall - parentNode.entry.fitnessMetrics.overall
            });
        }
    });

    // Find root
    const rootId = Array.from(nodes.values()).find(n => !n.parent)?.id || '';

    return {
        rootId,
        nodes,
        edges,
        depth: maxGeneration
    };
}