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

check_npm_script_for_vitest() {
    local cmd="$1"
    local script_name=""
    
    # Check different package manager patterns
    if [[ $cmd =~ ^npm[[:space:]]+run[[:space:]]+([^[:space:]]+) ]]; then
        # npm run <script-name>
        script_name="${BASH_REMATCH[1]}"
    elif [[ $cmd =~ ^npm[[:space:]]+test([[:space:]]|$) ]]; then
        # npm test (special case)
        script_name="test"
    elif [[ $cmd =~ ^yarn[[:space:]]+([^[:space:]]+) ]]; then
        # yarn <script-name>
        script_name="${BASH_REMATCH[1]}"
    elif [[ $cmd =~ ^pnpm[[:space:]]+run[[:space:]]+([^[:space:]]+) ]] || [[ $cmd =~ ^pnpm[[:space:]]+([^[:space:]]+) ]]; then
        # pnpm run <script-name> or pnpm <script-name>
        script_name="${BASH_REMATCH[1]}"
    fi
    
    # Check if package.json exists and contains this script
    if [[ -f "package.json" ]] && [[ -n "$script_name" ]]; then
        # Extract the script command from package.json
        local script_cmd=$(jq -r ".scripts[\"$script_name\"] // empty" package.json 2>/dev/null)
        
        # Check if the script runs vitest
        if [[ $script_cmd =~ vitest ]]; then
            # Return the actual vitest command that would be run
            echo "$script_cmd"
            return 0
        fi
    fi
    
    return 1
}

generate_mcp_suggestion() {
    local cmd="$1"
    local parsed
    local target format coverage reporter
    local actual_cmd="$cmd"
    
    # First check if this is an npm script that runs vitest
    if vitest_cmd=$(check_npm_script_for_vitest "$cmd"); then
        # Use the actual vitest command for parsing
        actual_cmd="$vitest_cmd"
        echo "ℹ️ Detected npm script running: $vitest_cmd" >&2
    elif ! [[ $cmd =~ ^(npx[[:space:]]+vitest|vitest|npm[[:space:]]+run[[:space:]]+vitest|yarn[[:space:]]+vitest|pnpm[[:space:]]+vitest)([[:space:]]|$) ]]; then
        return 1
    fi
    
    [[ $actual_cmd =~ --(version|help)|[[:space:]](-v|-h)[[:space:]] ]] && return 1
    [[ $actual_cmd =~ --watch|^vitest[[:space:]]+watch|^npx[[:space:]]+vitest[[:space:]]+watch ]] && {
        echo "ℹ️ Watch mode detected. Using direct Vitest execution for optimal experience."
        return 1
    }
    
    parsed=$(parse_vitest_command "$actual_cmd")
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
    
    # Check if bypass flag is present
    if [[ " $command " == *" $BYPASS_FLAG "* ]] || [[ "$command" == "$BYPASS_FLAG" ]] || [[ "$command" == *" $BYPASS_FLAG" ]] || [[ "$command" == "$BYPASS_FLAG "* ]]; then
        # Remove the bypass flag from the command
        cleaned_command="${command//$BYPASS_FLAG/}"
        # Remove any double spaces that may result
        cleaned_command=$(echo "$cleaned_command" | sed 's/  */ /g' | sed 's/^ *//;s/ *$//')
        
        # Output the cleaned command for the tool to use
        echo "$input" | jq --arg cmd "$cleaned_command" '.tool_input.command = $cmd'
        echo "✓ Hook bypassed - executing: $cleaned_command" >&2
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