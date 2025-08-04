# Dependency Upgrade Plan - Vitest MCP Server

## 📊 Executive Summary

**Date**: January 2025  
**Current State**: 4 moderate security vulnerabilities, 3 major version updates available  
**Risk Level**: MEDIUM-HIGH (due to major version changes)  
**Estimated Time**: 2-4 hours  
**Priority**: HIGH (security vulnerabilities present)

## 🔍 Current Dependency Analysis

### Outdated Dependencies

| Package | Current | Latest | Update Type | Risk Level | Priority |
|---------|---------|--------|-------------|------------|----------|
| @modelcontextprotocol/sdk | 0.4.0 | 1.17.1 | **MAJOR** | HIGH | CRITICAL |
| vitest | 1.6.1 | 3.2.4 | **MAJOR** | HIGH | CRITICAL (Security) |
| @types/node | 20.19.9 | 24.2.0 | **MAJOR** | LOW | LOW |

### Security Vulnerabilities

| Package | Severity | Issue | Fix Required |
|---------|----------|-------|--------------|
| vitest (indirect via esbuild) | MODERATE | Development server CORS bypass | Upgrade to 3.2.4 |
| vite (indirect) | MODERATE | Via esbuild vulnerability | Fixed in vitest 3.2.4 |
| vite-node (indirect) | MODERATE | Via vite vulnerability | Fixed in vitest 3.2.4 |
| esbuild (indirect) | MODERATE | Origin validation bypass | Fixed in vitest 3.2.4 |

**⚠️ Critical Finding**: The esbuild vulnerability (CVE-2024-XXXX) allows any website to send requests to the development server and read responses. This is a CORS bypass vulnerability affecting development environments.

## 🎯 Upgrade Strategy

### Phase 1: Security Updates (IMMEDIATE)
**Timeline**: Immediate  
**Risk**: MEDIUM  
**Testing**: Comprehensive

#### 1.1 Vitest Upgrade (1.6.1 → 3.2.4)
- **Breaking Changes**: Major version jump requires careful migration
- **Security Fix**: Resolves 4 moderate vulnerabilities
- **Dependencies**: Will update vite, vite-node, and esbuild

### Phase 2: Core Dependencies (PLANNED)
**Timeline**: After Phase 1 stability confirmed  
**Risk**: MEDIUM  
**Testing**: Full regression

#### 2.1 @modelcontextprotocol/sdk (0.4.0 → 1.17.1)
- **Breaking Changes**: API changes expected
- **Benefits**: New features, better stability
- **Testing Focus**: MCP tool registration and communication

### Phase 3: Development Dependencies (LOW PRIORITY)
**Timeline**: Next maintenance window  
**Risk**: LOW  
**Testing**: Build verification

#### 3.1 @types/node (20.19.9 → 24.2.0)
- **Breaking Changes**: Type definition changes
- **Benefits**: Better Node.js 22+ support
- **Testing Focus**: TypeScript compilation

## 📋 Pre-Upgrade Checklist

- [x] Current test suite passing
- [x] Git repository clean (all changes committed)
- [ ] Create upgrade branch: `git checkout -b upgrade/dependencies-jan-2025`
- [ ] Backup package-lock.json
- [ ] Document current functionality baseline
- [ ] Notify team of upgrade window

## 🔄 Incremental Upgrade Path

### Step 1: Create Safety Checkpoint
```bash
# Create branch and backup
git checkout -b upgrade/dependencies-jan-2025
cp package.json package.json.backup
cp package-lock.json package-lock.json.backup

# Tag current state
git tag -a pre-upgrade-2025-01 -m "Pre-dependency upgrade checkpoint"

# Run baseline tests
npm test > test-baseline.log 2>&1
npm run build
```

### Step 2: Upgrade Vitest (Security Critical)

#### 2.1 Analysis of Breaking Changes (Vitest 1.x → 3.x)

**Major Changes to Address:**
1. **Configuration Format Changes**
   - `defineConfig` API changes
   - New configuration options
   - Changed default behaviors

2. **API Changes**
   - Mock API improvements
   - Changed assertion methods
   - New test runner features

3. **Module Resolution**
   - ESM-first approach
   - Changed module resolution algorithm

#### 2.2 Migration Steps

```bash
# Step 1: Update vitest to latest 2.x first (intermediate step)
npm install vitest@2.1.8 --save-dev

# Test at 2.x
npm test
npm run build

# Step 2: If stable, upgrade to 3.x
npm install vitest@3.2.4 --save-dev

# Update related packages
npm update

# Verify security issues resolved
npm audit
```

#### 2.3 Code Modifications Required

```typescript
// vitest.config.ts - May need updates
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Updated configuration format
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8', // Changed from 'c8' in v3
      reporter: ['text', 'json', 'html']
    }
  }
});
```

### Step 3: Upgrade MCP SDK

#### 3.1 Breaking Changes Analysis (@modelcontextprotocol/sdk 0.4.0 → 1.17.1)

**Expected Changes:**
1. **Server Constructor**: API likely changed
2. **Tool Registration**: New methods available
3. **Type Definitions**: Enhanced TypeScript support
4. **Error Handling**: Improved error types

#### 3.2 Migration Steps

```bash
# Upgrade MCP SDK
npm install @modelcontextprotocol/sdk@1.17.1

# Check for TypeScript errors
npm run build

# Run integration tests
npm test
```

#### 3.3 Code Updates Required

```typescript
// src/index.ts - Update Server initialization
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// May need to update constructor params
const server = new Server({
  name: 'vitest-mcp-server',
  version: '1.0.0',
  // New API may have additional options
});

// Tool registration might change
server.setRequestHandler('tools/list', async () => {
  // Updated response format
  return {
    tools: [listTestsTool, runTestsTool]
  };
});
```

### Step 4: Update Type Definitions

```bash
# Update @types/node
npm install @types/node@24.2.0 --save-dev

# Rebuild to check for type errors
npm run build
```

## 🧪 Testing Strategy

### Automated Test Suite
```bash
#!/bin/bash
# upgrade-test.sh

echo "🧪 Running Upgrade Test Suite"

# 1. Unit Tests
echo "Running unit tests..."
npm test || exit 1

# 2. Build Verification
echo "Verifying build..."
npm run build || exit 1

# 3. Lint Check
echo "Running linter..."
npm run lint || exit 1

# 4. Integration Tests
echo "Testing MCP tools..."
node -e "
const { handleRunTests } = require('./dist/tools/run-tests.js');
handleRunTests({ target: 'src/example.test.ts', format: 'summary' })
  .then(() => console.log('✅ Integration test passed'))
  .catch(err => { console.error('❌ Integration test failed:', err); process.exit(1); });
"

# 5. Security Audit
echo "Checking security..."
npm audit || exit 1

echo "✅ All tests passed!"
```

### Manual Testing Checklist

- [ ] `list_tests` tool returns test files correctly
- [ ] `run_tests` tool executes tests with all formats
- [ ] Structured output format working
- [ ] Error handling still functional
- [ ] Timeout protection working
- [ ] JSON reporter always used internally

## 🔄 Rollback Plan

### Immediate Rollback (< 5 minutes)
```bash
# Quick rollback
git checkout package.json package-lock.json
npm ci
npm test
```

### Full Rollback
```bash
# Complete rollback
git checkout main
git branch -D upgrade/dependencies-jan-2025
git tag -d pre-upgrade-2025-01

# Restore from backup
cp package.json.backup package.json
cp package-lock.json.backup package-lock.json
rm -rf node_modules
npm ci
```

## 📊 Post-Upgrade Verification

### Health Metrics to Monitor

| Metric | Baseline | Target | Actual |
|--------|----------|--------|--------|
| Test Pass Rate | 100% | 100% | TBD |
| Build Time | <5s | <5s | TBD |
| Bundle Size | ~500KB | <600KB | TBD |
| Type Check Time | <3s | <3s | TBD |
| Security Vulnerabilities | 4 | 0 | TBD |

### Verification Commands
```bash
# Performance comparison
time npm run build
time npm test

# Size check
du -sh dist/

# Functionality check
node dist/index.js --version
```

## 🚨 Known Issues & Mitigations

### Issue 1: Vitest 3.x Module Resolution
**Problem**: ESM module resolution changes may break imports  
**Solution**: Update import statements to use `.js` extensions
```typescript
// Before
import { tool } from './tool';

// After
import { tool } from './tool.js';
```

### Issue 2: MCP SDK API Changes
**Problem**: Server constructor may have different signature  
**Solution**: Check migration guide at https://modelcontextprotocol.io/migration

### Issue 3: TypeScript Strictness
**Problem**: Newer @types/node may reveal type issues  
**Solution**: Fix type errors or use `// @ts-ignore` temporarily

## 📈 Expected Benefits

1. **Security**: Eliminate 4 moderate vulnerabilities
2. **Performance**: Vitest 3.x is ~30% faster
3. **Features**: Access to new MCP SDK capabilities
4. **Stability**: Latest stable versions with bug fixes
5. **Compatibility**: Better Node.js 20+ support

## 📅 Implementation Timeline

| Phase | Task | Duration | Risk |
|-------|------|----------|------|
| 1 | Backup & Branch Creation | 5 min | None |
| 2 | Vitest Upgrade | 30 min | Medium |
| 3 | Testing & Validation | 20 min | Low |
| 4 | MCP SDK Upgrade | 30 min | Medium |
| 5 | Testing & Validation | 20 min | Low |
| 6 | Type Definitions Update | 10 min | Low |
| 7 | Final Testing | 15 min | Low |
| 8 | Documentation Update | 10 min | None |

**Total Estimated Time**: 2-3 hours

## 🎯 Success Criteria

- ✅ All security vulnerabilities resolved
- ✅ All tests passing
- ✅ Build successful
- ✅ No TypeScript errors
- ✅ MCP tools functioning correctly
- ✅ Performance metrics maintained or improved

## 📝 Post-Upgrade Tasks

1. Update README.md with new version requirements
2. Update CI/CD pipelines if needed
3. Document any API changes
4. Create release notes
5. Tag new version
6. Notify team of completion

## 🔗 Resources

- [Vitest Migration Guide](https://vitest.dev/guide/migration.html)
- [MCP SDK Changelog](https://github.com/modelcontextprotocol/sdk-js/releases)
- [Node.js Compatibility](https://nodejs.org/en/about/releases/)
- [NPM Audit Documentation](https://docs.npmjs.com/cli/v10/commands/npm-audit)

---

**Ready to proceed?** Start with Phase 1 (Security Updates) as these are critical.