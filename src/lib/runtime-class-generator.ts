/**
 * Runtime class generator
 * Generates JavaScript client classes from Python server introspection
 */

import type { PyodideMcpClient } from './mcp-pyodide-client';

interface ParamMeta {
  name: string;
  type: string;
  required: boolean;
  default?: string | null;
}

interface MethodMeta {
  name: string;
  category: 'tool' | 'resource' | 'prompt';
  params: ParamMeta[];
  returnType: string;
  docstring: string;
}

export interface ServerSchema {
  className: string;
  version: string;
  methods: MethodMeta[];
}

/**
 * Generate a JavaScript class from Python server introspection schema
 * This happens entirely at runtime - Python introspects itself, JS creates the class
 */
export async function generateClientFromServer(
  client: PyodideMcpClient
): Promise<any> {
  
  // Call Python introspection endpoint
  console.log('🔍 Introspecting Python server...');
  const schema = await client.call('server/introspect', {}) as ServerSchema;
  
  console.log(`✨ Generating ${schema.className}Client with ${schema.methods.length} methods`);
  
  // Generate and instantiate the class
  return generateClass(client, schema);
}

/**
 * Generate a JavaScript class from schema
 */
function generateClass(client: PyodideMcpClient, schema: ServerSchema): any {
  
  // Create the class dynamically
  const GeneratedClass = class {
    private _client: PyodideMcpClient;
    private _schema: ServerSchema;
    
    constructor(client: PyodideMcpClient) {
      this._client = client;
      this._schema = schema;
    }
    
    // Add a toString for debugging
    toString() {
      return `${schema.className}Client (${schema.methods.length} methods, runtime-generated)`;
    }
    
    // Add method to list available methods
    __methods__() {
      return schema.methods.map(m => ({
        name: m.name,
        category: m.category,
        params: m.params.map(p => `${p.name}: ${p.type}`),
        returns: m.returnType,
        doc: m.docstring
      }));
    }
  };
  
  // Add each method to the prototype
  for (const method of schema.methods) {
    addMethodToClass(GeneratedClass, method);
  }
  
  // Instantiate and return
  return new GeneratedClass(client);
}

/**
 * Add a single method to the class prototype
 */
function addMethodToClass(ClassConstructor: any, method: MethodMeta): void {
  
  if (method.category === 'tool') {
    // Tool method: calls tools/call
    ClassConstructor.prototype[method.name] = async function(...args: any[]) {
      // Map positional arguments to named parameters
      const argsObj: Record<string, any> = {};
      method.params.forEach((param, index) => {
        if (index < args.length && args[index] !== undefined) {
          argsObj[param.name] = args[index];
        }
      });
      
      const mcpResult = await this._client.call('tools/call', {
        name: method.name,
        arguments: argsObj
      });
      
      return this._client.unwrapContent(mcpResult);
    };
    
  } else if (method.category === 'resource') {
    // Resource method: calls resources/read
    ClassConstructor.prototype[method.name] = async function(...args: any[]) {
      const resourceName = method.name.replace('resource_', '');
      
      // Build URI based on parameters
      let uri = `res://${resourceName}`;
      if (method.params.length > 0 && args[0] !== undefined) {
        // Parameterized resource: res://doc/{doc_id}
        uri += `/${args[0]}`;
      }
      
      const result = await this._client.readResource(uri);
      
      // Return the actual content text or parsed JSON
      const content = result.contents?.[0];
      if (content?.mimeType === 'application/json') {
        try {
          return JSON.parse(content.text);
        } catch {
          return content.text;
        }
      }
      return content?.text || result;
    };
    
  } else if (method.category === 'prompt') {
    // Prompt method: calls prompts/get
    ClassConstructor.prototype[method.name] = async function(...args: any[]) {
      const promptName = method.name.replace('prompt_', '');
      
      // Map positional arguments to named parameters
      const argsObj: Record<string, any> = {};
      method.params.forEach((param, index) => {
        if (index < args.length && args[index] !== undefined) {
          argsObj[param.name] = args[index];
        }
      });
      
      return this._client.getPrompt(promptName, argsObj);
    };
  }
  
  // Add metadata for introspection/debugging
  Object.defineProperty(ClassConstructor.prototype[method.name], '__meta__', {
    value: method,
    enumerable: false,
    writable: false
  });
  
  // Add toString to show signature
  Object.defineProperty(ClassConstructor.prototype[method.name], 'toString', {
    value: function() {
      const params = method.params
        .map(p => `${p.name}: ${p.type}${p.required ? '' : '?'}`)
        .join(', ');
      return `async ${method.name}(${params}): Promise<${method.returnType}>\n${method.docstring}`;
    },
    enumerable: false,
    writable: false
  });
}

/**
 * Helper to print available methods
 */
export function printMethods(instance: any): void {
  if (typeof instance.__methods__ === 'function') {
    const methods = instance.__methods__();
    console.log(`\n📋 ${instance.toString()}\n`);
    
    for (const method of methods) {
      console.log(`  ${method.category.toUpperCase()}: ${method.name}(${method.params.join(', ')})`);
      console.log(`    → ${method.returns}`);
      if (method.doc) {
        console.log(`    ${method.doc}`);
      }
      console.log();
    }
  }
}


