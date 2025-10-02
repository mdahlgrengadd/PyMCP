import Ajv from "ajv";
import type { McpTransport, JsonRpcRequest, JsonRpcNotification } from "./mcp-transport";

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
  private transport: McpTransport;
  private nextId = 0;
  private tools: ToolDesc[] = [];
  private initialized = false;
  private protocolVersion = "2025-06-18";

  constructor(transport: McpTransport) {
    this.transport = transport;
  }

  async init(config: any) {
    // Connect transport (this handles Pyodide loading for Web Worker)
    await this.transport.connect(config);

    // MCP LIFECYCLE HANDSHAKE
    console.log("Starting MCP initialization handshake...");

    const initResult = await this.call("initialize", {
      protocolVersion: this.protocolVersion,
      capabilities: {
        tools: {},
        experimental: { validation: true },
      },
      clientInfo: {
        name: "PyodideMCP",
        version: "0.1.0",
      },
    });

    console.log("MCP initialize result:", initResult);

    // Send initialized notification
    await this.notify("notifications/initialized");
    this.initialized = true;

    console.log("MCP handshake complete");

    // Fetch tools list
    this.tools = await this.call("tools/list");
    return this;
  }

  private async call(method: string, params?: Json): Promise<any> {
    const id = ++this.nextId;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    const res = await this.transport.sendRequest(req);

    if (res.error) {
      throw new Error(res.error.message);
    }

    return res.result;
  }

  private async notify(method: string, params?: Json): Promise<void> {
    const notif: JsonRpcNotification = { jsonrpc: "2.0", method, params };
    await this.transport.sendNotification(notif);
  }

  async listTools() {
    if (this.tools.length) return this.tools;
    const result = await this.call("tools/list");
    this.tools = result.tools;
    return this.tools;
  }

  async listResources(): Promise<any[]> {
    const result = await this.call("resources/list");
    return result.resources;
  }

  async readResource(uri: string): Promise<any> {
    const result = await this.call("resources/read", { uri });
    // result.contents[0] contains {uri, mimeType, text}
    return result;
  }

  async listPrompts(): Promise<any[]> {
    const result = await this.call("prompts/list");
    return result.prompts;
  }

  async getPrompt(name: string, args?: any): Promise<any> {
    return this.call("prompts/get", { name, arguments: args || {} });
  }

  private unwrapContent(mcpResult: any): any {
    // MCP format: { content: [{ type: "text", text: "..." }], isError?: bool }
    if (mcpResult?.isError) {
      throw new Error(mcpResult.content[0]?.text || "Tool error");
    }

    if (mcpResult?.content?.[0]?.type === "text") {
      const text = mcpResult.content[0].text;
      try {
        // Try parsing as JSON (for structured returns)
        return JSON.parse(text);
      } catch {
        // Return raw text
        return text;
      }
    }

    return mcpResult; // Fallback for non-MCP format
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
        const mcpRes = await this.call("tools/call", { name: t.name, arguments: args });

        // Unwrap MCP content format transparently
        const res = this.unwrapContent(mcpRes);

        // Note: Output validation is skipped because MCP content wrapping
        // transforms the response format. The Python server already validates
        // using Pydantic before wrapping in MCP format.

        return res;
      };
    }
    return proxy;
  }
}
