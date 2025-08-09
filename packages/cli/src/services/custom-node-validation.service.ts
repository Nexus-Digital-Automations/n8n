import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import type { ValidationResults } from '@n8n/db';
import { Service } from '@n8n/di';
import { promises as fs } from 'fs';
import { join, extname, basename, dirname } from 'path';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { tmpdir } from 'os';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { InternalServerError } from '@/errors/response-errors/internal-server.error';

export interface ValidationOptions {
	validateSyntax?: boolean;
	validateDependencies?: boolean;
	validateSecurity?: boolean;
	runTests?: boolean;
	strictMode?: boolean;
	allowedNodeTypes?: string[];
	maxComplexity?: number;
}

export interface SecurityCheckResult {
	passed: boolean;
	violations: SecurityViolation[];
	score: number; // 0-100, where 100 is most secure
}

export interface SecurityViolation {
	type: 'critical' | 'high' | 'medium' | 'low';
	rule: string;
	message: string;
	line?: number;
	column?: number;
	suggestion?: string;
}

export interface SyntaxValidationResult {
	valid: boolean;
	errors: SyntaxError[];
	warnings: SyntaxWarning[];
}

export interface SyntaxError {
	message: string;
	line: number;
	column: number;
	type: string;
}

export interface SyntaxWarning {
	message: string;
	line: number;
	column: number;
	type: string;
}

export interface DependencyValidationResult {
	valid: boolean;
	dependencies: DependencyInfo[];
	vulnerabilities: VulnerabilityInfo[];
	maliciousPackages: string[];
}

export interface DependencyInfo {
	name: string;
	version: string;
	license: string;
	deprecated: boolean;
	security: {
		vulnerabilities: number;
		advisories: string[];
	};
}

export interface VulnerabilityInfo {
	package: string;
	version: string;
	severity: 'low' | 'moderate' | 'high' | 'critical';
	title: string;
	overview: string;
	recommendation: string;
}

@Service()
export class CustomNodeValidationService {
	private readonly TEMP_DIR: string;
	private readonly ALLOWED_FILE_TYPES = ['.js', '.ts', '.json', '.md', '.txt', '.yml', '.yaml'];
	private readonly DANGEROUS_FUNCTIONS = [
		'eval',
		'Function',
		'setTimeout',
		'setInterval',
		'setImmediate',
		'process.exit',
		'process.kill',
		'require',
		'import',
		'__dirname',
		'__filename',
		'global',
		'globalThis',
	];

	private readonly DANGEROUS_MODULES = [
		'child_process',
		'cluster',
		'dgram',
		'dns',
		'domain',
		'events',
		'http',
		'https',
		'net',
		'os',
		'path',
		'process',
		'punycode',
		'querystring',
		'readline',
		'repl',
		'stream',
		'string_decoder',
		'sys',
		'timers',
		'tls',
		'tty',
		'url',
		'util',
		'v8',
		'vm',
		'worker_threads',
		'zlib',
	];

	private readonly MALICIOUS_PATTERNS = [
		/bitcoin/i,
		/cryptocurrency/i,
		/mining/i,
		/backdoor/i,
		/malware/i,
		/virus/i,
		/trojan/i,
		/keylogger/i,
		/password.*steal/i,
		/credit.*card/i,
		/social.*security/i,
		/exec\s*\(/,
		/spawn\s*\(/,
		/fork\s*\(/,
		/system\s*\(/,
		/shell\s*\(/,
	];

	constructor(
		private readonly logger: Logger,
		private readonly globalConfig: GlobalConfig,
	) {
		this.TEMP_DIR = join(tmpdir(), 'n8n-validation');
		this.ensureTempDirectory();
	}

	private async ensureTempDirectory(): Promise<void> {
		try {
			await fs.mkdir(this.TEMP_DIR, { recursive: true });
		} catch (error) {
			this.logger.error('Failed to create validation temp directory', { error });
		}
	}

	/**
	 * Comprehensive validation of a custom node
	 */
	async validateNode(
		filePath: string,
		options: ValidationOptions = {},
	): Promise<ValidationResults> {
		this.logger.info('Starting comprehensive node validation', { filePath });

		const results: ValidationResults = {
			syntax: false,
			dependencies: false,
			security: false,
			tests: false,
			warnings: [],
			errors: [],
		};

		try {
			// Extract and prepare files for validation
			const extractPath = await this.extractNodeFiles(filePath);

			// Syntax validation
			if (options.validateSyntax !== false) {
				const syntaxResult = await this.validateSyntax(extractPath, options);
				results.syntax = syntaxResult.valid;

				if (!syntaxResult.valid) {
					results.errors.push(
						...syntaxResult.errors.map((e) => `Syntax Error: ${e.message} (line ${e.line})`),
					);
				}

				results.warnings.push(
					...syntaxResult.warnings.map((w) => `Syntax Warning: ${w.message} (line ${w.line})`),
				);
			}

			// Security validation
			if (options.validateSecurity !== false) {
				const securityResult = await this.validateSecurity(extractPath, options);
				results.security = securityResult.passed;

				if (!securityResult.passed) {
					results.errors.push(
						...securityResult.violations
							.filter((v) => v.type === 'critical' || v.type === 'high')
							.map(
								(v) =>
									`Security ${v.type}: ${v.message}${v.suggestion ? ` - ${v.suggestion}` : ''}`,
							),
					);
				}

				results.warnings.push(
					...securityResult.violations
						.filter((v) => v.type === 'medium' || v.type === 'low')
						.map(
							(v) => `Security ${v.type}: ${v.message}${v.suggestion ? ` - ${v.suggestion}` : ''}`,
						),
				);
			}

			// Dependencies validation
			if (options.validateDependencies !== false) {
				const depResult = await this.validateDependencies(extractPath, options);
				results.dependencies = depResult.valid;

				if (!depResult.valid) {
					results.errors.push(
						...depResult.vulnerabilities
							.filter((v) => v.severity === 'critical' || v.severity === 'high')
							.map((v) => `Dependency Security: ${v.title} in ${v.package}@${v.version}`),
					);

					results.errors.push(
						...depResult.maliciousPackages.map(
							(pkg) => `Malicious Package: ${pkg} is flagged as potentially malicious`,
						),
					);
				}

				results.warnings.push(
					...depResult.vulnerabilities
						.filter((v) => v.severity === 'moderate' || v.severity === 'low')
						.map((v) => `Dependency Warning: ${v.title} in ${v.package}@${v.version}`),
				);
			}

			// Test execution
			if (options.runTests === true) {
				const testResult = await this.runTests(extractPath);
				results.tests = testResult;

				if (!testResult) {
					results.errors.push('Test execution failed or no tests found');
				}
			}

			// Cleanup
			await this.cleanup(extractPath);
		} catch (error) {
			this.logger.error('Validation process failed', { filePath, error });
			results.errors.push(`Validation failed: ${error.message}`);
		}

		this.logger.info('Node validation completed', {
			filePath,
			syntax: results.syntax,
			security: results.security,
			dependencies: results.dependencies,
			tests: results.tests,
			errorCount: results.errors.length,
			warningCount: results.warnings.length,
		});

		return results;
	}

	/**
	 * Extract node files for validation
	 */
	private async extractNodeFiles(filePath: string): Promise<string> {
		const extractId = createHash('md5')
			.update(filePath + Date.now())
			.digest('hex');
		const extractPath = join(this.TEMP_DIR, extractId);

		await fs.mkdir(extractPath, { recursive: true });

		const fileExt = extname(filePath).toLowerCase();

		if (['.js', '.ts', '.json'].includes(fileExt)) {
			// Single file - copy directly
			const targetPath = join(extractPath, basename(filePath));
			await fs.copyFile(filePath, targetPath);
		} else if (['.zip', '.tar.gz', '.tgz'].includes(fileExt)) {
			// Archive - extract
			await this.extractArchive(filePath, extractPath);
		} else {
			throw new BadRequestError(`Unsupported file type: ${fileExt}`);
		}

		return extractPath;
	}

	/**
	 * Extract archive files
	 */
	private async extractArchive(archivePath: string, targetPath: string): Promise<void> {
		const fileExt = extname(archivePath).toLowerCase();

		return new Promise((resolve, reject) => {
			let command: string;
			let args: string[];

			if (fileExt === '.zip') {
				command = 'unzip';
				args = ['-q', archivePath, '-d', targetPath];
			} else if (['.tar.gz', '.tgz'].includes(fileExt)) {
				command = 'tar';
				args = ['-xzf', archivePath, '-C', targetPath];
			} else {
				return reject(new BadRequestError(`Unsupported archive type: ${fileExt}`));
			}

			const process = spawn(command, args);

			process.on('close', (code) => {
				if (code === 0) {
					resolve();
				} else {
					reject(new InternalServerError(`Failed to extract archive: exit code ${code}`));
				}
			});

			process.on('error', (error) => {
				reject(new InternalServerError(`Failed to extract archive: ${error.message}`));
			});
		});
	}

	/**
	 * Validate syntax of JavaScript/TypeScript files
	 */
	private async validateSyntax(
		extractPath: string,
		options: ValidationOptions,
	): Promise<SyntaxValidationResult> {
		const result: SyntaxValidationResult = {
			valid: true,
			errors: [],
			warnings: [],
		};

		const jsFiles = await this.findFiles(extractPath, ['.js', '.ts']);

		for (const file of jsFiles) {
			try {
				const content = await fs.readFile(file, 'utf-8');
				const fileResult = await this.validateJavaScriptSyntax(content, file);

				if (fileResult.errors.length > 0) {
					result.valid = false;
					result.errors.push(...fileResult.errors);
				}

				result.warnings.push(...fileResult.warnings);
			} catch (error) {
				result.valid = false;
				result.errors.push({
					message: `Failed to read file: ${error.message}`,
					line: 0,
					column: 0,
					type: 'ReadError',
				});
			}
		}

		return result;
	}

	/**
	 * Validate JavaScript syntax using Node.js syntax checking
	 */
	private async validateJavaScriptSyntax(
		content: string,
		filePath: string,
	): Promise<SyntaxValidationResult> {
		const result: SyntaxValidationResult = {
			valid: true,
			errors: [],
			warnings: [],
		};

		try {
			// Basic syntax validation using Node.js vm module approach
			const vm = await import('vm');

			// Try to compile the script
			new vm.Script(content, { filename: filePath });

			// Additional checks for n8n node structure
			await this.validateN8nNodeStructure(content, filePath, result);
		} catch (error) {
			result.valid = false;
			result.errors.push({
				message: error.message,
				line: this.extractLineNumber(error.stack) || 0,
				column: 0,
				type: 'SyntaxError',
			});
		}

		return result;
	}

	/**
	 * Validate n8n node structure requirements
	 */
	private async validateN8nNodeStructure(
		content: string,
		filePath: string,
		result: SyntaxValidationResult,
	): Promise<void> {
		// Check for required n8n node exports
		if (!content.includes('IExecuteFunctions') && !content.includes('execute')) {
			result.warnings.push({
				message: 'Node should implement execute function with IExecuteFunctions',
				line: 1,
				column: 0,
				type: 'StructureWarning',
			});
		}

		// Check for node description
		if (!content.includes('description') || !content.includes('displayName')) {
			result.warnings.push({
				message: 'Node should have displayName and description properties',
				line: 1,
				column: 0,
				type: 'StructureWarning',
			});
		}

		// Check for proper node type
		if (!content.includes('class ') || !content.includes('implements INodeType')) {
			result.warnings.push({
				message: 'Node should be a class implementing INodeType interface',
				line: 1,
				column: 0,
				type: 'StructureWarning',
			});
		}
	}

	/**
	 * Comprehensive security validation
	 */
	private async validateSecurity(
		extractPath: string,
		options: ValidationOptions,
	): Promise<SecurityCheckResult> {
		const result: SecurityCheckResult = {
			passed: true,
			violations: [],
			score: 100,
		};

		const allFiles = await this.findFiles(extractPath, this.ALLOWED_FILE_TYPES);

		for (const file of allFiles) {
			const content = await fs.readFile(file, 'utf-8');
			const fileViolations = await this.scanFileForSecurity(content, file);
			result.violations.push(...fileViolations);
		}

		// Calculate security score
		const criticalCount = result.violations.filter((v) => v.type === 'critical').length;
		const highCount = result.violations.filter((v) => v.type === 'high').length;
		const mediumCount = result.violations.filter((v) => v.type === 'medium').length;
		const lowCount = result.violations.filter((v) => v.type === 'low').length;

		// Score deduction: critical(-30), high(-15), medium(-5), low(-1)
		const scoreDeduction = criticalCount * 30 + highCount * 15 + mediumCount * 5 + lowCount * 1;
		result.score = Math.max(0, 100 - scoreDeduction);

		// Fail if critical or too many high violations
		result.passed = criticalCount === 0 && highCount < 3 && result.score >= 70;

		return result;
	}

	/**
	 * Scan individual file for security issues
	 */
	private async scanFileForSecurity(
		content: string,
		filePath: string,
	): Promise<SecurityViolation[]> {
		const violations: SecurityViolation[] = [];

		// Check for dangerous functions
		for (const dangerousFunc of this.DANGEROUS_FUNCTIONS) {
			const regex = new RegExp(`\\b${dangerousFunc}\\s*\\(`, 'g');
			let match;
			while ((match = regex.exec(content)) !== null) {
				const line = content.substring(0, match.index).split('\n').length;
				violations.push({
					type: dangerousFunc === 'eval' || dangerousFunc === 'Function' ? 'critical' : 'high',
					rule: 'dangerous-function',
					message: `Use of dangerous function '${dangerousFunc}' detected`,
					line,
					column: match.index,
					suggestion: `Consider safer alternatives to '${dangerousFunc}'`,
				});
			}
		}

		// Check for dangerous module requires
		for (const dangerousModule of this.DANGEROUS_MODULES) {
			const requireRegex = new RegExp(
				`require\\s*\\(\\s*['"]\s*${dangerousModule}\s*['"]\\s*\\)`,
				'g',
			);
			const importRegex = new RegExp(`import\\s+.*from\\s+['"]\s*${dangerousModule}\s*['"]`, 'g');

			let match;
			while ((match = requireRegex.exec(content)) !== null) {
				const line = content.substring(0, match.index).split('\n').length;
				violations.push({
					type: 'high',
					rule: 'dangerous-module',
					message: `Use of potentially dangerous module '${dangerousModule}' detected`,
					line,
					column: match.index,
					suggestion: `Ensure '${dangerousModule}' usage is necessary and secure`,
				});
			}

			while ((match = importRegex.exec(content)) !== null) {
				const line = content.substring(0, match.index).split('\n').length;
				violations.push({
					type: 'high',
					rule: 'dangerous-module',
					message: `Import of potentially dangerous module '${dangerousModule}' detected`,
					line,
					column: match.index,
					suggestion: `Ensure '${dangerousModule}' import is necessary and secure`,
				});
			}
		}

		// Check for malicious patterns
		for (const pattern of this.MALICIOUS_PATTERNS) {
			let match;
			while ((match = pattern.exec(content)) !== null) {
				const line = content.substring(0, match.index).split('\n').length;
				violations.push({
					type: 'critical',
					rule: 'malicious-pattern',
					message: `Potentially malicious pattern detected: ${match[0]}`,
					line,
					column: match.index,
					suggestion: 'Remove or justify this suspicious code pattern',
				});
			}
		}

		// Check for hardcoded credentials
		const credentialPatterns = [
			/password\s*[=:]\s*["'][^"']+["']/gi,
			/api_?key\s*[=:]\s*["'][^"']+["']/gi,
			/secret\s*[=:]\s*["'][^"']+["']/gi,
			/token\s*[=:]\s*["'][^"']+["']/gi,
		];

		for (const pattern of credentialPatterns) {
			let match;
			while ((match = pattern.exec(content)) !== null) {
				const line = content.substring(0, match.index).split('\n').length;
				violations.push({
					type: 'high',
					rule: 'hardcoded-credentials',
					message: 'Potential hardcoded credentials detected',
					line,
					column: match.index,
					suggestion: 'Use environment variables or secure credential storage',
				});
			}
		}

		return violations;
	}

	/**
	 * Validate dependencies for security and licensing
	 */
	private async validateDependencies(
		extractPath: string,
		options: ValidationOptions,
	): Promise<DependencyValidationResult> {
		const result: DependencyValidationResult = {
			valid: true,
			dependencies: [],
			vulnerabilities: [],
			maliciousPackages: [],
		};

		// Look for package.json
		const packageJsonPath = join(extractPath, 'package.json');

		try {
			await fs.access(packageJsonPath);
			const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

			// Validate dependencies
			const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

			for (const [name, version] of Object.entries(deps)) {
				const depInfo = await this.analyzeDependency(name, version as string);
				result.dependencies.push(depInfo);

				if (depInfo.security.vulnerabilities > 0) {
					result.valid = false;
				}

				// Check for malicious packages (simplified check)
				if (await this.isMaliciousPackage(name)) {
					result.maliciousPackages.push(name);
					result.valid = false;
				}
			}
		} catch (error) {
			// No package.json or invalid format
			this.logger.debug('No package.json found or invalid format', { extractPath });
		}

		return result;
	}

	/**
	 * Analyze individual dependency
	 */
	private async analyzeDependency(name: string, version: string): Promise<DependencyInfo> {
		// This is a simplified implementation
		// In production, you'd integrate with npm audit API or security databases
		return {
			name,
			version,
			license: 'Unknown',
			deprecated: false,
			security: {
				vulnerabilities: 0,
				advisories: [],
			},
		};
	}

	/**
	 * Check if package is known to be malicious
	 */
	private async isMaliciousPackage(packageName: string): Promise<boolean> {
		// Simplified check - in production integrate with security databases
		const suspiciousPatterns = [/bitcoin/i, /crypto.*mine/i, /backdoor/i, /evil/i, /hack/i];

		return suspiciousPatterns.some((pattern) => pattern.test(packageName));
	}

	/**
	 * Run tests if available
	 */
	private async runTests(extractPath: string): Promise<boolean> {
		// Look for test files or test scripts
		const testFiles = await this.findFiles(extractPath, [
			'.test.js',
			'.spec.js',
			'.test.ts',
			'.spec.ts',
		]);

		if (testFiles.length === 0) {
			// No tests found, but don't fail validation
			return true;
		}

		try {
			// Try to run npm test if package.json exists
			const packageJsonPath = join(extractPath, 'package.json');
			await fs.access(packageJsonPath);

			const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

			if (packageJson.scripts && packageJson.scripts.test) {
				return await this.runNpmTest(extractPath);
			}

			return true; // Tests exist but no test script
		} catch (error) {
			this.logger.warn('Test execution failed', { error });
			return false;
		}
	}

	/**
	 * Run npm test
	 */
	private async runNpmTest(extractPath: string): Promise<boolean> {
		return new Promise((resolve) => {
			const process = spawn('npm', ['test'], {
				cwd: extractPath,
				stdio: ['ignore', 'ignore', 'ignore'],
			});

			const timeout = setTimeout(() => {
				process.kill('SIGTERM');
				resolve(false);
			}, 30000); // 30 second timeout

			process.on('close', (code) => {
				clearTimeout(timeout);
				resolve(code === 0);
			});

			process.on('error', () => {
				clearTimeout(timeout);
				resolve(false);
			});
		});
	}

	/**
	 * Find files with specific extensions
	 */
	private async findFiles(directory: string, extensions: string[]): Promise<string[]> {
		const files: string[] = [];

		async function scanDirectory(dir: string): Promise<void> {
			const entries = await fs.readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = join(dir, entry.name);

				if (entry.isDirectory()) {
					// Skip node_modules and hidden directories
					if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
						await scanDirectory(fullPath);
					}
				} else if (entry.isFile()) {
					const ext = extname(entry.name).toLowerCase();
					if (extensions.includes(ext) || extensions.some((e) => entry.name.endsWith(e))) {
						files.push(fullPath);
					}
				}
			}
		}

		await scanDirectory(directory);
		return files;
	}

	/**
	 * Extract line number from error stack
	 */
	private extractLineNumber(stack?: string): number | null {
		if (!stack) return null;

		const match = stack.match(/:(\d+):\d+/);
		return match ? parseInt(match[1], 10) : null;
	}

	/**
	 * Cleanup temporary files
	 */
	private async cleanup(extractPath: string): Promise<void> {
		try {
			await fs.rm(extractPath, { recursive: true, force: true });
		} catch (error) {
			this.logger.warn('Failed to cleanup validation files', { extractPath, error });
		}
	}

	/**
	 * Get security recommendations based on validation results
	 */
	getSecurityRecommendations(violations: SecurityViolation[]): string[] {
		const recommendations: string[] = [];

		const criticalViolations = violations.filter((v) => v.type === 'critical');
		const highViolations = violations.filter((v) => v.type === 'high');

		if (criticalViolations.length > 0) {
			recommendations.push(
				'🚨 Critical security issues detected. Node cannot be deployed until resolved.',
			);
		}

		if (highViolations.length > 0) {
			recommendations.push(
				'⚠️ High-risk security issues found. Please review and address before deployment.',
			);
		}

		const functionViolations = violations.filter((v) => v.rule === 'dangerous-function');
		if (functionViolations.length > 0) {
			recommendations.push(
				'Consider using safer alternatives to dangerous functions like eval() and Function().',
			);
		}

		const credentialViolations = violations.filter((v) => v.rule === 'hardcoded-credentials');
		if (credentialViolations.length > 0) {
			recommendations.push(
				'Use environment variables or n8n credentials for sensitive data instead of hardcoding.',
			);
		}

		return recommendations;
	}
}
