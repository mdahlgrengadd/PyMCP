/// <reference lib="webworker" />
// Dynamic MCP server worker that can load Python servers from URLs or use embedded ones

import mcpCoreSrc from '../py/mcp_core.py?raw';
import myServerSrc from '../py/my_server.py?raw';
import pymcpSrc from '../../public/pymcp.py?raw';

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

    // Write the core MCP framework files
    pyodide.FS.writeFile('mcp_core.py', mcpCoreSrc);
    pyodide.FS.writeFile('pymcp.py', pymcpSrc);

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
        
        // Try to detect and run the server (multiple patterns)
        bootCode = `
# Try different initialization patterns
try:
    # Pattern 1: Traditional boot() function
    from ${moduleName} import boot
    boot()
except ImportError:
    try:
        # Pattern 2: Look for if __name__ == "__main__" pattern or serve() calls
        exec(open('${filename}').read())
    except Exception as e1:
        try:
            # Pattern 3: Auto-detect Server classes and instantiate
            from ${moduleName} import *
            import inspect
            
            # Try to find serve() function and Server class
            server_class = None
            serve_func = None
            
            for name, obj in globals().items():
                if name.startswith('_'):
                    continue
                if inspect.isclass(obj):
                    # Look for classes that might inherit from Server or McpServer
                    mro_names = [cls.__name__ for cls in obj.__mro__]
                    if 'Server' in mro_names or 'McpServer' in mro_names:
                        server_class = obj
                elif callable(obj) and name == 'serve':
                    serve_func = obj
            
            if server_class and serve_func:
                # Use the clean API pattern
                svc = server_class()
                serve_func(svc)
            elif server_class:
                # Fallback to direct instantiation + attach
                svc = server_class()
                try:
                    from mcp_core import attach_pyodide_worker
                    attach_pyodide_worker(svc)
                except:
                    # Maybe it's using pymcp serve
                    try:
                        from pymcp import serve
                        serve(svc)
                    except:
                        raise RuntimeError("Could not attach server")
            else:
                raise RuntimeError("No compatible server class found")
        except Exception as e2:
            raise RuntimeError(f"Failed to initialize server: {e1}, then {e2}")
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
