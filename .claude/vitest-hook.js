#!/usr/bin/env node

/**
 * Claude Code hook for intercepting Vitest commands
 * Redirects Vitest commands to use the MCP server for better AI integration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Hook configuration and command patterns
 */
const VITEST_PATTERNS = {
  run: /^(npx\s+)?vitest(\s+run)?\s+(.*)$/,
  coverage: /^(npx\s+)?vitest(\s+run)?\s+.*--coverage\b/,
  watch: /^(npx\s+)?vitest(\s+watch|\s+--watch)\b/,
  version: /^(npx\s+)?vitest\s+(--version|-v)\b/,
  help: /^(npx\s+)?vitest\s+(--help|-h)\b/,
  listTests: /^(find|ls|grep).*\.(test|spec)\./
};

/**
 * Check if this is a Vitest project
 */
function isVitestProject() {
  const configFiles = [
    'vitest.config.ts',
    'vitest.config.js', 
    'vitest.config.mjs',
    'vite.config.ts',
    'vite.config.js'
  ];
  
  return configFiles.some(file => fs.existsSync(path.join(process.cwd(), file))) ||
         (fs.existsSync('package.json') && 
          JSON.parse(fs.readFileSync('package.json', 'utf8')).devDependencies?.vitest);
}

/**
 * Parse Vitest command arguments
 */
function parseVitestCommand(command) {
  const runMatch = command.match(VITEST_PATTERNS.run);
  if (!runMatch) return null;

  const args = runMatch[3] || '';
  const parsed = {
    target: '.',
    format: 'summary',
    coverage: false,
    reporter: null,
    thresholds: {}
  };

  // Extract target (first non-flag argument)
  const targetMatch = args.match(/^([^\s-]+(?:\s+[^\s-]+)*)/);
  if (targetMatch) {
    parsed.target = targetMatch[1].trim();
  }

  // Extract reporter
  const reporterMatch = args.match(/--reporter[=\s]([^\s]+)/);
  if (reporterMatch) {
    parsed.reporter = reporterMatch[1];
    parsed.format = reporterMatch[1] === 'json' ? 'detailed' : 'summary';
  }

  // Check for coverage
  parsed.coverage = /--coverage\b/.test(args);

  // Extract coverage thresholds
  const thresholdMatches = args.matchAll(/--coverage\.thresholds\.(\w+)=(\d+)/g);
  for (const match of thresholdMatches) {
    parsed.thresholds[match[1]] = parseInt(match[2], 10);
  }

  return parsed;
}

/**
 * Generate MCP tool call suggestion
 */
function generateMCPSuggestion(command) {
  if (!isVitestProject()) {
    return null;
  }

  // Handle coverage commands
  if (VITEST_PATTERNS.coverage.test(command)) {
    const parsed = parseVitestCommand(command);
    if (!parsed) return null;

    const params = {
      target: parsed.target,
      format: parsed.format
    };

    if (Object.keys(parsed.thresholds).length > 0) {
      params.thresholds = parsed.thresholds;
    }

    return {
      tool: 'analyze_coverage',
      params,
      message: '🔄 Intercepting Vitest coverage command. Using analyze_coverage MCP tool for enhanced coverage analysis...',
      explanation: 'The analyze_coverage tool provides better coverage insights with line-by-line analysis and actionable recommendations.'
    };
  }

  // Handle regular test runs
  if (VITEST_PATTERNS.run.test(command) && !VITEST_PATTERNS.watch.test(command)) {
    const parsed = parseVitestCommand(command);
    if (!parsed) return null;

    const params = {
      target: parsed.target,
      format: parsed.format
    };

    return {
      tool: 'run_tests',
      params,
      message: '🔄 Intercepting Vitest command. Using run_tests MCP tool for better AI integration...',
      explanation: 'The run_tests tool provides structured output optimized for AI analysis with enhanced error context.'
    };
  }

  // Handle test discovery commands
  if (VITEST_PATTERNS.listTests.test(command)) {
    return {
      tool: 'list_tests',
      params: { directory: '.' },
      message: '💡 Consider using the list_tests MCP tool for better test file discovery...',
      explanation: 'The list_tests tool provides structured test file information with pattern matching and project analysis.'
    };
  }

  return null;
}

/**
 * Main hook execution
 */
function main() {
  const args = process.argv.slice(2);
  const command = args.join(' ');

  // Skip if not a Vitest command
  if (!Object.values(VITEST_PATTERNS).some(pattern => pattern.test(command))) {
    process.exit(0); // Allow original command to execute
  }

  // Skip version and help commands
  if (VITEST_PATTERNS.version.test(command) || VITEST_PATTERNS.help.test(command)) {
    process.exit(0);
  }

  // Skip watch mode (better handled by direct Vitest)
  if (VITEST_PATTERNS.watch.test(command)) {
    console.log('ℹ️ Watch mode detected. Using direct Vitest execution for optimal experience.');
    process.exit(0);
  }

  const suggestion = generateMCPSuggestion(command);
  
  if (suggestion) {
    console.log(suggestion.message);
    console.log(`📝 Suggested MCP tool: ${suggestion.tool}(${JSON.stringify(suggestion.params, null, 2)})`);
    console.log(`💡 ${suggestion.explanation}`);
    console.log();
    console.log('🔄 Execute this instead:');
    console.log(`   Use the ${suggestion.tool} tool with parameters: ${JSON.stringify(suggestion.params)}`);
    console.log();
    console.log('⚠️  To bypass this hook and use direct Vitest, add --bypass-hook flag');
    
    // Exit with code 1 to prevent original command execution
    process.exit(1);
  }

  // Allow original command to execute
  process.exit(0);
}

// Execute if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}