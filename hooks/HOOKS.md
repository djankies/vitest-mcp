# Claude Code Vitest Hooks

This directory contains a bash script that automatically intercepts Vitest commands and suggests using the MCP server for better AI integration.

## How It Works

The `vitest-hook.sh` bash script:

1. **Intercepts Vitest commands** before execution
2. **Analyzes the command** to understand the intent  
3. **Suggests MCP tool usage** with appropriate parameters
4. **Provides clear guidance** on why the MCP tool is better

## Setup

```bash
# Copy the hook script
curl -o .claude/vitest-hook.sh https://raw.githubusercontent.com/djankies/vitest-mcp/main/hooks/vitest-hook.sh
chmod +x .claude/vitest-hook.sh

# Configure Claude Code hook
cat << 'EOF' > .claude/settings.local.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/vitest-hook.sh"
          }
        ]
      }
    ]
  }
}
EOF
```

## Intercepted Commands

### `vitest run` → `run_tests` MCP tool

**Before (Raw Vitest)**:
```bash
npx vitest run src/components/Button.test.ts
```

**After (Hook Intercepts)**:
```
🔄 Intercepting Vitest command. Using run_tests MCP tool for better AI integration...
📝 Suggested MCP tool: run_tests({
  "target": "src/components/Button.test.ts",
  "format": "summary"
})
💡 The run_tests tool provides structured output optimized for AI analysis with enhanced error context.

🔄 Execute this instead:
   Use the run_tests tool with parameters: {"target":"src/components/Button.test.ts","format":"summary"}
```

### `vitest --coverage` → `analyze_coverage` MCP tool

**Before (Raw Vitest)**:
```bash
npx vitest run src/ --coverage --coverage.thresholds.lines=80
```

**After (Hook Intercepts)**:
```
🔄 Intercepting Vitest coverage command. Using analyze_coverage MCP tool for enhanced coverage analysis...
📝 Suggested MCP tool: analyze_coverage({
  "target": "src/",
  "format": "detailed",
  "thresholds": {
    "lines": 80
  }
})
💡 The analyze_coverage tool provides better coverage insights with line-by-line analysis and actionable recommendations.
```

### Test Discovery Commands → `list_tests` MCP tool

**Before (Raw Commands)**:
```bash
find . -name "*.test.ts"
ls src/*test*
grep -r "describe\|it" src/
```

**After (Hook Suggests)**:
```
💡 Consider using the list_tests MCP tool for better test file discovery...
📝 Suggested MCP tool: list_tests({"directory": "."})
💡 The list_tests tool provides structured test file information with pattern matching and project analysis.
```

## Commands NOT Intercepted

The hook is smart about when to intervene:

- ✅ **Allowed through**: `vitest --version`, `vitest --help`
- ✅ **Allowed through**: `vitest watch` (better UX with direct Vitest)  
- ✅ **Allowed through**: Commands with `--bypass-hook` flag
- ✅ **Allowed through**: Non-Vitest projects (no config files found)

## Benefits of MCP Tool Usage

### vs Raw Vitest Commands

| Aspect | Raw Vitest | MCP Tools |
|--------|------------|-----------|
| **Output Format** | Terminal text | Structured JSON |
| **Error Context** | Basic messages | Code snippets with failure markers |
| **Coverage Analysis** | Basic metrics | Line-by-line gap analysis |
| **AI Integration** | Poor parsing | Optimized for LLM consumption |
| **Debugging** | Manual analysis | Visual failure indicators |
| **Performance** | Full output | Token-optimized summaries |

### Example: Test Failure Analysis

**Raw Vitest Output**:
```
FAIL src/auth.test.ts > should validate password
AssertionError: expected 'weak' to be 'strong'
  at /project/src/auth.test.ts:17:23
```

**MCP Tool Output**:
```json
{
  "error": {
    "type": "AssertionError", 
    "message": "expected 'weak' to be 'strong'",
    "actual": "weak",
    "expected": "strong",
    "codeSnippet": [
      " 15:   it('should validate password strength', () => {",
      " 16:     const result = validatePassword('123');", 
      " 17: ❌   expect(result.strength).toBe('strong');",
      " 18:   });"
    ]
  }
}
```

**Result**: Claude can immediately understand the issue and provide specific guidance.

## Configuration

### Enable/Disable Hooks

**Disable for this session**:
```bash
npx vitest run src/ --bypass-hook
```

**Disable permanently**:
Edit `.claude/settings.local.json`:
```json
{
  "hooks": {
    "bash": {
      "pre": [
        {
          "name": "vitest-mcp-interceptor",
          "enabled": false
        }
      ]
    }
  }
}
```

### Customize Patterns

Add more command patterns to intercept:
```json
{
  "hooks": {
    "bash": {
      "pre": [
        {
          "patterns": [
            "^(npx\\s+)?vitest\\b",
            "^find.*\\.(test|spec)\\.",
            "^your-custom-pattern"
          ]
        }
      ]
    }
  }
}
```

## Troubleshooting

### Hook Not Working

1. **Check file permissions**:
   ```bash
   ls -la .claude/vitest-hook.js
   # Should show: -rwxr-xr-x (executable)
   ```

2. **Test hook directly**:
   ```bash
   ./.claude/vitest-hook.js vitest run src/
   ```

3. **Check project detection**:
   - Ensure `vitest.config.ts/js` exists OR
   - Ensure `package.json` has `vitest` in `devDependencies`

### Hook Too Aggressive

If the hook intercepts commands you want to run directly:

```bash
# Bypass for one command
npx vitest run src/ --bypass-hook

# Or temporarily disable
mv .claude/settings.local.json .claude/settings.local.json.disabled
```

### Claude Not Using Suggestions

The hook provides suggestions but doesn't force usage. Claude will:
1. See the intercepted command fail
2. Read the suggestion message
3. Decide whether to use the MCP tool or fall back

This gives Claude flexibility while providing clear guidance.

## Integration Examples

### In Conversation

**User**: "Run the authentication tests"

**Claude sees**: 
1. Converts to: `npx vitest run src/auth.test.ts`
2. Hook intercepts and suggests MCP tool
3. Claude uses: `run_tests({"target": "src/auth.test.ts"})`
4. Gets structured, AI-friendly output

**User**: "Check test coverage for the API module"

**Claude sees**:
1. Converts to: `npx vitest run src/api/ --coverage`  
2. Hook suggests: `analyze_coverage({"target": "src/api/"})`
3. Claude gets detailed coverage analysis with gaps and recommendations

This creates a seamless experience where Vitest commands automatically become AI-optimized MCP tool calls.