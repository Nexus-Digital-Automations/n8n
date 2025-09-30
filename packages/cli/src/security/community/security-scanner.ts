import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import { WorkflowRepository, CredentialsRepository } from '@n8n/db';

export interface SecurityVulnerability {
	id: string;
	severity: 'low' | 'medium' | 'high' | 'critical';
	category: 'credential' | 'workflow' | 'node' | 'configuration';
	title: string;
	description: string;
	affectedEntity: {
		type: 'workflow' | 'credential' | 'node' | 'system';
		id?: string;
		name?: string;
	};
	remediation: string;
	detectedAt: Date;
}

export interface SecurityScanResult {
	scanId: string;
	startedAt: Date;
	completedAt: Date;
	vulnerabilities: SecurityVulnerability[];
	summary: {
		total: number;
		critical: number;
		high: number;
		medium: number;
		low: number;
	};
}

@Service()
export class SecurityScanner {
	constructor(
		private readonly logger: Logger,
		private readonly workflowRepository: WorkflowRepository,
		private readonly credentialsRepository: CredentialsRepository,
	) {
		this.logger = this.logger.scoped('security-scanner');
	}

	/**
	 * Run a comprehensive security scan across the n8n instance
	 */
	async runScan(): Promise<SecurityScanResult> {
		const scanId = `scan_${Date.now()}`;
		const startedAt = new Date();

		this.logger.info('Starting security scan', { scanId, startedAt });

		const vulnerabilities: SecurityVulnerability[] = [];

		try {
			// Scan for credential vulnerabilities
			const credentialVulns = await this.scanCredentials();
			vulnerabilities.push(...credentialVulns);

			// Scan for workflow vulnerabilities
			const workflowVulns = await this.scanWorkflows();
			vulnerabilities.push(...workflowVulns);

			// Scan for configuration vulnerabilities
			const configVulns = await this.scanConfiguration();
			vulnerabilities.push(...configVulns);

			// Scan for insecure node usage
			const nodeVulns = await this.scanNodeUsage();
			vulnerabilities.push(...nodeVulns);
		} catch (error) {
			this.logger.error('Error during security scan', {
				scanId,
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			});
		}

		const completedAt = new Date();
		const summary = this.summarizeVulnerabilities(vulnerabilities);

		this.logger.info('Security scan completed', {
			scanId,
			completedAt,
			duration: completedAt.getTime() - startedAt.getTime(),
			summary,
		});

		return {
			scanId,
			startedAt,
			completedAt,
			vulnerabilities,
			summary,
		};
	}

	/**
	 * Scan credentials for security issues
	 */
	private async scanCredentials(): Promise<SecurityVulnerability[]> {
		const vulnerabilities: SecurityVulnerability[] = [];

		try {
			const credentials = await this.credentialsRepository.find({
				select: ['id', 'name', 'type', 'createdAt', 'updatedAt'],
			});

			for (const credential of credentials) {
				// Check for old credentials (not updated in 365 days)
				const daysSinceUpdate = Math.floor(
					(Date.now() - credential.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
				);

				if (daysSinceUpdate > 365) {
					vulnerabilities.push({
						id: `cred_old_${credential.id}`,
						severity: 'medium',
						category: 'credential',
						title: 'Outdated Credential',
						description: `Credential "${credential.name}" has not been updated in ${daysSinceUpdate} days`,
						affectedEntity: {
							type: 'credential',
							id: credential.id,
							name: credential.name,
						},
						remediation:
							'Review and rotate this credential to ensure it follows current security best practices',
						detectedAt: new Date(),
					});
				}

				// Check for credentials with weak naming patterns
				if (this.hasWeakNaming(credential.name)) {
					vulnerabilities.push({
						id: `cred_weak_name_${credential.id}`,
						severity: 'low',
						category: 'credential',
						title: 'Weak Credential Naming',
						description: `Credential "${credential.name}" uses generic or weak naming that may indicate poor security practices`,
						affectedEntity: {
							type: 'credential',
							id: credential.id,
							name: credential.name,
						},
						remediation:
							'Use descriptive, unique names for credentials to improve security and organization',
						detectedAt: new Date(),
					});
				}
			}
		} catch (error) {
			this.logger.error('Error scanning credentials', {
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			});
		}

		return vulnerabilities;
	}

	/**
	 * Scan workflows for security issues
	 */
	private async scanWorkflows(): Promise<SecurityVulnerability[]> {
		const vulnerabilities: SecurityVulnerability[] = [];

		try {
			const workflows = await this.workflowRepository.find({
				select: ['id', 'name', 'nodes', 'active'],
			});

			for (const workflow of workflows) {
				// Check for workflows with hardcoded sensitive data patterns
				const workflowJson = JSON.stringify(workflow.nodes);

				if (this.containsSensitivePatterns(workflowJson)) {
					vulnerabilities.push({
						id: `workflow_hardcoded_${workflow.id}`,
						severity: 'high',
						category: 'workflow',
						title: 'Potential Hardcoded Secrets',
						description: `Workflow "${workflow.name}" may contain hardcoded sensitive data`,
						affectedEntity: {
							type: 'workflow',
							id: workflow.id,
							name: workflow.name,
						},
						remediation: 'Replace hardcoded secrets with credentials or environment variables',
						detectedAt: new Date(),
					});
				}

				// Check for workflows with insecure HTTP nodes
				if (this.hasInsecureHttpNodes(workflow.nodes)) {
					vulnerabilities.push({
						id: `workflow_insecure_http_${workflow.id}`,
						severity: 'medium',
						category: 'workflow',
						title: 'Insecure HTTP Connection',
						description: `Workflow "${workflow.name}" uses HTTP instead of HTTPS for connections`,
						affectedEntity: {
							type: 'workflow',
							id: workflow.id,
							name: workflow.name,
						},
						remediation: 'Use HTTPS for all external connections to ensure data encryption',
						detectedAt: new Date(),
					});
				}
			}
		} catch (error) {
			this.logger.error('Error scanning workflows', {
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			});
		}

		return vulnerabilities;
	}

	/**
	 * Scan system configuration for security issues
	 */
	private async scanConfiguration(): Promise<SecurityVulnerability[]> {
		const vulnerabilities: SecurityVulnerability[] = [];

		try {
			// Check if basic auth is disabled
			if (process.env.N8N_BASIC_AUTH_ACTIVE === 'false') {
				vulnerabilities.push({
					id: 'config_no_auth',
					severity: 'critical',
					category: 'configuration',
					title: 'Authentication Disabled',
					description:
						'Basic authentication is disabled, exposing the instance to unauthorized access',
					affectedEntity: {
						type: 'system',
					},
					remediation: 'Enable authentication to protect your n8n instance',
					detectedAt: new Date(),
				});
			}

			// Check if running in secure mode
			if (process.env.NODE_ENV !== 'production') {
				vulnerabilities.push({
					id: 'config_dev_mode',
					severity: 'medium',
					category: 'configuration',
					title: 'Development Mode Active',
					description:
						'Instance is running in development mode, which may expose debug information',
					affectedEntity: {
						type: 'system',
					},
					remediation: 'Run in production mode for production deployments',
					detectedAt: new Date(),
				});
			}

			// Check for secure cookie settings
			if (process.env.N8N_SECURE_COOKIE !== 'true') {
				vulnerabilities.push({
					id: 'config_insecure_cookies',
					severity: 'high',
					category: 'configuration',
					title: 'Insecure Cookie Configuration',
					description: 'Cookies are not set to secure-only, vulnerable to interception',
					affectedEntity: {
						type: 'system',
					},
					remediation: 'Enable secure cookies by setting N8N_SECURE_COOKIE=true',
					detectedAt: new Date(),
				});
			}
		} catch (error) {
			this.logger.error('Error scanning configuration', {
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			});
		}

		return vulnerabilities;
	}

	/**
	 * Scan for insecure node usage patterns
	 */
	private async scanNodeUsage(): Promise<SecurityVulnerability[]> {
		const vulnerabilities: SecurityVulnerability[] = [];

		try {
			const workflows = await this.workflowRepository.find({
				select: ['id', 'name', 'nodes'],
			});

			const riskyNodeTypes = [
				'n8n-nodes-base.executeCommand',
				'n8n-nodes-base.function',
				'n8n-nodes-base.functionItem',
			];

			for (const workflow of workflows) {
				for (const node of workflow.nodes) {
					if (riskyNodeTypes.includes(node.type)) {
						vulnerabilities.push({
							id: `node_risky_${workflow.id}_${node.name}`,
							severity: 'medium',
							category: 'node',
							title: 'Risky Node Type Usage',
							description: `Workflow "${workflow.name}" uses potentially risky node "${node.name}" of type ${node.type}`,
							affectedEntity: {
								type: 'workflow',
								id: workflow.id,
								name: workflow.name,
							},
							remediation:
								'Review code execution nodes for security issues and ensure they follow security best practices',
							detectedAt: new Date(),
						});
					}
				}
			}
		} catch (error) {
			this.logger.error('Error scanning node usage', {
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			});
		}

		return vulnerabilities;
	}

	/**
	 * Check if credential name follows weak patterns
	 */
	private hasWeakNaming(name: string): boolean {
		const weakPatterns = [/^test/i, /^temp/i, /^demo/i, /^default/i, /^admin/i, /^password/i];

		return weakPatterns.some((pattern) => pattern.test(name));
	}

	/**
	 * Check if text contains patterns that might indicate sensitive data
	 */
	private containsSensitivePatterns(text: string): boolean {
		const sensitivePatterns = [
			/password\s*[:=]\s*['"]\w+['"]/i,
			/api[_-]?key\s*[:=]\s*['"]\w+['"]/i,
			/secret\s*[:=]\s*['"]\w+['"]/i,
			/token\s*[:=]\s*['"]\w+['"]/i,
			/bearer\s+[a-zA-Z0-9_-]{20,}/i,
		];

		return sensitivePatterns.some((pattern) => pattern.test(text));
	}

	/**
	 * Check if workflow uses insecure HTTP connections
	 */
	private hasInsecureHttpNodes(nodes: any[]): boolean {
		for (const node of nodes) {
			if (node.type === 'n8n-nodes-base.httpRequest') {
				const url = node.parameters?.url || '';
				if (typeof url === 'string' && url.startsWith('http://')) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Summarize vulnerabilities by severity
	 */
	private summarizeVulnerabilities(vulnerabilities: SecurityVulnerability[]): {
		total: number;
		critical: number;
		high: number;
		medium: number;
		low: number;
	} {
		return {
			total: vulnerabilities.length,
			critical: vulnerabilities.filter((v) => v.severity === 'critical').length,
			high: vulnerabilities.filter((v) => v.severity === 'high').length,
			medium: vulnerabilities.filter((v) => v.severity === 'medium').length,
			low: vulnerabilities.filter((v) => v.severity === 'low').length,
		};
	}
}
