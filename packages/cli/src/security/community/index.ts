/**
 * n8n Community Edition Security Features
 *
 * This module provides basic security features for n8n community edition:
 * - Security vulnerability scanning
 * - Automatic secret rotation
 * - Secret usage tracking and auditing
 * - Basic compliance reporting (GDPR, SOC2, ISO 27001)
 * - Dependency vulnerability checking
 */

export {
	SecurityScanner,
	type SecurityVulnerability,
	type SecurityScanResult,
} from './security-scanner';
export {
	SecretRotationService,
	type SecretRotationPolicy,
	type SecretRotationEvent,
	type RotationSchedule,
} from './secret-rotation';
export {
	SecretAuditingService,
	type SecretAccessEvent,
	type SecretUsageReport,
	type AuditQuery,
} from './secret-auditing';
export {
	ComplianceReporter,
	type ComplianceReport,
	type ComplianceFramework,
	type ComplianceRequirement,
} from './compliance-reporter';
export {
	VulnerabilityChecker,
	type Vulnerability,
	type VulnerabilityScanResult,
	type DependencyInfo,
} from './vulnerability-checker';
