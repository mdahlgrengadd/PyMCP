# Electron Integration for PyMCP

This document explains how to run PyMCP as a standalone Electron application that exposes an HTTP server for external MCP clients like Cursor IDE, VS Code, and Claude Desktop.

## Architecture

```
External MCP Client (Cursor/VS Code/Claude Desktop)
    │
    │ HTTP POST to http://localhost:3000/mcp
    │
    ↓
Electron Main Process (Node.js + Express)
    │
    │ IPC (Inter-Process Communication)
    │
    ↓
Electron Renderer (Chromium Browser)
    │
    │ Service Worker HTTP Transport
    │
    ↓
Service Worker (sw-mcp.js)
    │
    │ JSON-RPC 2.0
    │
    ↓
Pyodide (Python running in WebAssembly)
    │
    ↓
MCP Server (mcp_core.py + my_server.py)
```

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

This installs Electron, Express, and all required dependencies.

### 2. Run in Development Mode

```bash
pnpm electron:dev
```

This will:
1. Build the Vite frontend (`dist/` directory)
2. Compile Electron TypeScript files (`dist-electron/` directory)
3. Start Electron with GUI window showing the MCP server logs
4. Start HTTP server on `http://localhost:3000`

### 3. Run in Headless Mode

```bash
pnpm electron:headless
```

This runs Electron without showing the GUI window - perfect for running as a background service.

### 4. Build Production Executable

```bash
pnpm electron:build
```

This creates platform-specific executables in the `release/` directory:
- **Windows**: `.exe` installer and portable `.exe`
- **macOS**: `.dmg` and `.zip`
- **Linux**: `.AppImage` and `.deb`

## Connecting from Cursor IDE

### Option 1: While Electron App is Running

1. Start the Electron app:
   ```bash
   pnpm electron:dev
   # or
   pnpm electron:headless
   ```

2. Configure Cursor's MCP settings (`.cursor/config.json` or Settings → MCP):
   ```json
   {
     "mcpServers": {
       "pymcp": {
         "url": "http://localhost:3000/mcp"
       }
     }
   }
   ```

3. Cursor will now be able to call your Python MCP tools!

### Option 2: Using the Built Executable

After building with `pnpm electron:build`:

1. Install the executable from `release/` directory
2. Run it (either with GUI or use the portable version in headless mode)
3. Configure Cursor as shown above

## How It Works

### Main Process (`electron/main.ts`)

- Creates an Express HTTP server on port 3000
- Listens for POST requests to `/mcp` endpoint
- Forwards incoming JSON-RPC requests to the Renderer process via IPC
- Returns responses back to the HTTP client

### Preload Script (`electron/preload.ts`)

- Secure bridge between Main and Renderer processes
- Exposes `window.electronAPI` for safe IPC communication
- Prevents direct Node.js access from the renderer (security best practice)

### Renderer (`src/main.ts`)

- Detects if running in Electron via `window.electronAPI`
- Auto-boots the MCP server using Service Worker transport
- Listens for incoming IPC messages from Main process
- Forwards JSON-RPC requests to Pyodide MCP server
- Sends responses back via IPC

### Service Worker (`public/sw-mcp.js`)

- Intercepts HTTP requests to `/mcp`
- Loads Pyodide and Python source files
- Executes Python MCP server methods
- Returns JSON-RPC responses

## Development Workflow

### Making Changes to Python Code

1. Edit `src/py/my_server.py` or `src/py/mcp_core.py`
2. Copy to public directory:
   ```bash
   cp src/py/*.py public/
   ```
3. Rebuild and restart:
   ```bash
   pnpm electron:dev
   ```

### Making Changes to TypeScript Code

1. Edit TypeScript files in `src/` or `electron/`
2. Rebuild and restart:
   ```bash
   pnpm electron:dev
   ```

### Updating Type Definitions

After changing Python method signatures:

```bash
pnpm typegen
```

This regenerates TypeScript type definitions from Python type hints.

## Testing the HTTP Endpoint

You can test the HTTP endpoint directly with `curl`:

```bash
# List available tools
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'

# Call a tool
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "add",
      "arguments": { "a": 5, "b": 3 }
    }
  }'
```

## Health Check

Check if the server is running:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok","service":"pymcp-electron"}
```

## Troubleshooting

### Port 3000 Already in Use

Edit `electron/main.ts` and change `MCP_PORT` to a different port.

### Service Worker Not Loading

The Service Worker needs to be registered on first load. If you see an error about reloading:
1. Reload the Electron window (in dev mode, DevTools should be open)
2. The Service Worker will activate on the second load

### Python Files Not Found

Ensure Python source files are copied to `public/`:
```bash
cp src/py/*.py public/
```

### Electron App Won't Start

1. Make sure dependencies are installed: `pnpm install`
2. Check that TypeScript compiled: look for `dist-electron/main.js`
3. Check that Vite built: look for `dist/index.html`

## Configuration

### Changing the HTTP Port

Edit `electron/main.ts`:
```typescript
const MCP_PORT = 3000; // Change to your desired port
```

### Changing Pyodide CDN

The default Pyodide CDN is configured in `public/sw-mcp.js`:
```javascript
const DEFAULT_PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
```

You can also pass a custom `indexURL` via the input field in the GUI.

## Benefits of This Approach

✅ **No Python Installation Required** - Pyodide is bundled in the Electron app
✅ **Cross-Platform** - Single build works on Windows, macOS, and Linux
✅ **Standard MCP Interface** - Works with any MCP client (Cursor, VS Code, Claude Desktop)
✅ **Sandboxed Python Execution** - Python runs in WebAssembly, fully isolated
✅ **Type Safety** - Full TypeScript type checking for Python tools
✅ **Offline Capable** - Everything runs locally, no internet required after installation

## Advanced Usage

### Running Multiple Instances

You can run multiple instances on different ports by:
1. Changing `MCP_PORT` in `electron/main.ts`
2. Building separate executables
3. Configuring Cursor to connect to different ports

### Custom MCP Server Classes

To create your own MCP server:

1. Create a new Python class in `src/py/`:
   ```python
   from mcp_core import McpServer

   class MyCustomServer(McpServer):
       def my_tool(self, arg: str) -> str:
           '''My custom tool description.'''
           return f"Processed: {arg}"
   ```

2. Update `public/sw-mcp.js` to import and instantiate your class:
   ```javascript
   await pyodide.runPythonAsync(`
   from my_custom_server import MyCustomServer
   _mcp_server = MyCustomServer()
   ...
   `);
   ```

3. Rebuild and restart

## Production Deployment

### Distributing to Users

1. Build the production executable:
   ```bash
   pnpm electron:build
   ```

2. Distribute the executable from `release/` directory

3. Provide users with Cursor configuration:
   ```json
   {
     "mcpServers": {
       "pymcp": {
         "url": "http://localhost:3000/mcp"
       }
     }
   }
   ```

4. Users simply run the executable and Cursor will connect automatically

### Auto-Start on System Boot

Users can configure the Electron app to start automatically:
- **Windows**: Add to Startup folder
- **macOS**: System Preferences → Users & Groups → Login Items
- **Linux**: Add to systemd or init.d

## Security Considerations

- The HTTP server listens on `localhost` only (not exposed to network)
- CORS is enabled for local development but can be restricted for production
- Python code runs in WebAssembly sandbox (no file system or network access by default)
- IPC communication uses Electron's `contextBridge` for security

## License

Same as the main PyMCP project.
