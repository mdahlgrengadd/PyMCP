import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false, coerceTypes: true });

type Json = any;
type ToolDesc = {
  name: string;
  description?: string;
  inputSchema?: object;
  outputSchema?: object;
  version: number;
};

export class PyodideMcpClient {
  private worker: Worker;
  private nextId = 0;
  private pending = new Map<number | string, (v: any) => void>();
  private tools: ToolDesc[] = [];

  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (e) => {
      const msg = e.data;
      const id = msg?.id;
      if (id != null && this.pending.has(id)) {
        const ok = this.pending.get(id)!;
        this.pending.delete(id);
        if (msg.error) {
          ok(Promise.reject(msg.error));
          return;
        }
        ok(msg.result);
      }
    };
  }

  async init(indexURL: string) {
    const ready = new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === "mcp.ready") {
          this.worker.removeEventListener("message", handler as any);
          resolve();
        }
      };
      this.worker.addEventListener("message", handler as any);
    });
    this.worker.postMessage({ type: "init", indexURL });
    await ready;
    this.tools = await this.call("tools/list");
    return this;
  }

  call(method: string, params?: Json): Promise<any> {
    const id = ++this.nextId;
    const req = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage(req);
    });
  }

  async listTools() {
    return this.tools.length
      ? this.tools
      : (this.tools = await this.call("tools/list"));
  }

  async createProxy(): Promise<Record<string, (args?: any) => Promise<any>>> {
    const tools = await this.listTools();
    const proxy: Record<string, any> = {};
    for (const t of tools) {
      const validateIn = t.inputSchema
        ? ajv.compile(t.inputSchema as any)
        : null;
      const validateOut = t.outputSchema
        ? ajv.compile(t.outputSchema as any)
        : null;
      proxy[t.name] = async (args: any = {}) => {
        if (validateIn && !validateIn(args)) {
          throw new Error(
            `Invalid args for ${t.name}: ${JSON.stringify(validateIn.errors)}`
          );
        }
        const res = await this.call("tools/call", { name: t.name, args });
        if (validateOut && !validateOut(res)) {
          throw new Error(
            `Invalid result for ${t.name}: ${JSON.stringify(
              validateOut.errors
            )}`
          );
        }
        return res;
      };
    }
    return proxy;
  }
}
