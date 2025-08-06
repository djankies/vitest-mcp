/**
 * Plugin registrations for all existing tools
 */
import { createToolPlugin } from './plugin-factory.js';
import { ToolPlugin } from './plugin-interface.js';

// Import existing tool definitions and handlers
import {
  setProjectRootTool,
  handleSetProjectRoot,
  SetProjectRootArgs,
  SetProjectRootResult,
} from '../tools/set-project-root.js';

import {
  listTestsTool,
  handleListTests,
  ListTestsArgs,
  ListTestsResult,
} from '../tools/list-tests.js';

import {
  runTestsTool,
  handleRunTests,
  RunTestsArgs,
  ProcessedTestResult,
} from '../tools/run-tests.js';

import {
  analyzeCoverageTool,
  handleAnalyzeCoverage,
} from '../tools/analyze-coverage.js';

import {
  AnalyzeCoverageArgs,
  ProcessedCoverageResult,
} from '../types/coverage-types.js';


/**
 * Set Project Root Plugin
 * Converts the existing set project root tool to plugin architecture
 */
export const setProjectRootPlugin: ToolPlugin<SetProjectRootArgs, SetProjectRootResult> = 
  createToolPlugin(
    setProjectRootTool,
    handleSetProjectRoot
  );

/**
 * List Tests Plugin  
 * Converts the existing list tests tool to plugin architecture
 */
export const listTestsPlugin: ToolPlugin<ListTestsArgs, ListTestsResult> = 
  createToolPlugin(
    listTestsTool,
    handleListTests
  );

/**
 * Run Tests Plugin
 * Converts the existing run tests tool to plugin architecture
 */
export const runTestsPlugin: ToolPlugin<RunTestsArgs, ProcessedTestResult> = 
  createToolPlugin(
    runTestsTool,
    handleRunTests
  );

/**
 * Analyze Coverage Plugin
 * Converts the existing analyze coverage tool to plugin architecture  
 */
export const analyzeCoveragePlugin: ToolPlugin<AnalyzeCoverageArgs, ProcessedCoverageResult> = 
  createToolPlugin(
    analyzeCoverageTool,
    handleAnalyzeCoverage
  );


/**
 * Array of all available plugins for batch registration
 */
export const allToolPlugins = [
  setProjectRootPlugin,
  listTestsPlugin,
  runTestsPlugin,
  analyzeCoveragePlugin,
] as const;

/**
 * Plugin map for easy lookup by name
 */
export const toolPluginMap = {
  set_project_root: setProjectRootPlugin,
  list_tests: listTestsPlugin,
  run_tests: runTestsPlugin,
  analyze_coverage: analyzeCoveragePlugin,
} as const;

/**
 * Type-safe plugin names
 */
export type PluginName = keyof typeof toolPluginMap;