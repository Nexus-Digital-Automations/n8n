#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(__dirname);

/**
 * Enhanced TypeScript configuration for better code quality
 */
const ENHANCED_COMPILER_OPTIONS = {
  // Strict Type Checking
  strict: true,
  noImplicitAny: true,
  strictNullChecks: true,
  strictFunctionTypes: true,
  strictBindCallApply: true,
  strictPropertyInitialization: true,
  noImplicitThis: true,
  noImplicitReturns: true,
  noImplicitOverride: true,
  noUncheckedIndexedAccess: true,
  
  // Additional Checks
  noUnusedLocals: true,
  noUnusedParameters: true,
  exactOptionalPropertyTypes: true,
  noFallthroughCasesInSwitch: true,
  noUncheckedSideEffectImports: true,
  
  // Interop Constraints
  allowSyntheticDefaultImports: true,
  esModuleInterop: true,
  forceConsistentCasingInFileNames: true,
  
  // Type Checking Performance
  skipLibCheck: false,
  skipDefaultLibCheck: false
};

/**
 * Find all tsconfig.json files
 */
function findTsConfigFiles() {
  const configs = [];
  
  function scanDirectory(dir) {
    if (!existsSync(dir)) return;
    
    const entries = readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile() && entry.name === 'tsconfig.json') {
        configs.push(path.join(dir, entry.name));
      } else if (entry.isDirectory() && !entry.name.startsWith('.') && 
                 entry.name !== 'node_modules' && entry.name !== 'dist') {
        scanDirectory(path.join(dir, entry.name));
      }
    }
  }
  
  // Add root tsconfig
  const rootTsConfig = path.join(ROOT_DIR, 'tsconfig.json');
  if (existsSync(rootTsConfig)) {
    configs.push(rootTsConfig);
  }
  
  // Scan packages directory
  scanDirectory(path.join(ROOT_DIR, 'packages'));
  
  return configs;
}

/**
 * Enhance a TypeScript configuration
 */
function enhanceTsConfig(configPath) {
  try {
    const content = readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);
    
    // Initialize compilerOptions if it doesn't exist
    if (!config.compilerOptions) {
      config.compilerOptions = {};
    }
    
    // Track changes
    const changes = [];
    
    // Apply enhanced options
    for (const [key, value] of Object.entries(ENHANCED_COMPILER_OPTIONS)) {
      if (config.compilerOptions[key] !== value) {
        const oldValue = config.compilerOptions[key];
        config.compilerOptions[key] = value;
        changes.push(`${key}: ${oldValue} → ${value}`);
      }
    }
    
    // Add quality-focused include/exclude patterns if not present
    if (!config.include) {
      config.include = ['src/**/*', '*.ts', '*.mts'];
      changes.push('Added include patterns');
    }
    
    if (!config.exclude) {
      config.exclude = [
        'node_modules',
        'dist',
        'build',
        '**/*.test.ts',
        '**/*.spec.ts',
        'coverage',
        'temp'
      ];
      changes.push('Added exclude patterns');
    }
    
    // Write back if changes were made
    if (changes.length > 0) {
      const updatedContent = JSON.stringify(config, null, 2);
      writeFileSync(configPath, updatedContent);
      
      console.log(`✅ Enhanced ${path.relative(ROOT_DIR, configPath)}:`);
      changes.forEach(change => console.log(`  - ${change}`));
      
      return true;
    } else {
      console.log(`✓ ${path.relative(ROOT_DIR, configPath)} already optimized`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ Failed to enhance ${configPath}: ${error.message}`);
    return false;
  }
}

/**
 * Main function
 */
function main() {
  console.log('🔧 TypeScript Configuration Enhancement\n');
  
  const configs = findTsConfigFiles();
  console.log(`📄 Found ${configs.length} TypeScript configurations\n`);
  
  let enhancedCount = 0;
  
  for (const config of configs) {
    if (enhanceTsConfig(config)) {
      enhancedCount++;
    }
  }
  
  console.log(`\n📊 Summary: Enhanced ${enhancedCount}/${configs.length} configurations`);
  
  if (enhancedCount > 0) {
    console.log('\n🎯 Benefits of enhanced TypeScript configuration:');
    console.log('  ✅ Stricter type checking catches more errors');
    console.log('  ✅ Better code quality and maintainability');
    console.log('  ✅ Improved developer experience with better IntelliSense');
    console.log('  ✅ Reduced runtime errors through compile-time checks');
    console.log('  ✅ Enhanced code review process');
    
    console.log('\n💡 Note: You may see new TypeScript errors after this enhancement.');
    console.log('   This is expected and indicates code quality improvements are needed.');
  }
}

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
TypeScript Configuration Enhancement

Usage: node scripts/enhance-tsconfig.mjs

This script enhances all TypeScript configurations in the project with:

Strict Type Checking:
  ✅ strict: true
  ✅ noImplicitAny: true
  ✅ strictNullChecks: true
  ✅ strictFunctionTypes: true
  ✅ strictBindCallApply: true
  ✅ strictPropertyInitialization: true
  ✅ noImplicitThis: true
  ✅ noImplicitReturns: true
  ✅ noImplicitOverride: true
  ✅ noUncheckedIndexedAccess: true

Additional Quality Checks:
  ✅ noUnusedLocals: true
  ✅ noUnusedParameters: true
  ✅ exactOptionalPropertyTypes: true
  ✅ noFallthroughCasesInSwitch: true
  ✅ noUncheckedSideEffectImports: true

Performance & Compatibility:
  ✅ Optimized include/exclude patterns
  ✅ Enhanced interop settings
  ✅ Consistent casing enforcement

The enhanced configuration will help catch more errors at compile time
and improve overall code quality.
`);
  process.exit(0);
}

main();