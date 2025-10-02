import Ajv from 'ajv';
export class PyodideMcpClient {
    constructor(worker) {
        this.nextId = 0;
        this.pending = new Map();
        this.ajv = new Ajv({ strict: false });
        this.tools = [];
        this.worker = worker;
        this.worker.onmessage = (e) => {
            const msg = e.data;
            const id = msg?.id;
            if (id != null && this.pending.has(id)) {
                const ok = this.pending.get(id);
                this.pending.delete(id);
                if (msg.error) {
                    ok(Promise.reject(msg.error));
                    return;
                }
                ok(msg.result);
            }
        };
    }
    async init(indexURL) {
        const ready = new Promise((resolve) => {
            const handler = (e) => {
                if (e.data?.type === 'mcp.ready') {
                    this.worker.removeEventListener('message', handler);
                    resolve();
                }
            };
            this.worker.addEventListener('message', handler);
        });
        this.worker.postMessage({ type: 'init', indexURL });
        await ready;
        this.tools = await this.call('tools/list');
        return this;
    }
    call(method, params) {
        const id = ++this.nextId;
        const req = { jsonrpc: '2.0', id, method, params };
        return new Promise((resolve) => {
            this.pending.set(id, resolve);
            this.worker.postMessage(req);
        });
    }
    async listTools() {
        return this.tools.length ? this.tools : (this.tools = await this.call('tools/list'));
    }
    async createProxy() {
        const tools = await this.listTools();
        const proxy = {};
        for (const t of tools) {
            const validateIn = t.inputSchema ? this.ajv.compile(t.inputSchema) : null;
            const validateOut = t.outputSchema ? this.ajv.compile(t.outputSchema) : null;
            proxy[t.name] = async (args = {}) => {
                if (validateIn && !validateIn(args)) {
                    throw new Error(`Invalid args for ${t.name}: ${JSON.stringify(validateIn.errors)}`);
                }
                const res = await this.call('tools/call', { name: t.name, args });
                if (validateOut && !validateOut(res)) {
                    throw new Error(`Invalid result for ${t.name}: ${JSON.stringify(validateOut.errors)}`);
                }
                return res;
            };
        }
        return proxy;
    }
}
//# sourceMappingURL=mcp-pyodide-client.js.map