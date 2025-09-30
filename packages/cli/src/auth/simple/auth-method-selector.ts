import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';

/**
 * Authentication method type
 */
export type AuthMethod =
	| 'oauth2'
	| 'basic'
	| 'apiKey'
	| 'jwt'
	| 'bearerToken'
	| 'digest'
	| 'ntlm'
	| 'none';

/**
 * Authentication method information
 */
export interface AuthMethodInfo {
	/** Method identifier */
	method: AuthMethod;
	/** Display name */
	name: string;
	/** Description */
	description: string;
	/** Security level (1-5, 5 being most secure) */
	securityLevel: number;
	/** Complexity (1-5, 5 being most complex) */
	complexity: number;
	/** Common use cases */
	useCases: string[];
	/** Advantages */
	advantages: string[];
	/** Disadvantages */
	disadvantages: string[];
	/** Required fields */
	requiredFields: string[];
	/** Recommended for */
	recommendedFor: string[];
}

/**
 * Authentication recommendation
 */
export interface AuthRecommendation {
	/** Recommended method */
	method: AuthMethod;
	/** Recommendation score (0-100) */
	score: number;
	/** Reason for recommendation */
	reason: string;
	/** Alternative methods */
	alternatives: AuthMethod[];
}

/**
 * Use case type
 */
export type UseCase =
	| 'web-api'
	| 'microservices'
	| 'mobile-app'
	| 'desktop-app'
	| 'iot'
	| 'legacy-system'
	| 'internal-service'
	| 'public-api'
	| 'third-party-integration';

/**
 * Authentication Method Selector
 * Provides helpers for selecting and comparing authentication methods
 */
@Service()
export class AuthMethodSelector {
	constructor(private readonly logger: Logger) {}

	/**
	 * Get all authentication methods
	 */
	getAllMethods(): AuthMethodInfo[] {
		return [
			this.getOAuth2Info(),
			this.getBasicAuthInfo(),
			this.getApiKeyInfo(),
			this.getJwtInfo(),
			this.getBearerTokenInfo(),
			this.getDigestAuthInfo(),
			this.getNtlmInfo(),
			this.getNoAuthInfo(),
		];
	}

	/**
	 * Get method information
	 */
	getMethodInfo(method: AuthMethod): AuthMethodInfo | null {
		return this.getAllMethods().find((m) => m.method === method) ?? null;
	}

	/**
	 * Recommend authentication method based on use case
	 */
	recommendMethod(useCase: UseCase): AuthRecommendation {
		const recommendations: Record<UseCase, AuthRecommendation> = {
			'web-api': {
				method: 'oauth2',
				score: 95,
				reason:
					'OAuth 2.0 is the industry standard for web APIs, providing secure delegated access',
				alternatives: ['apiKey', 'jwt'],
			},
			microservices: {
				method: 'jwt',
				score: 95,
				reason:
					'JWT is ideal for microservices with stateless authentication and service-to-service communication',
				alternatives: ['apiKey', 'oauth2'],
			},
			'mobile-app': {
				method: 'oauth2',
				score: 90,
				reason: 'OAuth 2.0 with PKCE provides secure authentication for mobile applications',
				alternatives: ['jwt', 'bearerToken'],
			},
			'desktop-app': {
				method: 'oauth2',
				score: 85,
				reason: 'OAuth 2.0 enables secure authentication without storing credentials locally',
				alternatives: ['jwt', 'apiKey'],
			},
			iot: {
				method: 'apiKey',
				score: 90,
				reason: 'API keys are simple and efficient for IoT devices with limited resources',
				alternatives: ['jwt', 'bearerToken'],
			},
			'legacy-system': {
				method: 'basic',
				score: 75,
				reason: 'Basic Auth is widely supported by legacy systems and simple to implement',
				alternatives: ['digest', 'ntlm'],
			},
			'internal-service': {
				method: 'apiKey',
				score: 85,
				reason: 'API keys provide simple and efficient authentication for internal services',
				alternatives: ['jwt', 'basic'],
			},
			'public-api': {
				method: 'oauth2',
				score: 95,
				reason: 'OAuth 2.0 is the best choice for public APIs requiring user authorization',
				alternatives: ['apiKey', 'jwt'],
			},
			'third-party-integration': {
				method: 'oauth2',
				score: 90,
				reason: 'OAuth 2.0 enables secure integration with third-party services',
				alternatives: ['apiKey', 'bearerToken'],
			},
		};

		return recommendations[useCase];
	}

	/**
	 * Compare authentication methods
	 */
	compareMethods(methods: AuthMethod[]): Array<{
		method: AuthMethod;
		info: AuthMethodInfo;
		score: number;
	}> {
		return methods
			.map((method) => {
				const info = this.getMethodInfo(method);
				if (!info) return null;

				// Calculate overall score
				const score = Math.round((info.securityLevel * 0.6 + (6 - info.complexity) * 0.4) * 20);

				return { method, info, score };
			})
			.filter((item): item is { method: AuthMethod; info: AuthMethodInfo; score: number } =>
				Boolean(item),
			)
			.sort((a, b) => b.score - a.score);
	}

	/**
	 * Get methods by security level
	 */
	getMethodsBySecurityLevel(minLevel: number): AuthMethodInfo[] {
		return this.getAllMethods()
			.filter((m) => m.securityLevel >= minLevel)
			.sort((a, b) => b.securityLevel - a.securityLevel);
	}

	/**
	 * Get methods by complexity
	 */
	getMethodsByComplexity(maxComplexity: number): AuthMethodInfo[] {
		return this.getAllMethods()
			.filter((m) => m.complexity <= maxComplexity)
			.sort((a, b) => a.complexity - b.complexity);
	}

	/**
	 * Find best method for requirements
	 */
	findBestMethod(requirements: {
		minSecurityLevel?: number;
		maxComplexity?: number;
		mustSupport?: string[];
		useCase?: UseCase;
	}): AuthRecommendation {
		let candidates = this.getAllMethods();

		// Filter by security level
		if (requirements.minSecurityLevel) {
			candidates = candidates.filter((m) => m.securityLevel >= requirements.minSecurityLevel);
		}

		// Filter by complexity
		if (requirements.maxComplexity) {
			candidates = candidates.filter((m) => m.complexity <= requirements.maxComplexity);
		}

		// Filter by required fields
		if (requirements.mustSupport) {
			candidates = candidates.filter((m) =>
				requirements.mustSupport!.every((field) => m.requiredFields.includes(field)),
			);
		}

		if (candidates.length === 0) {
			return {
				method: 'oauth2',
				score: 50,
				reason: 'No perfect match found. OAuth 2.0 is the safest general choice.',
				alternatives: ['jwt', 'apiKey'],
			};
		}

		// Score candidates
		const scored = candidates.map((m) => {
			let score = m.securityLevel * 15 + (6 - m.complexity) * 10;

			// Bonus for use case match
			if (requirements.useCase && m.useCases.includes(requirements.useCase)) {
				score += 20;
			}

			return { method: m.method, score };
		});

		scored.sort((a, b) => b.score - a.score);

		const best = scored[0];
		const alternatives = scored.slice(1, 4).map((s) => s.method);

		return {
			method: best.method,
			score: Math.min(best.score, 100),
			reason: 'Best match for your requirements with security level and complexity balance',
			alternatives,
		};
	}

	// Method Information

	private getOAuth2Info(): AuthMethodInfo {
		return {
			method: 'oauth2',
			name: 'OAuth 2.0',
			description:
				'Industry standard for delegated authorization, allowing third-party access without sharing credentials',
			securityLevel: 5,
			complexity: 4,
			useCases: ['web-api', 'public-api', 'third-party-integration', 'mobile-app'],
			advantages: [
				'Industry standard',
				'Delegated access without sharing credentials',
				'Token-based with refresh capability',
				'Granular permissions via scopes',
				'Widely supported',
			],
			disadvantages: [
				'Complex setup',
				'Requires OAuth provider',
				'More moving parts',
				'Callback URLs needed',
			],
			requiredFields: ['clientId', 'clientSecret', 'authUrl', 'accessTokenUrl'],
			recommendedFor: ['Public APIs', 'Third-party integrations', 'Mobile/web apps'],
		};
	}

	private getBasicAuthInfo(): AuthMethodInfo {
		return {
			method: 'basic',
			name: 'Basic Authentication',
			description:
				'Simple username and password authentication with Base64 encoding (username:password)',
			securityLevel: 2,
			complexity: 1,
			useCases: ['legacy-system', 'internal-service', 'simple-api'],
			advantages: [
				'Very simple to implement',
				'Widely supported',
				'No additional dependencies',
				'Works with any HTTP client',
			],
			disadvantages: [
				'Credentials sent with every request',
				'Base64 is not encryption',
				'No token refresh',
				'Requires HTTPS',
			],
			requiredFields: ['username', 'password'],
			recommendedFor: ['Legacy systems', 'Internal services', 'Simple APIs'],
		};
	}

	private getApiKeyInfo(): AuthMethodInfo {
		return {
			method: 'apiKey',
			name: 'API Key',
			description: 'Simple token-based authentication using a pre-shared key',
			securityLevel: 3,
			complexity: 1,
			useCases: ['web-api', 'internal-service', 'iot', 'microservices'],
			advantages: [
				'Simple to implement',
				'Easy to manage',
				'Low overhead',
				'Good for service-to-service',
				'Easy rotation',
			],
			disadvantages: [
				'No built-in expiration',
				'No user context',
				'Single point of failure if leaked',
				'Manual rotation needed',
			],
			requiredFields: ['apiKey'],
			recommendedFor: ['Internal APIs', 'IoT devices', 'Service-to-service'],
		};
	}

	private getJwtInfo(): AuthMethodInfo {
		return {
			method: 'jwt',
			name: 'JWT (JSON Web Token)',
			description: 'Stateless token-based authentication with claims and signatures',
			securityLevel: 4,
			complexity: 3,
			useCases: ['microservices', 'web-api', 'mobile-app', 'desktop-app'],
			advantages: [
				'Stateless authentication',
				'Contains user context',
				'Self-contained',
				'Supports expiration',
				'Good for microservices',
			],
			disadvantages: [
				'Larger payload',
				'Cannot revoke easily',
				'Requires careful secret management',
				'More complex than API keys',
			],
			requiredFields: ['secret', 'algorithm'],
			recommendedFor: ['Microservices', 'Stateless systems', 'Distributed systems'],
		};
	}

	private getBearerTokenInfo(): AuthMethodInfo {
		return {
			method: 'bearerToken',
			name: 'Bearer Token',
			description: 'Token-based authentication using Authorization: Bearer <token> header',
			securityLevel: 3,
			complexity: 1,
			useCases: ['web-api', 'mobile-app', 'third-party-integration'],
			advantages: [
				'Simple to implement',
				'Standard header format',
				'Works with OAuth tokens',
				'Widely supported',
			],
			disadvantages: [
				'Token must be managed elsewhere',
				'No built-in refresh',
				'Requires secure storage',
			],
			requiredFields: ['token'],
			recommendedFor: ['APIs with external token management', 'OAuth access tokens'],
		};
	}

	private getDigestAuthInfo(): AuthMethodInfo {
		return {
			method: 'digest',
			name: 'Digest Authentication',
			description: 'More secure than Basic Auth, using MD5 hashing to avoid sending passwords',
			securityLevel: 3,
			complexity: 2,
			useCases: ['legacy-system', 'internal-service'],
			advantages: [
				'More secure than Basic Auth',
				'Prevents replay attacks',
				'No password transmission',
				'Widely supported in legacy systems',
			],
			disadvantages: [
				'MD5 is considered weak',
				'More complex than Basic Auth',
				'Still requires HTTPS',
				'Limited modern support',
			],
			requiredFields: ['username', 'password', 'realm'],
			recommendedFor: ['Legacy systems requiring better security than Basic Auth'],
		};
	}

	private getNtlmInfo(): AuthMethodInfo {
		return {
			method: 'ntlm',
			name: 'NTLM Authentication',
			description: 'Windows-based authentication protocol for Active Directory integration',
			securityLevel: 3,
			complexity: 4,
			useCases: ['legacy-system', 'internal-service'],
			advantages: [
				'Windows integration',
				'Active Directory support',
				'Single sign-on capability',
				'Enterprise environment support',
			],
			disadvantages: [
				'Windows-specific',
				'Complex setup',
				'Limited cross-platform support',
				'Deprecated in favor of Kerberos',
			],
			requiredFields: ['username', 'password', 'domain'],
			recommendedFor: ['Windows environments', 'Active Directory systems'],
		};
	}

	private getNoAuthInfo(): AuthMethodInfo {
		return {
			method: 'none',
			name: 'No Authentication',
			description: 'No authentication required (public endpoints)',
			securityLevel: 0,
			complexity: 0,
			useCases: ['public-api'],
			advantages: ['No setup required', 'Maximum simplicity', 'Good for public data'],
			disadvantages: [
				'No security',
				'Anyone can access',
				'No rate limiting per user',
				'No access control',
			],
			requiredFields: [],
			recommendedFor: ['Public endpoints', 'Health checks', 'Public documentation'],
		};
	}

	/**
	 * Get method selection wizard
	 */
	getSelectionWizard(): {
		questions: Array<{
			id: string;
			question: string;
			options: Array<{ value: string; label: string; score: Record<AuthMethod, number> }>;
		}>;
	} {
		return {
			questions: [
				{
					id: 'use-case',
					question: 'What is your primary use case?',
					options: [
						{
							value: 'public-api',
							label: 'Public API for third-party developers',
							score: {
								oauth2: 10,
								basic: 2,
								apiKey: 7,
								jwt: 8,
								bearerToken: 6,
								digest: 1,
								ntlm: 0,
								none: 0,
							},
						},
						{
							value: 'internal-service',
							label: 'Internal service communication',
							score: {
								oauth2: 5,
								basic: 7,
								apiKey: 9,
								jwt: 10,
								bearerToken: 6,
								digest: 3,
								ntlm: 2,
								none: 1,
							},
						},
						{
							value: 'mobile-app',
							label: 'Mobile application',
							score: {
								oauth2: 10,
								basic: 3,
								apiKey: 5,
								jwt: 9,
								bearerToken: 7,
								digest: 1,
								ntlm: 0,
								none: 0,
							},
						},
						{
							value: 'legacy-system',
							label: 'Legacy system integration',
							score: {
								oauth2: 3,
								basic: 9,
								apiKey: 6,
								jwt: 4,
								bearerToken: 5,
								digest: 8,
								ntlm: 7,
								none: 1,
							},
						},
					],
				},
				{
					id: 'security-level',
					question: 'What security level do you need?',
					options: [
						{
							value: 'high',
							label: 'High security (financial, healthcare)',
							score: {
								oauth2: 10,
								basic: 1,
								apiKey: 4,
								jwt: 9,
								bearerToken: 5,
								digest: 3,
								ntlm: 3,
								none: 0,
							},
						},
						{
							value: 'medium',
							label: 'Medium security (business applications)',
							score: {
								oauth2: 8,
								basic: 5,
								apiKey: 8,
								jwt: 9,
								bearerToken: 7,
								digest: 6,
								ntlm: 4,
								none: 0,
							},
						},
						{
							value: 'low',
							label: 'Low security (public data)',
							score: {
								oauth2: 5,
								basic: 8,
								apiKey: 9,
								jwt: 6,
								bearerToken: 7,
								digest: 5,
								ntlm: 3,
								none: 10,
							},
						},
					],
				},
				{
					id: 'complexity',
					question: 'How much complexity can you handle?',
					options: [
						{
							value: 'simple',
							label: 'Keep it simple',
							score: {
								oauth2: 2,
								basic: 10,
								apiKey: 10,
								jwt: 5,
								bearerToken: 9,
								digest: 6,
								ntlm: 1,
								none: 10,
							},
						},
						{
							value: 'moderate',
							label: 'Moderate complexity is fine',
							score: {
								oauth2: 7,
								basic: 7,
								apiKey: 8,
								jwt: 9,
								bearerToken: 8,
								digest: 7,
								ntlm: 4,
								none: 5,
							},
						},
						{
							value: 'complex',
							label: 'I can handle complexity',
							score: {
								oauth2: 10,
								basic: 5,
								apiKey: 6,
								jwt: 10,
								bearerToken: 6,
								digest: 7,
								ntlm: 9,
								none: 1,
							},
						},
					],
				},
			],
		};
	}
}
