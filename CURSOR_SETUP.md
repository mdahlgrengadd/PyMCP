# Connecting PyMCP to Cursor IDE

This guide shows you how to connect your Python MCP server (running via Pyodide in Electron) to Cursor IDE.

## Quick Start

### 1. Start the Electron App

```bash
npm run electron:dev
```

You should see:
```
✅ MCP HTTP Server running on http://localhost:3000/mcp

Configure Cursor/VS Code with:

{
  "mcpServers": {
    "pymcp": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### 2. Configure Cursor

#### Option A: Using Cursor Settings UI
1. Open Cursor
2. Go to **Settings** (Ctrl+,)
3. Search for "MCP"
4. Click "Edit in settings.json"
5. Add this configuration:

```json
{
  "mcpServers": {
    "pymcp": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

#### Option B: Edit config file directly
1. Open `%APPDATA%\Cursor\User\settings.json` (Windows) or `~/.config/Cursor/User/settings.json` (Mac/Linux)
2. Add the configuration above

### 3. Restart Cursor

Close and reopen Cursor for the MCP server to be recognized.

### 4. Test the Connection

In Cursor's chat, you should now be able to use your Python tools!

Try asking:
- "List available MCP tools"
- "Use the add tool to calculate 5 + 3"
- "Echo 'Hello from Cursor!' in uppercase"

## Testing from Command Line

Before configuring Cursor, you can test if the server is working:

### Test 1: Health Check
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok","service":"pymcp-electron"}
```

### Test 2: List Tools
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"
```

Expected response (JSON with list of tools):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "echo",
        "description": "Echo back a message, optionally in uppercase.",
        ...
      },
      {
        "name": "add",
        "description": "Add two numbers.",
        ...
      },
      ...
    ]
  }
}
```

### Test 3: Call a Tool
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"add\",\"arguments\":{\"a\":5,\"b\":3}}}"
```

Expected response:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "8"
      }
    ]
  }
}
```

## Troubleshooting

### "Request timeout" error

**Symptom**: Cursor connects but requests timeout after 30 seconds.

**Cause**: The Electron renderer (browser window) hasn't finished booting Pyodide.

**Solution**:
1. Look at the Electron window - you should see log messages
2. Wait for "✅ MCP server ready in Electron" message
3. If you see errors, close Electron and restart: `npm run electron:dev`

### "Connection refused" error

**Symptom**: Cursor can't connect to `http://localhost:3000`

**Causes**:
1. Electron app isn't running
2. Port 3000 is already in use by another application

**Solutions**:
1. Make sure `npm run electron:dev` is running
2. Check if port 3000 is available:
   ```bash
   # Windows
   netstat -ano | findstr :3000

   # Mac/Linux
   lsof -i :3000
   ```
3. If port 3000 is in use, edit `electron/main.ts` and change `MCP_PORT` to a different port (e.g., 3001), then rebuild:
   ```bash
   npm run build
   npm run electron:compile
   npm run electron:dev
   ```

### Electron window shows errors

**Symptom**: Electron opens but shows errors in the log panel.

**Common issues**:
1. **"Failed to fetch Python files"**: Make sure `public/mcp_core.py` and `public/my_server.py` exist
   ```bash
   cp src/py/*.py public/
   ```

2. **"Pyodide failed to load"**: Network issue downloading Pyodide from CDN
   - Check your internet connection
   - Or use a local Pyodide installation (see advanced docs)

3. **Worker errors**: The Web Worker failed to initialize
   - Check the browser console (F12) for more details
   - Try rebuilding: `npm run build`

### Cursor doesn't show the MCP server

**Symptom**: After configuring, Cursor doesn't list your MCP server.

**Solutions**:
1. **Restart Cursor completely** (close all windows)
2. Check the MCP configuration syntax is valid JSON
3. Check Cursor's logs:
   - Windows: `%APPDATA%\Cursor\logs`
   - Mac: `~/Library/Application Support/Cursor/logs`
   - Linux: `~/.config/Cursor/logs`

## For VS Code Users

The exact same configuration works for VS Code with MCP extension:

```json
{
  "mcpServers": {
    "pymcp": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## For Claude Desktop Users

In Claude Desktop's configuration file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pymcp": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Adding Your Own Tools

1. Edit `src/py/my_server.py`
2. Add a new method with type hints and docstring:
   ```python
   def multiply(self, a: float, b: float) -> float:
       '''Multiply two numbers.'''
       return a * b
   ```
3. Copy to public: `cp src/py/my_server.py public/`
4. Restart Electron: Close the app and run `npm run electron:dev`
5. The new tool is now available in Cursor!

## Production Deployment

For distributing your MCP server to others:

1. Build the Electron executable:
   ```bash
   npm run electron:build
   ```

2. The executable will be in `release/` directory

3. Users just need to:
   - Run the executable
   - Configure their IDE with `http://localhost:3000/mcp`
   - No Python installation required!

## Advanced: Changing the Port

If you need to use a different port:

1. Edit `electron/main.ts`:
   ```typescript
   const MCP_PORT = 3001; // Change to your desired port
   ```

2. Rebuild:
   ```bash
   npm run build
   npm run electron:compile
   ```

3. Update your IDE configuration to use the new port:
   ```json
   {
     "mcpServers": {
       "pymcp": {
         "url": "http://localhost:3001/mcp"
       }
     }
   }
   ```

## Support

If you encounter issues:
1. Check the Electron console logs (visible in the GUI window)
2. Check Cursor's logs
3. Test the endpoint with `curl` commands above
4. File an issue with:
   - Error message
   - Electron console logs
   - Cursor logs (if applicable)
