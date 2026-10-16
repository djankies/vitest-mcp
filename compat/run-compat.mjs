#!/usr/bin/env node
/**
 * End-to-end compatibility check.
 *
 * Installs a given Vitest major into copies of the fixture projects and drives
 * the built MCP tool handlers (dist/) against them, so nothing is mocked.
 *
 * Usage: node compat/run-compat.mjs <vitest-major> [--keep]
 *   e.g. node compat/run-compat.mjs 4
 *
 * Requires `npm run build` first.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const dist = join(repoRoot, "dist");

const major = process.argv[2];
const keep = process.argv.includes("--keep");
if (!major || !/^\d+$/.test(major)) {
  console.error("Usage: node compat/run-compat.mjs <vitest-major> [--keep]");
  process.exit(2);
}
if (!existsSync(join(dist, "index.js"))) {
  console.error("dist/ not found. Run `npm run build` first.");
  process.exit(2);
}

const load = (path) => import(pathToFileURL(join(dist, path)).href);
const { projectContext } = await load("context/project-context.js");
const { handleListTests } = await load("tools/list-tests.js");
const { handleRunTests } = await load("tools/run-tests.js");
const { handleAnalyzeCoverage } = await load("tools/analyze-coverage.js");

const workDir = mkdtempSync(join(tmpdir(), `vitest-mcp-compat-v${major}-`));

function setupFixture(name) {
  const target = join(workDir, name);
  cpSync(join(here, "fixtures", name), target, { recursive: true });
  const pkgPath = join(target, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.devDependencies = {
    vitest: `^${major}.0.0`,
    "@vitest/coverage-v8": `^${major}.0.0`,
  };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  const installArgs = ["install", "--no-audit", "--no-fund", "--loglevel=error"];
  try {
    execFileSync("npm", installArgs, { cwd: target, stdio: "inherit" });
  } catch {
    // npm 10 crashes ("reading 'edgesOut'") resolving Vitest 4's optional peers; npm 11 does not.
    console.log("npm install failed, retrying with npm@11");
    execFileSync("npx", ["-y", "npm@11", ...installArgs], { cwd: target, stdio: "inherit" });
  }
  return target;
}

function fileCoverage(result, suffix) {
  const entry = result.fileBreakdown?.find((f) => f.path.endsWith(suffix));
  assert.ok(entry, `expected ${suffix} in fileBreakdown, got ${JSON.stringify(result.fileBreakdown?.map((f) => f.path))}`);
  return entry;
}

function strayFiles(dir) {
  return readdirSync(dir).filter((f) => f.startsWith(".vitest-"));
}

const results = [];
async function check(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - start });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - start, error });
    console.log(`  ✗ ${name}\n      ${String(error?.message ?? error).split("\n").join("\n      ")}`);
  }
}

console.log(`\nVitest ${major}.x compatibility check (workdir: ${workDir})\n`);

const colocated = setupFixture("colocated");
const split = setupFixture("split-projects");
const mcpConfig = setupFixture("mcp-config");
const installed = JSON.parse(readFileSync(join(colocated, "node_modules/vitest/package.json"), "utf8")).version;
console.log(`\nInstalled vitest ${installed}\n`);

console.log(`[${basename(colocated)}]`);
await projectContext.setProjectRoot(colocated);

await check("list_tests finds colocated test files", async () => {
  const result = await handleListTests({ path: "./src" });
  const files = result.testFiles.map((f) => f.relativePath).sort();
  assert.deepEqual(files, ["broken/broken.test.ts", "math.test.ts"]);
});

await check("run_tests on a passing file reports counts", async () => {
  const result = await handleRunTests({ target: "./src/math.test.ts" });
  assert.equal(result.success, true, result.summary);
  assert.deepEqual(result.testSummary, { totalTests: 3, passed: 2, failed: 0, skipped: 1 });
});

await check("run_tests on a directory reports the failing test", async () => {
  const result = await handleRunTests({ target: "./src", format: "detailed" });
  assert.equal(result.success, false);
  assert.equal(result.testSummary.failed, 1);
  assert.equal(result.testSummary.passed, 2);
  const failed = result.testResults?.failedTests?.find((f) => f.file.endsWith("broken.test.ts"));
  assert.ok(failed, `failedTests: ${JSON.stringify(result.testResults)}`);
  assert.match(failed.tests[0].message, /41/);
});

await check("run_tests showLogs captures stdout and stderr", async () => {
  const result = await handleRunTests({ target: "./src/math.test.ts", showLogs: true });
  assert.equal(result.success, true, result.summary);
  assert.ok(result.logs?.some((l) => l === "[stdout] compat-log-marker"), `logs: ${JSON.stringify(result.logs)}`);
  assert.ok(result.logs?.some((l) => l === "[stderr] compat-error-marker"), `logs: ${JSON.stringify(result.logs)}`);
  assert.deepEqual(strayFiles(colocated), []);
});

await check("analyze_coverage on a source file", async () => {
  const result = await handleAnalyzeCoverage({ target: "./src/math.ts", format: "detailed" });
  assert.equal(result.success, true, result.error);
  const math = fileCoverage(result, "src/math.ts");
  assert.equal(math.totals.functions, 3);
  assert.equal(math.covered.functions, 2);
  assert.equal(result.fileBreakdown.length, 1, "only the target file should be reported");
});

await check("analyze_coverage on a directory includes untested files", async () => {
  const result = await handleAnalyzeCoverage({ target: "./src", format: "detailed" });
  assert.equal(result.success, true, result.error);
  fileCoverage(result, "src/math.ts");
  const strings = fileCoverage(result, "src/strings.ts");
  assert.equal(strings.covered.functions, 0);
  assert.ok(!result.fileBreakdown.some((f) => f.path.includes(".test.")), "test files must not be reported");
});

await check("analyze_coverage reports uncovered lines by project-relative path", async () => {
  const result = await handleAnalyzeCoverage({ target: "./src/math.ts", format: "detailed" });
  assert.equal(result.success, true, result.error);
  const uncovered = result.uncovered?.["src/math.ts"];
  assert.ok(uncovered, `uncovered: ${JSON.stringify(result.uncovered)}`);
  assert.ok(uncovered.lines.includes(13), `uncovered lines: ${uncovered.lines}`);
  assert.ok(!uncovered.lines.includes(2), `line 2 is covered: ${uncovered.lines}`);
  assert.ok(uncovered.functions.some((f) => f.name === "untested"));
});

await check("analyze_coverage warns when no test imports the target", async () => {
  const result = await handleAnalyzeCoverage({ target: "./src/strings.ts" });
  assert.equal(result.success, true, result.error);
  assert.equal(result.testsRun, 0);
  assert.match(result.summary, /No tests import/);
  assert.equal(result.coverage.functions, 0);
});

await check("run_tests reports a test file that fails to load", async () => {
  const result = await handleRunTests({ target: "./errors", format: "detailed" });
  assert.equal(result.success, false);
  const failed = result.testResults?.failedTests?.[0];
  assert.ok(failed?.file.endsWith("load-error.test.ts"), JSON.stringify(result));
  assert.match(failed.tests[0].message, /does-not-exist/);
});

await check("run_tests surfaces Vitest errors for an unknown project", async () => {
  const result = await handleRunTests({ target: "./src", project: "no-such-project" });
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /no-such-project/i, JSON.stringify(result));
});

await check("analyze_coverage does not touch the project's coverage directory", async () => {
  assert.equal(existsSync(join(colocated, "coverage")), false);
});

console.log(`\n[${basename(split)}]`);
await projectContext.setProjectRoot(split);

await check("run_tests with a project filter", async () => {
  const result = await handleRunTests({ target: "./test/unit", project: "unit" });
  assert.equal(result.success, true, result.summary);
  assert.equal(result.testSummary.passed, 2);
});

await check("run_tests showLogs works with projects config", async () => {
  const result = await handleRunTests({ target: "./test/e2e", showLogs: true });
  assert.equal(result.success, true, result.summary);
  assert.ok(result.logs?.some((l) => l === "[stdout] e2e-log-marker"), `logs: ${JSON.stringify(result.logs)}`);
  assert.deepEqual(strayFiles(split), []);
});

await check("analyze_coverage on ./src with tests in ./test (issue #44)", async () => {
  const result = await handleAnalyzeCoverage({ target: "./src", format: "detailed" });
  assert.equal(result.success, true, result.error);
  const calc = fileCoverage(result, "src/calc.ts");
  assert.equal(calc.covered.functions, calc.totals.functions);
  const format = fileCoverage(result, "src/util/format.ts");
  assert.equal(format.totals.functions, 2);
  assert.equal(format.covered.functions, 1);
});

await check("analyze_coverage on a single source file with tests elsewhere", async () => {
  const result = await handleAnalyzeCoverage({ target: "./src/calc.ts", format: "detailed" });
  assert.equal(result.success, true, result.error);
  const calc = fileCoverage(result, "src/calc.ts");
  assert.ok(calc.totals.functions > 0);
  assert.equal(calc.covered.functions, calc.totals.functions);
  assert.equal(result.fileBreakdown.length, 1);
});

await check("analyze_coverage with a project filter", async () => {
  const result = await handleAnalyzeCoverage({ target: "./src", project: "unit", format: "detailed" });
  assert.equal(result.success, true, result.error);
  const calc = fileCoverage(result, "src/calc.ts");
  assert.equal(calc.covered.functions, calc.totals.functions);
  assert.equal(fileCoverage(result, "src/util/format.ts").covered.functions, 0);
});

await check("analyze_coverage leaves the configured reports directory alone", async () => {
  assert.equal(existsSync(join(split, "reports")), false);
});

await check("project names are never interpreted by a shell", async () => {
  await handleRunTests({ target: "./test/unit", project: "unit; touch pwned #" });
  assert.equal(existsSync(join(split, "pwned")), false);
});

console.log(`\n[${basename(mcpConfig)}]`);
await projectContext.setProjectRoot(mcpConfig);

await check("run_tests uses vitest.mcp.config.ts when present", async () => {
  const result = await handleRunTests({ target: "./src" });
  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(result.testSummary.passed, 1);
});

if (!keep) {
  rmSync(workDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\nVitest ${installed}: ${results.length - failed.length}/${results.length} checks passed\n`);
process.exit(failed.length > 0 ? 1 : 0);
