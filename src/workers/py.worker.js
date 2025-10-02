/// <reference lib="webworker" />
// Minimal Worker that loads Pyodide via CDN (indexURL), writes Python files, and boots your server.
import mcpCoreSrc from '../py/mcp_core.py?raw';
import myServerSrc from '../py/my_server.py?raw';
self.onmessage = async (e) => {
    const msg = e.data || {};
    if (msg.type !== 'init')
        return;
    let indexURL = msg.indexURL || 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
    if (!indexURL.endsWith('/'))
        indexURL += '/';
    // Load pyodide.js into this worker via fetch and eval (for ES module workers)
    try {
        const response = await fetch(indexURL + 'pyodide.js');
        const pyodideScript = await response.text();
        // @ts-ignore
        eval(pyodideScript);
        // @ts-ignore
        const pyodide = await self.loadPyodide({ indexURL });
        // Ensure micropip is available then install pydantic if needed
        await pyodide.loadPackage('micropip');
        try {
            await pyodide.runPythonAsync('import pydantic');
        }
        catch {
            await pyodide.runPythonAsync('import micropip; await micropip.install("pydantic==2.*")');
        }
        // Write our Python modules and boot
        pyodide.FS.writeFile('mcp_core.py', mcpCoreSrc);
        pyodide.FS.writeFile('my_server.py', myServerSrc);
        await pyodide.runPythonAsync(`
from my_server import boot
boot()
    `);
        // After this, Python owns self.onmessage via js.self.onmessage (set in attach_pyodide_worker).
        // Python will immediately post {type:"mcp.ready"}.
    }
    catch (error) {
        console.error('Worker error:', error);
        self.postMessage({ type: 'error', error: error?.message || 'Unknown error' });
    }
};
//# sourceMappingURL=py.worker.js.map