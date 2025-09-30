# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP over Pyodide – A template for writing Python MCP servers that run in the browser via Pyodide. Write plain Python classes with type hints & docstrings, run them in Pyodide, and call them from TypeScript as if they were local methods. Uses JSON-RPC 2.0 with runtime validation via Pydantic → JSON Schema → Ajv.

## Development Commands

```bash
# Install dependencies
pnpm i

# Start development server
pnpm dev
# Then open http://localhost:5173

# Build for production
pnpm build

# Preview production build
pnpm preview

# Generate TypeScript types from Python tools (requires CPython)
pnpm typegen
```

## Architecture

### Core Components

**Python Layer** ([src/py/](src/py/)):
- **[mcp_core.py](src/py/mcp_core.py)**: Core MCP server implementation using metaclass reflection
  - `McpMeta`: Metaclass that inspects methods and builds tool descriptors
  - `McpServer`: Base class for MCP servers with JSON-RPC 2.0 handling
  - `attach_pyodide_worker()`: Bridges Python server to Pyodide worker via `js.postMessage`
  - Uses Pydantic to generate JSON schemas from Python type hints

- **[my_server.py](src/py/my_server.py)**: Example service implementation
  - Inherit from `McpServer` and add public methods with type hints
  - Methods automatically become MCP tools
  - The `boot()` function instantiates and attaches the server to the worker

**TypeScript Layer**:
- **[src/lib/mcp-pyodide-client.ts](src/lib/mcp-pyodide-client.ts)**: Client-side JSON-RPC wrapper
  - `PyodideMcpClient`: Manages worker communication and tool discovery
  - `createProxy()`: Creates a typed proxy object for calling Python tools
  - Uses Ajv for runtime validation of inputs/outputs against JSON schemas

- **[src/workers/py.worker.ts](src/workers/py.worker.ts)**: Web Worker that:
  1. Loads Pyodide from CDN (configurable URL)
  2. Installs Pydantic via micropip
  3. Writes Python modules to Pyodide's virtual filesystem
  4. Boots the Python server by calling `boot()`
  5. Hands control to Python via `attach_pyodide_worker()`

**Type Generation**:
- **[tools_dump.py](tools_dump.py)**: Standalone script that imports MyService and dumps tool schemas
- **[scripts/gen-types.mjs](scripts/gen-types.mjs)**: Runs tools_dump.py and generates TypeScript definitions in `src/types/mcp-tools.gen.d.ts`

### Data Flow

1. User clicks "Boot Pyodide" → `mcp.init(indexURL)` → worker loads Pyodide & Python
2. Python calls `attach_pyodide_worker()` → posts `{type: "mcp.ready"}`
3. Client calls `createProxy()` → sends `tools/list` → gets schemas → creates validated proxy
4. Calling `proxy.toolName({...})` → JSON-RPC `tools/call` → Pyodide → Python method → JSON-RPC response
5. Ajv validates inputs before sending, outputs after receiving

### Adding New Tools

1. Edit [src/py/my_server.py](src/py/my_server.py)
2. Add a public method with type hints and docstring:
```python
def multiply(self, a: float, b: float) -> float:
    '''Multiply two numbers.'''
    return a * b
```
3. Reload the page to pick up changes (Vite hot-reloads TS but not Python)
4. Optionally run `pnpm typegen` to update TypeScript types

### Key Constraints

- Python code runs in Pyodide (WASM), so no native extensions or filesystem access
- Python files are bundled via Vite's `?raw` imports and written to Pyodide FS at runtime
- Pydantic must be installed in Pyodide (handled automatically by worker)
- Tool schemas are derived from Python type hints, so always annotate parameters and return types
- The same Python class can theoretically be served over stdio/WebSocket by changing the transport layer