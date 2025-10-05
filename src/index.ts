/**
 * PyMCP - Python MCP Client for Module Federation
 * 
 * This is the main entry point for the PyMCP shared library.
 * It exports the core classes and utilities for MCP (Model Context Protocol) integration.
 */

// Core MCP Client
export { PyodideMcpClient } from './lib/mcp-pyodide-client';

// Transport implementations
export { 
  WebWorkerTransport, 
  ServiceWorkerHTTPTransport,
  type McpTransport,
  type JsonRpcRequest,
  type JsonRpcNotification,
  type JsonRpcResponse
} from './lib/mcp-transport';

// Runtime class generator
export { 
  generateClientFromServer,
  printMethods,
  type ServerSchema
} from './lib/runtime-class-generator';

// Generated types (if available)
// export type { McpTools } from './types/mcp-tools.gen';

// Re-export everything for convenience
export * from './lib/mcp-pyodide-client';
export * from './lib/mcp-transport';
export * from './lib/runtime-class-generator';
