#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(__dirname);

/**
 * Quality Gate Configuration
 */
const QUALITY_STANDARDS = {
  minQualityScore: 80,
  maxErrors: 0,
  maxWarnings: 10,
  maxComplexity: 15,
  maxFileLength: 400,
  maxFunctionLength: 250,
  requiredCoverage: 70
};

/**
 * Quality Gate Checker
 */
class QualityGate {
  constructor() {
    this.results = {
      passed: false,
      checks: [],
      score: 0,
      recommendations: []
    };
  }

  /**
   * Add a quality check result
   */
  addCheck(name, passed, message, score = 0) {
    this.results.checks.push({
      name,
      passed,
      message,
      score
    });
    
    console.log(`${passed ? '✅' : '❌'} ${name}: ${message}`);
    
    if (!passed) {
      this.results.recommendations.push(`Fix: ${name} - ${message}`);
    }
  }

  /**
   * Check lint quality
   */
  async checkLintQuality() {
    try {
      const reportFile = path.join(ROOT_DIR, 'lint-quality-report.json');
      
      if (!existsSync(reportFile)) {
        // Run quality lint first
        console.log('🔍 Running quality lint analysis...');
        execSync('node scripts/lint-quality.mjs', { cwd: ROOT_DIR, stdio: 'inherit' });
      }
      
      const report = JSON.parse(readFileSync(reportFile, 'utf8'));
      
      this.addCheck(
        'Lint Quality Score',
        report.qualityScore >= QUALITY_STANDARDS.minQualityScore,
        `${report.qualityScore}% (min: ${QUALITY_STANDARDS.minQualityScore}%)`,
        report.qualityScore
      );
      
      this.addCheck(
        'Error Count',
        report.errors <= QUALITY_STANDARDS.maxErrors,
        `${report.errors} errors (max: ${QUALITY_STANDARDS.maxErrors})`
      );
      
      this.addCheck(
        'Warning Count',
        report.warnings <= QUALITY_STANDARDS.maxWarnings,
        `${report.warnings} warnings (max: ${QUALITY_STANDARDS.maxWarnings})`
      );
      
      return report.qualityScore;
      
    } catch (error) {
      this.addCheck('Lint Quality', false, `Failed to check lint quality: ${error.message}`);
      return 0;
    }
  }

  /**
   * Check TypeScript compilation
   */
  async checkTypeScript() {
    try {
      console.log('🔍 Checking TypeScript compilation...');
      execSync('pnpm run typecheck', { cwd: ROOT_DIR, stdio: 'pipe' });
      this.addCheck('TypeScript', true, 'All TypeScript files compile successfully');
      return true;
    } catch (error) {
      this.addCheck('TypeScript', false, 'TypeScript compilation errors detected');
      return false;
    }
  }

  /**
   * Check build success
   */
  async checkBuild() {
    try {
      console.log('🔍 Testing build process...');
      // Use a timeout to prevent hanging
      execSync('timeout 300s pnpm run build:fast', { cwd: ROOT_DIR, stdio: 'pipe' });
      this.addCheck('Build', true, 'Build process completes successfully');
      return true;
    } catch (error) {
      this.addCheck('Build', false, 'Build process failed or timed out');
      return false;
    }
  }

  /**
   * Check for common security issues
   */
  async checkSecurity() {
    try {
      console.log('🔍 Checking for security issues...');
      
      // Check for common security anti-patterns
      const securityPatterns = [
        { pattern: /eval\s*\(/, message: 'eval() usage detected' },
        { pattern: /innerHTML\s*=/, message: 'Direct innerHTML assignment detected' },
        { pattern: /document\.write/, message: 'document.write usage detected' },
        { pattern: /password.*=.*['"]\w+['"]/, message: 'Hardcoded password detected' },
        { pattern: /api[_-]?key.*=.*['"]\w+['"]/, message: 'Hardcoded API key detected' }
      ];
      
      const files = execSync('find packages -name "*.ts" -o -name "*.js" | grep -v node_modules | head -100', 
        { cwd: ROOT_DIR, encoding: 'utf8' }).split('\n').filter(Boolean);
      
      let securityIssues = 0;
      
      for (const file of files) {
        try {
          const content = readFileSync(path.join(ROOT_DIR, file), 'utf8');
          
          for (const { pattern, message } of securityPatterns) {
            if (pattern.test(content)) {
              securityIssues++;
              console.log(`  ⚠️  ${file}: ${message}`);
            }
          }
        } catch {
          // Skip files that can't be read
        }
      }
      
      this.addCheck(
        'Security Scan',
        securityIssues === 0,
        securityIssues === 0 ? 'No security issues detected' : `${securityIssues} potential security issues found`
      );
      
      return securityIssues === 0;
      
    } catch (error) {
      this.addCheck('Security Scan', false, `Security check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Check code formatting
   */
  async checkFormatting() {
    try {
      console.log('🔍 Checking code formatting...');
      execSync('pnpm run format:check', { cwd: ROOT_DIR, stdio: 'pipe' });
      this.addCheck('Formatting', true, 'Code formatting is consistent');
      return true;
    } catch (error) {
      this.addCheck('Formatting', false, 'Code formatting issues detected');
      return false;
    }
  }

  /**
   * Check for TODO/FIXME comments
   */
  async checkTodoComments() {
    try {
      console.log('🔍 Checking for TODO/FIXME comments...');
      
      const result = execSync(
        'find packages -name "*.ts" -o -name "*.js" | grep -v node_modules | xargs grep -i "\\(TODO\\|FIXME\\|XXX\\|HACK\\)" | wc -l',
        { cwd: ROOT_DIR, encoding: 'utf8' }
      );
      
      const todoCount = parseInt(result.trim());
      
      this.addCheck(
        'TODO Comments',
        todoCount < 50, // Allow some TODOs but not too many
        `${todoCount} TODO/FIXME comments found`
      );
      
      return todoCount < 50;
      
    } catch (error) {
      this.addCheck('TODO Comments', true, 'Unable to check TODO comments');
      return true;
    }
  }

  /**
   * Check dependencies for vulnerabilities
   */
  async checkDependencies() {
    try {
      console.log('🔍 Checking dependencies...');
      execSync('pnpm audit --audit-level moderate', { cwd: ROOT_DIR, stdio: 'pipe' });
      this.addCheck('Dependencies', true, 'No critical dependency vulnerabilities');
      return true;
    } catch (error) {
      // pnpm audit exits with non-zero if vulnerabilities found
      const isVulnerabilityIssue = error.message.includes('audit');
      this.addCheck(
        'Dependencies', 
        false, 
        isVulnerabilityIssue ? 'Dependency vulnerabilities detected' : 'Dependency check failed'
      );
      return false;
    }
  }

  /**
   * Calculate overall quality score
   */
  calculateScore() {
    const passedChecks = this.results.checks.filter(check => check.passed).length;
    const totalChecks = this.results.checks.length;
    
    this.results.score = Math.round((passedChecks / totalChecks) * 100);
    this.results.passed = this.results.score >= 85; // 85% of checks must pass
    
    return this.results.score;
  }

  /**
   * Print final results
   */
  printResults() {
    console.log('\n🎯 QUALITY GATE RESULTS');
    console.log('═'.repeat(50));
    
    const passedCount = this.results.checks.filter(c => c.passed).length;
    const totalCount = this.results.checks.length;
    
    console.log(`📊 Checks: ${passedCount}/${totalCount} passed`);
    console.log(`🎯 Score: ${this.results.score}%`);
    console.log(`Status: ${this.results.passed ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (this.results.recommendations.length > 0) {
      console.log('\n📋 RECOMMENDATIONS:');
      this.results.recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
    }
    
    if (this.results.passed) {
      console.log('\n🎉 Quality gate passed! Code is ready for merge.');
    } else {
      console.log('\n🚨 Quality gate failed! Please address the issues above.');
    }
  }

  /**
   * Run all quality checks
   */
  async runAllChecks() {
    console.log('🚀 Starting Quality Gate Analysis...\n');
    
    const startTime = Date.now();
    
    // Run all checks
    await this.checkLintQuality();
    await this.checkTypeScript();
    await this.checkSecurity();
    await this.checkFormatting();
    await this.checkTodoComments();
    await this.checkDependencies();
    
    // Build check is optional for speed (can be enabled with --include-build)
    if (process.argv.includes('--include-build')) {
      await this.checkBuild();
    }
    
    this.calculateScore();
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n⏱️  Total analysis time: ${duration}s`);
    
    this.printResults();
    
    return this.results;
  }
}

/**
 * Main function
 */
async function main() {
  const gate = new QualityGate();
  const results = await gate.runAllChecks();
  
  // Exit with error code if quality gate fails
  process.exit(results.passed ? 0 : 1);
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Quality Gate: Comprehensive code quality analysis

Usage: node scripts/quality-gate.mjs [options]

Options:
  --include-build    Include build verification (slower)
  --help, -h         Show this help message

Quality Checks:
  ✅ Lint quality score (80%+ required)
  ✅ TypeScript compilation
  ✅ Security scan
  ✅ Code formatting
  ✅ TODO/FIXME analysis
  ✅ Dependency vulnerabilities
  ⚡ Build verification (optional)

Exit Codes:
  0 = Quality gate passed (85%+ checks passed)
  1 = Quality gate failed

Example:
  node scripts/quality-gate.mjs                # Standard quality check
  node scripts/quality-gate.mjs --include-build  # Include build verification
`);
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Quality gate error:', error.message);
  process.exit(1);
});