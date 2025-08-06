import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAnalyzeCoverage } from "../analyze-coverage.js";
import * as configLoader from "../../config/config-loader.js";
import * as fileUtils from "../../utils/file-utils.js";
import * as versionChecker from "../../utils/version-checker.js";
import * as projectContext from "../../context/project-context.js";
import * as vitestConfigReader from "../../utils/vitest-config-reader.js";
import { spawn } from "child_process";
import type { ChildProcess } from "child_process";
import { EventEmitter } from "events";

vi.mock("../../config/config-loader");
vi.mock("../../utils/file-utils");
vi.mock("../../utils/version-checker");
vi.mock("../../context/project-context");
vi.mock("../../utils/vitest-config-reader");
vi.mock("child_process");

describe("analyze-coverage threshold detection", () => {
  const mockProjectRoot = "/test/project";

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock project context
    vi.spyOn(projectContext.projectContext, "getProjectRoot").mockReturnValue(
      mockProjectRoot
    );

    // Mock vitest config reader - default to no thresholds configured
    vi.mocked(vitestConfigReader.getVitestCoverageThresholds).mockResolvedValue(null);
    vi.mocked(vitestConfigReader.checkThresholdsMet).mockReturnValue(true);
    vi.mocked(vitestConfigReader.getThresholdViolations).mockReturnValue([]);

    // Mock config
    vi.mocked(configLoader.getConfig).mockResolvedValue({
      testDefaults: {
        format: "summary" as const,
        timeout: 30000,
        watchMode: false,
      },
      coverageDefaults: {
        format: "summary" as const,
        exclude: [],
      },
      discovery: {
        testPatterns: ["**/*.{test,spec}.{js,ts,jsx,tsx}"],
        excludePatterns: ["node_modules", "dist", "coverage", ".git"],
        maxDepth: 10,
      },
      server: {
        verbose: false,
        validatePaths: true,
        allowRootExecution: false,
        workingDirectory: mockProjectRoot,
      },
      safety: {
        maxFiles: 100,
        requireConfirmation: true,
        allowedRunners: ["vitest"],
        allowedPaths: undefined!,
      },
    });

    // Mock version check
    vi.mocked(versionChecker.checkAllVersions).mockResolvedValue({
      vitest: { installed: true, version: "1.0.0", compatible: true },
      node: { installed: true, version: "18.0.0", compatible: true },
      coverageProvider: { installed: true, version: "1.0.0", compatible: true },
      errors: [],
      warnings: [],
    });

    // Mock file exists
    vi.mocked(fileUtils.fileExists).mockResolvedValue(true);
    vi.mocked(fileUtils.isDirectory).mockResolvedValue(false);
  });

  it("should detect when Vitest thresholds pass (exit code 0)", async () => {
    // Mock thresholds configured
    vi.mocked(vitestConfigReader.getVitestCoverageThresholds).mockResolvedValue({
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80
    });
    vi.mocked(vitestConfigReader.checkThresholdsMet).mockReturnValue(true);
    vi.mocked(vitestConfigReader.getThresholdViolations).mockReturnValue([]);

    // Mock spawn to simulate successful threshold check
    const mockProcess = new EventEmitter() as ChildProcess;
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    mockProcess.stdout = mockStdout as NodeJS.ReadableStream;
    mockProcess.stderr = mockStderr as NodeJS.ReadableStream;

    vi.mocked(spawn).mockReturnValue(mockProcess);

    // Simulate Vitest output with coverage data
    const coverageOutput = JSON.stringify({
      coverageMap: {
        "/test/project/src/utils.ts": {
          path: "/test/project/src/utils.ts",
          statementMap: { "0": {}, "1": {} },
          fnMap: { "0": {}, "1": {} },
          branchMap: { "0": {} },
          s: { "0": 1, "1": 1 }, // 100% statement coverage
          f: { "0": 1, "1": 1 }, // 100% function coverage
          b: { "0": [1, 1] }, // 100% branch coverage
        },
      },
    });

    setTimeout(() => {
      mockStdout.emit("data", coverageOutput);
      mockProcess.emit("close", 0); // Exit code 0 - thresholds passed
    }, 10);

    const result = await handleAnalyzeCoverage({
      target: "./src/utils.ts",
      format: "summary",
    });

    expect(result.success).toBe(true);
    expect(result.meetsThreshold).toBe(true);
    expect(result.coverage.lines).toBe(100);
    expect(result.coverage.functions).toBe(100);
  });

  it("should detect when Vitest thresholds fail (exit code 1)", async () => {
    // Mock thresholds configured with failing coverage
    vi.mocked(vitestConfigReader.getVitestCoverageThresholds).mockResolvedValue({
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80
    });
    vi.mocked(vitestConfigReader.checkThresholdsMet).mockReturnValue(false);
    vi.mocked(vitestConfigReader.getThresholdViolations).mockReturnValue([
      "Line coverage (50%) is below threshold (80%)",
      "Function coverage (50%) is below threshold (80%)"
    ]);

    // Mock spawn to simulate failed threshold check
    const mockProcess = new EventEmitter() as ChildProcess;
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    mockProcess.stdout = mockStdout as NodeJS.ReadableStream;
    mockProcess.stderr = mockStderr as NodeJS.ReadableStream;

    vi.mocked(spawn).mockReturnValue(mockProcess);

    // Simulate Vitest output with low coverage
    const coverageOutput = JSON.stringify({
      coverageMap: {
        "/test/project/src/utils.ts": {
          path: "/test/project/src/utils.ts",
          statementMap: { "0": {}, "1": {}, "2": {}, "3": {} },
          fnMap: { "0": {}, "1": {} },
          branchMap: { "0": {} },
          s: { "0": 1, "1": 1, "2": 0, "3": 0 }, // 50% statement coverage
          f: { "0": 1, "1": 0 }, // 50% function coverage
          b: { "0": [1, 0] }, // 50% branch coverage
        },
      },
    });

    setTimeout(() => {
      mockStdout.emit("data", coverageOutput);
      mockProcess.emit("close", 0); // Exit code 0 - Vitest doesn't fail on threshold violations
    }, 10);

    const result = await handleAnalyzeCoverage({
      target: "./src/utils.ts",
      format: "summary",
    });

    expect(result.success).toBe(true); // Coverage ran successfully
    expect(result.meetsThreshold).toBe(false); // But thresholds were not met
    expect(result.thresholdViolations).toEqual([
      "Line coverage (50%) is below threshold (80%)",
      "Function coverage (50%) is below threshold (80%)"
    ]);
    expect(result.coverage.lines).toBe(50);
    expect(result.coverage.functions).toBe(50);
  });

  it("should handle when Vitest has no thresholds configured (exit code 0)", async () => {
    // Mock no thresholds configured (default from beforeEach)
    // Mock spawn to simulate no thresholds configured
    const mockProcess = new EventEmitter() as ChildProcess;
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    mockProcess.stdout = mockStdout as NodeJS.ReadableStream;
    mockProcess.stderr = mockStderr as NodeJS.ReadableStream;

    vi.mocked(spawn).mockReturnValue(mockProcess);

    const coverageOutput = JSON.stringify({
      coverageMap: {
        "/test/project/src/utils.ts": {
          path: "/test/project/src/utils.ts",
          statementMap: { "0": {}, "1": {} },
          fnMap: { "0": {} },
          branchMap: {},
          s: { "0": 1, "1": 0 }, // 50% coverage
          f: { "0": 0 }, // 0% function coverage
          b: {},
        },
      },
    });

    setTimeout(() => {
      mockStdout.emit("data", coverageOutput);
      // No threshold errors because none are configured
      mockProcess.emit("close", 0); // Exit code 0 - no thresholds to fail
    }, 10);

    const result = await handleAnalyzeCoverage({
      target: "./src/utils.ts",
      format: "summary",
    });

    expect(result.success).toBe(true);
    expect(result.meetsThreshold).toBeUndefined(); // No threshold info when none configured
    expect(result.thresholdViolations).toBeUndefined(); // No violations when none configured
    expect(result.coverage.lines).toBe(50);
    expect(result.coverage.functions).toBe(0);
  });

  it("should provide detailed format with threshold status", async () => {
    // Mock thresholds configured with failing coverage
    vi.mocked(vitestConfigReader.getVitestCoverageThresholds).mockResolvedValue({
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80
    });
    vi.mocked(vitestConfigReader.checkThresholdsMet).mockReturnValue(false);
    vi.mocked(vitestConfigReader.getThresholdViolations).mockReturnValue([
      "Line coverage (33%) is below threshold (80%)"
    ]);

    const mockProcess = new EventEmitter() as ChildProcess;
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    mockProcess.stdout = mockStdout as NodeJS.ReadableStream;
    mockProcess.stderr = mockStderr as NodeJS.ReadableStream;

    vi.mocked(spawn).mockReturnValue(mockProcess);

    const coverageOutput = JSON.stringify({
      coverageMap: {
        "/test/project/src/utils.ts": {
          path: "/test/project/src/utils.ts",
          statementMap: {
            "0": { start: { line: 1 } },
            "1": { start: { line: 2 } },
            "2": { start: { line: 3 } },
          },
          fnMap: {
            "0": { name: "testFunc", decl: { start: { line: 1 } } },
          },
          branchMap: {},
          s: { "0": 1, "1": 0, "2": 0 }, // Line 1 covered, lines 2-3 not covered
          f: { "0": 0 }, // Function not covered
          b: {},
        },
      },
    });

    setTimeout(() => {
      mockStdout.emit("data", coverageOutput);
      mockProcess.emit("close", 0); // Vitest doesn't fail the process
    }, 10);

    const result = await handleAnalyzeCoverage({
      target: "./src/utils.ts",
      format: "detailed",
    });

    expect(result.success).toBe(true);
    expect(result.meetsThreshold).toBe(false);
    expect(result.thresholdViolations).toEqual([
      "Line coverage (33%) is below threshold (80%)"
    ]);
    // In detailed format, uncovered items would be populated if the file was accessible
    // The key point is that meetsThreshold correctly reflects the threshold comparison
  });
});