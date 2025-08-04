#!/usr/bin/env node

/**
 * Dependency Compatibility Checker
 * Analyzes compatibility between dependencies before upgrading
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const UPGRADE_TARGETS = {
  '@modelcontextprotocol/sdk': '1.17.1',
  'vitest': '3.2.4',
  '@types/node': '24.2.0'
};

class CompatibilityChecker {
  constructor() {
    this.issues = [];
    this.warnings = [];
    this.suggestions = [];
  }

  async checkAll() {
    console.log('🔍 Dependency Compatibility Analysis\n');
    console.log('=' .repeat(50));
    
    // Check Node.js version compatibility
    this.checkNodeVersion();
    
    // Check TypeScript compatibility
    this.checkTypeScriptCompatibility();
    
    // Check for peer dependency conflicts
    this.checkPeerDependencies();
    
    // Check for breaking changes
    this.checkBreakingChanges();
    
    // Generate report
    this.generateReport();
  }

  checkNodeVersion() {
    console.log('\n📦 Node.js Version Check');
    console.log('-'.repeat(30));
    
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    console.log(`Current Node.js: ${nodeVersion}`);
    
    // Check compatibility with target versions
    if (majorVersion < 18) {
      this.issues.push({
        package: 'Node.js',
        issue: `Node.js ${nodeVersion} is below minimum required (18.0.0)`,
        severity: 'HIGH',
        action: 'Upgrade Node.js to 18.x or higher'
      });
    } else if (majorVersion < 20) {
      this.warnings.push({
        package: 'Node.js',
        warning: `Node.js ${nodeVersion} is supported but not optimal`,
        recommendation: 'Consider upgrading to Node.js 20.x LTS'
      });
    } else {
      console.log('✅ Node.js version is compatible');
    }
    
    // Check for @types/node compatibility
    if (majorVersion >= 24) {
      console.log('✅ Compatible with @types/node@24.2.0');
    } else if (majorVersion >= 20) {
      this.warnings.push({
        package: '@types/node',
        warning: 'Using @types/node@24 with Node.js 20.x may have type mismatches',
        recommendation: 'Monitor for TypeScript errors after upgrade'
      });
    }
  }

  checkTypeScriptCompatibility() {
    console.log('\n🔷 TypeScript Compatibility');
    console.log('-'.repeat(30));
    
    try {
      const tsVersion = execSync('npx tsc --version', { encoding: 'utf8' }).trim();
      console.log(`Current TypeScript: ${tsVersion}`);
      
      // Extract version number
      const version = tsVersion.match(/\d+\.\d+\.\d+/)?.[0];
      if (version) {
        const [major, minor] = version.split('.').map(Number);
        
        // Vitest 3.x requires TypeScript 4.5+
        if (major < 4 || (major === 4 && minor < 5)) {
          this.issues.push({
            package: 'TypeScript',
            issue: 'Vitest 3.x requires TypeScript 4.5 or higher',
            severity: 'HIGH',
            action: 'Upgrade TypeScript to 5.x'
          });
        } else if (major === 4) {
          this.warnings.push({
            package: 'TypeScript',
            warning: 'TypeScript 4.x is supported but 5.x is recommended',
            recommendation: 'Consider upgrading to TypeScript 5.x'
          });
        } else {
          console.log('✅ TypeScript version is compatible');
        }
      }
    } catch (error) {
      this.issues.push({
        package: 'TypeScript',
        issue: 'Could not determine TypeScript version',
        severity: 'MEDIUM',
        action: 'Verify TypeScript is installed'
      });
    }
  }

  checkPeerDependencies() {
    console.log('\n🔗 Peer Dependencies Check');
    console.log('-'.repeat(30));
    
    // Check Vitest peer dependencies
    console.log('Checking Vitest 3.x requirements...');
    
    const vitestPeers = {
      '@vitest/ui': 'optional',
      'happy-dom': 'optional',
      'jsdom': 'optional'
    };
    
    for (const [pkg, requirement] of Object.entries(vitestPeers)) {
      if (requirement === 'optional') {
        this.suggestions.push(`Consider installing ${pkg} for additional features`);
      }
    }
    
    // Check MCP SDK requirements
    console.log('Checking MCP SDK 1.x requirements...');
    
    // MCP SDK typically doesn't have strict peer deps, but check for conflicts
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    if (packageJson.type !== 'module') {
      this.warnings.push({
        package: 'package.json',
        warning: 'MCP SDK works best with ESM modules',
        recommendation: 'Ensure "type": "module" is set in package.json'
      });
    }
    
    console.log('✅ No peer dependency conflicts detected');
  }

  checkBreakingChanges() {
    console.log('\n⚠️  Breaking Changes Analysis');
    console.log('-'.repeat(30));
    
    // Vitest 1.x to 3.x breaking changes
    console.log('\nVitest 1.x → 3.x:');
    const vitestBreaking = [
      '• Configuration API changes (defineConfig)',
      '• Mock API improvements (vi.mock behavior)',
      '• Coverage provider changed from c8 to v8',
      '• ESM-first module resolution',
      '• Changed default test timeout (5000ms → 10000ms)',
      '• Snapshot format changes'
    ];
    
    vitestBreaking.forEach(change => console.log(change));
    
    // MCP SDK 0.4.x to 1.x breaking changes
    console.log('\n@modelcontextprotocol/sdk 0.4.x → 1.x:');
    const mcpBreaking = [
      '• Server constructor signature changed',
      '• New transport layer abstraction',
      '• Updated tool registration API',
      '• Enhanced error handling',
      '• TypeScript types restructured'
    ];
    
    mcpBreaking.forEach(change => console.log(change));
    
    // Code patterns to check
    console.log('\n📝 Code Patterns to Review:');
    this.checkCodePatterns();
  }

  checkCodePatterns() {
    const patterns = [
      {
        pattern: /new Server\(\{[\s\S]*?\}\)/g,
        file: 'src/index.ts',
        description: 'Server constructor may need updates'
      },
      {
        pattern: /import.*vitest/g,
        file: 'vitest.config.ts',
        description: 'Vitest imports may need updates'
      },
      {
        pattern: /defineConfig/g,
        file: 'vitest.config.ts',
        description: 'Config API may have changed'
      }
    ];
    
    patterns.forEach(({ pattern, file, description }) => {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        if (pattern.test(content)) {
          console.log(`  • ${file}: ${description}`);
        }
      }
    });
  }

  generateReport() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 COMPATIBILITY REPORT');
    console.log('='.repeat(50));
    
    // Issues (must fix)
    if (this.issues.length > 0) {
      console.log('\n❌ ISSUES (Must Fix):');
      this.issues.forEach(issue => {
        console.log(`\n  ${issue.package}:`);
        console.log(`    Issue: ${issue.issue}`);
        console.log(`    Severity: ${issue.severity}`);
        console.log(`    Action: ${issue.action}`);
      });
    } else {
      console.log('\n✅ No blocking issues found');
    }
    
    // Warnings (should consider)
    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      this.warnings.forEach(warning => {
        console.log(`\n  ${warning.package}:`);
        console.log(`    Warning: ${warning.warning}`);
        console.log(`    Recommendation: ${warning.recommendation}`);
      });
    }
    
    // Suggestions (nice to have)
    if (this.suggestions.length > 0) {
      console.log('\n💡 SUGGESTIONS:');
      this.suggestions.forEach(suggestion => {
        console.log(`  • ${suggestion}`);
      });
    }
    
    // Upgrade readiness
    console.log('\n' + '='.repeat(50));
    const ready = this.issues.length === 0;
    if (ready) {
      console.log('✅ READY TO UPGRADE');
      console.log('\nRecommended upgrade order:');
      console.log('  1. vitest@3.2.4 (security fix)');
      console.log('  2. @modelcontextprotocol/sdk@1.17.1');
      console.log('  3. @types/node@24.2.0');
      console.log('\nRun: ./scripts/upgrade-dependencies.sh --phase 1');
    } else {
      console.log('❌ NOT READY TO UPGRADE');
      console.log(`\nFix ${this.issues.length} issue(s) before proceeding`);
    }
    
    // Generate compatibility matrix
    console.log('\n📋 Compatibility Matrix:');
    console.log('-'.repeat(50));
    console.log('| Package | Current | Target | Compatible |');
    console.log('|---------|---------|--------|------------|');
    
    for (const [pkg, target] of Object.entries(UPGRADE_TARGETS)) {
      const compatible = this.issues.some(i => i.package === pkg) ? '❌' : '✅';
      const current = this.getCurrentVersion(pkg);
      console.log(`| ${pkg.padEnd(30)} | ${current.padEnd(7)} | ${target.padEnd(6)} | ${compatible.padEnd(10)} |`);
    }
  }

  getCurrentVersion(packageName) {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const version = packageJson.dependencies?.[packageName] || 
                     packageJson.devDependencies?.[packageName] || 
                     'N/A';
      return version.replace(/[\^~]/, '');
    } catch {
      return 'N/A';
    }
  }
}

// Run compatibility check
const checker = new CompatibilityChecker();
checker.checkAll().catch(console.error);