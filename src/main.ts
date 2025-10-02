import { PyodideMcpClient } from "./lib/mcp-pyodide-client";
import { WebWorkerTransport, ServiceWorkerHTTPTransport } from "./lib/mcp-transport";
import { generateClientFromServer, printMethods } from "./lib/runtime-class-generator";

import type { McpTools } from "./types/mcp-tools.gen";

const logEl = document.getElementById("log") as HTMLPreElement;
const idxEl = document.getElementById("idx") as HTMLInputElement;
const bootBtn = document.getElementById("boot") as HTMLButtonElement;

// Detect if running in Electron
const isElectron = !!(window as any).electronAPI;

// Tools
const listBtn = document.getElementById("list") as HTMLButtonElement;
const echoBtn = document.getElementById("echo") as HTMLButtonElement;
const addBtn = document.getElementById("add") as HTMLButtonElement;
const getBtn = document.getElementById("get") as HTMLButtonElement;

// Resources
const listResourcesBtn = document.getElementById("list-resources") as HTMLButtonElement;
const readHelpBtn = document.getElementById("read-help") as HTMLButtonElement;
const readStatsBtn = document.getElementById("read-stats") as HTMLButtonElement;
const readDocBtn = document.getElementById("read-doc") as HTMLButtonElement;

// Prompts
const listPromptsBtn = document.getElementById("list-prompts") as HTMLButtonElement;
const getSummarizeBtn = document.getElementById("get-summarize") as HTMLButtonElement;
const getReviewBtn = document.getElementById("get-review") as HTMLButtonElement;

let client: PyodideMcpClient | null = null;
let tools: McpTools | null = null;
let myService: any = null;  // Runtime-generated class instance

// Expose to window for console debugging
if (import.meta.env.DEV) {
  (window as any).mcp = {
    get client() {
      return client;
    },
    get tools() {
      return tools;
    },
    get myService() {
      return myService;
    },
    printMethods() {
      if (myService) {
        printMethods(myService);
      } else {
        console.log('No service instance. Boot first!');
      }
    }
  };
}

function log(...args: any[]) {
  logEl.textContent +=
    args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a, null, 2)))
      .join(" ") + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

bootBtn.onclick = async () => {
  try {
    // Read transport selection
    const transportType = (
      document.querySelector('input[name="transport"]:checked') as HTMLInputElement
    )?.value || "worker";

    log(`Booting with ${transportType} transport...`);

    let transport;

    switch (transportType) {
      case "worker": {
        const worker = new Worker(
          new URL("./workers/py.worker.ts", import.meta.url),
          { type: "module" }
        );

        worker.addEventListener("message", (e) => {
          if (e.data?.type === "error") {
            log("Worker error:", e.data.error);
          }
        });

        transport = new WebWorkerTransport(worker);
        break;
      }

      case "service-worker":
        transport = new ServiceWorkerHTTPTransport();
        break;

      default:
        throw new Error(`Unknown transport: ${transportType}`);
    }

    // Same client interface regardless of transport
    client = new PyodideMcpClient(transport);
    await client.init(idxEl.value);

    // Generate both interfaces for comparison
    tools = (await client.createProxy()) as unknown as McpTools;
    
    // 🚀 NEW: Runtime-generated class from Python introspection
    log(`🔍 Generating client class from Python server...`);
    myService = await generateClientFromServer(client);
    
    log(`✅ Pyodide ready via ${transportType} transport. MCP handshake complete.`);
    log(`✨ Runtime class generated: ${myService.toString()}`);
    log(`💡 Try: window.mcp.printMethods() in console to see available methods`);
  } catch (e: any) {
    log("Boot error:", e?.message || e);
    console.error(e);
  }
};

listBtn.onclick = async () => {
  if (!client) return log("Please boot first.");
  const t = await client.listTools();
  log("tools/list →", t);
};

echoBtn.onclick = async () => {
  if (!myService) return log("Please boot first.");
  // 🚀 NEW: Use runtime-generated class (Python-like interface!)
  const out = await myService.echo("hello", true);
  log("echo (runtime-generated) →", out);
  
  // OLD: Proxy-based approach still works
  if (tools) {
    const out2 = await tools.echo({ message: "hello", upper: true });
    log("echo (proxy) →", out2);
  }
};

addBtn.onclick = async () => {
  if (!myService) return log("Please boot first.");
  // 🚀 NEW: Positional args like Python!
  const out = await myService.add(1.5, 2.25);
  log("add (runtime-generated) →", out);
  
  // OLD: Object-based args
  if (tools) {
    const out2 = await tools.add({ a: 1.5, b: 2.25 });
    log("add (proxy) →", out2);
  }
};

getBtn.onclick = async () => {
  if (!myService) return log("Please boot first.");
  // 🚀 NEW: Clean interface
  const out = await myService.get_item(7);
  log("get_item (runtime-generated) →", out);
  
  // OLD: Verbose interface
  if (tools) {
    const out2 = await tools.get_item({ item_id: 7 });
    log("get_item (proxy) →", out2);
  }
};

// ============ RESOURCES ============

listResourcesBtn.onclick = async () => {
  if (!client) return log("Please boot first.");
  try {
    const resources = await client.listResources();
    log("resources/list →", resources);
  } catch (e: any) {
    log("Error:", e?.message || e);
  }
};

readHelpBtn.onclick = async () => {
  if (!myService) return log("Please boot first.");
  try {
    // 🚀 NEW: Call resource method directly
    const result = await myService.resource_help();
    log("resource_help (runtime-generated) →", result);
    
    // OLD: Manual URI construction
    if (client) {
      const result2 = await client.readResource("res://help");
      log("readResource('res://help') →", result2);
    }
  } catch (e: any) {
    log("Error:", e?.message || e);
  }
};

readStatsBtn.onclick = async () => {
  if (!myService) return log("Please boot first.");
  try {
    // 🚀 NEW: Method call returns parsed JSON
    const result = await myService.resource_stats();
    log("resource_stats (runtime-generated) →", result);
    
    // OLD: Manual URI
    if (client) {
      const result2 = await client.readResource("res://stats");
      log("readResource('res://stats') →", result2);
    }
  } catch (e: any) {
    log("Error:", e?.message || e);
  }
};

readDocBtn.onclick = async () => {
  if (!myService) return log("Please boot first.");
  try {
    // 🚀 NEW: Pass parameter directly
    const result = await myService.resource_doc("doc1");
    log("resource_doc('doc1') (runtime-generated) →", result);
    
    // OLD: Manual URI construction
    if (client) {
      const result2 = await client.readResource("res://doc/doc1");
      log("readResource('res://doc/doc1') →", result2);
    }
  } catch (e: any) {
    log("Error:", e?.message || e);
  }
};

// ============ PROMPTS ============

listPromptsBtn.onclick = async () => {
  if (!client) return log("Please boot first.");
  try {
    const prompts = await client.listPrompts();
    log("prompts/list →", prompts);
  } catch (e: any) {
    log("Error:", e?.message || e);
  }
};

getSummarizeBtn.onclick = async () => {
  if (!myService) return log("Please boot first.");
  try {
    // 🚀 NEW: Positional args like Python
    const result = await myService.prompt_summarize("doc1", 30);
    log("prompt_summarize('doc1', 30) (runtime-generated) →", result);
    
    // OLD: Manual getPrompt call
    if (client) {
      const result2 = await client.getPrompt("summarize", { doc_id: "doc1", max_words: 30 });
      log("getPrompt('summarize', ...) →", result2);
    }
  } catch (e: any) {
    log("Error:", e?.message || e);
  }
};

getReviewBtn.onclick = async () => {
  if (!myService) return log("Please boot first.");
  try {
    // 🚀 NEW: Clean method calls
    const result = await myService.prompt_code_review("python", "medium");
    log("prompt_code_review('python', 'medium') (runtime-generated) →", result);
    
    // OLD: Manual getPrompt
    if (client) {
      const result2 = await client.getPrompt("code_review", { language: "python", complexity: "medium" });
      log("getPrompt('code_review', ...) →", result2);
    }
  } catch (e: any) {
    log("Error:", e?.message || e);
  }
};

// ============ ELECTRON INTEGRATION ============

/**
 * Auto-boot in Electron mode and set up IPC request handler
 */
if (isElectron) {
  log("🔌 Running in Electron mode");

  // Auto-boot with Web Worker transport (Service Worker doesn't work in Electron file:// protocol)
  (async () => {
    try {
      log("Booting MCP server with Web Worker transport...");

      const worker = new Worker(
        new URL("./workers/py.worker.ts", import.meta.url),
        { type: "module" }
      );

      const transport = new WebWorkerTransport(worker);
      client = new PyodideMcpClient(transport);
      await client.init(idxEl.value);

      tools = (await client.createProxy()) as unknown as McpTools;
      log("✅ MCP server ready in Electron");

      // Notify main process that we're ready
      (window as any).electronAPI.sendMcpReady();

      // Set up IPC handler for incoming HTTP requests from main process
      (window as any).electronAPI.onMcpRequest(async ({ requestId, jsonRpcRequest }: any) => {
        try {
          log(`📨 HTTP request: ${jsonRpcRequest.method}`);

          // Forward request to our MCP client transport
          const response = await client!.transport.sendRequest(jsonRpcRequest);

          log(`📤 HTTP response: ${jsonRpcRequest.method}`);

          // Send response back to main process
          (window as any).electronAPI.sendMcpResponse(requestId, response);
        } catch (error: any) {
          log(`❌ Error handling request: ${error?.message || error}`);
          (window as any).electronAPI.sendMcpError(requestId, error?.message || 'Unknown error');
        }
      });

    } catch (e: any) {
      log("❌ Boot error:", e?.message || e);
      console.error(e);
    }
  })();
}
