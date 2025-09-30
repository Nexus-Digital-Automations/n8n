import type { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import type { ICredentialDataDecryptedObject } from 'n8n-workflow';

/**
 * OAuth provider configuration template
 */
export interface OAuthProviderTemplate {
	/** Provider name (e.g., 'Google', 'GitHub') */
	name: string;
	/** Provider identifier (e.g., 'googleSheetsOAuth2Api') */
	credentialType: string;
	/** Human-readable description */
	description: string;
	/** Authorization URL */
	authUrl: string;
	/** Access token URL */
	accessTokenUrl: string;
	/** Default scopes for standard use cases */
	defaultScopes: string[];
	/** Optional scopes for advanced use cases */
	optionalScopes?: string[];
	/** OAuth grant type */
	grantType: 'authorizationCode' | 'pkce';
	/** Authentication method */
	authenticationType: 'header' | 'body';
	/** Client authentication method */
	authentication: 'header' | 'body';
	/** Whether to use PKCE */
	usePKCE?: boolean;
	/** Additional configuration parameters */
	additionalParams?: Record<string, string>;
}

/**
 * Pre-configured OAuth templates for popular services
 */
@Service()
export class OAuthTemplates {
	constructor(private readonly logger: Logger) {}

	/**
	 * Get all available OAuth provider templates
	 */
	getAllTemplates(): OAuthProviderTemplate[] {
		return [
			this.getGoogleSheetsTemplate(),
			this.getTrelloTemplate(),
			this.getSlackTemplate(),
			this.getGitHubTemplate(),
			this.getNotionTemplate(),
			this.getAirtableTemplate(),
			this.getGoogleDriveTemplate(),
			this.getGmailTemplate(),
			this.getMicrosoftTeamsTemplate(),
			this.getDropboxTemplate(),
			this.getHubSpotTemplate(),
			this.getAsanaTemplate(),
		];
	}

	/**
	 * Get template by credential type
	 */
	getTemplateByType(credentialType: string): OAuthProviderTemplate | undefined {
		return this.getAllTemplates().find((template) => template.credentialType === credentialType);
	}

	/**
	 * Get template by provider name
	 */
	getTemplateByName(name: string): OAuthProviderTemplate | undefined {
		return this.getAllTemplates().find(
			(template) => template.name.toLowerCase() === name.toLowerCase(),
		);
	}

	/**
	 * Create credential data from template
	 */
	createCredentialData(
		template: OAuthProviderTemplate,
		clientId: string,
		clientSecret: string,
		scopes?: string[],
		additionalData?: Record<string, string>,
	): ICredentialDataDecryptedObject {
		const data: ICredentialDataDecryptedObject = {
			clientId,
			clientSecret,
			authUrl: template.authUrl,
			accessTokenUrl: template.accessTokenUrl,
			scope: (scopes ?? template.defaultScopes).join(' '),
			grantType: template.grantType,
			authenticationType: template.authenticationType,
			authentication: template.authentication,
			...template.additionalParams,
			...additionalData,
		};

		if (template.usePKCE) {
			data.usePKCE = true;
		}

		return data;
	}

	// Provider Templates

	private getGoogleSheetsTemplate(): OAuthProviderTemplate {
		return {
			name: 'Google Sheets',
			credentialType: 'googleSheetsOAuth2Api',
			description: 'Access and manage Google Sheets spreadsheets',
			authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
			accessTokenUrl: 'https://oauth2.googleapis.com/token',
			defaultScopes: [
				'https://www.googleapis.com/auth/spreadsheets',
				'https://www.googleapis.com/auth/drive.metadata.readonly',
			],
			optionalScopes: ['https://www.googleapis.com/auth/drive.file'],
			grantType: 'authorizationCode',
			authenticationType: 'body',
			authentication: 'body',
			additionalParams: {
				access_type: 'offline',
				prompt: 'consent',
			},
		};
	}

	private getTrelloTemplate(): OAuthProviderTemplate {
		return {
			name: 'Trello',
			credentialType: 'trelloOAuth2Api',
			description: 'Manage Trello boards, lists, and cards',
			authUrl: 'https://trello.com/1/authorize',
			accessTokenUrl: 'https://trello.com/1/OAuthGetAccessToken',
			defaultScopes: ['read', 'write'],
			optionalScopes: ['account'],
			grantType: 'authorizationCode',
			authenticationType: 'body',
			authentication: 'body',
			additionalParams: {
				expiration: 'never',
			},
		};
	}

	private getSlackTemplate(): OAuthProviderTemplate {
		return {
			name: 'Slack',
			credentialType: 'slackOAuth2Api',
			description: 'Send messages and manage Slack workspace',
			authUrl: 'https://slack.com/oauth/v2/authorize',
			accessTokenUrl: 'https://slack.com/api/oauth.v2.access',
			defaultScopes: ['channels:read', 'channels:write', 'chat:write', 'users:read', 'files:write'],
			optionalScopes: [
				'channels:history',
				'channels:manage',
				'chat:write.customize',
				'users:read.email',
			],
			grantType: 'authorizationCode',
			authenticationType: 'body',
			authentication: 'body',
		};
	}

	private getGitHubTemplate(): OAuthProviderTemplate {
		return {
			name: 'GitHub',
			credentialType: 'githubOAuth2Api',
			description: 'Access GitHub repositories and manage issues',
			authUrl: 'https://github.com/login/oauth/authorize',
			accessTokenUrl: 'https://github.com/login/oauth/access_token',
			defaultScopes: ['repo', 'user', 'read:org'],
			optionalScopes: ['admin:org', 'delete_repo', 'notifications', 'workflow'],
			grantType: 'authorizationCode',
			authenticationType: 'body',
			authentication: 'body',
		};
	}

	private getNotionTemplate(): OAuthProviderTemplate {
		return {
			name: 'Notion',
			credentialType: 'notionOAuth2Api',
			description: 'Access and update Notion databases and pages',
			authUrl: 'https://api.notion.com/v1/oauth/authorize',
			accessTokenUrl: 'https://api.notion.com/v1/oauth/token',
			defaultScopes: [],
			grantType: 'authorizationCode',
			authenticationType: 'body',
			authentication: 'body',
			usePKCE: true,
			additionalParams: {
				owner: 'user',
			},
		};
	}

	private getAirtableTemplate(): OAuthProviderTemplate {
		return {
			name: 'Airtable',
			credentialType: 'airtableOAuth2Api',
			description: 'Access and manage Airtable bases',
			authUrl: 'https://airtable.com/oauth2/v1/authorize',
			accessTokenUrl: 'https://airtable.com/oauth2/v1/token',
			defaultScopes: ['data.records:read', 'data.records:write', 'schema.bases:read'],
			optionalScopes: ['data.recordComments:read', 'data.recordComments:write'],
			grantType: 'pkce',
			authenticationType: 'body',
			authentication: 'body',
			usePKCE: true,
		};
	}

	private getGoogleDriveTemplate(): OAuthProviderTemplate {
		return {
			name: 'Google Drive',
			credentialType: 'googleDriveOAuth2Api',
			description: 'Access and manage Google Drive files',
			authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
			accessTokenUrl: 'https://oauth2.googleapis.com/token',
			defaultScopes: [
				'https://www.googleapis.com/auth/drive',
				'https://www.googleapis.com/auth/drive.file',
			],
			optionalScopes: [
				'https://www.googleapis.com/auth/drive.readonly',
				'https://www.googleapis.com/auth/drive.metadata',
			],
			grantType: 'authorizationCode',
			authenticationType: 'body',
			authentication: 'body',
			additionalParams: {
				access_type: 'offline',
				prompt: 'consent',
			},
		};
	}

	private getGmailTemplate(): OAuthProviderTemplate {
		return {
			name: 'Gmail',
			credentialType: 'gmailOAuth2',
			description: 'Send and read Gmail messages',
			authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
			accessTokenUrl: 'https://oauth2.googleapis.com/token',
			defaultScopes: [
				'https://www.googleapis.com/auth/gmail.send',
				'https://www.googleapis.com/auth/gmail.readonly',
			],
			optionalScopes: [
				'https://www.googleapis.com/auth/gmail.compose',
				'https://www.googleapis.com/auth/gmail.modify',
			],
			grantType: 'authorizationCode',
			authenticationType: 'body',
			authentication: 'body',
			additionalParams: {
				access_type: 'offline',
				prompt: 'consent',
			},
		};
	}

	private getMicrosoftTeamsTemplate(): OAuthProviderTemplate {
		return {
			name: 'Microsoft Teams',
			credentialType: 'microsoftTeamsOAuth2Api',
			description: 'Send messages and manage Microsoft Teams',
			authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
			accessTokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
			defaultScopes: [
				'Channel.ReadBasic.All',
				'ChannelMessage.Send',
				'Chat.ReadWrite',
				'User.Read',
			],
			optionalScopes: ['Team.ReadBasic.All', 'TeamsActivity.Send'],
			grantType: 'authorizationCode',
			authenticationType: 'body',
			authentication: 'body',
		};
	}

	private getDropboxTemplate(): OAuthProviderTemplate {
		return {
			name: 'Dropbox',
			credentialType: 'dropboxOAuth2Api',
			description: 'Access and manage Dropbox files',
			authUrl: 'https://www.dropbox.com/oauth2/authorize',
			accessTokenUrl: 'https://api.dropboxapi.com/oauth2/token',
			defaultScopes: [
				'files.content.read',
				'files.content.write',
				'files.metadata.read',
				'files.metadata.write',
			],
			optionalScopes: ['sharing.read', 'sharing.write'],
			grantType: 'authorizationCode',
			authenticationType: 'body',
			authentication: 'body',
			usePKCE: true,
		};
	}

	private getHubSpotTemplate(): OAuthProviderTemplate {
		return {
			name: 'HubSpot',
			credentialType: 'hubspotOAuth2Api',
			description: 'Access HubSpot CRM and marketing tools',
			authUrl: 'https://app.hubspot.com/oauth/authorize',
			accessTokenUrl: 'https://api.hubapi.com/oauth/v1/token',
			defaultScopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],
			optionalScopes: [
				'crm.objects.companies.read',
				'crm.objects.deals.read',
				'crm.schemas.contacts.read',
			],
			grantType: 'authorizationCode',
			authenticationType: 'body',
			authentication: 'body',
		};
	}

	private getAsanaTemplate(): OAuthProviderTemplate {
		return {
			name: 'Asana',
			credentialType: 'asanaOAuth2Api',
			description: 'Manage Asana tasks and projects',
			authUrl: 'https://app.asana.com/-/oauth_authorize',
			accessTokenUrl: 'https://app.asana.com/-/oauth_token',
			defaultScopes: ['default'],
			optionalScopes: [],
			grantType: 'authorizationCode',
			authenticationType: 'body',
			authentication: 'body',
		};
	}

	/**
	 * Get scope recommendations for a credential type
	 */
	getScopeRecommendations(credentialType: string): {
		minimal: string[];
		standard: string[];
		full: string[];
	} {
		const template = this.getTemplateByType(credentialType);
		if (!template) {
			return { minimal: [], standard: [], full: [] };
		}

		const allScopes = [...template.defaultScopes, ...(template.optionalScopes ?? [])];

		return {
			minimal: template.defaultScopes.slice(0, 2),
			standard: template.defaultScopes,
			full: allScopes,
		};
	}

	/**
	 * Validate OAuth configuration
	 */
	validateConfiguration(data: ICredentialDataDecryptedObject): {
		valid: boolean;
		errors: string[];
	} {
		const errors: string[] = [];

		if (!data.clientId || typeof data.clientId !== 'string') {
			errors.push('Client ID is required');
		}

		if (!data.clientSecret || typeof data.clientSecret !== 'string') {
			errors.push('Client Secret is required');
		}

		if (!data.authUrl || typeof data.authUrl !== 'string') {
			errors.push('Authorization URL is required');
		}

		if (!data.accessTokenUrl || typeof data.accessTokenUrl !== 'string') {
			errors.push('Access Token URL is required');
		}

		try {
			if (data.authUrl) new URL(data.authUrl as string);
			if (data.accessTokenUrl) new URL(data.accessTokenUrl as string);
		} catch {
			errors.push('Invalid URL format');
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}
}
