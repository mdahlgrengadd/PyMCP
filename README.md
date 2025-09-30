# MCP over Pyodide – Template

Write plain **Python** classes with type hints & docstrings; run them in **Pyodide**; call them from **TypeScript** as if they were local methods. JSON‑RPC 2.0 under the hood, with runtime validation via Pydantic (→ JSON Schema → Ajv).

## Quickstart

```bash
pnpm i
pnpm dev
# open http://localhost:5173
```
In the UI, click **Boot Pyodide**. Then try the sample tools.

> The worker loads Pyodide from the CDN URL you enter (defaults to `https://cdn.jsdelivr.net/pyodide/v0.26.4/full/`).

## Where things live

```
src/
  lib/mcp-pyodide-client.ts   # TS JSON-RPC client + “native-feeling” tool proxy (with Ajv validation)
  workers/py.worker.ts        # Worker: loads Pyodide, writes Python files, boots the server
  py/
    mcp_core.py               # MCP server core: metaclass reflection, schemas, Pyodide bridge
    my_server.py              # Example: plain Python class → tools
```

## Add your own tools

Edit `src/py/my_server.py` and add a public method with type hints:

```py
class MyService(McpServer):
    def multiply(self, a: float, b: float) -> float:
        '''Multiply two numbers.'''
        return a * b
```

Reload the page, click **tools/list**, and you’ll see `multiply`. Call it with:

```ts
const tools = await mcp.createProxy();
const out = await tools["multiply"]({ a: 6, b: 7 });
```

## Optional: Generate TypeScript types

If you have CPython locally:

```bash
pnpm typegen
```

This runs `scripts/gen-types.mjs` which executes `tools_dump.py` to dump tool schemas and emits `src/types/mcp-tools.gen.d.ts`. You can then cast the proxy:

```ts
import type { McpTools } from './types/mcp-tools.gen';
const typed = await mcp.createProxy() as unknown as McpTools;
```

## Notes

- Runtime validation uses **Ajv** against JSON Schemas derived from your Pydantic models.
- The same Python class can be served over stdio/WebSocket; only the transport changes.
