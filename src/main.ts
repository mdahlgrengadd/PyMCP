import { PyodideMcpClient } from './lib/mcp-pyodide-client';
import type { McpTools } from './types/mcp-tools.gen';

const logEl = document.getElementById('log') as HTMLPreElement;
const idxEl = document.getElementById('idx') as HTMLInputElement;
const bootBtn = document.getElementById('boot') as HTMLButtonElement;
const listBtn = document.getElementById('list') as HTMLButtonElement;
const echoBtn = document.getElementById('echo') as HTMLButtonElement;
const addBtn  = document.getElementById('add')  as HTMLButtonElement;
const getBtn  = document.getElementById('get')  as HTMLButtonElement;

let client: PyodideMcpClient | null = null;
let tools: McpTools | null = null;

function log(...args: any[]) {
  logEl.textContent += args.map(a => typeof a === 'string' ? a : JSON.stringify(a, null, 2)).join(' ') + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

bootBtn.onclick = async () => {
  try {
    log('Booting worker + Pyodide...');
    const worker = new Worker(new URL('./workers/py.worker.ts', import.meta.url), { type: 'module' });
    
    // Listen for worker errors
    worker.addEventListener('message', (e) => {
      if (e.data?.type === 'error') {
        log('Worker error:', e.data.error);
      }
    });
    
    client = await new PyodideMcpClient(worker).init(idxEl.value);
    tools  = await client.createProxy() as unknown as McpTools;
    log('✅ Pyodide ready and tools proxy created.');
  } catch (e:any) {
    log('Boot error:', e?.message || e);
  }
};

listBtn.onclick = async () => {
  if (!client) return log('Please boot first.');
  const t = await client.listTools();
  log('tools/list →', t);
};

echoBtn.onclick = async () => {
  if (!tools) return log('Please boot first.');
  // Now we have full type safety!
  const out = await tools.echo({ message: 'hello', upper: true });
  log('echo →', out);
};

addBtn.onclick = async () => {
  if (!tools) return log('Please boot first.');
  // TypeScript knows the parameter types
  const out = await tools.add({ a: 1.5, b: 2.25 });
  log('add →', out);
};

getBtn.onclick = async () => {
  if (!tools) return log('Please boot first.');
  // Return type is properly typed as { id: number; name: string }
  const out = await tools.get_item({ item_id: 7 });
  log('get_item →', out);
};
