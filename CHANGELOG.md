# Changelog

All notable changes to the Vitest MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **BREAKING**: Removed MCP server's ability to set or override coverage thresholds
- Coverage thresholds are now read exclusively from `vitest.config.ts` files
- Removed all threshold-related CLI arguments (`--threshold`, `--coverage-threshold-*`)
- Removed threshold-related environment variables (`VITEST_MCP_COVERAGE_THRESHOLD*`)
- `analyze_coverage` tool responses only include threshold information when thresholds are configured in Vitest config
- Projects without configured thresholds will not receive threshold-related fields in responses

### Added
- New `vitest-config-reader` utility to extract thresholds from Vitest configuration files
- Graceful error handling for future Vitest configuration schema changes
- Comprehensive validation and type checking for threshold values

### Fixed
- Threshold detection now uses parsed coverage percentages compared against configured thresholds
- Proper handling of projects that don't specify coverage thresholds
- Updated all documentation to reflect that thresholds should be configured in `vitest.config.ts`

## [0.4.1] - 2024-12-06

### Fixed
- Enhanced Claude Code hook to intercept npm/yarn/pnpm scripts that run vitest
- Added support for script names with colons (test:unit) and dashes (test-coverage)
- Hook now parses package.json to detect vitest-based scripts
- Improved bypass flag (`--bypass-hook`) flexibility - works in multiple positions

## [0.4.0] - 2024-12-06

### Added
- Comprehensive test suite with unit and integration tests
- Support for `vitest.mcp.config.ts` - MCP-specific configuration file that takes priority over regular vitest/vite configs
- New `config-finder` utility to intelligently locate configuration files with proper priority order
- Example configuration file (`vitest.mcp.config.example.ts`) demonstrating MCP-specific settings
- Path security validation with traversal protection
- Development mode support with VITEST_MCP_DEV_MODE environment variable

### Changed
- Configuration file detection now follows priority order: vitest.mcp.config.ts > vitest.config.ts > vitest.config.js > vitest.config.mjs > vite.config.ts > vite.config.js > vite.config.mjs
- Updated `run-tests` tool to use the prioritized configuration when setting up log capture
- Updated `project-context` to use the new config finder for project validation
- Enhanced coverage analysis with threshold validation and insights
- Improved test runner with better output capture and formatting
- Refactored MCP server initialization for better error handling

### Documentation
- Added configuration priority documentation to README
- Added example of MCP-specific configuration usage

## [0.3.0] - 2024-01-XX

### Added
- Plugin architecture for extensible tool system
- Coverage gap analysis with line-by-line insights
- Console log capture for debugging test failures
- Multi-repository support with context switching
- Development mode with enhanced debugging

### Changed
- Complete refactor to type-safe plugin architecture
- Improved error handling with user-friendly hints
- Enhanced structured JSON output for AI consumption

## [0.2.0] - Previous Release

### Added
- Initial MCP server implementation
- Basic test execution with JSON output
- Coverage analysis tool
- Test listing functionality