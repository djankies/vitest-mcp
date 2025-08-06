import { resolve, relative, normalize, join } from "path";
import { promises as fs } from "fs";
import { randomBytes } from "crypto";

/**
 * ! Security: Path validation and sanitization utilities
 * OWASP: A01:2021 - Broken Access Control Prevention
 * CWE-22: Path Traversal Prevention
 */

// ! Security: Maximum allowed path depth to prevent resource exhaustion
const MAX_PATH_DEPTH = 20;
const MAX_PATH_LENGTH = 4096;

// ! Security: Allowed file extensions for test operations
const ALLOWED_TEST_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'];
const ALLOWED_CONFIG_EXTENSIONS = ['.json', '.js', '.ts', '.mjs'];

// ! Security: Patterns that indicate potential security risks
const DANGEROUS_PATTERNS = [
  /\0/,             // Null bytes
  /\.\./,           // Directory traversal
  /~\//,            // Home directory traversal
  /\/proc\//,       // Linux proc filesystem
  /\/dev\//,        // Device files
  /\/sys\//,        // System files
  /\\\\?\\/,        // Windows UNC paths
  /\$\{[^}]*\}/,    // Variable expansion
  /`[^`]*`/,        // Command substitution
  /\$\([^)]*\)/,    // Command substitution
];

// ! Security: System directories that should never be accessed
const FORBIDDEN_PATHS = [
  '/etc',
  '/usr',
  '/bin',
  '/sbin',
  '/boot',
  '/proc',
  '/dev',
  '/sys',
  '/root',
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
];

/**
 * ! Security: Validates if a path is safe for file operations
 * @param inputPath - The path to validate
 * @throws Error if path is unsafe
 */
export function validatePathSecurity(inputPath: string): void {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Path must be a non-empty string');
  }

  // ! Check path length to prevent buffer overflow attacks
  if (inputPath.length > MAX_PATH_LENGTH) {
    throw new Error(`Path too long: maximum ${MAX_PATH_LENGTH} characters allowed`);
  }

  // ! Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(inputPath)) {
      throw new Error(`Potentially dangerous path pattern detected: ${pattern.source}`);
    }
  }

  // ! Check path depth to prevent resource exhaustion
  const pathParts = inputPath.split(/[/\\]/).filter(part => part && part !== '.');
  if (pathParts.length > MAX_PATH_DEPTH) {
    throw new Error(`Path too deep: maximum ${MAX_PATH_DEPTH} levels allowed`);
  }

  // ! Check for forbidden system paths
  const normalizedPath = normalize(inputPath);
  for (const forbiddenPath of FORBIDDEN_PATHS) {
    if (normalizedPath.startsWith(forbiddenPath)) {
      throw new Error(`Access to system directory forbidden: ${forbiddenPath}`);
    }
  }
}

/**
 * ! Security: Safely resolves a path within a project boundary
 * @param projectRoot - The trusted project root directory
 * @param userPath - The user-provided path to resolve
 * @returns Safely resolved absolute path
 * @throws Error if path escapes project boundary
 */
export function securePathResolve(projectRoot: string, userPath: string): string {
  // ! Validate inputs
  validatePathSecurity(userPath);
  validatePathSecurity(projectRoot);

  try {
    // ! Resolve and normalize paths
    const resolvedProject = resolve(normalize(projectRoot));
    const resolvedPath = resolve(resolvedProject, normalize(userPath));

    // ! Ensure resolved path stays within project boundary
    const relativePath = relative(resolvedProject, resolvedPath);
    
    if (relativePath.startsWith('..') || relativePath === '..' || relative(resolvedProject, resolvedPath).includes('..')) {
      throw new Error('Path escapes project boundary');
    }

    // ! Additional check using normalized paths
    if (!resolvedPath.startsWith(resolvedProject + '/') && resolvedPath !== resolvedProject) {
      throw new Error('Resolved path is outside project boundary');
    }

    return resolvedPath;
  } catch (error) {
    if (error instanceof Error && error.message.includes('boundary')) {
      throw error;
    }
    throw new Error('Path resolution failed: invalid path structure');
  }
}

/**
 * ! Security: Validates file extension against allowed types
 * @param filePath - Path to validate
 * @param allowedExtensions - Array of allowed extensions
 * @throws Error if extension is not allowed
 */
export function validateFileExtension(filePath: string, allowedExtensions: string[]): void {
  const extension = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  
  if (!allowedExtensions.includes(extension)) {
    throw new Error(`File extension '${extension}' not allowed. Allowed: ${allowedExtensions.join(', ')}`);
  }
}

/**
 * ! Security: Validates test file paths
 * @param filePath - Path to test file
 * @throws Error if not a valid test file
 */
export function validateTestFilePath(filePath: string): void {
  validatePathSecurity(filePath);
  
  // ! Check file extension
  validateFileExtension(filePath, ALLOWED_TEST_EXTENSIONS);
  
  // ! Ensure it's actually a test file
  const isTestFile = 
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('__tests__') ||
    filePath.includes('/tests/');
    
  if (!isTestFile) {
    // Allow non-test files for coverage analysis, but validate they're source files
    const hasSourceExtension = ALLOWED_TEST_EXTENSIONS.some(ext => filePath.endsWith(ext));
    if (!hasSourceExtension) {
      throw new Error('File must be a test file or valid source file');
    }
  }
}

/**
 * ! Security: Validates configuration file paths
 * @param filePath - Path to config file
 * @throws Error if not a valid config file
 */
export function validateConfigFilePath(filePath: string): void {
  validatePathSecurity(filePath);
  validateFileExtension(filePath, ALLOWED_CONFIG_EXTENSIONS);
  
  // ! Ensure it's a recognized config file
  const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
  const allowedConfigNames = [
    'vitest.config',
    'vitest.workspace',
    '.vitest-mcp.json',
    'package.json'
  ];
  
  const isValidConfig = allowedConfigNames.some(name => fileName.startsWith(name));
  if (!isValidConfig) {
    throw new Error('Not a recognized configuration file');
  }
}

/**
 * ! Security: Checks if a path exists and is accessible without exposing system info
 * @param filePath - Path to check
 * @returns boolean indicating if path exists and is accessible
 */
export async function securePathExists(filePath: string): Promise<boolean> {
  try {
    validatePathSecurity(filePath);
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * ! Security: Safely checks if path is a directory
 * @param filePath - Path to check
 * @returns boolean indicating if path is a directory
 */
export async function secureIsDirectory(filePath: string): Promise<boolean> {
  try {
    validatePathSecurity(filePath);
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * ! Security: Creates a secure temporary file path within project boundary
 * @param projectRoot - Project root directory
 * @param prefix - File prefix
 * @returns Secure temporary file path
 */
export function createSecureTempPath(projectRoot: string, prefix: string): string {
  validatePathSecurity(projectRoot);
  
  // ! Validate and sanitize prefix
  const sanitizedPrefix = prefix.replace(/[^a-zA-Z0-9-_]/g, '');
  if (!sanitizedPrefix || sanitizedPrefix.length === 0) {
    throw new Error('Invalid temp file prefix');
  }
  
  // ! Generate cryptographically secure random suffix
  const randomSuffix = randomBytes(32).toString('hex');
  
  const tempFileName = `${sanitizedPrefix}-${randomSuffix}.tmp`;
  return join(projectRoot, tempFileName);
}

/**
 * ! Security: Sanitizes file content to prevent code injection
 * @param content - File content to sanitize
 * @returns Sanitized content
 */
export function sanitizeFileContent(content: string): string {
  if (typeof content !== 'string') {
    return '';
  }
  
  // ! Remove potential script injections and control characters
  return content
    .split('').filter(char => char.charCodeAt(0) >= 32).join('') // Remove control chars
    .replace(/(<script[^>]*>[\s\S]*?<\/script>)/gi, '') // Remove script tags
    .replace(/(javascript:|data:|vbscript:|file:|ftp:)/gi, '') // Remove dangerous protocols
    .substring(0, 1024 * 1024); // Limit to 1MB
}