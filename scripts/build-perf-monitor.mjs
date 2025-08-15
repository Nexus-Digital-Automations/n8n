#!/usr/bin/env node

import { performance } from 'perf_hooks';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const PERF_LOG_FILE = path.join(process.cwd(), 'build-performance.log');

function logPerformance(operation, duration, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    operation,
    duration: `${duration.toFixed(2)}ms`,
    ...details
  };
  
  const logLine = `${timestamp} [${operation}] ${duration.toFixed(2)}ms ${JSON.stringify(details)}\n`;
  fs.appendFileSync(PERF_LOG_FILE, logLine);
  console.log(`⏱️  ${operation}: ${duration.toFixed(2)}ms`);
}

function measureCommand(command, operation) {
  const start = performance.now();
  try {
    const result = execSync(command, { 
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    const duration = performance.now() - start;
    logPerformance(operation, duration, { success: true, command });
    return { success: true, result, duration };
  } catch (error) {
    const duration = performance.now() - start;
    logPerformance(operation, duration, { success: false, error: error.message, command });
    return { success: false, error, duration };
  }
}

function analyzePerformance() {
  if (!fs.existsSync(PERF_LOG_FILE)) {
    console.log('📊 No performance data available yet');
    return;
  }
  
  const logs = fs.readFileSync(PERF_LOG_FILE, 'utf8').split('\n').filter(Boolean);
  const builds = logs.filter(line => line.includes('[build]'));
  
  if (builds.length === 0) {
    console.log('📊 No build performance data available');
    return;
  }
  
  const durations = builds.map(line => {
    const match = line.match(/(\d+\.\d+)ms/);
    return match ? parseFloat(match[1]) : 0;
  });
  
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  
  console.log('📊 Build Performance Analysis:');
  console.log(`   Total builds: ${builds.length}`);
  console.log(`   Average: ${avg.toFixed(2)}ms (${(avg/1000/60).toFixed(1)}min)`);
  console.log(`   Fastest: ${min.toFixed(2)}ms (${(min/1000/60).toFixed(1)}min)`);
  console.log(`   Slowest: ${max.toFixed(2)}ms (${(max/1000/60).toFixed(1)}min)`);
  
  if (avg > 300000) { // 5 minutes
    console.log('⚠️  Average build time is high - consider optimization');
  } else if (avg < 120000) { // 2 minutes  
    console.log('✅ Build performance is good');
  }
}

const command = process.argv[2];

switch (command) {
  case 'build':
    measureCommand('pnpm run build', 'build');
    break;
  case 'analyze':
    analyzePerformance();
    break;
  case 'monitor':
    const result = measureCommand('pnpm run build', 'monitored_build');
    if (result.success) {
      console.log('✅ Build completed successfully');
    } else {
      console.log('❌ Build failed');
      process.exit(1);
    }
    break;
  default:
    console.log('Usage: node build-perf-monitor.mjs [build|analyze|monitor]');
    process.exit(1);
}