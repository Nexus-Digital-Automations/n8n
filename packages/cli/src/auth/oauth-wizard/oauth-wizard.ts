import { Logger } from '@n8n/backend-common';
import type { User, CredentialsEntity } from '@n8n/db';
import { Service } from '@n8n/di';
import type { ICredentialDataDecryptedObject } from 'n8n-workflow';

import { CredentialsService } from '@/credentials/credentials.service';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';

import type { OAuthProviderTemplate } from './oauth-templates';
import { OAuthTemplates } from './oauth-templates';

/**
 * OAuth wizard setup request
 */
export interface OAuthWizardSetupRequest {
	/** Provider name or credential type */
	provider: string;
	/** Credential name */
	name: string;
	/** OAuth client ID */
	clientId: string;
	/** OAuth client secret */
	clientSecret: string;
	/** Custom scopes (optional, uses defaults if not provided) */
	scopes?: string[];
	/** Project ID to associate credential with */
	projectId?: string;
	/** Additional provider-specific parameters */
	additionalParams?: Record<string, string>;
}

/**
 * OAuth wizard setup response
 */
export interface OAuthWizardSetupResponse {
	/** Created credential */
	credential: CredentialsEntity & { scopes: string[] };
	/** OAuth authorization URL */
	authorizationUrl?: string;
	/** Setup instructions */
	instructions: string[];
	/** Next steps */
	nextSteps: string[];
}

/**
 * OAuth provider info
 */
export interface OAuthProviderInfo {
	/** Provider name */
	name: string;
	/** Credential type */
	credentialType: string;
	/** Description */
	description: string;
	/** Default scopes */
	defaultScopes: string[];
	/** Optional scopes */
	optionalScopes?: string[];
	/** Setup requirements */
	requirements: string[];
	/** Documentation URL */
	documentationUrl?: string;
}

/**
 * OAuth Wizard Service
 * Simplifies OAuth setup for popular applications
 */
@Service()
export class OAuthWizard {
	constructor(
		private readonly logger: Logger,
		private readonly oauthTemplates: OAuthTemplates,
		private readonly credentialsService: CredentialsService,
	) {}

	/**
	 * Get all available OAuth providers
	 */
	getAvailableProviders(): OAuthProviderInfo[] {
		return this.oauthTemplates.getAllTemplates().map((template) => ({
			name: template.name,
			credentialType: template.credentialType,
			description: template.description,
			defaultScopes: template.defaultScopes,
			optionalScopes: template.optionalScopes,
			requirements: this.getProviderRequirements(template),
			documentationUrl: this.getProviderDocumentationUrl(template.name),
		}));
	}

	/**
	 * Get OAuth provider details
	 */
	getProviderDetails(providerNameOrType: string): OAuthProviderInfo | null {
		const template =
			this.oauthTemplates.getTemplateByName(providerNameOrType) ??
			this.oauthTemplates.getTemplateByType(providerNameOrType);

		if (!template) {
			return null;
		}

		return {
			name: template.name,
			credentialType: template.credentialType,
			description: template.description,
			defaultScopes: template.defaultScopes,
			optionalScopes: template.optionalScopes,
			requirements: this.getProviderRequirements(template),
			documentationUrl: this.getProviderDocumentationUrl(template.name),
		};
	}

	/**
	 * Quick setup OAuth credential
	 */
	async quickSetup(
		request: OAuthWizardSetupRequest,
		user: User,
	): Promise<OAuthWizardSetupResponse> {
		this.logger.info('Starting OAuth quick setup', {
			provider: request.provider,
			userId: user.id,
		});

		// Get provider template
		const template =
			this.oauthTemplates.getTemplateByName(request.provider) ??
			this.oauthTemplates.getTemplateByType(request.provider);

		if (!template) {
			throw new BadRequestError(`OAuth provider '${request.provider}' not found`);
		}

		// Create credential data from template
		const credentialData = this.oauthTemplates.createCredentialData(
			template,
			request.clientId,
			request.clientSecret,
			request.scopes,
			request.additionalParams,
		);

		// Validate configuration
		const validation = this.oauthTemplates.validateConfiguration(credentialData);
		if (!validation.valid) {
			throw new BadRequestError(`Invalid OAuth configuration: ${validation.errors.join(', ')}`);
		}

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

		this.logger.info('OAuth credential created successfully', {
			credentialId: credential.id,
			provider: template.name,
			userId: user.id,
		});

		return {
			credential,
			instructions: this.getSetupInstructions(template),
			nextSteps: this.getNextSteps(template),
		};
	}

	/**
	 * Get scope recommendations for a provider
	 */
	getScopeRecommendations(providerNameOrType: string): {
		minimal: string[];
		standard: string[];
		full: string[];
		descriptions: Record<string, string>;
	} {
		const template =
			this.oauthTemplates.getTemplateByName(providerNameOrType) ??
			this.oauthTemplates.getTemplateByType(providerNameOrType);

		if (!template) {
			return { minimal: [], standard: [], full: [], descriptions: {} };
		}

		const recommendations = this.oauthTemplates.getScopeRecommendations(template.credentialType);

		return {
			...recommendations,
			descriptions: this.getScopeDescriptions(template.name),
		};
	}

	/**
	 * Validate OAuth credential setup
	 */
	async validateSetup(
		credentialId: string,
		user: User,
	): Promise<{
		valid: boolean;
		errors: string[];
		warnings: string[];
	}> {
		const credential = await this.credentialsService.getOne(user, credentialId, true);

		if (!credential.data) {
			return {
				valid: false,
				errors: ['Unable to decrypt credential data'],
				warnings: [],
			};
		}

		const validation = this.oauthTemplates.validateConfiguration(
			credential.data as ICredentialDataDecryptedObject,
		);

		const warnings: string[] = [];

		// Check for common issues
		if (credential.data.oauthTokenData) {
			warnings.push('OAuth token data present - credential may need reconnection');
		}

		return {
			valid: validation.valid,
			errors: validation.errors,
			warnings,
		};
	}

	/**
	 * Get setup instructions for a provider
	 */
	private getSetupInstructions(template: OAuthProviderTemplate): string[] {
		const instructions: string[] = [
			`Go to the ${template.name} developer console`,
			'Create a new OAuth application',
			'Copy the Client ID and Client Secret',
			'Set the redirect URL in your OAuth app settings',
			'Add the required scopes to your OAuth app',
		];

		// Add provider-specific instructions
		switch (template.name) {
			case 'Google Sheets':
			case 'Google Drive':
			case 'Gmail':
				instructions.push('Enable the relevant Google API in the Google Cloud Console');
				break;
			case 'Slack':
				instructions.push('Install the app to your Slack workspace');
				break;
			case 'GitHub':
				instructions.push('Generate OAuth app credentials in your GitHub settings');
				break;
			case 'Notion':
				instructions.push('Create an integration in your Notion workspace settings');
				break;
		}

		return instructions;
	}

	/**
	 * Get next steps after setup
	 */
	private getNextSteps(template: OAuthProviderTemplate): string[] {
		return [
			'Click the "Connect" button to authorize the application',
			`Grant the requested permissions for ${template.name}`,
			'You will be redirected back to n8n',
			'Test the credential to ensure it works correctly',
			'Start using the credential in your workflows',
		];
	}

	/**
	 * Get provider requirements
	 */
	private getProviderRequirements(template: OAuthProviderTemplate): string[] {
		const requirements: string[] = ['OAuth Client ID', 'OAuth Client Secret'];

		if (template.usePKCE) {
			requirements.push('PKCE support enabled');
		}

		if (template.defaultScopes.length > 0) {
			requirements.push(`Scopes: ${template.defaultScopes.join(', ')}`);
		}

		return requirements;
	}

	/**
	 * Get documentation URL for a provider
	 */
	private getProviderDocumentationUrl(providerName: string): string {
		const docUrls: Record<string, string> = {
			'Google Sheets': 'https://developers.google.com/sheets/api/guides/authorizing',
			Trello: 'https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/',
			Slack: 'https://api.slack.com/authentication/oauth-v2',
			GitHub: 'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps',
			Notion: 'https://developers.notion.com/docs/authorization',
			Airtable: 'https://airtable.com/developers/web/api/oauth-reference',
			'Google Drive': 'https://developers.google.com/drive/api/guides/about-auth',
			Gmail: 'https://developers.google.com/gmail/api/auth/about-auth',
			'Microsoft Teams':
				'https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/authentication/auth-oauth-card',
			Dropbox: 'https://developers.dropbox.com/oauth-guide',
			HubSpot: 'https://developers.hubspot.com/docs/api/oauth-quickstart-guide',
			Asana: 'https://developers.asana.com/docs/oauth',
		};

		return docUrls[providerName] ?? '';
	}

	/**
	 * Get scope descriptions for a provider
	 */
	private getScopeDescriptions(providerName: string): Record<string, string> {
		const descriptions: Record<string, Record<string, string>> = {
			'Google Sheets': {
				'https://www.googleapis.com/auth/spreadsheets':
					'Full access to spreadsheets (read and write)',
				'https://www.googleapis.com/auth/drive.metadata.readonly': 'View metadata for Drive files',
				'https://www.googleapis.com/auth/drive.file': 'Access files created by this app',
			},
			Slack: {
				'channels:read': 'View basic channel information',
				'channels:write': 'Manage public channels',
				'chat:write': 'Send messages',
				'users:read': 'View users in workspace',
				'files:write': 'Upload files',
			},
			GitHub: {
				repo: 'Full control of private repositories',
				user: 'Read and write all user profile data',
				'read:org': 'Read organization data',
			},
		};

		return descriptions[providerName] ?? {};
	}

	/**
	 * Generate redirect URL for OAuth callback
	 */
	getRedirectUrl(baseUrl: string, credentialType: string): string {
		return `${baseUrl}/rest/oauth2-credential/callback`;
	}

	/**
	 * Get provider-specific setup tips
	 */
	getProviderSetupTips(providerNameOrType: string): string[] {
		const tips: Record<string, string[]> = {
			'Google Sheets': [
				'Make sure to enable the Google Sheets API in your Google Cloud project',
				'Set the OAuth consent screen to "External" for public access',
				'Add test users if your app is not published',
			],
			Slack: [
				'Use Bot Token Scopes for bot functionality',
				'User Token Scopes are needed for actions on behalf of users',
				'Some scopes require workspace admin approval',
			],
			GitHub: [
				'Personal access tokens are simpler for personal use',
				'OAuth apps are better for public applications',
				'GitHub Apps provide more granular permissions',
			],
			Notion: [
				'Internal integrations are easier to set up',
				'Public integrations require OAuth approval',
				'Request only the capabilities you need',
			],
		};

		const template =
			this.oauthTemplates.getTemplateByName(providerNameOrType) ??
			this.oauthTemplates.getTemplateByType(providerNameOrType);

		return tips[template?.name ?? ''] ?? [];
	}
}
