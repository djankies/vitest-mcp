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
    // Validate the path argument
    if (!args.path || args.path.trim() === '') {
      throw new Error('Path parameter is required');
    }

    const requestedPath = args.path.trim();

    // Get configuration to check for allowed paths restriction
    const config = await getConfig();
    
    // Check if path restrictions are configured
    if (config.safety?.allowedPaths) {
      const allowedPaths = Array.isArray(config.safety.allowedPaths) 
        ? config.safety.allowedPaths 
        : [config.safety.allowedPaths];
      
      let isAllowed = false;
      let restrictionMessage = '';
      
      for (const allowedPath of allowedPaths) {
        const resolvedAllowedPath = resolve(allowedPath);
        const resolvedRequestedPath = resolve(requestedPath);
        
        // Check if requested path is within or equal to an allowed path
        if (resolvedRequestedPath === resolvedAllowedPath || 
            resolvedRequestedPath.startsWith(resolvedAllowedPath + '/')) {
          isAllowed = true;
          break;
        }
        
        // Build helpful message showing what paths are allowed
        if (restrictionMessage) {
          restrictionMessage += ', ';
        }
        restrictionMessage += allowedPath;
      }
      
      if (!isAllowed) {
        throw new Error(
          `Access denied: Path "${requestedPath}" is outside allowed directories. ` +
          `Allowed paths: ${restrictionMessage}. ` +
          `Configure allowedPaths in your .vitest-mcp.json to change this restriction.`
        );
      }
    }

    // Set the project root
    await projectContext.setProjectRoot(requestedPath);
    
    // Get project info for response
    const projectInfo = projectContext.getProjectInfo();
    
    if (!projectInfo) {
      throw new Error('Failed to set project root');
    }

    return {
      success: true,
      projectRoot: projectInfo.path,
      projectName: projectInfo.name,
      message: `Project root set to: ${projectInfo.path}`
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