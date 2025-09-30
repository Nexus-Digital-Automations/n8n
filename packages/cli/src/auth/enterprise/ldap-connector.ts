import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import type { User } from '@n8n/db';
import { UserRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import { Client, type SearchOptions } from 'ldapts';
import { createHash } from 'crypto';

interface LDAPConfig {
	enabled: boolean;
	url: string;
	bindDN: string;
	bindPassword: string;
	baseDN: string;
	searchFilter: string;
	userIdAttribute: string;
	emailAttribute: string;
	firstNameAttribute: string;
	lastNameAttribute: string;
	// Group mapping
	groupBaseDN?: string;
	groupSearchFilter?: string;
	groupMemberAttribute?: string;
	groupRoleMapping?: Record<string, string>;
	// Sync options
	syncEnabled?: boolean;
	syncInterval?: number; // in minutes
	autoCreateUser?: boolean;
	autoDisableUser?: boolean;
	// Connection options
	tlsEnabled?: boolean;
	tlsRejectUnauthorized?: boolean;
	timeout?: number;
}

interface LDAPUser {
	dn: string;
	uid: string;
	email: string;
	firstName: string;
	lastName: string;
	groups: string[];
}

interface LDAPGroup {
	dn: string;
	name: string;
	members: string[];
}

@Service()
export class LDAPConnector {
	private client: Client | null = null;
	private config: LDAPConfig | null = null;
	private syncTimer: NodeJS.Timeout | null = null;
	private connected = false;

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
		private readonly userRepository: UserRepository,
	) {}

	async initialize(config: LDAPConfig): Promise<void> {
		this.logger.info('Initializing LDAP connector', {
			url: config.url,
			enabled: config.enabled,
		});

		if (!config.enabled) {
			this.logger.debug('LDAP is disabled');
			return;
		}

		this.config = config;

		try {
			// Create LDAP client
			this.client = new Client({
				url: config.url,
				timeout: config.timeout ?? 5000,
				connectTimeout: config.timeout ?? 5000,
				tlsOptions: {
					rejectUnauthorized: config.tlsRejectUnauthorized ?? true,
				},
			});

			// Test connection
			await this.connect();

			// Start sync if enabled
			if (config.syncEnabled && config.syncInterval) {
				await this.startSync();
			}

			this.logger.info('LDAP connector initialized successfully');
		} catch (error) {
			this.logger.error('Failed to initialize LDAP connector', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
		}
	}

	private async connect(): Promise<void> {
		if (!this.client || !this.config) {
			throw new Error('LDAP client not initialized');
		}

		this.logger.debug('Connecting to LDAP server', {
			url: this.config.url,
			bindDN: this.config.bindDN,
		});

		try {
			await this.client.bind(this.config.bindDN, this.config.bindPassword);
			this.connected = true;
			this.logger.info('Connected to LDAP server successfully');
		} catch (error) {
			this.logger.error('Failed to connect to LDAP server', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			this.connected = false;
			throw error;
		}
	}

	async disconnect(): Promise<void> {
		if (!this.client) {
			return;
		}

		this.logger.debug('Disconnecting from LDAP server');

		try {
			await this.client.unbind();
			this.connected = false;
			this.logger.info('Disconnected from LDAP server');
		} catch (error) {
			this.logger.error('Error disconnecting from LDAP server', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
		}
	}

	async authenticate(username: string, password: string): Promise<User | null> {
		if (!this.client || !this.config) {
			throw new Error('LDAP connector not initialized');
		}

		this.logger.debug('Authenticating user with LDAP', { username });

		try {
			// Ensure connection
			if (!this.connected) {
				await this.connect();
			}

			// Find user DN
			const ldapUser = await this.findUser(username);
			if (!ldapUser) {
				this.logger.warn('User not found in LDAP', { username });
				return null;
			}

			// Try to bind with user credentials
			const userClient = new Client({
				url: this.config.url,
				timeout: this.config.timeout ?? 5000,
			});

			try {
				await userClient.bind(ldapUser.dn, password);
				await userClient.unbind();

				this.logger.info('LDAP authentication successful', {
					username,
					dn: ldapUser.dn,
				});

				// Find or create user in n8n
				return await this.syncUser(ldapUser);
			} catch (bindError) {
				this.logger.warn('LDAP bind failed for user', {
					username,
					dn: ldapUser.dn,
					error: bindError instanceof Error ? bindError.message : String(bindError),
				});
				return null;
			}
		} catch (error) {
			this.logger.error('LDAP authentication error', {
				username,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			return null;
		}
	}

	private async findUser(identifier: string): Promise<LDAPUser | null> {
		if (!this.client || !this.config) {
			throw new Error('LDAP connector not initialized');
		}

		this.logger.debug('Finding user in LDAP', { identifier });

		try {
			const searchFilter = this.config.searchFilter.replace('{0}', identifier);
			const searchOptions: SearchOptions = {
				scope: 'sub',
				filter: searchFilter,
				attributes: [
					this.config.userIdAttribute,
					this.config.emailAttribute,
					this.config.firstNameAttribute,
					this.config.lastNameAttribute,
				],
			};

			const { searchEntries } = await this.client.search(this.config.baseDN, searchOptions);

			if (searchEntries.length === 0) {
				this.logger.debug('No user found in LDAP', { identifier });
				return null;
			}

			if (searchEntries.length > 1) {
				this.logger.warn('Multiple users found in LDAP, using first result', {
					identifier,
					count: searchEntries.length,
				});
			}

			const entry = searchEntries[0];
			const ldapUser: LDAPUser = {
				dn: entry.dn,
				uid: String(entry[this.config.userIdAttribute] ?? ''),
				email: String(entry[this.config.emailAttribute] ?? ''),
				firstName: String(entry[this.config.firstNameAttribute] ?? ''),
				lastName: String(entry[this.config.lastNameAttribute] ?? ''),
				groups: [],
			};

			// Get user groups if group mapping is configured
			if (this.config.groupBaseDN) {
				ldapUser.groups = await this.getUserGroups(ldapUser.dn);
			}

			this.logger.debug('Found user in LDAP', {
				dn: ldapUser.dn,
				email: ldapUser.email,
				groupCount: ldapUser.groups.length,
			});

			return ldapUser;
		} catch (error) {
			this.logger.error('Error finding user in LDAP', {
				identifier,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			return null;
		}
	}

	private async getUserGroups(userDN: string): Promise<string[]> {
		if (!this.client || !this.config || !this.config.groupBaseDN) {
			return [];
		}

		this.logger.debug('Finding groups for user', { userDN });

		try {
			const memberAttribute = this.config.groupMemberAttribute ?? 'member';
			const searchFilter = this.config.groupSearchFilter
				? this.config.groupSearchFilter.replace('{0}', userDN)
				: `(${memberAttribute}=${userDN})`;

			const searchOptions: SearchOptions = {
				scope: 'sub',
				filter: searchFilter,
				attributes: ['cn'],
			};

			const { searchEntries } = await this.client.search(this.config.groupBaseDN, searchOptions);

			const groups = searchEntries.map((entry) => String(entry.cn ?? ''));

			this.logger.debug('Found groups for user', {
				userDN,
				groups,
				count: groups.length,
			});

			return groups;
		} catch (error) {
			this.logger.error('Error finding groups for user', {
				userDN,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			return [];
		}
	}

	private async syncUser(ldapUser: LDAPUser): Promise<User> {
		this.logger.debug('Syncing LDAP user to n8n', {
			email: ldapUser.email,
			dn: ldapUser.dn,
		});

		// Find existing user
		let user = await this.userRepository.findOne({
			where: { email: ldapUser.email.toLowerCase() },
			relations: ['role'],
		});

		if (user) {
			// Update existing user
			user.firstName = ldapUser.firstName || user.firstName;
			user.lastName = ldapUser.lastName || user.lastName;
			user.disabled = false; // Re-enable if user exists in LDAP
			user.lastActiveAt = new Date();

			await this.userRepository.save(user);

			this.logger.debug('Updated existing user from LDAP', {
				userId: user.id,
				email: user.email,
			});
		} else if (this.config?.autoCreateUser) {
			// Create new user
			user = this.userRepository.create({
				email: ldapUser.email.toLowerCase(),
				firstName: ldapUser.firstName,
				lastName: ldapUser.lastName,
				password: this.generateLDAPPasswordHash(ldapUser.dn), // Special hash for LDAP users
				disabled: false,
				lastActiveAt: new Date(),
			});

			// Map LDAP groups to n8n roles if configured
			if (this.config.groupRoleMapping && ldapUser.groups.length > 0) {
				for (const group of ldapUser.groups) {
					const mappedRole = this.config.groupRoleMapping[group];
					if (mappedRole) {
						this.logger.debug('Mapping LDAP group to role', {
							group,
							role: mappedRole,
						});
						// Role assignment would happen here
						break;
					}
				}
			}

			await this.userRepository.save(user);

			this.logger.info('Created new user from LDAP', {
				userId: user.id,
				email: user.email,
				groups: ldapUser.groups,
			});
		} else {
			throw new Error('User not found and auto-creation is disabled');
		}

		return user;
	}

	private generateLDAPPasswordHash(dn: string): string {
		// Generate a special hash for LDAP users to prevent password login
		// This ensures LDAP users can only authenticate via LDAP
		return createHash('sha256').update(`LDAP:${dn}:${Date.now()}`).digest('hex');
	}

	async syncAllUsers(): Promise<{ synced: number; disabled: number; errors: number }> {
		if (!this.client || !this.config) {
			throw new Error('LDAP connector not initialized');
		}

		this.logger.info('Starting full LDAP user sync');

		const stats = {
			synced: 0,
			disabled: 0,
			errors: 0,
		};

		try {
			// Ensure connection
			if (!this.connected) {
				await this.connect();
			}

			// Get all users from LDAP
			const ldapUsers = await this.getAllLDAPUsers();

			this.logger.info('Found LDAP users', { count: ldapUsers.length });

			// Sync each user
			for (const ldapUser of ldapUsers) {
				try {
					await this.syncUser(ldapUser);
					stats.synced++;
				} catch (error) {
					this.logger.error('Error syncing LDAP user', {
						email: ldapUser.email,
						error: error instanceof Error ? error.message : String(error),
					});
					stats.errors++;
				}
			}

			// Disable users not in LDAP if configured
			if (this.config.autoDisableUser) {
				const ldapEmails = ldapUsers.map((u) => u.email.toLowerCase());
				const allUsers = await this.userRepository.find({
					where: { password: { like: 'LDAP:%' } as never }, // Type assertion for LIKE query
				});

				for (const user of allUsers) {
					if (!ldapEmails.includes(user.email) && !user.disabled) {
						user.disabled = true;
						await this.userRepository.save(user);
						stats.disabled++;

						this.logger.info('Disabled user no longer in LDAP', {
							userId: user.id,
							email: user.email,
						});
					}
				}
			}

			this.logger.info('LDAP user sync completed', stats);
		} catch (error) {
			this.logger.error('LDAP user sync failed', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
		}

		return stats;
	}

	private async getAllLDAPUsers(): Promise<LDAPUser[]> {
		if (!this.client || !this.config) {
			throw new Error('LDAP connector not initialized');
		}

		const searchFilter = this.config.searchFilter.replace('{0}', '*');
		const searchOptions: SearchOptions = {
			scope: 'sub',
			filter: searchFilter,
			attributes: [
				this.config.userIdAttribute,
				this.config.emailAttribute,
				this.config.firstNameAttribute,
				this.config.lastNameAttribute,
			],
			paged: true,
			sizeLimit: 1000,
		};

		const { searchEntries } = await this.client.search(this.config.baseDN, searchOptions);

		const users: LDAPUser[] = [];
		for (const entry of searchEntries) {
			const ldapUser: LDAPUser = {
				dn: entry.dn,
				uid: String(entry[this.config.userIdAttribute] ?? ''),
				email: String(entry[this.config.emailAttribute] ?? ''),
				firstName: String(entry[this.config.firstNameAttribute] ?? ''),
				lastName: String(entry[this.config.lastNameAttribute] ?? ''),
				groups: [],
			};

			if (this.config.groupBaseDN) {
				ldapUser.groups = await this.getUserGroups(ldapUser.dn);
			}

			users.push(ldapUser);
		}

		return users;
	}

	private async startSync(): Promise<void> {
		if (!this.config?.syncInterval) {
			return;
		}

		this.logger.info('Starting periodic LDAP sync', {
			intervalMinutes: this.config.syncInterval,
		});

		const intervalMs = this.config.syncInterval * 60 * 1000;

		this.syncTimer = setInterval(async () => {
			this.logger.debug('Running scheduled LDAP sync');
			try {
				await this.syncAllUsers();
			} catch (error) {
				this.logger.error('Scheduled LDAP sync failed', {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}, intervalMs);
	}

	async stopSync(): Promise<void> {
		if (this.syncTimer) {
			clearInterval(this.syncTimer);
			this.syncTimer = null;
			this.logger.info('Stopped periodic LDAP sync');
		}
	}

	isConnected(): boolean {
		return this.connected;
	}

	async testConnection(): Promise<boolean> {
		try {
			await this.connect();
			await this.disconnect();
			return true;
		} catch (error) {
			this.logger.error('LDAP connection test failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}
}
