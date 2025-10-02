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
 * 
 * When useIframe is true, registers SW in a hidden iframe to avoid page reloads
 */
export class ServiceWorkerHTTPTransport implements McpTransport {
  private useIframe: boolean;
  private baseUrl = '/mcp';
  private registration?: ServiceWorkerRegistration;
  private protocolVersion = '2025-06-18';
  private iframe?: HTMLIFrameElement;
  public isIframeInitialized: boolean = false; // Track if iframe already did handshake

  constructor(options?: { useIframe?: boolean }) {
    this.useIframe = options?.useIframe ?? true; // Default to iframe mode
  }

  async connect(config: string | { indexURL: string; swPath?: string; serverUrl?: string }): Promise<void> {
    // Normalize config to object
    const normalizedConfig = typeof config === 'string' 
      ? { indexURL: config }
      : config;

    if (this.useIframe) {
      // Use iframe mode - no page reload needed
      return this.connectViaIframe(normalizedConfig);
    }

    // Direct SW registration (original behavior)
    const swPath = normalizedConfig.swPath || '/sw-mcp.js';

    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker not supported in this browser');
    }

    console.log('Registering Service Worker:', swPath);

    // Check if SW is already controlling before registration
    const hadController = !!navigator.serviceWorker.controller;

    // Register service worker (module type for static ESM imports)
    this.registration = await navigator.serviceWorker.register(swPath, {
      scope: '/',
      type: 'module'
    });

    console.log('Service Worker registered');

    // If this is the first registration (no controller), we need to reload
    // because Service Workers can't intercept the page that registered them
    if (!hadController && !navigator.serviceWorker.controller) {
      throw new Error(
        '⚠️ Service Worker registered for the first time.\n\n' +
        'Please reload the page (F5 or Ctrl+R) for the Service Worker to take control.\n\n' +
        'This is only needed once. Subsequent loads will work without reloading.'
      );
    }

    console.log('✅ Service Worker controlling page');

    // Wait for service worker to be ready
    await navigator.serviceWorker.ready;

    console.log('Service Worker ready');

    // Give SW a moment to fully activate
    await new Promise(resolve => setTimeout(resolve, 200));

    // Initialize Pyodide inside the Service Worker
    console.log('Initializing Pyodide in Service Worker...');

    const initReq: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 'init',
      method: 'sw/init',
      params: { indexURL: normalizedConfig.indexURL }
    };

    const res = await this.sendRequest(initReq);

    if (res.error) {
      throw new Error(`Service worker init failed: ${res.error.message}`);
    }

    console.log('Pyodide initialized in Service Worker');
  }

  async sendRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    // If using iframe mode, forward request to iframe instead of direct fetch
    if (this.isIframeInitialized && this.iframe) {
      return this.sendRequestViaIframe(req);
    }

    // Direct fetch to Service Worker (original behavior)
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

  /**
   * Forward MCP request to iframe, which will handle it via its Service Worker
   */
  private async sendRequestViaIframe(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      const requestId = `mcp-req-${Date.now()}-${Math.random()}`;
      
      const messageHandler = (event: MessageEvent) => {
        const { type, data } = event.data;
        
        if (type === 'mcp-response' && data.requestId === requestId) {
          window.removeEventListener('message', messageHandler);
          
          if (data.error) {
            reject(new Error(data.error));
          } else {
            resolve(data.response);
          }
        }
      };
      
      window.addEventListener('message', messageHandler);
      
      // Set timeout
      setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        reject(new Error('MCP request timeout'));
      }, 30000);
      
      // Send request to iframe
      this.iframe!.contentWindow!.postMessage({
        type: 'mcp-request',
        data: { requestId, request: req }
      }, '*');
    });
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

  /**
   * Connect via iframe - SW registers in iframe context, avoiding page reload
   */
  private async connectViaIframe(config: { indexURL: string; serverUrl?: string }): Promise<void> {
    console.log('🖼️ Initializing MCP Server in iframe...');

    // Create or reuse iframe
    this.iframe = document.getElementById('mcp-server-frame') as HTMLIFrameElement;
    if (!this.iframe) {
      this.iframe = document.createElement('iframe');
      this.iframe.id = 'mcp-server-frame';
      this.iframe.src = '/mcp-server-frame.html';
      this.iframe.style.cssText = 'position: fixed; bottom: 0; right: 0; width: 300px; height: 40px; border: 1px solid #ddd; z-index: 9999;';
      document.body.appendChild(this.iframe);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('iframe MCP server initialization timeout'));
      }, 60000); // 60s timeout

      const messageHandler = (event: MessageEvent) => {
        const { type, data } = event.data;

        if (type === 'mcp-frame-loaded') {
          // Frame loaded, send init command
          console.log('📬 Sending init command to iframe...');
          this.iframe!.contentWindow!.postMessage({
            type: 'init-mcp-server',
            data: {
              indexURL: config.indexURL,
              serverUrl: config.serverUrl
            }
          }, '*');
        } else if (type === 'mcp-server-ready') {
          clearTimeout(timeout);
          window.removeEventListener('message', messageHandler);
          console.log('✅ MCP Server ready in iframe');
          this.isIframeInitialized = true; // Mark that handshake is complete
          resolve();
        } else if (type === 'mcp-server-error') {
          clearTimeout(timeout);
          window.removeEventListener('message', messageHandler);
          reject(new Error(`MCP Server error: ${data.error}`));
        }
      };

      window.addEventListener('message', messageHandler);
    });
  }

  close(): void {
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = undefined;
    }
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
