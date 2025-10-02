import { PyodideMcpClient } from "./lib/mcp-pyodide-client";
import { WebWorkerTransport, ServiceWorkerHTTPTransport } from "./lib/mcp-transport";

import type { McpTools } from "./types/mcp-tools.gen";

const logEl = document.getElementById("log") as HTMLPreElement;
const idxEl = document.getElementById("idx") as HTMLInputElement;
const bootBtn = document.getElementById("boot") as HTMLButtonElement;

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

// Expose to window for console debugging
if (import.meta.env.DEV) {
  (window as any).mcp = {
    get client() {
      return client;
    },
    get tools() {
      return tools;
    },
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

    tools = (await client.createProxy()) as unknown as McpTools;
    log(`✅ Pyodide ready via ${transportType} transport. MCP handshake complete.`);
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
  if (!tools) return log("Please boot first.");
  // Now we have full type safety!
  const out = await tools.echo({ message: "hello", upper: true });
  log("echo →", out);
};

addBtn.onclick = async () => {
  if (!tools) return log("Please boot first.");
  // TypeScript knows the parameter types
  const out = await tools.add({ a: 1.5, b: 2.25 });
  log("add →", out);
};

getBtn.onclick = async () => {
  if (!tools) return log("Please boot first.");
  // Return type is properly typed as { id: number; name: string }
  const out = await tools.get_item({ item_id: 7 });
  log("get_item →", out);
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
  if (!client) return log("Please boot first.");
  try {
    const result = await client.readResource("res://help");
    log("read res://help →", result);
  } catch (e: any) {
    log("Error:", e?.message || e);
  }
};

readStatsBtn.onclick = async () => {
  if (!client) return log("Please boot first.");
  try {
    const result = await client.readResource("res://stats");
    log("read res://stats →", result);
  } catch (e: any) {
    log("Error:", e?.message || e);
  }
};

readDocBtn.onclick = async () => {
  if (!client) return log("Please boot first.");
  try {
    const result = await client.readResource("res://doc/doc1");
    log("read res://doc/doc1 →", result);
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
  if (!client) return log("Please boot first.");
  try {
    const result = await client.getPrompt("summarize", { doc_id: "doc1", max_words: 30 });
    log("get summarize →", result);
  } catch (e: any) {
    log("Error:", e?.message || e);
  }
};

getReviewBtn.onclick = async () => {
  if (!client) return log("Please boot first.");
  try {
    const result = await client.getPrompt("code_review", { language: "python", complexity: "medium" });
    log("get code_review →", result);
  } catch (e: any) {
    log("Error:", e?.message || e);
  }
};
