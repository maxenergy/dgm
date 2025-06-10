import * as vscode from 'vscode';
import { 
    ArchiveEntry, 
    Archive, 
    IAgent, 
    FitnessScore,
    ArchiveQuery,
    ArchiveSearchResult
} from '@shared/types';
import { Logger } from '@shared/utils/Logger';
import { ConfigurationManager } from '@api/vscode/ConfigurationManager';

export class ArchiveManager implements vscode.Disposable {
    private readonly logger = new Logger('ArchiveManager');
    private readonly archive: Archive;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly configManager: ConfigurationManager
    ) {
        this.archive = {
            id: 'main-archive',
            name: 'DGM Main Archive',
            description: 'Primary archive for agent evolution history',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            entries: new Map(),
            index: {
                byFitness: new Map(),
                byGeneration: new Map(),
                byAgentType: new Map(),
                byTag: new Map(),
                byParent: new Map()
            },
            statistics: {
                totalEntries: 0,
                uniqueAgents: 0,
                averageFitness: 0,
                bestFitness: 0,
                totalMutations: 0,
                successfulMutations: 0,
                compressionRatio: 0,
                sizeBytes: 0
            }
        };
    }

    async initialize(): Promise<void> {
        this.logger.info('Initializing archive manager...');
        
        try {
            await this.loadArchive();
            this.logger.info('Archive manager initialized', {
                entries: this.archive.entries.size
            });
        } catch (error) {
            this.logger.error('Failed to initialize archive manager', error);
            throw error;
        }
    }

    async archiveAgent(
        agent: IAgent, 
        fitness: FitnessScore, 
        reason: string
    ): Promise<ArchiveEntry> {
        const entry: ArchiveEntry = {
            id: this.generateEntryId(),
            agentSnapshot: agent.serialize(),
            mutationDelta: {
                additions: [],
                deletions: [],
                modifications: [],
                summary: {
                    filesChanged: 0,
                    insertions: 0,
                    deletions: 0,
                    totalChanges: 0
                }
            },
            fitnessMetrics: fitness,
            timestamp: Date.now(),
            metadata: {
                createdBy: 'evolution-engine',
                reason,
                environment: {
                    nodeVersion: process.version,
                    vscodeVersion: vscode.version,
                    extensionVersion: this.context.extension.packageJSON.version,
                    platform: process.platform,
                    architecture: process.arch
                },
                performance: {
                    evolutionTime: 0,
                    compilationTime: 0,
                    testExecutionTime: 0,
                    memoryPeakMB: process.memoryUsage().heapUsed / (1024 * 1024),
                    cpuPeakPercent: 0
                },
                qualityMetrics: {
                    codeComplexity: 0,
                    testCoverage: 0,
                    lintScore: 0,
                    securityScore: 0,
                    maintainabilityIndex: 0
                }
            },
            tags: [agent.type, reason]
        };

        // Store entry
        this.archive.entries.set(entry.id, entry);
        
        // Update indices
        this.updateIndices(entry);
        
        // Update statistics
        this.updateStatistics();

        // Persist changes
        await this.saveArchive();

        this.logger.info('Agent archived', {
            entryId: entry.id,
            agentId: agent.id,
            fitness: fitness.overall
        });

        return entry;
    }

    async search(query: ArchiveQuery): Promise<ArchiveSearchResult> {
        let entries = Array.from(this.archive.entries.values());

        // Apply filters
        if (query.agentType) {
            const typeEntries = this.archive.index.byAgentType.get(query.agentType) || [];
            entries = entries.filter(e => typeEntries.includes(e.id));
        }

        if (query.minFitness !== undefined) {
            entries = entries.filter(e => e.fitnessMetrics.overall >= query.minFitness!);
        }

        if (query.maxFitness !== undefined) {
            entries = entries.filter(e => e.fitnessMetrics.overall <= query.maxFitness!);
        }

        if (query.tags && query.tags.length > 0) {
            entries = entries.filter(e => 
                query.tags!.some(tag => e.tags.includes(tag))
            );
        }

        if (query.dateRange) {
            entries = entries.filter(e => 
                e.timestamp >= query.dateRange!.start &&
                e.timestamp <= query.dateRange!.end
            );
        }

        // Sort results
        entries = this.sortEntries(entries, query.sortBy);

        // Apply pagination
        const totalCount = entries.length;
        const offset = query.offset || 0;
        const limit = query.limit || 50;
        const paginatedEntries = entries.slice(offset, offset + limit);

        return {
            entries: paginatedEntries,
            totalCount,
            hasMore: offset + limit < totalCount,
            query
        };
    }

    getBestAgents(limit: number = 10): ArchiveEntry[] {
        return Array.from(this.archive.entries.values())
            .sort((a, b) => b.fitnessMetrics.overall - a.fitnessMetrics.overall)
            .slice(0, limit);
    }

    getArchiveStatistics() {
        return { ...this.archive.statistics };
    }

    private updateIndices(entry: ArchiveEntry): void {
        const { index } = this.archive;

        // Index by fitness
        const fitnessKey = Math.floor(entry.fitnessMetrics.overall * 10) / 10;
        const fitnessEntries = index.byFitness.get(fitnessKey) || [];
        fitnessEntries.push(entry.id);
        index.byFitness.set(fitnessKey, fitnessEntries);

        // Index by agent type
        const typeEntries = index.byAgentType.get(entry.agentSnapshot.type) || [];
        typeEntries.push(entry.id);
        index.byAgentType.set(entry.agentSnapshot.type, typeEntries);

        // Index by tags
        entry.tags.forEach(tag => {
            const tagEntries = index.byTag.get(tag) || [];
            tagEntries.push(entry.id);
            index.byTag.set(tag, tagEntries);
        });

        // Index by generation
        const generation = entry.agentSnapshot.configuration?.parameters?.generation as number || 0;
        const genEntries = index.byGeneration.get(generation) || [];
        genEntries.push(entry.id);
        index.byGeneration.set(generation, genEntries);
    }

    private updateStatistics(): void {
        const entries = Array.from(this.archive.entries.values());
        const stats = this.archive.statistics;

        stats.totalEntries = entries.length;
        stats.uniqueAgents = new Set(entries.map(e => e.agentSnapshot.id)).size;

        if (entries.length > 0) {
            const fitnessValues = entries.map(e => e.fitnessMetrics.overall);
            stats.averageFitness = fitnessValues.reduce((a, b) => a + b, 0) / fitnessValues.length;
            stats.bestFitness = Math.max(...fitnessValues);
        }

        this.archive.updatedAt = Date.now();
    }

    private sortEntries(entries: ArchiveEntry[], sortBy = 'fitness-desc') {
        switch (sortBy) {
            case 'fitness-asc':
                return entries.sort((a, b) => a.fitnessMetrics.overall - b.fitnessMetrics.overall);
            case 'fitness-desc':
                return entries.sort((a, b) => b.fitnessMetrics.overall - a.fitnessMetrics.overall);
            case 'date-asc':
                return entries.sort((a, b) => a.timestamp - b.timestamp);
            case 'date-desc':
                return entries.sort((a, b) => b.timestamp - a.timestamp);
            default:
                return entries;
        }
    }

    private async loadArchive(): Promise<void> {
        try {
            const saved = this.context.globalState.get<any>('archiveData');
            if (saved && saved.entries) {
                // Convert saved entries back to Map
                for (const [id, entry] of Object.entries(saved.entries)) {
                    this.archive.entries.set(id, entry as ArchiveEntry);
                }
                
                if (saved.statistics) {
                    Object.assign(this.archive.statistics, saved.statistics);
                }
                
                this.logger.info('Archive loaded from storage', {
                    entries: this.archive.entries.size
                });
            }
        } catch (error) {
            this.logger.error('Failed to load archive', error);
        }
    }

    private async saveArchive(): Promise<void> {
        try {
            const data = {
                entries: Object.fromEntries(this.archive.entries),
                statistics: this.archive.statistics,
                updatedAt: this.archive.updatedAt
            };
            
            await this.context.globalState.update('archiveData', data);
        } catch (error) {
            this.logger.error('Failed to save archive', error);
        }
    }

    private generateEntryId(): string {
        return `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    dispose(): void {
        this.saveArchive().catch(error => {
            this.logger.error('Error saving archive during disposal', error);
        });
    }
}