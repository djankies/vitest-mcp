import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { projectContext } from '../context/project-context.js';
import { getConfig } from '../config/config-loader.js';
import { resolve } from 'path';

/**
 * Tool for setting the project root directory
 */
export const setProjectRootTool: Tool = {
  name: 'set_project_root',
  description: 'Set the project root directory for all subsequent operations. This must be called before using other tools to specify which repository to work with.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the project root directory (must start with / on Unix or drive letter on Windows)'
      }
    },
    required: ['path']
  }
};

export interface SetProjectRootArgs {
  path: string;
}

export interface SetProjectRootResult {
  success: boolean;
  projectRoot: string;
  projectName: string;
  message: string;
}

/**
 * Handle the set_project_root tool
 */
export async function handleSetProjectRoot(args: SetProjectRootArgs): Promise<SetProjectRootResult> {
  try {
    
    if (!args.path || args.path.trim() === '') {
      throw new Error('Path parameter is required');
    }

    const requestedPath = args.path.trim();
    
    // Resolve relative paths to absolute paths
    const resolvedPath = resolve(requestedPath);

    
    const config = await getConfig();
    
    
    if (config.safety?.allowedPaths) {
      const allowedPaths = Array.isArray(config.safety.allowedPaths) 
        ? config.safety.allowedPaths 
        : [config.safety.allowedPaths];
      
      let isAllowed = false;
      let restrictionMessage = '';
      
      for (const allowedPath of allowedPaths) {
        const resolvedAllowedPath = resolve(allowedPath);
        
        
        if (resolvedPath === resolvedAllowedPath || 
            resolvedPath.startsWith(resolvedAllowedPath + '/')) {
          isAllowed = true;
          break;
        }
        
        
        if (restrictionMessage) {
          restrictionMessage += ', ';
        }
        restrictionMessage += allowedPath;
      }
      
      if (!isAllowed) {
        throw new Error(
          `Access denied: Path "${resolvedPath}" is outside allowed directories. ` +
          `Allowed paths: ${restrictionMessage}. ` +
          `Configure allowedPaths in your .vitest-mcp.json to change this restriction.`
        );
      }
    }

    
    await projectContext.setProjectRoot(resolvedPath);
    
    
    const projectInfo = projectContext.getProjectInfo();
    
    if (!projectInfo) {
      throw new Error('Failed to set project root');
    }

    
    const devModeNotice = process.env.VITEST_MCP_DEV_MODE === 'true' 
      ? ' (Development mode enabled - self-targeting allowed)' 
      : '';
    
    return {
      success: true,
      projectRoot: projectInfo.path,
      projectName: projectInfo.name,
      message: `Project root set to: ${projectInfo.path}${devModeNotice}`
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return {
      success: false,
      projectRoot: '',
      projectName: '',
      message: `Failed to set project root: ${errorMessage}`
    };
  }
}

/**
 * Export a function to check if project root is set
 * This can be used by other tools to validate state
 */
export function requireProjectRoot(): string {
  return projectContext.getProjectRoot();
}