import { Logger } from '@n8n/backend-common';
import { CustomNodeRepository } from '@n8n/db';
import type { CustomNode, ValidationResults, NodeMetadata } from '@n8n/db';
import { Service } from '@n8n/di';
import { readFile, access, constants } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join, extname, basename } from 'path';
import { createHash, randomBytes } from 'crypto';
import { tmpdir } from 'os';
import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { InternalServerError } from '@/errors/response-errors/internal-server.error';

const asyncExec = promisify(exec);

export interface SecurityCheckResult {
	passed: boolean;
	warnings: string[];
	errors: string[];
	riskLevel: 'low' | 'medium' | 'high';
}

export interface DependencyCheckResult {
	passed: boolean;
	dependencies: string[];
	missingDependencies: string[];
	vulnerabilities: string[];
}

@Service()
export class CustomNodeValidationService {
	private readonly tempDir: string;
	private readonly dangerousPatterns: RegExp[] = [
		/eval\s*\(/gi,
		/Function\s*\(/gi,
		/process\.exit/gi,
		/process\.kill/gi,
		/require\s*\(\s*['"]child_process['"].*\)/gi,
		/require\s*\(\s*['"]fs['"].*\)\.unlink/gi,
		/require\s*\(\s*['"]fs['"].*\)\.rmdir/gi,
		/require\s*\(\s*['"]path['"].*\)\.\.+/gi,
		/__dirname.*\.\./gi,
		/\.\.\/\.\./gi,
		/document\.cookie/gi,
		/localStorage\./gi,
		/sessionStorage\./gi,
	];

	private readonly restrictedModules = [
		'child_process',
		'cluster',
		'dgram',
		'dns',
		'http2',
		'inspector',
		'module',
		'perf_hooks',
		'repl',
		'tls',
		'v8',
		'vm',
		'worker_threads',
	];

	constructor(
		private readonly logger: Logger,
		private readonly customNodeRepository: CustomNodeRepository,
	) {
		this.tempDir = join(tmpdir(), 'n8n-custom-node-validation');
	}

	async validateCustomNode(nodeId: string): Promise<ValidationResults> {
		const node = await this.customNodeRepository.findOne({ where: { id: nodeId } });
		if (!node) {
			throw new BadRequestError(`Custom node with ID "${nodeId}" not found`);
		}

		this.logger.info('Starting validation for custom node', {
			nodeId: node.id,
			name: node.name,
			version: node.version,
		});

		// Update status to validating
		await this.customNodeRepository.updateStatus(nodeId, 'validating');

		const results: ValidationResults = {
			syntax: false,
			dependencies: false,
			security: false,
			tests: false,
			warnings: [],
			errors: [],
		};

		try {
			// Step 1: Syntax validation
			const syntaxResult = await this.validateSyntax(node);
			results.syntax = syntaxResult.passed;
			results.warnings.push(...syntaxResult.warnings);
			results.errors.push(...syntaxResult.errors);

			// Step 2: Security validation
			const securityResult = await this.validateSecurity(node);
			results.security = securityResult.passed;
			results.warnings.push(...securityResult.warnings);
			results.errors.push(...securityResult.errors);

			// Step 3: Dependency validation
			const dependencyResult = await this.validateDependencies(node);
			results.dependencies = dependencyResult.passed;
			results.warnings.push(...dependencyResult.warnings);
			results.errors.push(...dependencyResult.errors);

			// Step 4: Test validation (optional)
			const testResult = await this.validateTests(node);
			results.tests = testResult.passed;
			results.warnings.push(...testResult.warnings);
			results.errors.push(...testResult.errors);

			// Update node with validation results
			const overallSuccess = results.syntax && results.security && results.dependencies;
			const finalStatus = overallSuccess ? 'validated' : 'failed';

			await this.customNodeRepository.update(nodeId, {
				status: finalStatus,
				validationResults: results,
				validatedAt: new Date(),
			});

			this.logger.info('Custom node validation completed', {
				nodeId: node.id,
				status: finalStatus,
				results,
			});

			return results;
		} catch (error) {
			// Mark as failed and update with error
			results.errors.push(error instanceof Error ? error.message : 'Unknown validation error');

			await this.customNodeRepository.update(nodeId, {
				status: 'failed',
				validationResults: results,
				validatedAt: new Date(),
			});

			this.logger.error('Custom node validation failed', {
				nodeId: node.id,
				error: error instanceof Error ? error.message : error,
			});

			throw new InternalServerError('Validation process failed', { cause: error });
		}
	}

	private async validateSyntax(
		node: CustomNode,
	): Promise<{ passed: boolean; warnings: string[]; errors: string[] }> {
		const warnings: string[] = [];
		const errors: string[] = [];

		try {
			if (!node.filePath) {
				errors.push('No file path specified for validation');
				return { passed: false, warnings, errors };
			}

			// Check if file exists
			await access(node.filePath, constants.R_OK);

			const fileContent = await readFile(node.filePath, 'utf-8');
			const extension = extname(node.filePath).toLowerCase();

			// Basic syntax checks based on file type
			if (extension === '.js' || extension === '.ts') {
				try {
					// Check for basic JavaScript/TypeScript syntax
					new Function(fileContent); // This will throw for syntax errors
				} catch (syntaxError) {
					errors.push(
						`Syntax error: ${syntaxError instanceof Error ? syntaxError.message : 'Unknown syntax error'}`,
					);
				}

				// Check for required n8n node structure
				if (!this.hasValidNodeStructure(fileContent)) {
					warnings.push('File may not contain valid n8n node structure');
				}

				// Check for TypeScript specific issues
				if (extension === '.ts' && !fileContent.includes('export')) {
					warnings.push('TypeScript file should have export statements');
				}
			} else if (extension === '.json') {
				try {
					JSON.parse(fileContent);
				} catch (jsonError) {
					errors.push(
						`JSON syntax error: ${jsonError instanceof Error ? jsonError.message : 'Invalid JSON'}`,
					);
				}
			}

			return { passed: errors.length === 0, warnings, errors };
		} catch (error) {
			errors.push(
				`File access error: ${error instanceof Error ? error.message : 'Cannot access file'}`,
			);
			return { passed: false, warnings, errors };
		}
	}

	private async validateSecurity(node: CustomNode): Promise<SecurityCheckResult> {
		const warnings: string[] = [];
		const errors: string[] = [];
		let riskLevel: 'low' | 'medium' | 'high' = 'low';

		try {
			if (!node.filePath) {
				errors.push('No file path for security validation');
				return { passed: false, warnings, errors, riskLevel: 'high' };
			}

			const fileContent = await readFile(node.filePath, 'utf-8');

			// Check for dangerous patterns
			for (const pattern of this.dangerousPatterns) {
				const matches = fileContent.match(pattern);
				if (matches) {
					const message = `Potentially dangerous pattern found: ${pattern.toString()}`;
					if (pattern.source.includes('eval') || pattern.source.includes('Function')) {
						errors.push(message);
						riskLevel = 'high';
					} else {
						warnings.push(message);
						if (riskLevel === 'low') riskLevel = 'medium';
					}
				}
			}

			// Check for restricted modules
			for (const module of this.restrictedModules) {
				const requirePattern = new RegExp(`require\\s*\\(\\s*['"]${module}['"].*\\)`, 'gi');
				if (requirePattern.test(fileContent)) {
					errors.push(`Restricted module detected: ${module}`);
					riskLevel = 'high';
				}
			}

			// Check for file system operations
			const fsOperations = [
				'writeFile',
				'writeFileSync',
				'appendFile',
				'appendFileSync',
				'unlink',
				'unlinkSync',
				'rmdir',
				'rmdirSync',
				'mkdir',
				'mkdirSync',
			];

			for (const op of fsOperations) {
				if (fileContent.includes(op)) {
					warnings.push(`File system operation detected: ${op}`);
					if (riskLevel === 'low') riskLevel = 'medium';
				}
			}

			// Check for network operations
			const networkPatterns = [
				/https?:\/\/[^\s'"]+/gi,
				/fetch\s*\(/gi,
				/axios\./gi,
				/request\s*\(/gi,
			];

			for (const pattern of networkPatterns) {
				if (pattern.test(fileContent)) {
					warnings.push(
						'Network operation detected - ensure proper validation of external requests',
					);
					break;
				}
			}

			return {
				passed: errors.length === 0,
				warnings,
				errors,
				riskLevel,
			};
		} catch (error) {
			errors.push(
				`Security validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
			return { passed: false, warnings, errors, riskLevel: 'high' };
		}
	}

	private async validateDependencies(node: CustomNode): Promise<DependencyCheckResult> {
		const warnings: string[] = [];
		const errors: string[] = [];
		const dependencies: string[] = [];
		const missingDependencies: string[] = [];
		const vulnerabilities: string[] = [];

		try {
			if (!node.filePath) {
				errors.push('No file path for dependency validation');
				return { passed: false, dependencies, missingDependencies, vulnerabilities };
			}

			const fileContent = await readFile(node.filePath, 'utf-8');

			// Extract require/import statements
			const requireMatches = fileContent.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g) || [];
			const importMatches = fileContent.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g) || [];

			// Parse dependencies
			[...requireMatches, ...importMatches].forEach((match) => {
				const depMatch = match.match(/['"]([^'"]+)['"]/);
				if (depMatch && depMatch[1] && !depMatch[1].startsWith('.')) {
					const dep = depMatch[1].split('/')[0]; // Get package name without subpath
					if (!dependencies.includes(dep)) {
						dependencies.push(dep);
					}
				}
			});

			// Check if dependencies are available (basic check)
			// In a real implementation, you would check against npm registry or local node_modules
			const coreDependencies = ['n8n-workflow', 'n8n-core'];
			const allowedDependencies = [...coreDependencies, 'lodash', 'axios', 'moment', 'uuid'];

			dependencies.forEach((dep) => {
				if (!allowedDependencies.includes(dep)) {
					missingDependencies.push(dep);
					warnings.push(`Dependency "${dep}" may not be available in n8n runtime`);
				}
			});

			// Update node metadata with dependencies
			const updatedMetadata: NodeMetadata = {
				...node.metadata,
				dependencies,
			};

			await this.customNodeRepository.update(node.id, { metadata: updatedMetadata });

			return {
				passed: missingDependencies.length === 0,
				dependencies,
				missingDependencies,
				vulnerabilities,
			};
		} catch (error) {
			errors.push(
				`Dependency validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
			return { passed: false, dependencies, missingDependencies, vulnerabilities };
		}
	}

	private async validateTests(
		node: CustomNode,
	): Promise<{ passed: boolean; warnings: string[]; errors: string[] }> {
		const warnings: string[] = [];
		const errors: string[] = [];

		// For now, we'll just check if the file has basic test structure
		// In a full implementation, you would run actual tests
		try {
			if (!node.filePath) {
				warnings.push('No file path for test validation');
				return { passed: true, warnings, errors }; // Tests are optional
			}

			const fileContent = await readFile(node.filePath, 'utf-8');

			// Check for common test patterns
			const testPatterns = [/describe\s*\(/gi, /it\s*\(/gi, /test\s*\(/gi, /expect\s*\(/gi];

			const hasTests = testPatterns.some((pattern) => pattern.test(fileContent));

			if (!hasTests) {
				warnings.push('No tests detected in the file');
			}

			return { passed: true, warnings, errors }; // Tests are optional for now
		} catch (error) {
			warnings.push(
				`Test validation warning: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
			return { passed: true, warnings, errors };
		}
	}

	private hasValidNodeStructure(content: string): boolean {
		// Check for basic n8n node patterns
		const nodePatterns = [
			/class.*implements.*INodeType/i,
			/description.*INodeTypeDescription/i,
			/execute.*IExecuteFunctions/i,
			/displayName/i,
			/name.*string/i,
		];

		return nodePatterns.some((pattern) => pattern.test(content));
	}

	async getValidationResults(nodeId: string): Promise<ValidationResults | null> {
		const node = await this.customNodeRepository.findOne({
			where: { id: nodeId },
			select: ['validationResults'],
		});

		return node?.validationResults || null;
	}

	async revalidateCustomNode(nodeId: string): Promise<ValidationResults> {
		// Reset validation status and run validation again
		await this.customNodeRepository.update(nodeId, {
			status: 'uploaded',
			validationResults: undefined,
			validatedAt: undefined,
		});

		return await this.validateCustomNode(nodeId);
	}
}
