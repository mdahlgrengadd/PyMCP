/**
 * Transport abstraction for MCP protocol
 * Supports Web Worker, Service Worker HTTP, and stdio transports
 */

export type Json = any;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Json;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Json;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: Json;
  error?: {
    code: number;
    message: string;
    data?: Json;
  };
}

/**
 * Base transport interface for MCP communication
 */
export interface McpTransport {
  /**
   * Connect to the MCP server with given configuration
   */
  connect(config: any): Promise<void>;

  /**
   * Send a JSON-RPC request and wait for response
   */
  sendRequest(req: JsonRpcRequest): Promise<JsonRpcResponse>;

  /**
   * Send a JSON-RPC notification (no response expected)
   */
  sendNotification(notif: JsonRpcNotification): Promise<void>;

  /**
   * Close the transport connection
   */
  close?(): void;
}

/**
 * Web Worker transport - communicates via postMessage
 * This is the direct RPC approach using a dedicated worker
 */
export class WebWorkerTransport implements McpTransport {
  private pending = new Map<number | string, (v: JsonRpcResponse) => void>();
  private messageHandler?: (e: MessageEvent) => void;

  constructor(private worker: Worker) {
    // Set up message handler
    this.messageHandler = (e: MessageEvent) => {
      const msg = e.data;
      const id = msg?.id;

      if (id != null && this.pending.has(id)) {
        const resolve = this.pending.get(id)!;
        this.pending.delete(id);
        resolve(msg);
      }
    };

    this.worker.addEventListener('message', this.messageHandler);
  }

  async connect(indexURL: string): Promise<void> {
    const ready = new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'mcp.ready') {
          this.worker.removeEventListener('message', handler);
          resolve();
        }
      };
      this.worker.addEventListener('message', handler);
    });

    this.worker.postMessage({ type: 'init', indexURL });
    await ready;
  }

  async sendRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    return new Promise((resolve) => {
      this.pending.set(req.id, resolve);
      this.worker.postMessage(req);
    });
  }

  async sendNotification(notif: JsonRpcNotification): Promise<void> {
    this.worker.postMessage(notif);
  }

  close(): void {
    if (this.messageHandler) {
      this.worker.removeEventListener('message', this.messageHandler);
    }
    this.worker.terminate();
  }
}

/**
 * Service Worker HTTP transport - communicates via HTTP requests
 * This provides an HTTP-like interface while keeping everything client-side
 */
export class ServiceWorkerHTTPTransport implements McpTransport {
  private baseUrl = '/mcp';
  private registration?: ServiceWorkerRegistration;
  private protocolVersion = '2025-06-18';

  async connect(config: { indexURL: string; swPath?: string }): Promise<void> {
    // Register service worker
    const swPath = config.swPath || '/sw-mcp.js';

    if ('serviceWorker' in navigator) {
      this.registration = await navigator.serviceWorker.register(swPath);
      await navigator.serviceWorker.ready;

      // Initialize Pyodide via service worker
      const initReq: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 'init',
        method: 'sw/init',
        params: { indexURL: config.indexURL }
      };

      const res = await this.sendRequest(initReq);
      if (res.error) {
        throw new Error(`Service worker init failed: ${res.error.message}`);
      }
    } else {
      throw new Error('Service Worker not supported in this browser');
    }
  }

  async sendRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': this.protocolVersion
      },
      body: JSON.stringify(req)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async sendNotification(notif: JsonRpcNotification): Promise<void> {
    // For notifications, we don't wait for response
    fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': this.protocolVersion
      },
      body: JSON.stringify(notif)
    }).catch(err => {
      console.warn('Notification send failed:', err);
    });
  }

  close(): void {
    if (this.registration) {
      this.registration.unregister();
    }
  }
}

/**
 * Stdio transport for Node.js environments
 * Communicates over stdin/stdout with newline-delimited JSON
 */
export class StdioTransport implements McpTransport {
  private pending = new Map<number | string, (v: JsonRpcResponse) => void>();
  private process?: any;

  constructor(processOrCommand?: any) {
    this.process = processOrCommand;
  }

  async connect(config: { command?: string; args?: string[] }): Promise<void> {
    if (typeof window !== 'undefined') {
      throw new Error('StdioTransport only available in Node.js');
    }

    // This would be implemented for Node.js environments
    // For now, just a placeholder
    const { spawn } = await import('child_process');

    if (config.command) {
      this.process = spawn(config.command, config.args || []);

      // Set up stdout listener for responses
      this.process.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.id != null && this.pending.has(msg.id)) {
              const resolve = this.pending.get(msg.id)!;
              this.pending.delete(msg.id);
              resolve(msg);
            }
          } catch (e) {
            console.error('Failed to parse JSON-RPC message:', line);
          }
        }
      });
    }
  }

  async sendRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this.process?.stdin) {
      throw new Error('Process not connected');
    }

    return new Promise((resolve, reject) => {
      this.pending.set(req.id, resolve);

      const message = JSON.stringify(req) + '\n';
      this.process.stdin.write(message, (err: Error) => {
        if (err) {
          this.pending.delete(req.id);
          reject(err);
        }
      });
    });
  }

  async sendNotification(notif: JsonRpcNotification): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error('Process not connected');
    }

    const message = JSON.stringify(notif) + '\n';
    this.process.stdin.write(message);
  }

  close(): void {
    if (this.process) {
      this.process.kill();
    }
  }
}
