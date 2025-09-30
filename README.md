# MCP over Pyodide – Template

Write plain **Python** classes with type hints & docstrings; run them in **Pyodide**; call them from **TypeScript** as if they were local methods. Supports **tools**, **resources**, and **prompt templates** with dynamic server loading.

## Quickstart

```bash
pnpm i
pnpm dev
# open http://localhost:5174
```
In the UI, select your server source (embedded or URL), click **Boot Pyodide**, then explore tools, resources, and prompts.

## Features

✅ **Tools**: Python methods become JSON-RPC callable tools  
✅ **Resources**: Expose files, documents, or data via `resource_*` methods  
✅ **Prompts**: Template systems via `prompt_*` methods  
✅ **Dynamic Loading**: Load servers from URLs at runtime  
✅ **Type Safety**: Auto-generated TypeScript types  
✅ **Validation**: Runtime validation via Pydantic + Ajv  

## Architecture

```
src/
  lib/mcp-pyodide-client.ts   # TS JSON-RPC client with validation
  workers/py.worker.ts        # Dynamic Pyodide loader (embedded or URL)
  py/
    mcp_core.py               # MCP framework with metaclass magic
    my_server.py              # Example server with tools/resources/prompts
```

## Adding Tools

Add a public method to your server class:

```python
class MyService(McpServer):
    def multiply(self, a: float, b: float) -> float:
        '''Multiply two numbers.'''
        return a * b
```

The method becomes available as a tool automatically.

## Adding Resources

Add a method prefixed with `resource_`:

```python
def resource_help(self) -> str:
    '''Help documentation for this server.'''
    return "# Help\n\nThis server provides..."

def resource_data(self) -> dict:
    '''JSON data resource.'''
    return {
        "mimeType": "application/json", 
        "text": '{"key": "value"}',
        "description": "Sample JSON data"
    }
```

Resources are accessible via `res://help`, `res://data`, etc.

## Adding Prompts

Add a method prefixed with `prompt_`:

```python
def prompt_greeting(self) -> str:
    '''Greet a user by name.'''
    return "Hello {{ name }}! Welcome to our service."

def prompt_advanced(self) -> dict:
    '''Advanced prompt with schema.'''
    return {
        "template": "Process {{ data }} with {{ method }}",
        "inputSchema": {
            "type": "object",
            "properties": {
                "data": {"type": "string"},
                "method": {"type": "string", "enum": ["fast", "thorough"]}
            }
        }
    }
```

## Dynamic Server Loading

The system supports loading servers from URLs:

1. **Embedded**: Uses the built-in `my_server.py`
2. **Example Remote Server**: Loads the included example from `/public/example_remote_server.py`
3. **Custom URL**: Fetches Python code from any URL

### URL Server Requirements

Your remote server must:
- Import or define `McpServer` and `attach_pyodide_worker`
- Have a `boot()` function OR a class inheriting from `McpServer`
- Follow the same naming conventions (`resource_*`, `prompt_*`)

Example remote server:

```python
from mcp_core import McpServer, attach_pyodide_worker

class RemoteServer(McpServer):
    def hello(self, name: str) -> str:
        '''Say hello to someone.'''
        return f"Hello {name} from the remote server!"
    
    def resource_info(self) -> str:
        '''Server information.'''
        return "This server was loaded from a URL!"

def boot():
    server = RemoteServer()
    attach_pyodide_worker(server)
```

### Usage Examples

Try the included example server by selecting "Example Remote Server" from the dropdown, or enter a custom URL:

```
Custom Server URL: https://example.com/my_server.py
```

## Type Generation

Generate TypeScript types for full IDE support:

```bash
# Setup (one time)
python3 -m venv .venv
source .venv/bin/activate  # or `.venv\Scripts\activate` on Windows
pip install pydantic

# Generate types
pnpm typegen
```

This creates `src/types/mcp-tools.gen.d.ts` with exact type definitions:

```typescript
import type { McpTools } from './types/mcp-tools.gen';

const tools = await client.createProxy() as unknown as McpTools;
const result = await tools.multiply({ a: 6, b: 7 }); // Fully typed!
```

## MCP Protocol Support

| Feature | Status | Notes |
|---------|--------|-------|
| Tools | ✅ | `tools/list`, `tools/call` |
| Resources | ✅ | `resources/list`, `resources/read` |
| Prompts | ✅ | `prompts/list`, `prompts/get` |
| Sampling | ❌ | Not implemented |
| Logging | ❌ | Console only |

## Deployment

The same Python server classes work in multiple environments:

- **Browser**: Via Pyodide (this template)
- **Node.js**: Via stdio transport
- **Server**: Via WebSocket transport
- **Desktop**: Via process communication

Only the transport layer changes – your Python code remains identical.
