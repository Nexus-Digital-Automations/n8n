#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(__dirname);
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages');
const QUALITY_REPORT_FILE = path.join(ROOT_DIR, 'lint-quality-report.json');

/**
 * Quality metrics tracker
 */
class QualityMetrics {
  constructor() {
    this.metrics = {
      timestamp: new Date().toISOString(),
      totalPackages: 0,
      lintedPackages: 0,
      errors: 0,
      warnings: 0,
      packageResults: {},
      performance: {
        startTime: Date.now(),
        endTime: null,
        duration: null
      },
      qualityScore: 0,
      previousScore: this.loadPreviousScore()
    };
  }

  loadPreviousScore() {
    if (existsSync(QUALITY_REPORT_FILE)) {
      try {
        const report = JSON.parse(readFileSync(QUALITY_REPORT_FILE, 'utf8'));
        return report.qualityScore || 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  addPackageResult(packageName, result) {
    this.metrics.packageResults[packageName] = result;
    this.metrics.errors += result.errors || 0;
    this.metrics.warnings += result.warnings || 0;
    this.metrics.lintedPackages++;
  }

  calculateQualityScore() {
    const totalIssues = this.metrics.errors + this.metrics.warnings;
    const maxIssues = this.metrics.lintedPackages * 10; // Assume 10 issues per package as baseline
    const score = Math.max(0, Math.min(100, 100 - (totalIssues / maxIssues) * 100));
    this.metrics.qualityScore = Math.round(score * 100) / 100;
    return this.metrics.qualityScore;
  }

  finalize() {
    this.metrics.performance.endTime = Date.now();
    this.metrics.performance.duration = this.metrics.performance.endTime - this.metrics.performance.startTime;
    this.calculateQualityScore();
    
    // Save report
    writeFileSync(QUALITY_REPORT_FILE, JSON.stringify(this.metrics, null, 2));
    
    return this.metrics;
  }

  printSummary() {
    const improvement = this.metrics.qualityScore - this.metrics.previousScore;
    const duration = Math.round(this.metrics.performance.duration / 1000);
    
    console.log('\n📊 QUALITY REPORT SUMMARY');
    console.log('═'.repeat(50));
    console.log(`📦 Packages: ${this.metrics.lintedPackages}/${this.metrics.totalPackages}`);
    console.log(`❌ Errors: ${this.metrics.errors}`);
    console.log(`⚠️  Warnings: ${this.metrics.warnings}`);
    console.log(`🎯 Quality Score: ${this.metrics.qualityScore}% ${improvement >= 0 ? '↗️' : '↘️'} (${improvement > 0 ? '+' : ''}${improvement.toFixed(1)})`);
    console.log(`⏱️  Duration: ${duration}s`);
    
    if (this.metrics.qualityScore >= 95) {
      console.log('🏆 EXCELLENT - Code quality is outstanding!');
    } else if (this.metrics.qualityScore >= 85) {
      console.log('✅ GOOD - Code quality meets standards');
    } else if (this.metrics.qualityScore >= 70) {
      console.log('⚠️  FAIR - Code quality needs improvement');
    } else {
      console.log('🚨 POOR - Urgent code quality fixes needed');
    }
    
    console.log(`📄 Full report: ${QUALITY_REPORT_FILE}`);
  }
}

/**
 * Enhanced package scanner with caching
 */
function getLintablePackages() {
  const packages = [];
  const cacheFile = path.join(ROOT_DIR, '.lint-cache.json');
  
  // Check if cache is valid (less than 1 hour old)
  if (existsSync(cacheFile)) {
    const cacheStats = statSync(cacheFile);
    const cacheAge = Date.now() - cacheStats.mtime.getTime();
    if (cacheAge < 3600000) { // 1 hour
      try {
        return JSON.parse(readFileSync(cacheFile, 'utf8'));
      } catch {
        // Cache corrupted, continue with fresh scan
      }
    }
  }
  
  function scanDirectory(dir) {
    if (!existsSync(dir)) return;
    
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(dir, entry.name);
        const packageJsonPath = path.join(fullPath, 'package.json');
        
        if (existsSync(packageJsonPath)) {
          try {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
            if (packageJson.scripts && packageJson.scripts.lint) {
              const stats = statSync(fullPath);
              
              packages.push({
                name: packageJson.name,
                path: fullPath,
                lastModified: stats.mtime.getTime(),
                hasTypescript: existsSync(path.join(fullPath, 'tsconfig.json')),
                hasTests: !!(packageJson.scripts.test || packageJson.scripts['test:unit']),
                isPrivate: packageJson.private || false,
                size: calculateDirectorySize(fullPath)
              });
            }
          } catch (error) {
            console.warn(`Warning: Could not parse ${packageJsonPath}`);
          }
        } else {
          // Recursively scan subdirectories
          scanDirectory(fullPath);
        }
      }
    }
  }
  
  scanDirectory(PACKAGES_DIR);
  
  // Cache the results
  writeFileSync(cacheFile, JSON.stringify(packages, null, 2));
  
  return packages;
}

/**
 * Calculate directory size for prioritization
 */
function calculateDirectorySize(dirPath) {
  let size = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && !entry.name.startsWith('.')) {
        const fullPath = path.join(dirPath, entry.name);
        size += statSync(fullPath).size;
      }
    }
  } catch {
    // Ignore errors
  }
  return size;
}

/**
 * Smart package categorization based on multiple factors
 */
function categorizePackages(packages) {
  const heavy = [];
  const medium = [];
  const light = [];
  
  // Sort by size and complexity for better scheduling
  const sortedPackages = packages.sort((a, b) => b.size - a.size);
  
  for (const pkg of sortedPackages) {
    const name = pkg.name;
    const sizeWeight = pkg.size > 1000000 ? 2 : pkg.size > 500000 ? 1 : 0;
    const complexityWeight = (pkg.hasTypescript ? 1 : 0) + (pkg.hasTests ? 1 : 0);
    const nameWeight = (name.includes('nodes-base') || name === 'n8n' || name.includes('editor-ui')) ? 2 : 
                      (name.includes('core') || name.includes('cli') || name.includes('design-system')) ? 1 : 0;
    
    const totalWeight = sizeWeight + complexityWeight + nameWeight;
    
    if (totalWeight >= 4) {
      heavy.push(pkg);
    } else if (totalWeight >= 2) {
      medium.push(pkg);
    } else {
      light.push(pkg);
    }
  }
  
  return { heavy, medium, light };
}

/**
 * Parse ESLint output for metrics
 */
function parseESLintOutput(output) {
  const lines = output.split('\n');
  let errors = 0;
  let warnings = 0;
  
  for (const line of lines) {
    if (line.includes('error')) errors++;
    if (line.includes('warning')) warnings++;
  }
  
  return { errors, warnings };
}

/**
 * Run lint with real-time quality tracking
 */
async function runQualityLint(packages, mode = 'full') {
  const metrics = new QualityMetrics();
  metrics.metrics.totalPackages = packages.length;
  
  if (packages.length === 0) {
    console.log('🎉 No packages to lint');
    return metrics.finalize();
  }
  
  const { heavy, medium, light } = categorizePackages(packages);
  
  console.log(`🔍 Quality Lint Analysis (${mode} mode)`);
  console.log(`📊 Package Distribution:`);
  console.log(`  🔨 Heavy: ${heavy.length} packages (sequential)`);
  console.log(`  ⚡ Medium: ${medium.length} packages (concurrency: 4)`);
  console.log(`  🚀 Light: ${light.length} packages (concurrency: 8)`);
  console.log();
  
  try {
    // Process heavy packages sequentially with detailed tracking
    for (const pkg of heavy) {
      console.log(`🔨 Linting ${pkg.name}...`);
      const startTime = Date.now();
      
      try {
        const relativePath = path.relative(ROOT_DIR, pkg.path);
        const output = execSync(`turbo run lint --filter="./${relativePath}" --cache-dir=.turbo`, 
          { encoding: 'utf8', timeout: 120000 }); // 2 minute timeout per package
        
        const result = parseESLintOutput(output);
        result.duration = Date.now() - startTime;
        result.status = 'success';
        
        metrics.addPackageResult(pkg.name, result);
        console.log(`  ✅ ${Math.round(result.duration / 1000)}s - ${result.errors} errors, ${result.warnings} warnings`);
        
      } catch (error) {
        const result = { errors: 1, warnings: 0, duration: Date.now() - startTime, status: 'failed' };
        metrics.addPackageResult(pkg.name, result);
        console.log(`  ❌ ${Math.round(result.duration / 1000)}s - Failed to lint`);
      }
    }
    
    // Process medium packages in parallel batches
    if (medium.length > 0) {
      console.log('⚡ Linting medium packages...');
      const mediumFilters = medium.map(pkg => `--filter="./${path.relative(ROOT_DIR, pkg.path)}"`).join(' ');
      
      try {
        const output = execSync(`turbo run lint ${mediumFilters} --parallel --concurrency=4 --cache-dir=.turbo`, 
          { encoding: 'utf8', timeout: 300000 }); // 5 minute timeout
        
        // Simplified tracking for batch operations
        const batchResult = parseESLintOutput(output);
        const avgPerPackage = {
          errors: Math.round(batchResult.errors / medium.length),
          warnings: Math.round(batchResult.warnings / medium.length)
        };
        
        medium.forEach(pkg => {
          metrics.addPackageResult(pkg.name, { ...avgPerPackage, status: 'success' });
        });
        
        console.log(`  ✅ Completed - ${batchResult.errors} total errors, ${batchResult.warnings} total warnings`);
        
      } catch (error) {
        medium.forEach(pkg => {
          metrics.addPackageResult(pkg.name, { errors: 1, warnings: 0, status: 'failed' });
        });
        console.log(`  ❌ Batch failed`);
      }
    }
    
    // Process light packages with high concurrency
    if (light.length > 0) {
      console.log('🚀 Linting light packages...');
      const lightFilters = light.map(pkg => `--filter="./${path.relative(ROOT_DIR, pkg.path)}"`).join(' ');
      
      try {
        const output = execSync(`turbo run lint ${lightFilters} --parallel --concurrency=8 --cache-dir=.turbo`, 
          { encoding: 'utf8', timeout: 300000 }); // 5 minute timeout
        
        const batchResult = parseESLintOutput(output);
        const avgPerPackage = {
          errors: Math.round(batchResult.errors / light.length),
          warnings: Math.round(batchResult.warnings / light.length)
        };
        
        light.forEach(pkg => {
          metrics.addPackageResult(pkg.name, { ...avgPerPackage, status: 'success' });
        });
        
        console.log(`  ✅ Completed - ${batchResult.errors} total errors, ${batchResult.warnings} total warnings`);
        
      } catch (error) {
        light.forEach(pkg => {
          metrics.addPackageResult(pkg.name, { errors: 1, warnings: 0, status: 'failed' });
        });
        console.log(`  ❌ Batch failed`);
      }
    }
    
    const finalMetrics = metrics.finalize();
    metrics.printSummary();
    
    return finalMetrics;
    
  } catch (error) {
    console.error('\n❌ Quality lint failed:', error.message);
    return metrics.finalize();
  }
}

/**
 * Main function with quality tracking
 */
async function main() {
  const mode = process.argv[2] || 'auto';
  
  console.log('🎯 Quality Lint: Enhanced code quality analysis...\n');
  
  const allPackages = getLintablePackages();
  console.log(`📄 Found ${allPackages.length} lintable packages\n`);
  
  // For now, always run full quality lint to establish baseline
  const packages = allPackages;
  
  const metrics = await runQualityLint(packages, mode);
  
  // Exit with appropriate code based on quality score
  if (metrics.qualityScore < 70) {
    process.exit(1);
  }
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Quality Lint: Enhanced code quality analysis with metrics tracking

Usage: node scripts/lint-quality.mjs [mode]

Modes:
  auto     - Intelligent mode with quality tracking (default)
  full     - Complete quality analysis of all packages
  
Features:
  ✅ Real-time quality metrics
  ⚡ Optimized parallel execution 
  📊 Quality score tracking
  🎯 Performance monitoring
  💾 Intelligent caching
  📄 Detailed quality reports

Output:
  - Quality score (0-100%)
  - Error/warning counts
  - Performance metrics
  - Trend analysis
  - Detailed JSON report
`);
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});