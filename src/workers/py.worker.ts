/// <reference lib="webworker" />
// Minimal Worker that loads Pyodide via CDN (indexURL), writes Python files, and boots your server.

import mcpCoreSrc from '../py/mcp_core.py?raw';
import myServerSrc from '../py/my_server.py?raw';
import mcpIntrospectSrc from '../py/mcp_introspect.py?raw';
import { getEmbeddedPrometheosPackage } from './prometheos-package';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data || {};
  if (msg.type !== 'init') return;

  let indexURL: string = msg.indexURL || 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
  if (!indexURL.endsWith('/')) indexURL += '/';

  // Load pyodide.js into this worker via fetch and eval (for ES module workers)
  try {
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

    // Check for Desktop API bridge availability
    const bridge = (globalThis as any).desktop_api_comlink;
    const mcpHandler = (globalThis as any).desktop_mcp_comlink;

    if (bridge) {
      console.log('✓ Desktop API bridge available to PyMCP worker');
    } else {
      console.warn('⚠ Desktop API bridge not found - prometheos.api will not work');
    }

    // Load PrometheOS package code
    const prometheosPackageCode = getEmbeddedPrometheosPackage();
    await pyodide.runPythonAsync(prometheosPackageCode);
    console.log('✓ PrometheOS package loaded in PyMCP worker');

    // Write our Python modules and boot
    pyodide.FS.writeFile('mcp_core.py', mcpCoreSrc);
    pyodide.FS.writeFile('my_server.py', myServerSrc);
    pyodide.FS.writeFile('mcp_introspect.py', mcpIntrospectSrc);

    await pyodide.runPythonAsync(`
from my_server import boot
boot()
    `);

    // After this, Python owns self.onmessage via js.self.onmessage (set in attach_pyodide_worker).
    // Python will immediately post {type:"mcp.ready"}.
  } catch (error: any) {
    console.error('Worker error:', error);
    self.postMessage({ type: 'error', error: error?.message || 'Unknown error' });
  }
};
