# Product Requirements Document - Vitest MCP Server (PRD)

## Executive Summary

### Problem Statement

LLMs frequently run inefficient Vitest commands:

- Running `vitest` on entire projects instead of specific files
- Using incorrect command syntax
- Not understanding basic Vitest options

### Solution Overview

A basic MCP server that provides simple guardrails for Vitest commands:

- Safe command execution with validation
- Basic project analysis
- Simple test targeting recommendations

### Success Metrics (V1)

- Prevent dangerous/inefficient commands
- Provide basic test execution interface
- Simple project structure understanding

## Core Objectives (V1)

### Primary Goals

1. **Safe Execution**: Validate and execute basic Vitest commands safely
2. **Simple Targeting**: Help LLMs target specific files/directories instead of running all tests
3. **Basic Validation**: Prevent obviously wrong command combinations

### V1 Scope Limitations

- No advanced optimization
- No complex configuration
- No performance analytics
- No caching systems

## Target Users (V1)

- Developers using Claude Code or other MCP-enabled LLM tools
- Focus on individual developers, not teams
- Simple use cases: running tests on specific files

## Technical Requirements (V1)

### Core MCP Tools (Simplified)

#### 1. `run_tests` Tool

**Purpose**: Execute basic Vitest commands safely
**Parameters**:

- `target` (optional): File path or directory
- `coverage` (boolean): Enable coverage

**Basic Validation**:

- Check if target exists
- Prevent running all tests if target not specified
- Basic command construction

#### 2. `list_tests` Tool  

**Purpose**: Find test files in project
**Parameters**:

- `path` (optional): Directory to search

**Returns**:

- List of test files found
- Basic project structure

### No Resources or Prompts in V1

Keep it simple - just the two basic tools above.

### Non-Functional Requirements (V1)

#### Basic Requirements

- Fast response time (<1s)
- Simple error messages
- Basic input validation
- Works with standard Vitest projects

## Simple Architecture (V1)

```text
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   LLM Client    │    │  Basic Vitest   │    │   Vitest CLI    │
│   (Claude)      │◄──►│  MCP Server     │◄──►│                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Simple Components

- **MCP Handler**: Basic MCP protocol handling
- **Command Builder**: Simple Vitest command construction  
- **File Scanner**: Basic test file discovery
- **Validator**: Basic input validation

## Implementation (V1)

### Simple Tech Stack

- **Language**: TypeScript/Node.js
- **MCP SDK**: @modelcontextprotocol/sdk-typescript
- **File System**: Node.js built-in fs
- **Process**: Node.js child_process

### Minimal Project Structure

```tree
vitest-mcp/
├── src/
│   ├── index.ts           # Main MCP server
│   ├── tools/
│   │   ├── run-tests.ts   # Run tests tool
│   │   └── list-tests.ts  # List tests tool  
│   └── utils/
│       └── file-utils.ts  # Basic file operations
├── package.json
└── README.md
```

## V1 Development Plan

### Week 1: Basic Setup

- Initialize TypeScript project with MCP SDK
- Create basic server structure with 2 tools
- Basic file discovery functionality

### Week 2: Core Tools  

- Implement `run_tests` tool with basic validation
- Implement `list_tests` tool
- Basic error handling

### Week 3: Testing & Polish

- Test with Claude Code
- Fix basic issues
- Simple documentation

## Future Versions

- V2: Add configuration options
- V3: Add performance optimizations  
- V4: Add advanced features from original PRD

This V1 focuses on the core problem: preventing LLMs from running inefficient Vitest commands and providing basic guardrails.
