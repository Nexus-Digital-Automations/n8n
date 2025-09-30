import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import { UserRepository } from '@n8n/db';
import { Service } from '@n8n/di';

type ResourceType =
	| 'workflow'
	| 'credential'
	| 'execution'
	| 'user'
	| 'tag'
	| 'variable'
	| 'project';
type Action = 'create' | 'read' | 'update' | 'delete' | 'execute' | 'share' | 'manage';
type Effect = 'allow' | 'deny';

interface Permission {
	id: string;
	resource: ResourceType;
	action: Action;
	effect: Effect;
	conditions?: Record<string, unknown>;
}

interface Role {
	id: string;
	name: string;
	description: string;
	permissions: Permission[];
	inherits?: string[]; // Role IDs to inherit from
	isSystem?: boolean; // Built-in system roles
	priority?: number; // Higher priority roles override lower priority
}

interface Policy {
	id: string;
	name: string;
	description: string;
	rules: PolicyRule[];
	enabled: boolean;
}

interface PolicyRule {
	resource: ResourceType;
	action: Action;
	effect: Effect;
	conditions?: {
		userAttributes?: Record<string, unknown>;
		resourceAttributes?: Record<string, unknown>;
		timeRestrictions?: TimeRestriction;
		ipRestrictions?: string[];
	};
}

interface TimeRestriction {
	startTime?: string; // HH:MM format
	endTime?: string; // HH:MM format
	daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
	timezone?: string;
}

interface AccessRequest {
	userId: string;
	resource: ResourceType;
	resourceId?: string;
	action: Action;
	context?: {
		ip?: string;
		timestamp?: Date;
		metadata?: Record<string, unknown>;
	};
}

interface AccessDecision {
	allowed: boolean;
	reason: string;
	matchedRules: string[];
	evaluationTime: number;
}

@Service()
export class RBACManager {
	private roles = new Map<string, Role>();
	private policies = new Map<string, Policy>();
	private userRoles = new Map<string, Set<string>>(); // userId -> roleIds
	private permissionCache = new Map<string, { decision: boolean; expiresAt: number }>();

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
		private readonly userRepository: UserRepository,
	) {
		this.initializeSystemRoles();
	}

	private initializeSystemRoles(): void {
		this.logger.info('Initializing system roles');

		// Owner role - full access
		this.createRole({
			id: 'owner',
			name: 'Owner',
			description: 'Full system access',
			permissions: this.getAllPermissions(),
			isSystem: true,
			priority: 100,
		});

		// Admin role - administrative access
		this.createRole({
			id: 'admin',
			name: 'Administrator',
			description: 'Administrative access to most resources',
			permissions: [
				...this.getResourcePermissions('workflow', [
					'create',
					'read',
					'update',
					'delete',
					'execute',
				]),
				...this.getResourcePermissions('credential', ['create', 'read', 'update', 'delete']),
				...this.getResourcePermissions('execution', ['read', 'delete']),
				...this.getResourcePermissions('user', ['read', 'update']),
				...this.getResourcePermissions('tag', ['create', 'read', 'update', 'delete']),
				...this.getResourcePermissions('variable', ['create', 'read', 'update', 'delete']),
			],
			isSystem: true,
			priority: 90,
		});

		// Member role - standard user access
		this.createRole({
			id: 'member',
			name: 'Member',
			description: 'Standard user access',
			permissions: [
				...this.getResourcePermissions('workflow', ['create', 'read', 'update', 'execute']),
				...this.getResourcePermissions('credential', ['create', 'read', 'update']),
				...this.getResourcePermissions('execution', ['read']),
				...this.getResourcePermissions('tag', ['read']),
				...this.getResourcePermissions('variable', ['read']),
			],
			isSystem: true,
			priority: 50,
		});

		// Viewer role - read-only access
		this.createRole({
			id: 'viewer',
			name: 'Viewer',
			description: 'Read-only access',
			permissions: [
				...this.getResourcePermissions('workflow', ['read']),
				...this.getResourcePermissions('credential', ['read']),
				...this.getResourcePermissions('execution', ['read']),
				...this.getResourcePermissions('tag', ['read']),
				...this.getResourcePermissions('variable', ['read']),
			],
			isSystem: true,
			priority: 10,
		});

		this.logger.info('System roles initialized', {
			rolesCount: this.roles.size,
		});
	}

	private getAllPermissions(): Permission[] {
		const resources: ResourceType[] = [
			'workflow',
			'credential',
			'execution',
			'user',
			'tag',
			'variable',
			'project',
		];
		const actions: Action[] = ['create', 'read', 'update', 'delete', 'execute', 'share', 'manage'];

		const permissions: Permission[] = [];
		for (const resource of resources) {
			for (const action of actions) {
				permissions.push({
					id: `${resource}:${action}`,
					resource,
					action,
					effect: 'allow',
				});
			}
		}

		return permissions;
	}

	private getResourcePermissions(resource: ResourceType, actions: Action[]): Permission[] {
		return actions.map((action) => ({
			id: `${resource}:${action}`,
			resource,
			action,
			effect: 'allow',
		}));
	}

	createRole(role: Role): void {
		this.logger.info('Creating role', {
			roleId: role.id,
			name: role.name,
			permissionsCount: role.permissions.length,
		});

		this.roles.set(role.id, role);
	}

	getRole(roleId: string): Role | undefined {
		return this.roles.get(roleId);
	}

	listRoles(): Role[] {
		return Array.from(this.roles.values());
	}

	updateRole(roleId: string, updates: Partial<Role>): void {
		const role = this.roles.get(roleId);
		if (!role) {
			throw new Error(`Role ${roleId} not found`);
		}

		if (role.isSystem) {
			throw new Error(`Cannot update system role ${roleId}`);
		}

		this.logger.info('Updating role', { roleId, updates });

		this.roles.set(roleId, { ...role, ...updates });
		this.clearPermissionCache();
	}

	deleteRole(roleId: string): void {
		const role = this.roles.get(roleId);
		if (!role) {
			throw new Error(`Role ${roleId} not found`);
		}

		if (role.isSystem) {
			throw new Error(`Cannot delete system role ${roleId}`);
		}

		this.logger.info('Deleting role', { roleId });

		this.roles.delete(roleId);

		// Remove role from all users
		for (const [userId, roleIds] of this.userRoles.entries()) {
			if (roleIds.has(roleId)) {
				roleIds.delete(roleId);
				this.logger.debug('Removed deleted role from user', { userId, roleId });
			}
		}

		this.clearPermissionCache();
	}

	async assignRole(userId: string, roleId: string): Promise<void> {
		this.logger.info('Assigning role to user', { userId, roleId });

		const role = this.roles.get(roleId);
		if (!role) {
			throw new Error(`Role ${roleId} not found`);
		}

		const user = await this.userRepository.findOne({ where: { id: userId } });
		if (!user) {
			throw new Error(`User ${userId} not found`);
		}

		let userRoleSet = this.userRoles.get(userId);
		if (!userRoleSet) {
			userRoleSet = new Set();
			this.userRoles.set(userId, userRoleSet);
		}

		userRoleSet.add(roleId);
		this.clearPermissionCacheForUser(userId);

		this.logger.debug('Role assigned successfully', {
			userId,
			roleId,
			totalRoles: userRoleSet.size,
		});
	}

	async revokeRole(userId: string, roleId: string): Promise<void> {
		this.logger.info('Revoking role from user', { userId, roleId });

		const userRoleSet = this.userRoles.get(userId);
		if (!userRoleSet) {
			return;
		}

		userRoleSet.delete(roleId);
		this.clearPermissionCacheForUser(userId);

		this.logger.debug('Role revoked successfully', {
			userId,
			roleId,
			remainingRoles: userRoleSet.size,
		});
	}

	getUserRoles(userId: string): Role[] {
		const roleIds = this.userRoles.get(userId);
		if (!roleIds) {
			return [];
		}

		const roles: Role[] = [];
		for (const roleId of roleIds) {
			const role = this.roles.get(roleId);
			if (role) {
				roles.push(role);
			}
		}

		// Sort by priority
		return roles.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
	}

	private getEffectivePermissions(userId: string): Permission[] {
		const roles = this.getUserRoles(userId);
		const permissionMap = new Map<string, Permission>();

		// Process roles in priority order
		for (const role of roles) {
			// Add inherited permissions
			if (role.inherits) {
				for (const inheritedRoleId of role.inherits) {
					const inheritedRole = this.roles.get(inheritedRoleId);
					if (inheritedRole) {
						for (const permission of inheritedRole.permissions) {
							if (!permissionMap.has(permission.id)) {
								permissionMap.set(permission.id, permission);
							}
						}
					}
				}
			}

			// Add role's own permissions
			for (const permission of role.permissions) {
				permissionMap.set(permission.id, permission);
			}
		}

		return Array.from(permissionMap.values());
	}

	async checkPermission(request: AccessRequest): Promise<AccessDecision> {
		const startTime = Date.now();
		this.logger.debug('Checking permission', {
			userId: request.userId,
			resource: request.resource,
			action: request.action,
		});

		// Check cache
		const cacheKey = this.getPermissionCacheKey(request);
		const cached = this.permissionCache.get(cacheKey);
		if (cached && Date.now() < cached.expiresAt) {
			this.logger.debug('Returning cached permission decision', { cacheKey });
			return {
				allowed: cached.decision,
				reason: 'Cached decision',
				matchedRules: [],
				evaluationTime: Date.now() - startTime,
			};
		}

		const matchedRules: string[] = [];
		let allowed = false;
		let reason = 'No matching permissions found';

		// Get user permissions
		const permissions = this.getEffectivePermissions(request.userId);

		// Check direct permissions
		for (const permission of permissions) {
			if (permission.resource === request.resource && permission.action === request.action) {
				if (this.evaluateConditions(permission.conditions, request.context)) {
					allowed = permission.effect === 'allow';
					reason = `Permission ${permission.id} ${permission.effect}`;
					matchedRules.push(permission.id);
					break;
				}
			}
		}

		// Check policies
		for (const policy of this.policies.values()) {
			if (!policy.enabled) {
				continue;
			}

			for (const rule of policy.rules) {
				if (rule.resource === request.resource && rule.action === request.action) {
					if (this.evaluatePolicyRule(rule, request)) {
						// Deny rules override allow rules
						if (rule.effect === 'deny') {
							allowed = false;
							reason = `Policy ${policy.id} denied access`;
							matchedRules.push(`${policy.id}:${rule.resource}:${rule.action}`);
							break;
						} else {
							allowed = true;
							reason = `Policy ${policy.id} allowed access`;
							matchedRules.push(`${policy.id}:${rule.resource}:${rule.action}`);
						}
					}
				}
			}
		}

		// Cache decision
		this.permissionCache.set(cacheKey, {
			decision: allowed,
			expiresAt: Date.now() + 60000, // Cache for 1 minute
		});

		const evaluationTime = Date.now() - startTime;

		this.logger.info('Permission check completed', {
			userId: request.userId,
			resource: request.resource,
			action: request.action,
			allowed,
			evaluationTime,
		});

		return {
			allowed,
			reason,
			matchedRules,
			evaluationTime,
		};
	}

	private evaluateConditions(
		conditions: Record<string, unknown> | undefined,
		context: AccessRequest['context'],
	): boolean {
		if (!conditions) {
			return true;
		}

		// Implement condition evaluation logic
		// This is a simplified version
		return true;
	}

	private evaluatePolicyRule(rule: PolicyRule, request: AccessRequest): boolean {
		// Check time restrictions
		if (rule.conditions?.timeRestrictions) {
			const now = request.context?.timestamp ?? new Date();
			const restrictions = rule.conditions.timeRestrictions;

			// Check day of week
			if (restrictions.daysOfWeek && restrictions.daysOfWeek.length > 0) {
				if (!restrictions.daysOfWeek.includes(now.getDay())) {
					return false;
				}
			}

			// Check time range
			if (restrictions.startTime && restrictions.endTime) {
				const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
				if (currentTime < restrictions.startTime || currentTime > restrictions.endTime) {
					return false;
				}
			}
		}

		// Check IP restrictions
		if (rule.conditions?.ipRestrictions && rule.conditions.ipRestrictions.length > 0) {
			const userIp = request.context?.ip;
			if (!userIp || !rule.conditions.ipRestrictions.includes(userIp)) {
				return false;
			}
		}

		return true;
	}

	createPolicy(policy: Policy): void {
		this.logger.info('Creating policy', {
			policyId: policy.id,
			name: policy.name,
			rulesCount: policy.rules.length,
		});

		this.policies.set(policy.id, policy);
		this.clearPermissionCache();
	}

	getPolicy(policyId: string): Policy | undefined {
		return this.policies.get(policyId);
	}

	listPolicies(): Policy[] {
		return Array.from(this.policies.values());
	}

	updatePolicy(policyId: string, updates: Partial<Policy>): void {
		const policy = this.policies.get(policyId);
		if (!policy) {
			throw new Error(`Policy ${policyId} not found`);
		}

		this.logger.info('Updating policy', { policyId, updates });

		this.policies.set(policyId, { ...policy, ...updates });
		this.clearPermissionCache();
	}

	deletePolicy(policyId: string): void {
		this.logger.info('Deleting policy', { policyId });

		this.policies.delete(policyId);
		this.clearPermissionCache();
	}

	private getPermissionCacheKey(request: AccessRequest): string {
		return `${request.userId}:${request.resource}:${request.resourceId ?? '*'}:${request.action}`;
	}

	private clearPermissionCache(): void {
		this.permissionCache.clear();
		this.logger.debug('Permission cache cleared');
	}

	private clearPermissionCacheForUser(userId: string): void {
		const keysToDelete: string[] = [];
		for (const key of this.permissionCache.keys()) {
			if (key.startsWith(`${userId}:`)) {
				keysToDelete.push(key);
			}
		}

		for (const key of keysToDelete) {
			this.permissionCache.delete(key);
		}

		this.logger.debug('Permission cache cleared for user', {
			userId,
			keysCleared: keysToDelete.length,
		});
	}

	async exportConfiguration(): Promise<{ roles: Role[]; policies: Policy[] }> {
		return {
			roles: Array.from(this.roles.values()).filter((role) => !role.isSystem),
			policies: Array.from(this.policies.values()),
		};
	}

	async importConfiguration(config: { roles?: Role[]; policies?: Policy[] }): Promise<void> {
		this.logger.info('Importing RBAC configuration', {
			rolesCount: config.roles?.length ?? 0,
			policiesCount: config.policies?.length ?? 0,
		});

		if (config.roles) {
			for (const role of config.roles) {
				this.createRole(role);
			}
		}

		if (config.policies) {
			for (const policy of config.policies) {
				this.createPolicy(policy);
			}
		}

		this.logger.info('RBAC configuration imported successfully');
	}
}
