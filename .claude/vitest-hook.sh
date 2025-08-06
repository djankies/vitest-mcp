#!/bin/bash

# Claude Code PreToolUse hook for intercepting Vitest commands
# Redirects Vitest commands to use the MCP server for better AI integration

# https://github.com/djankies/vitest-mcp

set -e

BYPASS_FLAG="--bypass-hook"

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')
description=$(echo "$input" | jq -r '.tool_input.description // empty')

is_vitest_project() {
    [[ -f "vitest.config.ts" ]] || \
    [[ -f "vitest.config.js" ]] || \
    [[ -f "vitest.config.mjs" ]] || \
    [[ -f "vite.config.ts" ]] || \
    [[ -f "vite.config.js" ]] || \
    ([ -f "package.json" ] && grep -q '"vitest"' package.json)
}

parse_vitest_command() {
    local cmd="$1"
    local target="."
    local format="summary"
    local coverage=false
    local reporter=""
    
    if [[ $cmd =~ vitest[[:space:]]+run[[:space:]]+([^[:space:]-]+) ]]; then
        target="${BASH_REMATCH[1]}"
    elif [[ $cmd =~ vitest[[:space:]]+([^[:space:]-]+) ]] && [[ ! $cmd =~ --watch ]]; then
        target="${BASH_REMATCH[1]}"
    fi
    
    if [[ $cmd =~ --reporter[=[:space:]]([^[:space:]]+) ]]; then
        reporter="${BASH_REMATCH[1]}"
        [[ $reporter == "json" ]] && format="detailed"
    fi
    
    [[ $cmd =~ --coverage ]] && coverage=true
    
    echo "$target|$format|$coverage|$reporter"
}

generate_mcp_suggestion() {
    local cmd="$1"
    local parsed
    local target format coverage reporter
    
    if ! [[ $cmd =~ ^(npx[[:space:]]+vitest|vitest|npm[[:space:]]+run[[:space:]]+vitest|yarn[[:space:]]+vitest|pnpm[[:space:]]+vitest)([[:space:]]|$) ]]; then
        return 1
    fi
    
    [[ $cmd =~ --(version|help)|[[:space:]](-v|-h)[[:space:]] ]] && return 1
    [[ $cmd =~ --watch|^vitest[[:space:]]+watch|^npx[[:space:]]+vitest[[:space:]]+watch ]] && {
        echo "ℹ️ Watch mode detected. Using direct Vitest execution for optimal experience."
        return 1
    }
    
    parsed=$(parse_vitest_command "$cmd")
    IFS='|' read -r target format coverage reporter <<< "$parsed"
    
    if [[ $coverage == "true" ]]; then
        echo "🔄 Use MCP tool: analyze_coverage({\"target\": \"$target\", \"format\": \"$format\"})" >&2
        return 0
    fi
    
    if [[ ! $cmd =~ --watch ]]; then
        echo "🔄 Use MCP tool: run_tests({\"target\": \"$target\", \"format\": \"$format\"})" >&2
        return 0
    fi
    
    return 1
}


main() {
    [[ -n "$command" ]] || exit 0
    
    if [[ " $command " == *" $BYPASS_FLAG "* ]] || [[ "$command" == "$BYPASS_FLAG" ]] || [[ "$command" == *" $BYPASS_FLAG" ]] || [[ "$command" == "$BYPASS_FLAG "* ]]; then
        echo "✓ Hook bypassed" >&2
        exit 0
    fi
    
    if ! is_vitest_project; then
        exit 0
    fi
    
    if generate_mcp_suggestion "$command"; then
        echo "💡 Add $BYPASS_FLAG to use Vitest directly" >&2
        exit 2
    fi
    
    exit 0
}

main