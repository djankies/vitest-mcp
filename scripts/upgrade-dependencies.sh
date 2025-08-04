#!/bin/bash

# Dependency Upgrade Script for Vitest MCP Server
# Usage: ./scripts/upgrade-dependencies.sh [--phase <1|2|3>] [--dry-run]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PHASE=${2:-1}
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --phase)
      PHASE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

create_backup() {
    log_info "Creating backup..."
    cp package.json package.json.backup
    cp package-lock.json package-lock.json.backup
    
    # Create git tag
    git tag -a "pre-upgrade-$(date +%Y%m%d-%H%M%S)" -m "Pre-upgrade snapshot" || true
    
    log_info "Backup created successfully"
}

run_tests() {
    log_info "Running test suite..."
    
    # Run tests
    npm test || {
        log_error "Tests failed!"
        return 1
    }
    
    # Build project
    npm run build || {
        log_error "Build failed!"
        return 1
    }
    
    # Run linter
    npm run lint || {
        log_warning "Linting issues detected"
    }
    
    log_info "All tests passed!"
    return 0
}

check_security() {
    log_info "Checking security vulnerabilities..."
    
    npm audit --json > audit-report.json
    
    # Parse audit report
    vulnerabilities=$(node -e "
        const report = require('./audit-report.json');
        const total = report.metadata.vulnerabilities.total;
        console.log(total);
    ")
    
    if [ "$vulnerabilities" -gt 0 ]; then
        log_warning "Found $vulnerabilities vulnerabilities"
        npm audit
    else
        log_info "No vulnerabilities found!"
    fi
    
    rm audit-report.json
}

upgrade_phase_1() {
    log_info "=== PHASE 1: Security Updates (Vitest) ==="
    
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would upgrade vitest to 3.2.4"
        npm install vitest@3.2.4 --dry-run
        return 0
    fi
    
    # First upgrade to intermediate version
    log_info "Upgrading to Vitest 2.x (intermediate)..."
    npm install vitest@2.1.8 --save-dev
    
    # Test at 2.x
    if run_tests; then
        log_info "Vitest 2.x stable, upgrading to 3.x..."
        
        # Upgrade to latest
        npm install vitest@3.2.4 --save-dev
        
        # Update all related packages
        npm update
        
        # Test again
        if run_tests; then
            log_info "✅ Phase 1 complete: Vitest upgraded successfully"
            check_security
        else
            log_error "Tests failed after upgrade to 3.x"
            return 1
        fi
    else
        log_error "Tests failed at Vitest 2.x"
        return 1
    fi
}

upgrade_phase_2() {
    log_info "=== PHASE 2: Core Dependencies (MCP SDK) ==="
    
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would upgrade @modelcontextprotocol/sdk to 1.17.1"
        npm install @modelcontextprotocol/sdk@1.17.1 --dry-run
        return 0
    fi
    
    # Upgrade MCP SDK
    log_info "Upgrading MCP SDK..."
    npm install @modelcontextprotocol/sdk@1.17.1
    
    # Test
    if run_tests; then
        log_info "✅ Phase 2 complete: MCP SDK upgraded successfully"
    else
        log_error "Tests failed after MCP SDK upgrade"
        return 1
    fi
}

upgrade_phase_3() {
    log_info "=== PHASE 3: Development Dependencies ==="
    
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would upgrade @types/node to 24.2.0"
        npm install @types/node@24.2.0 --dry-run
        return 0
    fi
    
    # Upgrade type definitions
    log_info "Upgrading @types/node..."
    npm install @types/node@24.2.0 --save-dev
    
    # Test
    if run_tests; then
        log_info "✅ Phase 3 complete: Type definitions upgraded successfully"
    else
        log_error "Tests failed after @types/node upgrade"
        return 1
    fi
}

rollback() {
    log_error "Rolling back changes..."
    
    # Restore package files
    if [ -f package.json.backup ]; then
        mv package.json.backup package.json
        mv package-lock.json.backup package-lock.json
        
        # Reinstall dependencies
        rm -rf node_modules
        npm ci
        
        log_info "Rollback complete"
    else
        log_error "No backup found!"
        return 1
    fi
}

verify_upgrade() {
    log_info "Verifying upgrade..."
    
    # Check versions
    log_info "Current versions:"
    npm list --depth=0
    
    # Run comprehensive tests
    run_tests
    
    # Check security
    check_security
    
    # Test MCP functionality
    log_info "Testing MCP tools..."
    node -e "
        import('./dist/tools/run-tests.js').then(({ handleRunTests }) => {
            return handleRunTests({ 
                target: 'src/example.test.ts', 
                format: 'summary' 
            });
        }).then(result => {
            console.log('✅ MCP tools working correctly');
            console.log('Result:', result.structured.summary);
        }).catch(err => {
            console.error('❌ MCP tools test failed:', err);
            process.exit(1);
        });
    " || {
        log_error "MCP functionality test failed"
        return 1
    }
    
    log_info "✅ All verifications passed!"
}

# Main execution
main() {
    log_info "Starting dependency upgrade process..."
    log_info "Phase: $PHASE, Dry Run: $DRY_RUN"
    
    # Create backup (unless dry run)
    if [ "$DRY_RUN" = false ]; then
        create_backup
    fi
    
    # Run baseline tests
    log_info "Running baseline tests..."
    if ! run_tests; then
        log_error "Baseline tests failed. Fix issues before upgrading."
        exit 1
    fi
    
    # Execute appropriate phase
    case $PHASE in
        1)
            upgrade_phase_1 || {
                rollback
                exit 1
            }
            ;;
        2)
            upgrade_phase_2 || {
                rollback
                exit 1
            }
            ;;
        3)
            upgrade_phase_3 || {
                rollback
                exit 1
            }
            ;;
        all)
            upgrade_phase_1 || {
                rollback
                exit 1
            }
            upgrade_phase_2 || {
                rollback
                exit 1
            }
            upgrade_phase_3 || {
                rollback
                exit 1
            }
            ;;
        *)
            log_error "Invalid phase: $PHASE. Use 1, 2, 3, or 'all'"
            exit 1
            ;;
    esac
    
    # Final verification
    if [ "$DRY_RUN" = false ]; then
        verify_upgrade
        
        log_info "🎉 Upgrade completed successfully!"
        log_info "Remember to:"
        log_info "  1. Update documentation if needed"
        log_info "  2. Commit changes: git add -A && git commit -m 'chore: upgrade dependencies'"
        log_info "  3. Push to remote: git push origin upgrade/dependencies-jan-2025"
        log_info "  4. Create PR for review"
    else
        log_info "Dry run complete. Run without --dry-run to apply changes."
    fi
}

# Run main function
main