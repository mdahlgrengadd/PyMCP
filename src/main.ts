import { PyodideMcpClient } from './lib/mcp-pyodide-client';
import type { McpTools } from './types/mcp-tools.gen';

const logEl = document.getElementById('log') as HTMLPreElement;
const idxEl = document.getElementById('idx') as HTMLInputElement;
const serverSelectEl = document.getElementById('serverSelect') as HTMLSelectElement;
const serverUrlEl = document.getElementById('serverUrl') as HTMLInputElement;
const bootBtn = document.getElementById('boot') as HTMLButtonElement;
const listBtn = document.getElementById('list') as HTMLButtonElement;
const listResourcesBtn = document.getElementById('listResources') as HTMLButtonElement;
const listPromptsBtn = document.getElementById('listPrompts') as HTMLButtonElement;
const echoBtn = document.getElementById('echo') as HTMLButtonElement;
const addBtn  = document.getElementById('add')  as HTMLButtonElement;
const getBtn  = document.getElementById('get')  as HTMLButtonElement;

let client: PyodideMcpClient | null = null;
let tools: McpTools | null = null;

function log(...args: any[]) {
  logEl.textContent += args.map(a => typeof a === 'string' ? a : JSON.stringify(a, null, 2)).join(' ') + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

// Handle server selection changes
serverSelectEl.onchange = () => {
  const isCustomUrl = serverSelectEl.value === 'url';
  serverUrlEl.style.display = isCustomUrl ? 'inline-block' : 'none';
  
  if (serverSelectEl.value === 'example') {
    // Set the example server URL
    serverUrlEl.value = '/example_remote_server.py';
    serverUrlEl.style.display = 'none'; // Hide URL input for preset
  } else if (!isCustomUrl) {
    serverUrlEl.value = '';
  }
};

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
    
    const serverType: 'embedded' | 'url' = serverSelectEl.value === 'embedded' ? 'embedded' : 'url';
    let serverUrl = '';
    
    if (serverSelectEl.value === 'example') {
      serverUrl = '/example_remote_server.py';
      log('Loading example remote server...');
    } else if (serverSelectEl.value === 'url') {
      serverUrl = serverUrlEl.value.trim();
    }
    
    const serverConfig = serverType === 'url' ? {
      serverType,
      serverUrl
    } : { serverType };
    
    if (serverType === 'url' && !serverUrl) {
      log('❌ Please enter a server URL');
      return;
    }
    
    client = await new PyodideMcpClient(worker).init(idxEl.value, serverConfig);
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

listResourcesBtn.onclick = async () => {
  if (!client) return log('Please boot first.');
  try {
    const resources = await client.call('resources/list');
    log('resources/list →', resources);
  } catch (e: any) {
    log('Resources error:', e?.message || e);
  }
};

listPromptsBtn.onclick = async () => {
  if (!client) return log('Please boot first.');
  try {
    const prompts = await client.call('prompts/list');
    log('prompts/list →', prompts);
  } catch (e: any) {
    log('Prompts error:', e?.message || e);
  }
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
