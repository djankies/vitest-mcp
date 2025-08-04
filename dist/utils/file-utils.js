import { promises as fs } from 'fs';
import { join, relative, resolve } from 'path';
/**
 * Check if a file or directory exists
 */
export async function fileExists(path) {
    try {
        await fs.access(path);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Check if a path is a directory
 */
export async function isDirectory(path) {
    try {
        const stats = await fs.stat(path);
        return stats.isDirectory();
    }
    catch {
        return false;
    }
}
/**
 * Find test files in a directory recursively
 */
export async function findTestFiles(searchPath = process.cwd()) {
    const testFiles = [];
    const absoluteSearchPath = resolve(searchPath);
    async function scanDirectory(dir) {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = join(dir, entry.name);
                // Skip node_modules and common build directories
                if (entry.isDirectory() && !['node_modules', 'dist', 'build', '.git'].includes(entry.name)) {
                    await scanDirectory(fullPath);
                }
                else if (entry.isFile() && isTestFile(entry.name)) {
                    const relativePath = relative(absoluteSearchPath, fullPath);
                    testFiles.push({
                        path: fullPath,
                        relativePath,
                        type: determineTestType(relativePath)
                    });
                }
            }
        }
        catch {
            // Silently skip directories we can't read
        }
    }
    await scanDirectory(absoluteSearchPath);
    return testFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
/**
 * Check if a filename is a test file
 */
function isTestFile(filename) {
    const testPatterns = [
        /\.test\.(js|ts|jsx|tsx)$/,
        /\.spec\.(js|ts|jsx|tsx)$/,
        /__tests__\/.*\.(js|ts|jsx|tsx)$/
    ];
    return testPatterns.some(pattern => pattern.test(filename));
}
/**
 * Determine the type of test based on file path
 */
function determineTestType(relativePath) {
    if (relativePath.includes('e2e') || relativePath.includes('integration')) {
        return relativePath.includes('e2e') ? 'e2e' : 'integration';
    }
    if (relativePath.includes('unit') || relativePath.includes('__tests__')) {
        return 'unit';
    }
    return 'unknown';
}
/**
 * Get project root directory (look for package.json)
 */
export async function findProjectRoot(startPath = process.cwd()) {
    let currentPath = resolve(startPath);
    while (currentPath !== '/') {
        if (await fileExists(join(currentPath, 'package.json'))) {
            return currentPath;
        }
        currentPath = resolve(currentPath, '..');
    }
    return startPath; // Fallback to start path if no package.json found
}
//# sourceMappingURL=file-utils.js.map