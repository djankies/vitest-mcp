import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ToolPlugin } from './plugin-interface.js';

/**
 * JSON Schema validation result
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Simplified JSON Schema type for validation
 */
interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  additionalProperties?: boolean;
  [key: string]: unknown;
}

/**
 * Simple JSON Schema validator for tool arguments
 * Uses basic validation rules based on JSON Schema properties
 */
class JSONSchemaValidator {
  /**
   * Validate data against a JSON schema
   */
  static validate(data: unknown, schema: JSONSchema): ValidationResult {
    const errors: string[] = [];

    if (!schema || typeof schema !== 'object') {
      return { valid: true, errors: [] };
    }

    this.validateValue(data, schema, '', errors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private static validateValue(value: unknown, schema: JSONSchema, path: string, errors: string[]): void {
    // Type validation
    if (schema.type) {
      const typeStr = Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type;
      if (!this.validateType(value, schema.type)) {
        errors.push(`${path || 'root'}: Expected ${typeStr}, got ${typeof value}`);
        return; // Don't continue validation if type is wrong
      }
    }

    // Object validation
    if (schema.type === 'object' && typeof value === 'object' && value !== null) {
      this.validateObject(value as Record<string, unknown>, schema, path, errors);
    }

    // Array validation
    if (schema.type === 'array' && Array.isArray(value)) {
      this.validateArray(value, schema, path, errors);
    }

    // String validation
    if (schema.type === 'string' && typeof value === 'string') {
      this.validateString(value, schema, path, errors);
    }

    // Number validation
    if ((schema.type === 'number' || schema.type === 'integer') && typeof value === 'number') {
      this.validateNumber(value, schema, path, errors);
    }
  }

  private static validateType(value: unknown, expectedType: string | string[]): boolean {
    if (Array.isArray(expectedType)) {
      return expectedType.some(type => this.validateType(value, type));
    }
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'null':
        return value === null;
      default:
        return true; // Unknown types pass validation
    }
  }

  private static validateObject(value: Record<string, unknown>, schema: JSONSchema, path: string, errors: string[]): void {
    const currentPath = path ? `${path}.` : '';

    // Required properties
    if (schema.required && Array.isArray(schema.required)) {
      for (const requiredProp of schema.required) {
        if (!(requiredProp in value)) {
          errors.push(`${currentPath}${requiredProp}: Required property missing`);
        }
      }
    }

    // Properties validation
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propName in value) {
          this.validateValue(value[propName], propSchema, `${currentPath}${propName}`, errors);
        }
      }
    }

    // Additional properties
    if (schema.additionalProperties === false) {
      const allowedProps = new Set(Object.keys(schema.properties || {}));
      for (const propName of Object.keys(value)) {
        if (!allowedProps.has(propName)) {
          errors.push(`${currentPath}${propName}: Additional property not allowed`);
        }
      }
    }
  }

  private static validateArray(value: unknown[], schema: JSONSchema, path: string, errors: string[]): void {
    if (schema.items) {
      value.forEach((item, index) => {
        this.validateValue(item, schema.items!, `${path}[${index}]`, errors);
      });
    }

    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: Array must have at least ${schema.minItems} items`);
    }

    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path}: Array must have at most ${schema.maxItems} items`);
    }
  }

  private static validateString(value: string, schema: JSONSchema, path: string, errors: string[]): void {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: String must be at least ${schema.minLength} characters`);
    }

    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: String must be at most ${schema.maxLength} characters`);
    }

    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: String does not match pattern ${schema.pattern}`);
    }

    if (schema.enum && !schema.enum.includes(value)) {
      const enumStr = schema.enum.map(v => String(v)).join(', ');
      errors.push(`${path}: Value must be one of ${enumStr}`);
    }
  }

  private static validateNumber(value: number, schema: JSONSchema, path: string, errors: string[]): void {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: Number must be at least ${schema.minimum}`);
    }

    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: Number must be at most ${schema.maximum}`);
    }

    if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) {
      errors.push(`${path}: Number must be a multiple of ${schema.multipleOf}`);
    }
  }
}

/**
 * Create a validation function from a JSON schema
 */
export function createValidationFunction<T>(schema: JSONSchema): (args: unknown) => args is T {
  return (args: unknown): args is T => {
    const result = JSONSchemaValidator.validate(args, schema);
    return result.valid;
  };
}

/**
 * Create a validation function with detailed error reporting
 */
export function createDetailedValidationFunction<T>(
  schema: JSONSchema
): (args: unknown) => { valid: true; data: T } | { valid: false; errors: string[] } {
  return (args: unknown) => {
    const result = JSONSchemaValidator.validate(args, schema);
    if (result.valid) {
      return { valid: true, data: args as T };
    } else {
      return { valid: false, errors: result.errors };
    }
  };
}

/**
 * Factory function to create a tool plugin from existing tool components
 */
export function createToolPlugin<TArgs, TResult>(
  tool: Tool,
  handler: (args: TArgs) => Promise<TResult>,
  customValidator?: (args: unknown) => args is TArgs
): ToolPlugin<TArgs, TResult> {
  // Use custom validator or create one from the tool's input schema
  const validator = customValidator || createValidationFunction<TArgs>(tool.inputSchema as JSONSchema);

  return {
    tool,
    handler,
    validate: validator,
  };
}

/**
 * Factory function with enhanced validation error reporting
 */
export function createToolPluginWithValidation<TArgs, TResult>(
  tool: Tool,
  handler: (args: TArgs) => Promise<TResult>,
  customValidator?: (args: unknown) => args is TArgs
): ToolPlugin<TArgs, TResult> {
  // Use custom validator or create one from the tool's input schema
  const detailedValidator = createDetailedValidationFunction<TArgs>(tool.inputSchema as JSONSchema);

  const validator = customValidator || ((args: unknown): args is TArgs => {
    const result = detailedValidator(args);
    if (result.valid) {
      return true;
    } else {
      const errorMessage = `Validation failed for tool '${tool.name}': ${result.errors.join(', ')}`;
      throw new Error(errorMessage);
    }
  });

  return {
    tool,
    handler,
    validate: validator,
  };
}

/**
 * Batch register multiple tool plugins
 */
export function registerToolPlugins(
  plugins: Array<{
    tool: Tool;
    handler: (args: unknown) => Promise<unknown>;
    validator?: (args: unknown) => args is unknown;
  }>
): ToolPlugin<unknown, unknown>[] {
  return plugins.map(({ tool, handler, validator }) =>
    createToolPlugin(tool, handler, validator)
  );
}

/**
 * Type-safe tool plugin builder
 */
export class ToolPluginBuilder<TArgs, TResult> {
  private _tool?: Tool;
  private _handler?: (args: TArgs) => Promise<TResult>;
  private _validator?: (args: unknown) => args is TArgs;

  tool(tool: Tool): this {
    this._tool = tool;
    return this;
  }

  handler(handler: (args: TArgs) => Promise<TResult>): this {
    this._handler = handler;
    return this;
  }

  validator(validator: (args: unknown) => args is TArgs): this {
    this._validator = validator;
    return this;
  }

  build(): ToolPlugin<TArgs, TResult> {
    if (!this._tool || !this._handler) {
      throw new Error('ToolPluginBuilder requires both tool and handler to be set');
    }

    return createToolPlugin(this._tool, this._handler, this._validator);
  }
}