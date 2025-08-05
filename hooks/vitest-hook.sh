#!/bin/bash

# Claude Code PreToolUse hook for intercepting Vitest commands
# Redirects Vitest commands to use the MCP server for better AI integration

set -e

# Configuration
BYPASS_FLAG="--bypass-hook"

# Read JSON input from stdin
input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')
description=$(echo "$input" | jq -r '.tool_input.description // empty')

# Check if this is a Vitest project
is_vitest_project() {
    [[ -f "vitest.config.ts" ]] || \
    [[ -f "vitest.config.js" ]] || \
    [[ -f "vitest.config.mjs" ]] || \
    [[ -f "vite.config.ts" ]] || \
    [[ -f "vite.config.js" ]] || \
    ([ -f "package.json" ] && grep -q '"vitest"' package.json)
}

# Parse command arguments
parse_vitest_command() {
    local cmd="$1"
    local target="."
    local format="summary"
    local coverage=false
    local reporter=""
    
    # Extract target (first non-flag argument)
    if [[ $cmd =~ vitest[[:space:]]+run[[:space:]]+([^[:space:]-]+) ]]; then
        target="${BASH_REMATCH[1]}"
    elif [[ $cmd =~ vitest[[:space:]]+([^[:space:]-]+) ]] && [[ ! $cmd =~ --watch ]]; then
        target="${BASH_REMATCH[1]}"
    fi
    
    # Extract reporter
    if [[ $cmd =~ --reporter[=[:space:]]([^[:space:]]+) ]]; then
        reporter="${BASH_REMATCH[1]}"
        [[ $reporter == "json" ]] && format="detailed"
    fi
    
    # Check for coverage
    [[ $cmd =~ --coverage ]] && coverage=true
    
    echo "$target|$format|$coverage|$reporter"
}

# Generate MCP tool suggestion
generate_mcp_suggestion() {
    local cmd="$1"
    local parsed
    local target format coverage reporter
    
    # Skip non-Vitest commands
    [[ $cmd =~ (npx[[:space:]]+)?vitest ]] || return 1
    
    # Skip version, help, and watch commands
    [[ $cmd =~ --(version|help)|[[:space:]](-v|-h)[[:space:]] ]] && return 1
    [[ $cmd =~ --watch|[[:space:]]watch[[:space:]] ]] && {
        echo "ℹ️ Watch mode detected. Using direct Vitest execution for optimal experience."
        return 1
    }
    
    parsed=$(parse_vitest_command "$cmd")
    IFS='|' read -r target format coverage reporter <<< "$parsed"
    
    # Handle coverage commands
    if [[ $coverage == "true" ]]; then
        echo "🔄 Intercepting Vitest coverage command. Using analyze_coverage MCP tool..." >&2
        echo "📝 Suggested MCP tool: analyze_coverage({\"target\": \"$target\", \"format\": \"$format\"})" >&2
        echo "💡 The analyze_coverage tool provides better coverage insights with line-by-line analysis." >&2
        echo "" >&2
        echo "🔄 Execute this instead:" >&2
        echo "   Use the analyze_coverage tool with parameters: {\"target\":\"$target\",\"format\":\"$format\"}" >&2
        return 0
    fi
    
    # Handle regular test runs (not watch mode)
    if [[ $cmd =~ (npx[[:space:]]+)?vitest([[:space:]]+run)? ]] && [[ ! $cmd =~ --watch ]]; then
        echo "🔄 Intercepting Vitest command. Using run_tests MCP tool for better AI integration..." >&2
        echo "📝 Suggested MCP tool: run_tests({\"target\": \"$target\", \"format\": \"$format\"})" >&2
        echo "💡 The run_tests tool provides structured output optimized for AI analysis." >&2
        echo "" >&2
        echo "🔄 Execute this instead:" >&2
        echo "   Use the run_tests tool with parameters: {\"target\":\"$target\",\"format\":\"$format\"}" >&2
        return 0
    fi
    
    return 1
}

# Handle test discovery commands
handle_test_discovery() {
    local cmd="$1"
    
    if [[ $cmd =~ find.*\.(test|spec)\. ]] || \
       [[ $cmd =~ ls.*test ]] || \
       [[ $cmd =~ grep.*test.*\.ts ]]; then
        echo "💡 Consider using the list_tests MCP tool for better test file discovery..." >&2
        echo "📝 Suggested MCP tool: list_tests({\"directory\": \".\"})" >&2
        echo "💡 The list_tests tool provides structured test file information." >&2
        return 0
    fi
    
    return 1
}

# Main execution for Claude Code hook
main() {
    # Exit early if no command or not a bash command
    [[ -n "$command" ]] || exit 0
    
    # Check for bypass flag
    if [[ $command =~ $BYPASS_FLAG ]]; then
        echo "⚠️ Bypassing hook as requested" >&2
        exit 0  # Allow command
    fi
    
    # Skip if not a Vitest project
    if ! is_vitest_project; then
        exit 0  # Allow command
    fi
    
    # Try to generate MCP suggestion for Vitest commands
    if generate_mcp_suggestion "$command"; then
        echo "" >&2
        echo "⚠️ To bypass this hook and use direct Vitest, add $BYPASS_FLAG flag" >&2
        exit 2  # Block command and show error to Claude
    fi
    
    # Try test discovery suggestion
    if handle_test_discovery "$command"; then
        exit 0  # Allow command but show suggestion
    fi
    
    # Allow original command to execute
    exit 0
}

# Execute main function
main