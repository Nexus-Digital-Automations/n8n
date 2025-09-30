import { Logger } from '@n8n/backend-common';
import type { User } from '@n8n/db';
import { Service } from '@n8n/di';
import type { ICredentialDataDecryptedObject } from 'n8n-workflow';

import { CredentialsService } from '@/credentials/credentials.service';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';

/**
 * Credential template definition
 */
export interface CredentialTemplate {
	/** Template name */
	name: string;
	/** Credential type */
	credentialType: string;
	/** Description */
	description: string;
	/** Authentication method */
	authMethod: 'oauth2' | 'basic' | 'apiKey' | 'jwt' | 'bearerToken';
	/** Required fields */
	requiredFields: string[];
	/** Optional fields */
	optionalFields?: string[];
	/** Default values */
	defaultValues?: Record<string, string | number | boolean>;
	/** Field descriptions */
	fieldDescriptions: Record<string, string>;
	/** Usage examples */
	usageExamples?: string[];
}

/**
 * Quick setup request
 */
export interface QuickSetupRequest {
	/** Template name or credential type */
	template: string;
	/** Credential name */
	name: string;
	/** Field values */
	fields: Record<string, string | number | boolean>;
	/** Project ID */
	projectId?: string;
}

/**
 * Credential Templates Service
 * Provides quick credential setup templates
 */
@Service()
export class CredentialTemplates {
	constructor(
		private readonly logger: Logger,
		private readonly credentialsService: CredentialsService,
	) {}

	/**
	 * Get all available credential templates
	 */
	getAllTemplates(): CredentialTemplate[] {
		return [
			this.getHttpBasicAuthTemplate(),
			this.getHttpHeaderAuthTemplate(),
			this.getApiKeyTemplate(),
			this.getBearerTokenTemplate(),
			this.getJwtTemplate(),
			this.getAwsTemplate(),
			this.getMongoDbTemplate(),
			this.getPostgresTemplate(),
			this.getMySqlTemplate(),
			this.getRedisTemplate(),
		];
	}

	/**
	 * Get template by name or credential type
	 */
	getTemplate(nameOrType: string): CredentialTemplate | null {
		const templates = this.getAllTemplates();
		return (
			templates.find(
				(t) => t.name.toLowerCase() === nameOrType.toLowerCase() || t.credentialType === nameOrType,
			) ?? null
		);
	}

	/**
	 * Quick setup credential from template
	 */
	async quickSetup(request: QuickSetupRequest, user: User) {
		const template = this.getTemplate(request.template);

		if (!template) {
			throw new BadRequestError(`Template '${request.template}' not found`);
		}

		// Validate required fields
		const missingFields = template.requiredFields.filter((field) => !request.fields[field]);

		if (missingFields.length > 0) {
			throw new BadRequestError(`Missing required fields: ${missingFields.join(', ')}`);
		}

		// Build credential data
		const credentialData: ICredentialDataDecryptedObject = {
			...template.defaultValues,
			...request.fields,
		};

		// Create credential
		const credential = await this.credentialsService.createUnmanagedCredential(
			{
				name: request.name,
				type: template.credentialType,
				data: credentialData,
				projectId: request.projectId,
			},
			user,
		);

		this.logger.info('Credential created from template', {
			credentialId: credential.id,
			template: template.name,
			userId: user.id,
		});

		return credential;
	}

	/**
	 * Get templates by authentication method
	 */
	getTemplatesByAuthMethod(
		authMethod: 'oauth2' | 'basic' | 'apiKey' | 'jwt' | 'bearerToken',
	): CredentialTemplate[] {
		return this.getAllTemplates().filter((t) => t.authMethod === authMethod);
	}

	// Template Definitions

	private getHttpBasicAuthTemplate(): CredentialTemplate {
		return {
			name: 'HTTP Basic Auth',
			credentialType: 'httpBasicAuth',
			description: 'Username and password authentication',
			authMethod: 'basic',
			requiredFields: ['user', 'password'],
			optionalFields: [],
			fieldDescriptions: {
				user: 'Username for authentication',
				password: 'Password for authentication',
			},
			usageExamples: [
				'REST APIs with basic authentication',
				'Legacy web services',
				'Internal tools and services',
			],
		};
	}

	private getHttpHeaderAuthTemplate(): CredentialTemplate {
		return {
			name: 'HTTP Header Auth',
			credentialType: 'httpHeaderAuth',
			description: 'Custom header authentication',
			authMethod: 'apiKey',
			requiredFields: ['name', 'value'],
			optionalFields: [],
			fieldDescriptions: {
				name: 'Header name (e.g., X-API-Key)',
				value: 'Header value',
			},
			usageExamples: ['Custom API authentication', 'Proprietary authentication schemes'],
		};
	}

	private getApiKeyTemplate(): CredentialTemplate {
		return {
			name: 'API Key',
			credentialType: 'apiKey',
			description: 'Simple API key authentication',
			authMethod: 'apiKey',
			requiredFields: ['apiKey'],
			optionalFields: ['apiKeyLocation', 'apiKeyName'],
			defaultValues: {
				apiKeyLocation: 'header',
				apiKeyName: 'X-API-Key',
			},
			fieldDescriptions: {
				apiKey: 'Your API key',
				apiKeyLocation: 'Where to send the API key (header or query)',
				apiKeyName: 'API key parameter name',
			},
			usageExamples: ['Most modern REST APIs', 'SaaS platforms', 'Third-party services'],
		};
	}

	private getBearerTokenTemplate(): CredentialTemplate {
		return {
			name: 'Bearer Token',
			credentialType: 'httpBearerAuth',
			description: 'Bearer token authentication (Authorization: Bearer <token>)',
			authMethod: 'bearerToken',
			requiredFields: ['token'],
			optionalFields: [],
			fieldDescriptions: {
				token: 'Bearer token for authentication',
			},
			usageExamples: ['OAuth 2.0 access tokens', 'JWT tokens', 'Personal access tokens'],
		};
	}

	private getJwtTemplate(): CredentialTemplate {
		return {
			name: 'JWT Authentication',
			credentialType: 'jwtAuth',
			description: 'JSON Web Token authentication',
			authMethod: 'jwt',
			requiredFields: ['secret'],
			optionalFields: ['algorithm', 'expiresIn', 'issuer', 'audience'],
			defaultValues: {
				algorithm: 'HS256',
				expiresIn: '1h',
			},
			fieldDescriptions: {
				secret: 'Secret key for signing tokens',
				algorithm: 'JWT signing algorithm (HS256, RS256, etc.)',
				expiresIn: 'Token expiration time',
				issuer: 'Token issuer',
				audience: 'Token audience',
			},
			usageExamples: ['Microservices authentication', 'API gateways', 'Stateless auth'],
		};
	}

	private getAwsTemplate(): CredentialTemplate {
		return {
			name: 'AWS',
			credentialType: 'aws',
			description: 'Amazon Web Services credentials',
			authMethod: 'apiKey',
			requiredFields: ['accessKeyId', 'secretAccessKey'],
			optionalFields: ['region', 'sessionToken'],
			defaultValues: {
				region: 'us-east-1',
			},
			fieldDescriptions: {
				accessKeyId: 'AWS Access Key ID',
				secretAccessKey: 'AWS Secret Access Key',
				region: 'AWS region',
				sessionToken: 'Session token (for temporary credentials)',
			},
			usageExamples: ['AWS Lambda', 'S3 storage', 'DynamoDB', 'SQS queues'],
		};
	}

	private getMongoDbTemplate(): CredentialTemplate {
		return {
			name: 'MongoDB',
			credentialType: 'mongoDb',
			description: 'MongoDB database connection',
			authMethod: 'basic',
			requiredFields: ['host', 'database'],
			optionalFields: ['user', 'password', 'port', 'authSource'],
			defaultValues: {
				port: 27017,
				authSource: 'admin',
			},
			fieldDescriptions: {
				host: 'MongoDB host address',
				database: 'Database name',
				user: 'Username for authentication',
				password: 'Password for authentication',
				port: 'MongoDB port (default: 27017)',
				authSource: 'Authentication database',
			},
			usageExamples: ['NoSQL database operations', 'Document storage', 'Data aggregation'],
		};
	}

	private getPostgresTemplate(): CredentialTemplate {
		return {
			name: 'PostgreSQL',
			credentialType: 'postgres',
			description: 'PostgreSQL database connection',
			authMethod: 'basic',
			requiredFields: ['host', 'database', 'user', 'password'],
			optionalFields: ['port', 'ssl'],
			defaultValues: {
				port: 5432,
				ssl: false,
			},
			fieldDescriptions: {
				host: 'PostgreSQL host address',
				database: 'Database name',
				user: 'Username for authentication',
				password: 'Password for authentication',
				port: 'PostgreSQL port (default: 5432)',
				ssl: 'Use SSL connection',
			},
			usageExamples: ['Relational database queries', 'Data warehousing', 'Transaction management'],
		};
	}

	private getMySqlTemplate(): CredentialTemplate {
		return {
			name: 'MySQL',
			credentialType: 'mysql',
			description: 'MySQL database connection',
			authMethod: 'basic',
			requiredFields: ['host', 'database', 'user', 'password'],
			optionalFields: ['port', 'ssl'],
			defaultValues: {
				port: 3306,
				ssl: false,
			},
			fieldDescriptions: {
				host: 'MySQL host address',
				database: 'Database name',
				user: 'Username for authentication',
				password: 'Password for authentication',
				port: 'MySQL port (default: 3306)',
				ssl: 'Use SSL connection',
			},
			usageExamples: ['Relational database queries', 'Content management', 'E-commerce'],
		};
	}

	private getRedisTemplate(): CredentialTemplate {
		return {
			name: 'Redis',
			credentialType: 'redis',
			description: 'Redis cache connection',
			authMethod: 'basic',
			requiredFields: ['host'],
			optionalFields: ['port', 'password', 'database'],
			defaultValues: {
				port: 6379,
				database: 0,
			},
			fieldDescriptions: {
				host: 'Redis host address',
				port: 'Redis port (default: 6379)',
				password: 'Password for authentication (optional)',
				database: 'Database number (default: 0)',
			},
			usageExamples: ['Caching', 'Session storage', 'Real-time analytics', 'Message queues'],
		};
	}

	/**
	 * Validate credential data against template
	 */
	validateCredentialData(
		template: CredentialTemplate,
		data: Record<string, unknown>,
	): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		// Check required fields
		for (const field of template.requiredFields) {
			if (!data[field]) {
				errors.push(`Missing required field: ${field}`);
			}
		}

		// Validate field types
		for (const [key, value] of Object.entries(data)) {
			if (value === null || value === undefined) continue;

			if (key.toLowerCase().includes('port')) {
				if (typeof value !== 'number' && isNaN(Number(value))) {
					errors.push(`${key} must be a number`);
				}
			}

			if (key.toLowerCase().includes('ssl')) {
				if (typeof value !== 'boolean') {
					errors.push(`${key} must be a boolean`);
				}
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Get setup instructions for a template
	 */
	getSetupInstructions(template: CredentialTemplate): string[] {
		const instructions: string[] = [
			`Setting up ${template.name} authentication`,
			'',
			'Required fields:',
			...template.requiredFields.map(
				(field) => `  - ${field}: ${template.fieldDescriptions[field]}`,
			),
		];

		if (template.optionalFields && template.optionalFields.length > 0) {
			instructions.push('', 'Optional fields:');
			instructions.push(
				...template.optionalFields.map(
					(field) => `  - ${field}: ${template.fieldDescriptions[field]}`,
				),
			);
		}

		if (template.defaultValues) {
			instructions.push('', 'Default values:');
			instructions.push(
				...Object.entries(template.defaultValues).map(([key, value]) => `  - ${key}: ${value}`),
			);
		}

		if (template.usageExamples) {
			instructions.push('', 'Common use cases:');
			instructions.push(...template.usageExamples.map((example) => `  - ${example}`));
		}

		return instructions;
	}
}
