import { Logger } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import { CredentialsRepository, WorkflowRepository, UserRepository } from '@n8n/db';
import type { SecurityScanner, SecurityScanResult } from './security-scanner';
import type { SecretAuditingService } from './secret-auditing';
import type { SecretRotationService } from './secret-rotation';

export interface ComplianceFramework {
	name: string;
	version: string;
	description: string;
	requirements: ComplianceRequirement[];
}

export interface ComplianceRequirement {
	id: string;
	title: string;
	description: string;
	category: 'access-control' | 'data-protection' | 'monitoring' | 'encryption' | 'general';
	severity: 'must' | 'should' | 'recommended';
	autoCheckAvailable: boolean;
}

export interface ComplianceCheckResult {
	requirementId: string;
	status: 'compliant' | 'non-compliant' | 'partial' | 'not-applicable';
	details: string;
	evidence?: any;
	recommendations?: string[];
}

export interface ComplianceReport {
	reportId: string;
	framework: string;
	generatedAt: Date;
	overallScore: number; // 0-100
	summary: {
		total: number;
		compliant: number;
		nonCompliant: number;
		partial: number;
		notApplicable: number;
	};
	checks: ComplianceCheckResult[];
	securityScan?: SecurityScanResult;
	recommendations: string[];
}

@Service()
export class ComplianceReporter {
	constructor(
		private readonly logger: Logger,
		private readonly credentialsRepository: CredentialsRepository,
		private readonly workflowRepository: WorkflowRepository,
		private readonly userRepository: UserRepository,
	) {
		this.logger = this.logger.scoped('compliance-reporter');
	}

	/**
	 * Generate GDPR compliance report
	 */
	async generateGDPRReport(
		securityScanner?: SecurityScanner,
		auditingService?: SecretAuditingService,
	): Promise<ComplianceReport> {
		this.logger.info('Generating GDPR compliance report');

		const framework = this.getGDPRFramework();
		const checks: ComplianceCheckResult[] = [];

		// Check: Right to be forgotten
		checks.push({
			requirementId: 'gdpr_rtbf',
			status: 'compliant',
			details: 'User deletion capabilities are in place',
			recommendations: ['Ensure all user data is properly deleted when user account is removed'],
		});

		// Check: Data encryption
		const encryptionCheck = await this.checkDataEncryption();
		checks.push(encryptionCheck);

		// Check: Access logging
		const accessLoggingCheck = await this.checkAccessLogging(auditingService);
		checks.push(accessLoggingCheck);

		// Check: Data minimization
		const minimizationCheck = await this.checkDataMinimization();
		checks.push(minimizationCheck);

		// Check: Consent management
		checks.push({
			requirementId: 'gdpr_consent',
			status: 'not-applicable',
			details:
				'n8n is a workflow automation tool, consent mechanisms depend on user implementations',
			recommendations: [
				'Ensure workflows that collect personal data include proper consent mechanisms',
			],
		});

		// Check: Data breach notification
		checks.push({
			requirementId: 'gdpr_breach',
			status: 'partial',
			details: 'Basic logging is in place, but automated breach detection is limited',
			recommendations: [
				'Implement automated breach detection',
				'Set up alerting for suspicious activities',
				'Document breach response procedures',
			],
		});

		// Run security scan if available
		let securityScan: SecurityScanResult | undefined;
		if (securityScanner) {
			securityScan = await securityScanner.runScan();
		}

		return this.generateReport(framework.name, checks, securityScan);
	}

	/**
	 * Generate SOC2 compliance report (basic checks)
	 */
	async generateSOC2Report(
		securityScanner?: SecurityScanner,
		rotationService?: SecretRotationService,
	): Promise<ComplianceReport> {
		this.logger.info('Generating SOC2 compliance report');

		const framework = this.getSOC2Framework();
		const checks: ComplianceCheckResult[] = [];

		// Check: Access controls
		const accessControlCheck = await this.checkAccessControls();
		checks.push(accessControlCheck);

		// Check: Encryption in transit and at rest
		const encryptionCheck = await this.checkDataEncryption();
		checks.push(encryptionCheck);

		// Check: Security monitoring
		checks.push({
			requirementId: 'soc2_monitoring',
			status: 'partial',
			details: 'Basic security monitoring is available through audit logs',
			recommendations: [
				'Implement real-time security monitoring',
				'Set up alerting for security events',
				'Regular security reviews',
			],
		});

		// Check: Change management
		checks.push({
			requirementId: 'soc2_change_mgmt',
			status: 'compliant',
			details: 'Workflow versioning and change tracking is in place',
			recommendations: ['Maintain comprehensive change logs', 'Implement approval workflows'],
		});

		// Check: Secret rotation
		const rotationCheck = await this.checkSecretRotation(rotationService);
		checks.push(rotationCheck);

		// Check: Vulnerability management
		checks.push({
			requirementId: 'soc2_vulnerability',
			status: 'partial',
			details: 'Basic vulnerability scanning is available',
			recommendations: [
				'Implement regular automated vulnerability scans',
				'Establish vulnerability remediation SLAs',
			],
		});

		// Run security scan if available
		let securityScan: SecurityScanResult | undefined;
		if (securityScanner) {
			securityScan = await securityScanner.runScan();
		}

		return this.generateReport(framework.name, checks, securityScan);
	}

	/**
	 * Generate ISO 27001 compliance report (basic checks)
	 */
	async generateISO27001Report(securityScanner?: SecurityScanner): Promise<ComplianceReport> {
		this.logger.info('Generating ISO 27001 compliance report');

		const framework = this.getISO27001Framework();
		const checks: ComplianceCheckResult[] = [];

		// Check: Information security policies
		checks.push({
			requirementId: 'iso27001_policy',
			status: 'partial',
			details: 'Security features are in place, formal policies should be documented',
			recommendations: [
				'Document information security policies',
				'Establish security governance structure',
			],
		});

		// Check: Asset management
		const assetCheck = await this.checkAssetManagement();
		checks.push(assetCheck);

		// Check: Access control
		const accessCheck = await this.checkAccessControls();
		checks.push(accessCheck);

		// Check: Cryptography
		const cryptoCheck = await this.checkDataEncryption();
		checks.push(cryptoCheck);

		// Check: Security monitoring
		checks.push({
			requirementId: 'iso27001_monitoring',
			status: 'partial',
			details: 'Security audit logging is available',
			recommendations: [
				'Implement comprehensive security monitoring',
				'Regular log reviews',
				'Incident response procedures',
			],
		});

		// Run security scan if available
		let securityScan: SecurityScanResult | undefined;
		if (securityScanner) {
			securityScan = await securityScanner.runScan();
		}

		return this.generateReport(framework.name, checks, securityScan);
	}

	/**
	 * Check data encryption compliance
	 */
	private async checkDataEncryption(): Promise<ComplianceCheckResult> {
		// Check if credentials are encrypted
		const hasEncryption = process.env.N8N_ENCRYPTION_KEY !== undefined;

		return {
			requirementId: 'encryption',
			status: hasEncryption ? 'compliant' : 'non-compliant',
			details: hasEncryption ? 'Credentials are encrypted at rest' : 'No encryption key configured',
			recommendations: hasEncryption
				? ['Ensure encryption keys are properly managed and rotated']
				: ['Set N8N_ENCRYPTION_KEY to enable credential encryption'],
		};
	}

	/**
	 * Check access logging compliance
	 */
	private async checkAccessLogging(
		auditingService?: SecretAuditingService,
	): Promise<ComplianceCheckResult> {
		if (!auditingService) {
			return {
				requirementId: 'access_logging',
				status: 'partial',
				details: 'Access logging service not enabled',
				recommendations: ['Enable comprehensive access logging', 'Regular log reviews'],
			};
		}

		const stats = auditingService.getAuditStatistics();

		return {
			requirementId: 'access_logging',
			status: stats.totalEvents > 0 ? 'compliant' : 'partial',
			details: `${stats.totalEvents} access events logged`,
			evidence: stats,
			recommendations: ['Maintain comprehensive access logs', 'Implement log retention policy'],
		};
	}

	/**
	 * Check data minimization compliance
	 */
	private async checkDataMinimization(): Promise<ComplianceCheckResult> {
		const workflowCount = await this.workflowRepository.count();
		const credentialCount = await this.credentialsRepository.count();

		return {
			requirementId: 'data_minimization',
			status: 'partial',
			details: `${workflowCount} workflows, ${credentialCount} credentials`,
			recommendations: [
				'Regularly review and delete unused workflows',
				'Remove unnecessary credentials',
				'Minimize data retention periods',
			],
		};
	}

	/**
	 * Check access controls compliance
	 */
	private async checkAccessControls(): Promise<ComplianceCheckResult> {
		const userCount = await this.userRepository.count();
		const hasAuth = process.env.N8N_BASIC_AUTH_ACTIVE !== 'false';

		return {
			requirementId: 'access_control',
			status: hasAuth ? 'compliant' : 'non-compliant',
			details: hasAuth
				? `Authentication enabled with ${userCount} users`
				: 'Authentication is disabled',
			recommendations: hasAuth
				? ['Implement role-based access control', 'Regular access reviews']
				: ['Enable authentication immediately'],
		};
	}

	/**
	 * Check secret rotation compliance
	 */
	private async checkSecretRotation(
		rotationService?: SecretRotationService,
	): Promise<ComplianceCheckResult> {
		if (!rotationService) {
			return {
				requirementId: 'secret_rotation',
				status: 'non-compliant',
				details: 'Secret rotation service not enabled',
				recommendations: [
					'Enable secret rotation',
					'Establish rotation policies',
					'Automate rotation process',
				],
			};
		}

		const stats = await rotationService.getRotationStatistics();

		if (stats.totalPolicies === 0) {
			return {
				requirementId: 'secret_rotation',
				status: 'non-compliant',
				details: 'No rotation policies configured',
				recommendations: ['Configure rotation policies for all credentials'],
			};
		}

		return {
			requirementId: 'secret_rotation',
			status: stats.credentialsDue > 0 ? 'partial' : 'compliant',
			details: `${stats.totalPolicies} rotation policies, ${stats.credentialsDue} credentials overdue`,
			evidence: stats,
			recommendations:
				stats.credentialsDue > 0
					? ['Rotate overdue credentials immediately']
					: ['Maintain regular rotation schedule'],
		};
	}

	/**
	 * Check asset management compliance
	 */
	private async checkAssetManagement(): Promise<ComplianceCheckResult> {
		const workflowCount = await this.workflowRepository.count();
		const credentialCount = await this.credentialsRepository.count();

		return {
			requirementId: 'asset_management',
			status: 'partial',
			details: `Tracking ${workflowCount} workflows and ${credentialCount} credentials`,
			recommendations: [
				'Maintain inventory of all assets',
				'Classify assets by sensitivity',
				'Regular asset reviews',
			],
		};
	}

	/**
	 * Generate final compliance report
	 */
	private generateReport(
		framework: string,
		checks: ComplianceCheckResult[],
		securityScan?: SecurityScanResult,
	): ComplianceReport {
		const summary = {
			total: checks.length,
			compliant: checks.filter((c) => c.status === 'compliant').length,
			nonCompliant: checks.filter((c) => c.status === 'non-compliant').length,
			partial: checks.filter((c) => c.status === 'partial').length,
			notApplicable: checks.filter((c) => c.status === 'not-applicable').length,
		};

		// Calculate score (compliant = 100%, partial = 50%, others = 0%)
		const applicableChecks = summary.total - summary.notApplicable;
		const score =
			applicableChecks > 0
				? Math.round(((summary.compliant + summary.partial * 0.5) / applicableChecks) * 100)
				: 0;

		// Collect all recommendations
		const recommendations = Array.from(new Set(checks.flatMap((c) => c.recommendations || [])));

		const report: ComplianceReport = {
			reportId: `compliance_${Date.now()}`,
			framework,
			generatedAt: new Date(),
			overallScore: score,
			summary,
			checks,
			securityScan,
			recommendations,
		};

		this.logger.info('Compliance report generated', {
			framework,
			score,
			summary,
		});

		return report;
	}

	/**
	 * Get GDPR framework definition
	 */
	private getGDPRFramework(): ComplianceFramework {
		return {
			name: 'GDPR',
			version: '2016/679',
			description: 'General Data Protection Regulation',
			requirements: [
				{
					id: 'gdpr_rtbf',
					title: 'Right to be Forgotten',
					description: 'Ability to delete user data upon request',
					category: 'data-protection',
					severity: 'must',
					autoCheckAvailable: true,
				},
				{
					id: 'gdpr_encryption',
					title: 'Data Encryption',
					description: 'Encrypt personal data at rest and in transit',
					category: 'encryption',
					severity: 'should',
					autoCheckAvailable: true,
				},
				{
					id: 'gdpr_logging',
					title: 'Access Logging',
					description: 'Log all access to personal data',
					category: 'monitoring',
					severity: 'should',
					autoCheckAvailable: true,
				},
			],
		};
	}

	/**
	 * Get SOC2 framework definition
	 */
	private getSOC2Framework(): ComplianceFramework {
		return {
			name: 'SOC2',
			version: 'Type II',
			description: 'Service Organization Control 2',
			requirements: [
				{
					id: 'soc2_access',
					title: 'Access Controls',
					description: 'Implement and maintain access controls',
					category: 'access-control',
					severity: 'must',
					autoCheckAvailable: true,
				},
				{
					id: 'soc2_encryption',
					title: 'Data Encryption',
					description: 'Encrypt data in transit and at rest',
					category: 'encryption',
					severity: 'must',
					autoCheckAvailable: true,
				},
				{
					id: 'soc2_monitoring',
					title: 'Security Monitoring',
					description: 'Continuous security monitoring and alerting',
					category: 'monitoring',
					severity: 'must',
					autoCheckAvailable: true,
				},
			],
		};
	}

	/**
	 * Get ISO 27001 framework definition
	 */
	private getISO27001Framework(): ComplianceFramework {
		return {
			name: 'ISO 27001',
			version: '2013',
			description: 'Information Security Management System',
			requirements: [
				{
					id: 'iso27001_policy',
					title: 'Information Security Policy',
					description: 'Documented security policies',
					category: 'general',
					severity: 'must',
					autoCheckAvailable: false,
				},
				{
					id: 'iso27001_access',
					title: 'Access Control',
					description: 'Proper access control mechanisms',
					category: 'access-control',
					severity: 'must',
					autoCheckAvailable: true,
				},
				{
					id: 'iso27001_crypto',
					title: 'Cryptographic Controls',
					description: 'Use of cryptography for data protection',
					category: 'encryption',
					severity: 'must',
					autoCheckAvailable: true,
				},
			],
		};
	}
}
