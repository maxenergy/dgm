import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { Logger } from '@shared/utils/Logger';
import { IAgent, Permission, AgentType } from '@shared/types';

export interface AuditEvent {
    id: string;
    timestamp: number;
    type: AuditEventType;
    severity: AuditSeverity;
    actor: AuditActor;
    action: string;
    resource?: string;
    result: AuditResult;
    details: Record<string, unknown>;
    hash: string;
}

export enum AuditEventType {
    Permission = 'permission',
    Execution = 'execution',
    Mutation = 'mutation',
    DataAccess = 'data-access',
    Configuration = 'configuration',
    Security = 'security',
    System = 'system'
}

export enum AuditSeverity {
    Info = 'info',
    Warning = 'warning',
    Error = 'error',
    Critical = 'critical'
}

export interface AuditActor {
    type: 'agent' | 'system' | 'user';
    id: string;
    name?: string;
    metadata?: Record<string, unknown>;
}

export interface AuditResult {
    success: boolean;
    error?: string;
    metadata?: Record<string, unknown>;
}

export interface AuditQuery {
    startTime?: number;
    endTime?: number;
    types?: AuditEventType[];
    severities?: AuditSeverity[];
    actorId?: string;
    searchTerm?: string;
    limit?: number;
    offset?: number;
}

export class AuditLogger {
    private readonly logger = new Logger('AuditLogger');
    private readonly events: Map<string, AuditEvent> = new Map();
    private readonly maxEvents = 10000;
    private readonly auditChannel: vscode.OutputChannel;
    private encryptionKey?: Buffer;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly encrypted: boolean = false
    ) {
        this.auditChannel = vscode.window.createOutputChannel('DGM Audit Log');
        
        if (this.encrypted) {
            this.initializeEncryption();
        }

        // Load existing audit logs
        this.loadAuditLogs();
    }

    async logPermissionRequest(
        agent: IAgent,
        permission: Permission,
        granted: boolean,
        reason?: string
    ): Promise<void> {
        await this.log({
            type: AuditEventType.Permission,
            severity: granted ? AuditSeverity.Info : AuditSeverity.Warning,
            actor: {
                type: 'agent',
                id: agent.id,
                name: agent.type,
                metadata: { version: agent.version }
            },
            action: `Permission ${permission} ${granted ? 'granted' : 'denied'}`,
            result: { success: granted },
            details: {
                permission,
                reason,
                agentType: agent.type,
                agentState: agent.state
            }
        });
    }

    async logExecution(
        agent: IAgent,
        action: string,
        result: AuditResult,
        details?: Record<string, unknown>
    ): Promise<void> {
        await this.log({
            type: AuditEventType.Execution,
            severity: result.success ? AuditSeverity.Info : AuditSeverity.Error,
            actor: {
                type: 'agent',
                id: agent.id,
                name: agent.type
            },
            action,
            result,
            details: {
                ...details,
                executionTime: Date.now(),
                agentFitness: agent.state.fitness
            }
        });
    }

    async logMutation(
        agentId: string,
        mutationType: string,
        success: boolean,
        details: Record<string, unknown>
    ): Promise<void> {
        await this.log({
            type: AuditEventType.Mutation,
            severity: success ? AuditSeverity.Info : AuditSeverity.Warning,
            actor: {
                type: 'system',
                id: 'evolution-engine'
            },
            action: `Mutation ${mutationType} on agent ${agentId}`,
            result: { success },
            details
        });
    }

    async logSecurityEvent(
        severity: AuditSeverity,
        action: string,
        details: Record<string, unknown>
    ): Promise<void> {
        await this.log({
            type: AuditEventType.Security,
            severity,
            actor: {
                type: 'system',
                id: 'security-manager'
            },
            action,
            result: { success: severity !== AuditSeverity.Critical },
            details
        });
    }

    async logDataAccess(
        actor: AuditActor,
        resource: string,
        operation: 'read' | 'write' | 'delete',
        success: boolean
    ): Promise<void> {
        await this.log({
            type: AuditEventType.DataAccess,
            severity: AuditSeverity.Info,
            actor,
            action: `${operation} ${resource}`,
            resource,
            result: { success },
            details: {
                operation,
                timestamp: Date.now()
            }
        });
    }

    async query(query: AuditQuery): Promise<AuditEvent[]> {
        let events = Array.from(this.events.values());

        // Apply filters
        if (query.startTime) {
            events = events.filter(e => e.timestamp >= query.startTime!);
        }
        if (query.endTime) {
            events = events.filter(e => e.timestamp <= query.endTime!);
        }
        if (query.types && query.types.length > 0) {
            events = events.filter(e => query.types!.includes(e.type));
        }
        if (query.severities && query.severities.length > 0) {
            events = events.filter(e => query.severities!.includes(e.severity));
        }
        if (query.actorId) {
            events = events.filter(e => e.actor.id === query.actorId);
        }
        if (query.searchTerm) {
            const term = query.searchTerm.toLowerCase();
            events = events.filter(e => 
                e.action.toLowerCase().includes(term) ||
                JSON.stringify(e.details).toLowerCase().includes(term)
            );
        }

        // Sort by timestamp descending
        events.sort((a, b) => b.timestamp - a.timestamp);

        // Apply pagination
        const offset = query.offset || 0;
        const limit = query.limit || 100;
        return events.slice(offset, offset + limit);
    }

    async export(format: 'json' | 'csv' = 'json'): Promise<string> {
        const events = Array.from(this.events.values());
        
        if (format === 'json') {
            return JSON.stringify(events, null, 2);
        } else {
            // CSV format
            const headers = ['id', 'timestamp', 'type', 'severity', 'actor', 'action', 'result', 'details'];
            const rows = events.map(e => [
                e.id,
                new Date(e.timestamp).toISOString(),
                e.type,
                e.severity,
                `${e.actor.type}:${e.actor.id}`,
                e.action,
                e.result.success ? 'success' : 'failure',
                JSON.stringify(e.details)
            ]);
            
            return [headers, ...rows].map(row => row.join(',')).join('\n');
        }
    }

    async verifyIntegrity(): Promise<{ valid: boolean; tamperedEvents: string[] }> {
        const tamperedEvents: string[] = [];

        for (const [id, event] of this.events) {
            const calculatedHash = this.calculateHash(event);
            if (calculatedHash !== event.hash) {
                tamperedEvents.push(id);
            }
        }

        return {
            valid: tamperedEvents.length === 0,
            tamperedEvents
        };
    }

    private async log(params: Omit<AuditEvent, 'id' | 'timestamp' | 'hash'>): Promise<void> {
        const event: AuditEvent = {
            id: this.generateEventId(),
            timestamp: Date.now(),
            ...params,
            hash: '' // Will be calculated
        };

        // Calculate hash for integrity
        event.hash = this.calculateHash(event);

        // Store event
        this.events.set(event.id, event);

        // Write to output channel
        this.auditChannel.appendLine(this.formatEvent(event));

        // Persist to storage
        await this.persistAuditLogs();

        // Cleanup old events if needed
        if (this.events.size > this.maxEvents) {
            this.cleanupOldEvents();
        }

        // Log critical events to main logger
        if (event.severity === AuditSeverity.Critical) {
            this.logger.error('Critical audit event', event);
        }
    }

    private calculateHash(event: Omit<AuditEvent, 'hash'>): string {
        const data = JSON.stringify({
            id: event.id,
            timestamp: event.timestamp,
            type: event.type,
            severity: event.severity,
            actor: event.actor,
            action: event.action,
            result: event.result,
            details: event.details
        });

        return crypto.createHash('sha256').update(data).digest('hex');
    }

    private formatEvent(event: AuditEvent): string {
        const timestamp = new Date(event.timestamp).toISOString();
        const actor = `${event.actor.type}:${event.actor.id}`;
        const result = event.result.success ? '✓' : '✗';
        
        return `[${timestamp}] ${event.severity.toUpperCase()} ${result} ${actor} - ${event.action}`;
    }

    private generateEventId(): string {
        return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private async persistAuditLogs(): Promise<void> {
        try {
            const logs = Array.from(this.events.values());
            const data = this.encrypted ? await this.encrypt(logs) : logs;
            
            await this.context.globalState.update('auditLogs', data);
        } catch (error) {
            this.logger.error('Failed to persist audit logs', error);
        }
    }

    private async loadAuditLogs(): Promise<void> {
        try {
            const data = this.context.globalState.get<any>('auditLogs');
            if (data) {
                const logs = this.encrypted ? await this.decrypt(data) : data;
                logs.forEach((event: AuditEvent) => {
                    this.events.set(event.id, event);
                });
            }
        } catch (error) {
            this.logger.error('Failed to load audit logs', error);
        }
    }

    private cleanupOldEvents(): void {
        const sortedEvents = Array.from(this.events.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        const toRemove = sortedEvents.slice(0, sortedEvents.length - this.maxEvents + 1000);
        toRemove.forEach(([id]) => this.events.delete(id));
    }

    private initializeEncryption(): void {
        // In production, this should use a secure key management system
        const salt = this.context.globalState.get<string>('auditSalt') || 
                     crypto.randomBytes(32).toString('hex');
        
        this.context.globalState.update('auditSalt', salt);
        this.encryptionKey = crypto.pbkdf2Sync('audit-encryption', salt, 100000, 32, 'sha256');
    }

    private async encrypt(data: any): Promise<string> {
        if (!this.encryptionKey) {
            throw new Error('Encryption not initialized');
        }

        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
        
        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    }

    private async decrypt(encrypted: string): Promise<any> {
        if (!this.encryptionKey) {
            throw new Error('Encryption not initialized');
        }

        const [ivHex, encryptedData] = encrypted.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
        
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return JSON.parse(decrypted);
    }

    dispose(): void {
        this.auditChannel.dispose();
    }
}