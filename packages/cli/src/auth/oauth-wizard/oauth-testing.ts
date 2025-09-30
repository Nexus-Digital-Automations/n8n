import { Logger } from '@n8n/backend-common';
import type { User } from '@n8n/db';
import { Service } from '@n8n/di';
import type { ICredentialsDecrypted } from 'n8n-workflow';

import { CredentialsService } from '@/credentials/credentials.service';
import { CredentialsTester } from '@/services/credentials-tester.service';

/**
 * OAuth test result
 */
export interface OAuthTestResult {
	/** Whether the test was successful */
	success: boolean;
	/** Test message */
	message: string;
	/** Error details if test failed */
	error?: string;
	/** Test metadata */
	metadata?: {
		/** Whether OAuth token is present */
		hasToken: boolean;
		/** Token expiration timestamp */
		tokenExpiration?: number;
		/** Scopes granted */
		grantedScopes?: string[];
		/** Test timestamp */
		testedAt: number;
	};
}

/**
 * OAuth callback test result
 */
export interface OAuthCallbackTestResult {
	/** Whether the callback URL is valid */
	valid: boolean;
	/** Callback URL */
	callbackUrl: string;
	/** Whether the URL is reachable */
	reachable: boolean;
	/** Status code if reachable */
	statusCode?: number;
	/** Error message if not reachable */
	error?: string;
}

/**
 * OAuth token info
 */
export interface OAuthTokenInfo {
	/** Whether token exists */
	hasToken: boolean;
	/** Whether token is expired */
	isExpired?: boolean;
	/** Token type */
	tokenType?: string;
	/** Expiration timestamp */
	expiresAt?: number;
	/** Time until expiration (ms) */
	expiresIn?: number;
	/** Granted scopes */
	scopes?: string[];
}

/**
 * OAuth Testing Service
 * Provides tools for testing and validating OAuth credentials
 */
@Service()
export class OAuthTesting {
	constructor(
		private readonly logger: Logger,
		private readonly credentialsService: CredentialsService,
		private readonly credentialsTester: CredentialsTester,
	) {}

	/**
	 * Test OAuth credential
	 */
	async testCredential(credentialId: string, user: User): Promise<OAuthTestResult> {
		this.logger.info('Testing OAuth credential', {
			credentialId,
			userId: user.id,
		});

		try {
			// Get credential with decrypted data
			const credential = await this.credentialsService.getOne(user, credentialId, true);

			if (!credential.data) {
				return {
					success: false,
					message: 'Unable to decrypt credential data',
					error: 'Credential data not available',
				};
			}

			// Check if OAuth token exists
			const hasToken = Boolean(credential.data.oauthTokenData);

			if (!hasToken) {
				return {
					success: false,
					message: 'OAuth not connected',
					error: 'No OAuth token found. Please authorize the credential first.',
					metadata: {
						hasToken: false,
						testedAt: Date.now(),
					},
				};
			}

			// Test the credential
			const testResult = await this.credentialsTester.testCredentials(
				user.id,
				credential.type,
				credential as ICredentialsDecrypted,
			);

			if (testResult.status === 'OK') {
				return {
					success: true,
					message: 'OAuth credential is working correctly',
					metadata: {
						hasToken: true,
						testedAt: Date.now(),
					},
				};
			} else {
				return {
					success: false,
					message: 'OAuth credential test failed',
					error: testResult.message,
					metadata: {
						hasToken: true,
						testedAt: Date.now(),
					},
				};
			}
		} catch (error) {
			this.logger.error('OAuth credential test failed', {
				credentialId,
				userId: user.id,
				error: (error as Error).message,
			});

			return {
				success: false,
				message: 'OAuth credential test failed',
				error: (error as Error).message,
				metadata: {
					hasToken: false,
					testedAt: Date.now(),
				},
			};
		}
	}

	/**
	 * Get OAuth token information
	 */
	async getTokenInfo(credentialId: string, user: User): Promise<OAuthTokenInfo> {
		try {
			const credential = await this.credentialsService.getOne(user, credentialId, true);

			if (!credential.data || !credential.data.oauthTokenData) {
				return {
					hasToken: false,
				};
			}

			const tokenData = credential.data.oauthTokenData as Record<string, unknown>;
			const expiresIn = tokenData.expires_in as number | undefined;
			const tokenType = tokenData.token_type as string | undefined;
			const scope = tokenData.scope as string | undefined;

			const info: OAuthTokenInfo = {
				hasToken: true,
				tokenType,
			};

			if (expiresIn !== undefined) {
				const expiresAt = Date.now() + expiresIn * 1000;
				info.expiresAt = expiresAt;
				info.expiresIn = expiresIn * 1000;
				info.isExpired = Date.now() > expiresAt;
			}

			if (scope) {
				info.scopes = scope.split(' ');
			}

			return info;
		} catch (error) {
			this.logger.error('Failed to get token info', {
				credentialId,
				userId: user.id,
				error: (error as Error).message,
			});

			return {
				hasToken: false,
			};
		}
	}

	/**
	 * Validate OAuth callback URL
	 */
	async validateCallbackUrl(baseUrl: string): Promise<OAuthCallbackTestResult> {
		const callbackUrl = `${baseUrl}/rest/oauth2-credential/callback`;

		try {
			// Try to reach the callback URL
			const response = await fetch(callbackUrl, {
				method: 'GET',
				redirect: 'manual',
			});

			return {
				valid: true,
				callbackUrl,
				reachable: true,
				statusCode: response.status,
			};
		} catch (error) {
			this.logger.warn('OAuth callback URL not reachable', {
				callbackUrl,
				error: (error as Error).message,
			});

			return {
				valid: true,
				callbackUrl,
				reachable: false,
				error: (error as Error).message,
			};
		}
	}

	/**
	 * Check if credential needs reauthorization
	 */
	async needsReauthorization(credentialId: string, user: User): Promise<boolean> {
		const tokenInfo = await this.getTokenInfo(credentialId, user);

		// Need reauth if no token exists
		if (!tokenInfo.hasToken) {
			return true;
		}

		// Need reauth if token is expired
		if (tokenInfo.isExpired) {
			return true;
		}

		// Try to test the credential
		const testResult = await this.testCredential(credentialId, user);

		// Need reauth if test failed
		return !testResult.success;
	}

	/**
	 * Get OAuth connection status
	 */
	async getConnectionStatus(
		credentialId: string,
		user: User,
	): Promise<{
		connected: boolean;
		status: 'connected' | 'disconnected' | 'expired' | 'invalid';
		message: string;
		tokenInfo?: OAuthTokenInfo;
	}> {
		const tokenInfo = await this.getTokenInfo(credentialId, user);

		if (!tokenInfo.hasToken) {
			return {
				connected: false,
				status: 'disconnected',
				message: 'OAuth not connected. Please authorize the credential.',
			};
		}

		if (tokenInfo.isExpired) {
			return {
				connected: false,
				status: 'expired',
				message: 'OAuth token has expired. Please reauthorize the credential.',
				tokenInfo,
			};
		}

		const testResult = await this.testCredential(credentialId, user);

		if (testResult.success) {
			return {
				connected: true,
				status: 'connected',
				message: 'OAuth credential is connected and working.',
				tokenInfo,
			};
		} else {
			return {
				connected: false,
				status: 'invalid',
				message: 'OAuth credential test failed. Please check your configuration.',
				tokenInfo,
			};
		}
	}

	/**
	 * Bulk test multiple OAuth credentials
	 */
	async bulkTestCredentials(
		credentialIds: string[],
		user: User,
	): Promise<Map<string, OAuthTestResult>> {
		const results = new Map<string, OAuthTestResult>();

		await Promise.all(
			credentialIds.map(async (credentialId) => {
				const result = await this.testCredential(credentialId, user);
				results.set(credentialId, result);
			}),
		);

		return results;
	}

	/**
	 * Get OAuth health metrics
	 */
	async getHealthMetrics(
		credentialIds: string[],
		user: User,
	): Promise<{
		total: number;
		connected: number;
		disconnected: number;
		expired: number;
		invalid: number;
		healthScore: number;
	}> {
		const statuses = await Promise.all(
			credentialIds.map(async (id) => {
				const status = await this.getConnectionStatus(id, user);
				return status.status;
			}),
		);

		const metrics = {
			total: statuses.length,
			connected: statuses.filter((s) => s === 'connected').length,
			disconnected: statuses.filter((s) => s === 'disconnected').length,
			expired: statuses.filter((s) => s === 'expired').length,
			invalid: statuses.filter((s) => s === 'invalid').length,
			healthScore: 0,
		};

		// Calculate health score (0-100)
		if (metrics.total > 0) {
			metrics.healthScore = Math.round((metrics.connected / metrics.total) * 100);
		}

		return metrics;
	}

	/**
	 * Validate OAuth scopes
	 */
	validateScopes(
		requestedScopes: string[],
		grantedScopes: string[],
	): {
		valid: boolean;
		missing: string[];
		extra: string[];
	} {
		const missing = requestedScopes.filter((scope) => !grantedScopes.includes(scope));
		const extra = grantedScopes.filter((scope) => !requestedScopes.includes(scope));

		return {
			valid: missing.length === 0,
			missing,
			extra,
		};
	}

	/**
	 * Generate OAuth test report
	 */
	async generateTestReport(credentialId: string, user: User): Promise<string> {
		const testResult = await this.testCredential(credentialId, user);
		const tokenInfo = await this.getTokenInfo(credentialId, user);
		const connectionStatus = await this.getConnectionStatus(credentialId, user);

		const report = [];
		report.push('=== OAuth Credential Test Report ===\n');
		report.push(`Credential ID: ${credentialId}`);
		report.push(`Test Time: ${new Date().toISOString()}\n`);

		report.push('Connection Status:');
		report.push(`  Status: ${connectionStatus.status}`);
		report.push(`  Message: ${connectionStatus.message}\n`);

		report.push('Test Result:');
		report.push(`  Success: ${testResult.success}`);
		report.push(`  Message: ${testResult.message}`);
		if (testResult.error) {
			report.push(`  Error: ${testResult.error}`);
		}
		report.push('');

		report.push('Token Information:');
		report.push(`  Has Token: ${tokenInfo.hasToken}`);
		if (tokenInfo.hasToken) {
			report.push(`  Token Type: ${tokenInfo.tokenType ?? 'N/A'}`);
			report.push(`  Expired: ${tokenInfo.isExpired ?? 'N/A'}`);
			if (tokenInfo.expiresAt) {
				report.push(`  Expires At: ${new Date(tokenInfo.expiresAt).toISOString()}`);
			}
			if (tokenInfo.scopes) {
				report.push(`  Scopes: ${tokenInfo.scopes.join(', ')}`);
			}
		}

		return report.join('\n');
	}
}
