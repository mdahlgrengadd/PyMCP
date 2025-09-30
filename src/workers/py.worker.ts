/// <reference lib="webworker" />
// Dynamic MCP server worker that can load Python servers from URLs or use embedded ones

import mcpCoreSrc from '../py/mcp_core.py?raw';
import myServerSrc from '../py/my_server.py?raw';

declare const self: DedicatedWorkerGlobalScope;

interface InitMessage {
  type: 'init';
  indexURL?: string;
  serverUrl?: string;
  serverType?: 'embedded' | 'url';
}

self.onmessage = async (e: MessageEvent) => {
  const msg: InitMessage = e.data || {};
  if (msg.type !== 'init') return;

  let indexURL: string = msg.indexURL || 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
  if (!indexURL.endsWith('/')) indexURL += '/';

  const serverType = msg.serverType || 'embedded';
  const serverUrl = msg.serverUrl;

  // Load pyodide.js into this worker via fetch and eval (for ES module workers)
  try {
    console.log(`Loading Pyodide from ${indexURL}...`);
    const response = await fetch(indexURL + 'pyodide.js');
    const pyodideScript = await response.text();
    // @ts-ignore
    eval(pyodideScript);
    // @ts-ignore
    const pyodide = await (self as any).loadPyodide({ indexURL });

    // Ensure micropip is available then install pydantic if needed
    await pyodide.loadPackage('micropip');
    try {
      await pyodide.runPythonAsync('import pydantic');
    } catch {
      await pyodide.runPythonAsync('import micropip; await micropip.install("pydantic==2.*")');
    }

    // Write the core MCP framework
    pyodide.FS.writeFile('mcp_core.py', mcpCoreSrc);

    let serverCode: string;
    let bootCode: string;

    if (serverType === 'url' && serverUrl) {
      console.log(`Loading server from URL: ${serverUrl}`);
      try {
        const serverResponse = await fetch(serverUrl);
        if (!serverResponse.ok) {
          throw new Error(`Failed to fetch server: ${serverResponse.status} ${serverResponse.statusText}`);
        }
        serverCode = await serverResponse.text();
        
        // Extract filename from URL for the Python module
        const urlParts = serverUrl.split('/');
        const filename = urlParts[urlParts.length - 1] || 'remote_server.py';
        const moduleName = filename.replace('.py', '');
        
        pyodide.FS.writeFile(filename, serverCode);
        
        // Try to detect the boot function or server class
        bootCode = `
try:
    from ${moduleName} import boot
    boot()
except ImportError:
    try:
        from ${moduleName} import *
        # Look for a class that inherits from McpServer
        import inspect
        from mcp_core import McpServer
        server_class = None
        for name, obj in globals().items():
            if inspect.isclass(obj) and issubclass(obj, McpServer) and obj != McpServer:
                server_class = obj
                break
        if server_class:
            svc = server_class()
            from mcp_core import attach_pyodide_worker
            attach_pyodide_worker(svc)
        else:
            raise RuntimeError("No MCP server class found in remote module")
    except Exception as e:
        raise RuntimeError(f"Failed to initialize server from {serverUrl}: {e}")
        `;
      } catch (error: any) {
        console.error('Failed to load remote server:', error);
        self.postMessage({ 
          type: 'error', 
          error: `Failed to load server from ${serverUrl}: ${error.message}` 
        });
        return;
      }
    } else {
      // Use embedded server
      console.log('Using embedded server');
      serverCode = myServerSrc;
      pyodide.FS.writeFile('my_server.py', serverCode);
      bootCode = `
from my_server import boot
boot()
      `;
    }

    console.log('Booting Python server...');
    await pyodide.runPythonAsync(bootCode);

    // After this, Python owns self.onmessage via js.self.onmessage (set in attach_pyodide_worker).
    // Python will immediately post {type:"mcp.ready"}.
  } catch (error: any) {
    console.error('Worker error:', error);
    self.postMessage({ type: 'error', error: error?.message || 'Unknown error' });
  }
};
