/// Service Worker (Module) for MCP over Pyodide
/// Intercepts /mcp requests and forwards to Python MCP server running in Pyodide

// Version - increment to force update
const SW_VERSION = 'v6-module';

// Default Pyodide CDN URL (used when indexURL not provided)
const DEFAULT_PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

// Use module-type SW with static ESM imports per Pyodide docs
import 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.asm.js';
import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs';

// Minimal XMLHttpRequest shim (Pyodide expects it to exist)
class XMLHttpRequestPolyfill {
  constructor() { this.responseType = ''; this.response = null; this.responseText = null; this.status = 0; this.statusText = ''; this.onload = null; this.onerror = null; this._url = null; this._method = null; }
  open(method, url) { this._method = method; this._url = url; }
  async send() {
    try {
      const res = await fetch(this._url, { method: this._method });
      this.status = res.status; this.statusText = res.statusText;
      if (this.responseType === 'arraybuffer') this.response = await res.arrayBuffer();
      else { this.responseText = await res.text(); this.response = this.responseText; }
      this.onload && this.onload();
    } catch (e) { this.onerror && this.onerror(e); }
  }
  setRequestHeader() {}
}
self.XMLHttpRequest = XMLHttpRequestPolyfill;

// Global state
let pyodide = null;
let mcpReady = false;
let cachedIndexURL = null;

console.log(`SW (${SW_VERSION}): Module SW loaded`);

// Install event - prepare service worker
self.addEventListener('install', (event) => {
  console.log('SW: Installing...');
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - take control of clients
self.addEventListener('activate', (event) => {
  console.log('SW: Activating...');
  // Claim all clients immediately
  event.waitUntil(self.clients.claim());
});

// Fetch event - intercept HTTP requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle CORS preflight (OPTIONS) for /mcp
  if (url.pathname === '/mcp' && event.request.method === 'OPTIONS') {
    event.respondWith(new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      }
    }));
    return;
  }

  // Only intercept POST requests to /mcp
  if (url.pathname === '/mcp' && event.request.method === 'POST') {
    console.log('SW: Intercepting /mcp request');
    event.respondWith(handleMcpRequest(event.request));
    return;
  }

  // Let all other requests pass through normally
  return;
});

/**
 * Handle MCP JSON-RPC request
 */
async function handleMcpRequest(request) {
  try {
    const jsonRpcRequest = await request.json();
    const { id, method, params = {} } = jsonRpcRequest;
    console.log('SW: Received JSON-RPC request:', method);

    // Special method to initialize Pyodide
    if (method === 'sw/init') {
      const indexURL = (typeof params.indexURL === 'string' && params.indexURL)
        ? params.indexURL
        : (cachedIndexURL || DEFAULT_PYODIDE);

      await initPyodide(indexURL);

      cachedIndexURL = indexURL;

      return jsonResponse({
        jsonrpc: '2.0',
        id,
        result: { status: 'ready', indexURL }
      });
    }

    // Check if Pyodide is ready
    if (!mcpReady) {
      return jsonResponse({
        jsonrpc: '2.0',
        id,
        error: { code: -32002, message: 'Pyodide not initialized. Call sw/init first.' }
      });
    }

    // Forward request to Python MCP server
    const result = await forwardToPython(jsonRpcRequest);

    return jsonResponse(result);

  } catch (error) {
    console.error('SW: Error handling request:', error);
    return jsonResponse({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: 'Internal error: ' + (error?.message || String(error))
      }
    });
  }
}

/**
 * Initialize Pyodide and load Python MCP server (idempotent)
 */
async function initPyodide(indexURL) {
  // Make idempotent - return immediately if already initialized with same URL
  if (pyodide && cachedIndexURL === indexURL) {
    console.log('SW: Pyodide already initialized');
    return;
  }

  // Normalize URL
  if (!indexURL.endsWith('/')) {
    indexURL += '/';
  }

  cachedIndexURL = indexURL;

  // Load Pyodide via static ESM (module SW cannot use importScripts or dynamic import in fetch handler)
  console.log(`SW (${SW_VERSION}): Initializing Pyodide from:`, indexURL);
  pyodide = await loadPyodide({ indexURL });
  console.log('SW: Pyodide loaded');

  // Initialize Pyodide
  console.log('SW: Pyodide loaded');

  // Ensure Python can import our files - add "/" to sys.path
  await pyodide.runPythonAsync(`
import sys
if "/" not in sys.path:
    sys.path.append("/")
print(f"Python sys.path: {sys.path}")
  `);

  // Load micropip
  await pyodide.loadPackage('micropip');
  console.log('SW: micropip loaded');

  // Install pydantic
  try {
    await pyodide.runPythonAsync('import pydantic');
    console.log('SW: pydantic already available');
  } catch {
    console.log('SW: Installing pydantic...');
    await pyodide.runPythonAsync('import micropip; await micropip.install("pydantic==2.*")');
    console.log('SW: pydantic installed');
  }

  // Fetch Python source files from public directory
  // Note: These files should be copied to public/ during build
  console.log(`SW (${SW_VERSION}): Fetching Python source files from /mcp_core.py and /my_server.py`);
  
  let mcpCoreResp, myServerResp;
  try {
    [mcpCoreResp, myServerResp] = await Promise.all([
      fetch('/mcp_core.py'),
      fetch('/my_server.py')
    ]);
  } catch (fetchError) {
    console.error('SW: Fetch error:', fetchError);
    throw new Error(`Network error fetching Python files: ${fetchError.message}`);
  }

  console.log(`SW: Fetch responses - mcp_core: ${mcpCoreResp.status}, my_server: ${myServerResp.status}`);

  if (!mcpCoreResp.ok || !myServerResp.ok) {
    throw new Error(`Failed to fetch Python source files (mcp_core: ${mcpCoreResp.status}, my_server: ${myServerResp.status})`);
  }

  const mcpCoreSrc = await mcpCoreResp.text();
  const myServerSrc = await myServerResp.text();

  // Write Python files to Pyodide virtual filesystem
  pyodide.FS.writeFile('/mcp_core.py', mcpCoreSrc);
  pyodide.FS.writeFile('/my_server.py', myServerSrc);
  console.log('SW: Python files written to Pyodide FS');

  // Boot the MCP server (create instance and expose handler)
  console.log('SW: Booting MCP server...');
  await pyodide.runPythonAsync(`
from my_server import MyService
_mcp_server = MyService()

# Expose handler function for RPC calls
async def _mcp_handle(request_dict):
    """Handle JSON-RPC request from JavaScript."""
    response = await _mcp_server._handle_request(request_dict)
    return response

print("MCP server instance created and handler exposed")
  `);

  mcpReady = true;
  console.log('SW: MCP server ready');
}

/**
 * Forward JSON-RPC request to Python MCP server using safe object passing
 */
async function forwardToPython(jsonRpcRequest) {
  // Get the Python handler function
  const handle = pyodide.globals.get('_mcp_handle');

  if (!handle) {
    throw new Error('Python handler not found. MCP server not properly initialized.');
  }

  try {
    // Convert JS object to Python using pyodide.toPy (safe object passing)
    const pyReq = pyodide.toPy(jsonRpcRequest);

    // Call Python async handler
    const pyResp = await handle(pyReq);

    // Convert Python response to JS using .toJs() with dict converter
    const resp = pyResp?.toJs?.({ dict_converter: Object.fromEntries }) ?? pyResp;

    // Clean up PyProxy objects to avoid memory leaks
    pyReq.destroy?.();
    pyResp?.destroy?.();

    return resp ?? null;

  } catch (error) {
    console.error('SW: Error forwarding to Python:', error);

    // Clean up on error
    return {
      jsonrpc: '2.0',
      id: jsonRpcRequest.id || null,
      error: {
        code: -32603,
        message: 'Python execution error: ' + error.message
      }
    };
  }
}

/**
 * Create JSON response with consistent headers
 */
function jsonResponse(data) {
  // Common CORS headers for all responses
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // Handle notification responses (null/undefined)
  if (data === null || data === undefined) {
    return new Response(null, {
      status: 204,  // No Content
      headers
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers
  });
}
