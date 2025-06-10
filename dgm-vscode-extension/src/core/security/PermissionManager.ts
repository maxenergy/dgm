import { Permission, PermissionLevel, IAgent, AgentType } from '@shared/types';
import { Logger } from '@shared/utils/Logger';

export interface PermissionRequest {
    agentId: string;
    agentType: AgentType;
    permission: Permission;
    reason: string;
    duration?: number;
}

export interface PermissionGrant {
    id: string;
    agentId: string;
    permission: Permission;
    grantedAt: number;
    expiresAt?: number;
    reason: string;
    grantedBy: string;
}

export interface PermissionPolicy {
    level: PermissionLevel;
    defaultPermissions: Map<AgentType, Permission[]>;
    deniedPermissions: Permission[];
    temporaryGrants: Map<string, PermissionGrant[]>;
}

export class PermissionManager {
    private readonly logger = new Logger('PermissionManager');
    private policy: PermissionPolicy;
    private readonly permissionHistory: Map<string, PermissionRequest[]> = new Map();

    constructor(level: PermissionLevel = PermissionLevel.Moderate) {
        this.policy = this.createDefaultPolicy(level);
    }

    async checkPermission(
        agent: IAgent,
        permission: Permission,
        context?: Record<string, unknown>
    ): Promise<boolean> {
        // Check if permission is globally denied
        if (this.policy.deniedPermissions.includes(permission)) {
            this.logger.warn(`Permission denied globally: ${permission}`, {
                agentId: agent.id,
                agentType: agent.type
            });
            return false;
        }

        // Check temporary grants
        const grants = this.policy.temporaryGrants.get(agent.id) || [];
        const validGrant = grants.find(g => 
            g.permission === permission &&
            (!g.expiresAt || g.expiresAt > Date.now())
        );

        if (validGrant) {
            this.logger.info(`Permission granted via temporary grant: ${permission}`, {
                agentId: agent.id,
                grantId: validGrant.id
            });
            return true;
        }

        // Check default permissions for agent type
        const defaultPerms = this.policy.defaultPermissions.get(agent.type) || [];
        if (defaultPerms.includes(permission)) {
            return true;
        }

        // Check policy level
        return this.checkPolicyLevel(permission, agent.type);
    }

    async requestPermission(request: PermissionRequest): Promise<boolean> {
        // Log the request
        const history = this.permissionHistory.get(request.agentId) || [];
        history.push(request);
        this.permissionHistory.set(request.agentId, history);

        // Auto-approve based on policy level
        if (this.shouldAutoApprove(request)) {
            await this.grantPermission(request);
            return true;
        }

        // For strict mode, always deny dynamic requests
        if (this.policy.level === PermissionLevel.Strict) {
            this.logger.warn('Permission request denied in strict mode', request);
            return false;
        }

        // For moderate mode, check if it's a reasonable request
        if (this.policy.level === PermissionLevel.Moderate) {
            return this.evaluateModerateRequest(request);
        }

        // Permissive mode - grant most requests
        await this.grantPermission(request);
        return true;
    }

    async grantPermission(request: PermissionRequest): Promise<PermissionGrant> {
        const grant: PermissionGrant = {
            id: this.generateGrantId(),
            agentId: request.agentId,
            permission: request.permission,
            grantedAt: Date.now(),
            expiresAt: request.duration ? Date.now() + request.duration : undefined,
            reason: request.reason,
            grantedBy: 'system'
        };

        const grants = this.policy.temporaryGrants.get(request.agentId) || [];
        grants.push(grant);
        this.policy.temporaryGrants.set(request.agentId, grants);

        this.logger.info('Permission granted', {
            agentId: request.agentId,
            permission: request.permission,
            expiresAt: grant.expiresAt
        });

        // Clean up expired grants
        this.cleanupExpiredGrants();

        return grant;
    }

    revokePermission(agentId: string, permission: Permission): void {
        const grants = this.policy.temporaryGrants.get(agentId) || [];
        const filtered = grants.filter(g => g.permission !== permission);
        
        if (filtered.length < grants.length) {
            this.policy.temporaryGrants.set(agentId, filtered);
            this.logger.info('Permission revoked', {
                agentId,
                permission
            });
        }
    }

    revokeAllPermissions(agentId: string): void {
        this.policy.temporaryGrants.delete(agentId);
        this.logger.info('All permissions revoked', { agentId });
    }

    updatePermissionLevel(level: PermissionLevel): void {
        this.policy = this.createDefaultPolicy(level);
        this.logger.info('Permission level updated', { level });
    }

    getAgentPermissions(agentId: string, agentType: AgentType): Permission[] {
        const permissions: Set<Permission> = new Set();

        // Add default permissions
        const defaults = this.policy.defaultPermissions.get(agentType) || [];
        defaults.forEach(p => permissions.add(p));

        // Add temporary grants
        const grants = this.policy.temporaryGrants.get(agentId) || [];
        grants
            .filter(g => !g.expiresAt || g.expiresAt > Date.now())
            .forEach(g => permissions.add(g.permission));

        // Remove denied permissions
        this.policy.deniedPermissions.forEach(p => permissions.delete(p));

        return Array.from(permissions);
    }

    getPermissionHistory(agentId: string): PermissionRequest[] {
        return this.permissionHistory.get(agentId) || [];
    }

    private createDefaultPolicy(level: PermissionLevel): PermissionPolicy {
        const policy: PermissionPolicy = {
            level,
            defaultPermissions: new Map(),
            deniedPermissions: [],
            temporaryGrants: new Map()
        };

        switch (level) {
            case PermissionLevel.Strict:
                // Minimal permissions
                policy.defaultPermissions.set(AgentType.Requirements, [
                    Permission.FileSystemRead
                ]);
                policy.defaultPermissions.set(AgentType.Architecture, [
                    Permission.FileSystemRead
                ]);
                policy.defaultPermissions.set(AgentType.CodeGeneration, [
                    Permission.FileSystemRead,
                    Permission.WorkspaceModification
                ]);
                policy.defaultPermissions.set(AgentType.Testing, [
                    Permission.FileSystemRead
                ]);
                policy.defaultPermissions.set(AgentType.Deployment, []);
                
                policy.deniedPermissions = [
                    Permission.ProcessExecution,
                    Permission.NetworkAccess
                ];
                break;

            case PermissionLevel.Moderate:
                // Balanced permissions
                policy.defaultPermissions.set(AgentType.Requirements, [
                    Permission.FileSystemRead,
                    Permission.WorkspaceModification
                ]);
                policy.defaultPermissions.set(AgentType.Architecture, [
                    Permission.FileSystemRead,
                    Permission.FileSystemWrite
                ]);
                policy.defaultPermissions.set(AgentType.CodeGeneration, [
                    Permission.FileSystemRead,
                    Permission.FileSystemWrite,
                    Permission.WorkspaceModification
                ]);
                policy.defaultPermissions.set(AgentType.Testing, [
                    Permission.FileSystemRead,
                    Permission.FileSystemWrite,
                    Permission.ProcessExecution
                ]);
                policy.defaultPermissions.set(AgentType.Deployment, [
                    Permission.FileSystemRead,
                    Permission.NetworkAccess
                ]);
                
                policy.deniedPermissions = [];
                break;

            case PermissionLevel.Permissive:
                // Most permissions granted
                const allPermissions = Object.values(Permission) as Permission[];
                
                policy.defaultPermissions.set(AgentType.Requirements, allPermissions);
                policy.defaultPermissions.set(AgentType.Architecture, allPermissions);
                policy.defaultPermissions.set(AgentType.CodeGeneration, allPermissions);
                policy.defaultPermissions.set(AgentType.Testing, allPermissions);
                policy.defaultPermissions.set(AgentType.Deployment, allPermissions);
                
                policy.deniedPermissions = [];
                break;
        }

        return policy;
    }

    private checkPolicyLevel(permission: Permission, agentType: AgentType): boolean {
        switch (this.policy.level) {
            case PermissionLevel.Strict:
                return false; // No additional permissions in strict mode
            
            case PermissionLevel.Moderate:
                // Allow some additional permissions based on agent type
                if (agentType === AgentType.Testing && permission === Permission.ProcessExecution) {
                    return true;
                }
                if (agentType === AgentType.Deployment && permission === Permission.NetworkAccess) {
                    return true;
                }
                return false;
            
            case PermissionLevel.Permissive:
                return true; // Allow all permissions in permissive mode
        }
    }

    private shouldAutoApprove(request: PermissionRequest): boolean {
        // Check request frequency to prevent abuse
        const history = this.permissionHistory.get(request.agentId) || [];
        const recentRequests = history.filter(r => 
            r.permission === request.permission &&
            Date.now() - (r as any).timestamp < 60000 // Last minute
        );

        if (recentRequests.length > 5) {
            this.logger.warn('Too many permission requests', {
                agentId: request.agentId,
                permission: request.permission
            });
            return false;
        }

        // Auto-approve based on policy level and agent type
        if (this.policy.level === PermissionLevel.Permissive) {
            return true;
        }

        return false;
    }

    private evaluateModerateRequest(request: PermissionRequest): boolean {
        // Evaluate if the request is reasonable for moderate policy
        const riskyPermissions = [
            Permission.ProcessExecution,
            Permission.NetworkAccess,
            Permission.ExtensionConfiguration
        ];

        if (riskyPermissions.includes(request.permission)) {
            // Check if agent type typically needs this permission
            const expectedPerms = this.getExpectedPermissions(request.agentType);
            return expectedPerms.includes(request.permission);
        }

        return true;
    }

    private getExpectedPermissions(agentType: AgentType): Permission[] {
        switch (agentType) {
            case AgentType.Testing:
                return [Permission.ProcessExecution, Permission.FileSystemWrite];
            case AgentType.Deployment:
                return [Permission.NetworkAccess, Permission.ProcessExecution];
            case AgentType.CodeGeneration:
                return [Permission.FileSystemWrite, Permission.WorkspaceModification];
            default:
                return [Permission.FileSystemRead];
        }
    }

    private cleanupExpiredGrants(): void {
        const now = Date.now();
        
        this.policy.temporaryGrants.forEach((grants, agentId) => {
            const valid = grants.filter(g => !g.expiresAt || g.expiresAt > now);
            if (valid.length < grants.length) {
                this.policy.temporaryGrants.set(agentId, valid);
            }
        });
    }

    private generateGrantId(): string {
        return `grant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}