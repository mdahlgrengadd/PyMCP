# WebLLM-MLC Chat Agent Refactoring Plan

## Executive Summary

Transform the current PyMCP template into a **modern, browser-based chat agent** powered by **WebLLM-MLC** with **native MCP (Model Context Protocol) support**. The agent will run entirely locally in the browser, leveraging WebGPU for inference and maintaining the existing Python-based MCP server infrastructure.

---

## Current Architecture Analysis

### Strengths to Preserve
✅ **MCP Server Framework**: Robust Python-based MCP implementation with tools, resources, and prompts  
✅ **Pyodide Integration**: Solid worker-based Python runtime  
✅ **Type Safety**: Pydantic → JSON Schema → TypeScript type generation  
✅ **Dynamic Server Loading**: Can load MCP servers from URLs  
✅ **JSON-RPC Communication**: Clean, standardized protocol  

### Limitations to Address
❌ No LLM inference capability  
❌ No chat interface or conversation management  
❌ No function calling / tool use integration  
❌ Basic UI not suitable for chat experience  

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser Window                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Modern Chat UI Component               │   │
│  │  • Message list with streaming                      │   │
│  │  • Input area with multiline support               │   │
│  │  • Model selector & settings                        │   │
│  │  • Tool execution indicators                        │   │
│  │  • System status (model loaded, tools available)   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ↕                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         Chat Orchestrator (main thread)             │   │
│  │  • Conversation state management                    │   │
│  │  • WebLLM-MLC client wrapper                       │   │
│  │  • MCP tool call detection & execution             │   │
│  │  • Streaming response handling                      │   │
│  │  • Function call result injection                   │   │
│  └─────────────────────────────────────────────────────┘   │
│           ↕                                    ↕            │
│  ┌──────────────────────┐         ┌──────────────────────┐ │
│  │  WebLLM Worker       │         │  Pyodide Worker      │ │
│  │  • Model loading     │         │  • MCP Server        │ │
│  │  • Inference engine  │         │  • Python tools      │ │
│  │  • WebGPU compute    │         │  • Resources/Prompts │ │
│  └──────────────────────┘         └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Dependencies & Setup

### 1.1 Add WebLLM-MLC Dependencies

```bash
pnpm add @mlc-ai/web-llm
```

**Additional packages needed:**
```bash
pnpm add marked          # Markdown rendering for messages
pnpm add highlight.js    # Code syntax highlighting
pnpm add dompurify       # XSS protection for rendered HTML
```

### 1.2 Update TypeScript Configuration

Ensure `tsconfig.json` includes:
- `"target": "ES2022"` (for top-level await)
- `"lib": ["ES2022", "DOM", "WebWorker", "WebGPU"]`
- `"moduleResolution": "bundler"`

### 1.3 Update Vite Configuration

Add optimizations for WebLLM:
```typescript
// vite.config.ts additions
export default defineConfig({
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm']
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  }
})
```

---

## Phase 2: WebLLM Integration Layer

### 2.1 Create WebLLM Client Wrapper

**File**: `src/lib/webllm-client.ts`

```typescript
import * as webllm from '@mlc-ai/web-llm';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export class WebLLMClient {
  private engine: webllm.MLCEngine | null = null;
  private modelId: string = '';
  
  async init(
    modelId: string = 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
    onProgress?: (report: webllm.InitProgressReport) => void
  ): Promise<void> {
    this.modelId = modelId;
    this.engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: onProgress
    });
  }
  
  async chat(
    messages: ChatMessage[],
    tools?: any[],
    onStream?: (delta: string, snapshot: string) => void
  ): Promise<ChatMessage> {
    if (!this.engine) throw new Error('Engine not initialized');
    
    const request: webllm.ChatCompletionRequest = {
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 2048,
      stream: !!onStream
    };
    
    if (tools && tools.length > 0) {
      request.tools = tools;
      request.tool_choice = 'auto';
    }
    
    if (onStream) {
      const chunks = await this.engine.chat.completions.create(request);
      let fullContent = '';
      
      for await (const chunk of chunks) {
        const delta = chunk.choices[0]?.delta?.content || '';
        fullContent += delta;
        onStream(delta, fullContent);
      }
      
      return {
        role: 'assistant',
        content: fullContent
      };
    } else {
      const response = await this.engine.chat.completions.create(request);
      const choice = response.choices[0];
      
      return {
        role: 'assistant',
        content: choice.message.content || '',
        tool_calls: choice.message.tool_calls as any
      };
    }
  }
  
  async interrupt(): Promise<void> {
    if (this.engine) {
      await this.engine.interruptGenerate();
    }
  }
  
  async reset(): Promise<void> {
    if (this.engine) {
      await this.engine.resetChat();
    }
  }
  
  getModelId(): string {
    return this.modelId;
  }
  
  getRuntimeStats(): webllm.RuntimeStats | null {
    return this.engine ? this.engine.runtimeStatsText() as any : null;
  }
}
```

### 2.2 Create MCP-WebLLM Bridge

**File**: `src/lib/mcp-webllm-bridge.ts`

```typescript
import { PyodideMcpClient } from './mcp-pyodide-client';
import { WebLLMClient, ChatMessage, ToolCall } from './webllm-client';

export interface ConversationState {
  messages: ChatMessage[];
  toolExecutions: ToolExecution[];
}

export interface ToolExecution {
  id: string;
  name: string;
  arguments: any;
  result: any;
  timestamp: number;
  error?: string;
}

export class McpWebLLMBridge {
  constructor(
    private llmClient: WebLLMClient,
    private mcpClient: PyodideMcpClient
  ) {}
  
  /**
   * Convert MCP tools to OpenAI function calling format
   */
  async getMcpToolsForLLM(): Promise<any[]> {
    const mcpTools = await this.mcpClient.listTools();
    
    return mcpTools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || `Call the ${tool.name} tool`,
        parameters: tool.inputSchema || { type: 'object', properties: {} }
      }
    }));
  }
  
  /**
   * Execute a tool call via MCP
   */
  async executeToolCall(toolCall: ToolCall): Promise<any> {
    const { name, arguments: argsJson } = toolCall.function;
    const args = JSON.parse(argsJson);
    
    return await this.mcpClient.call('tools/call', {
      name,
      args
    });
  }
  
  /**
   * Main chat loop with automatic tool calling
   */
  async chatWithTools(
    userMessage: string,
    conversationHistory: ChatMessage[],
    systemPrompt?: string,
    onStream?: (delta: string, snapshot: string) => void,
    onToolExecution?: (execution: ToolExecution) => void
  ): Promise<ConversationState> {
    const messages: ChatMessage[] = [...conversationHistory];
    
    // Add system prompt if provided
    if (systemPrompt && messages[0]?.role !== 'system') {
      messages.unshift({ role: 'system', content: systemPrompt });
    }
    
    // Add user message
    messages.push({ role: 'user', content: userMessage });
    
    const tools = await this.getMcpToolsForLLM();
    const toolExecutions: ToolExecution[] = [];
    
    // Multi-turn tool calling loop
    let maxIterations = 10;
    while (maxIterations-- > 0) {
      const response = await this.llmClient.chat(
        messages,
        tools,
        onStream
      );
      
      messages.push(response);
      
      // Check if model wants to call tools
      if (!response.tool_calls || response.tool_calls.length === 0) {
        // No more tool calls, conversation complete
        break;
      }
      
      // Execute all requested tool calls
      for (const toolCall of response.tool_calls) {
        const execution: ToolExecution = {
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments),
          result: null,
          timestamp: Date.now()
        };
        
        try {
          execution.result = await this.executeToolCall(toolCall);
          
          // Add tool result to conversation
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify(execution.result)
          });
        } catch (error: any) {
          execution.error = error.message;
          
          // Add error to conversation
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify({ error: error.message })
          });
        }
        
        toolExecutions.push(execution);
        onToolExecution?.(execution);
      }
      
      // Continue loop to let model process tool results
    }
    
    return {
      messages,
      toolExecutions
    };
  }
}
```

---

## Phase 3: Modern Chat UI

### 3.1 Create Chat UI HTML Structure

**Update**: `index.html`

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WebLLM Chat Agent with MCP</title>
    <link rel="stylesheet" href="/src/styles/chat.css">
  </head>
  <body>
    <div id="app">
      <!-- Header -->
      <header class="app-header">
        <div class="header-content">
          <h1>🤖 WebLLM Chat Agent</h1>
          <div class="header-status">
            <span id="model-status" class="status-badge">Not loaded</span>
            <span id="tools-status" class="status-badge">0 tools</span>
          </div>
        </div>
      </header>

      <!-- Main Content -->
      <div class="app-container">
        <!-- Sidebar -->
        <aside class="sidebar">
          <div class="sidebar-section">
            <h3>🤖 Model</h3>
            <select id="model-select" class="model-select">
              <option value="Llama-3.2-3B-Instruct-q4f32_1-MLC">Llama 3.2 3B (Fast)</option>
              <option value="Llama-3.1-8B-Instruct-q4f32_1-MLC">Llama 3.1 8B (Better)</option>
              <option value="Phi-3.5-mini-instruct-q4f16_1-MLC">Phi 3.5 Mini</option>
              <option value="Qwen2.5-7B-Instruct-q4f32_1-MLC">Qwen 2.5 7B</option>
            </select>
            <button id="load-model-btn" class="primary-btn">Load Model</button>
            <div id="model-progress" class="progress-container" style="display: none;">
              <div class="progress-bar">
                <div id="progress-fill" class="progress-fill"></div>
              </div>
              <p id="progress-text" class="progress-text">Loading...</p>
            </div>
          </div>

          <div class="sidebar-section">
            <h3>🔧 MCP Server</h3>
            <select id="server-select">
              <option value="embedded">Embedded</option>
              <option value="example">Example Server</option>
              <option value="clean">Clean API</option>
              <option value="url">Custom URL</option>
            </select>
            <input id="server-url" type="text" placeholder="https://..." style="display: none;" />
            <input id="pyodide-url" type="text" 
                   value="https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" 
                   placeholder="Pyodide CDN URL" />
            <button id="boot-mcp-btn" class="primary-btn">Boot MCP Server</button>
          </div>

          <div class="sidebar-section">
            <h3>📚 Available Tools</h3>
            <div id="tools-list" class="tools-list">
              <p class="muted">No tools loaded</p>
            </div>
            <button id="refresh-tools-btn" class="secondary-btn">Refresh</button>
          </div>

          <div class="sidebar-section">
            <h3>⚙️ Settings</h3>
            <label>
              <input type="checkbox" id="auto-scroll" checked />
              Auto-scroll
            </label>
            <label>
              <input type="checkbox" id="stream-response" checked />
              Stream responses
            </label>
            <button id="clear-chat-btn" class="danger-btn">Clear Chat</button>
          </div>
        </aside>

        <!-- Chat Area -->
        <main class="chat-main">
          <div id="chat-messages" class="chat-messages">
            <!-- Messages will be inserted here -->
            <div class="welcome-message">
              <h2>👋 Welcome to WebLLM Chat Agent</h2>
              <p>This is a fully local, browser-based chat agent with MCP tool support.</p>
              <ol>
                <li>Select and load a model</li>
                <li>Boot the MCP server (for tools)</li>
                <li>Start chatting!</li>
              </ol>
            </div>
          </div>

          <!-- Input Area -->
          <div class="chat-input-container">
            <div class="chat-input-wrapper">
              <textarea 
                id="chat-input" 
                class="chat-input" 
                placeholder="Type your message... (Shift+Enter for new line)"
                rows="1"
              ></textarea>
              <div class="chat-input-actions">
                <button id="stop-btn" class="stop-btn" style="display: none;">⏹ Stop</button>
                <button id="send-btn" class="send-btn" disabled>
                  <span>Send</span>
                  <kbd>Enter</kbd>
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>

    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

### 3.2 Create Modern CSS Styling

**New file**: `src/styles/chat.css`

```css
:root {
  --bg-primary: #0a0a0a;
  --bg-secondary: #151515;
  --bg-tertiary: #1f1f1f;
  --border-color: #2a2a2a;
  --text-primary: #e8e8e8;
  --text-secondary: #a0a0a0;
  --text-muted: #606060;
  --accent-primary: #3b82f6;
  --accent-hover: #2563eb;
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
  --tool-bg: #1e3a5f;
  --user-msg-bg: #2563eb;
  --assistant-msg-bg: #1f1f1f;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
  overflow: hidden;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* Header */
.app-header {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  padding: 1rem 1.5rem;
  flex-shrink: 0;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1800px;
  margin: 0 auto;
}

.app-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.header-status {
  display: flex;
  gap: 0.5rem;
}

.status-badge {
  background: var(--bg-tertiary);
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  font-size: 0.875rem;
  border: 1px solid var(--border-color);
}

/* Main Container */
.app-container {
  display: flex;
  flex: 1;
  overflow: hidden;
  max-width: 1800px;
  margin: 0 auto;
  width: 100%;
}

/* Sidebar */
.sidebar {
  width: 320px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  padding: 1.5rem;
  overflow-y: auto;
  flex-shrink: 0;
}

.sidebar-section {
  margin-bottom: 2rem;
}

.sidebar-section h3 {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}

.sidebar input[type="text"],
.sidebar select,
.sidebar textarea {
  width: 100%;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 0.5rem;
  border-radius: 0.375rem;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.sidebar input[type="text"]:focus,
.sidebar select:focus {
  outline: none;
  border-color: var(--accent-primary);
}

/* Buttons */
.primary-btn,
.secondary-btn,
.danger-btn {
  width: 100%;
  padding: 0.625rem 1rem;
  border: none;
  border-radius: 0.375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.875rem;
}

.primary-btn {
  background: var(--accent-primary);
  color: white;
}

.primary-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.secondary-btn {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.secondary-btn:hover {
  background: var(--bg-primary);
}

.danger-btn {
  background: transparent;
  color: var(--danger);
  border: 1px solid var(--danger);
}

.danger-btn:hover {
  background: var(--danger);
  color: white;
}

/* Progress */
.progress-container {
  margin-top: 1rem;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  background: var(--accent-primary);
  transition: width 0.3s;
}

.progress-text {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-align: center;
}

/* Tools List */
.tools-list {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  padding: 0.75rem;
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.tool-item {
  padding: 0.375rem;
  margin-bottom: 0.25rem;
  background: var(--bg-primary);
  border-radius: 0.25rem;
}

.tool-item:last-child {
  margin-bottom: 0;
}

.tool-name {
  font-weight: 600;
  color: var(--accent-primary);
}

.tool-desc {
  color: var(--text-secondary);
  font-size: 0.75rem;
  margin-top: 0.125rem;
}

/* Chat Main Area */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  scroll-behavior: smooth;
}

/* Welcome Message */
.welcome-message {
  max-width: 600px;
  margin: 4rem auto;
  text-align: center;
  color: var(--text-secondary);
}

.welcome-message h2 {
  color: var(--text-primary);
  margin-bottom: 1rem;
}

.welcome-message ol {
  text-align: left;
  margin-top: 2rem;
  padding-left: 2rem;
}

.welcome-message li {
  margin-bottom: 0.5rem;
}

/* Chat Messages */
.message {
  display: flex;
  margin-bottom: 1.5rem;
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-user {
  justify-content: flex-end;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  flex-shrink: 0;
  margin: 0 0.75rem;
}

.message-user .message-avatar {
  background: var(--user-msg-bg);
  order: 2;
}

.message-assistant .message-avatar {
  background: var(--bg-tertiary);
}

.message-content {
  max-width: 700px;
  padding: 1rem 1.25rem;
  border-radius: 1rem;
  position: relative;
}

.message-user .message-content {
  background: var(--user-msg-bg);
  border-bottom-right-radius: 0.25rem;
}

.message-assistant .message-content {
  background: var(--assistant-msg-bg);
  border: 1px solid var(--border-color);
  border-bottom-left-radius: 0.25rem;
}

.message-content pre {
  background: var(--bg-primary);
  padding: 1rem;
  border-radius: 0.375rem;
  overflow-x: auto;
  margin: 0.5rem 0;
}

.message-content code {
  background: var(--bg-primary);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 0.875em;
}

.message-content pre code {
  background: transparent;
  padding: 0;
}

/* Tool Execution Display */
.tool-execution {
  background: var(--tool-bg);
  border-left: 3px solid var(--accent-primary);
  padding: 0.75rem 1rem;
  margin: 0.75rem 0;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.tool-execution-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.tool-execution-icon {
  font-size: 1rem;
}

.tool-execution-result {
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 0.25rem;
  overflow-x: auto;
}

/* Typing Indicator */
.typing-indicator {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem 0;
}

.typing-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-secondary);
  animation: typing 1.4s infinite;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  30% {
    opacity: 1;
    transform: scale(1);
  }
}

/* Input Area */
.chat-input-container {
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  padding: 1rem 2rem;
  flex-shrink: 0;
}

.chat-input-wrapper {
  max-width: 900px;
  margin: 0 auto;
}

.chat-input {
  width: 100%;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 0.875rem 1rem;
  border-radius: 0.75rem;
  font-size: 1rem;
  font-family: inherit;
  resize: none;
  max-height: 200px;
  min-height: 48px;
}

.chat-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.chat-input-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.send-btn,
.stop-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 0.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.send-btn {
  background: var(--accent-primary);
  color: white;
}

.send-btn:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-1px);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn kbd {
  background: rgba(255, 255, 255, 0.2);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}

.stop-btn {
  background: var(--danger);
  color: white;
}

.stop-btn:hover {
  background: #dc2626;
}

/* Scrollbar Styling */
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background: var(--bg-primary);
}

::-webkit-scrollbar-thumb {
  background: var(--bg-tertiary);
  border-radius: 5px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--border-color);
}

/* Responsive */
@media (max-width: 1024px) {
  .sidebar {
    width: 280px;
  }
}

@media (max-width: 768px) {
  .app-container {
    flex-direction: column;
  }
  
  .sidebar {
    width: 100%;
    max-height: 40vh;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }
  
  .message-content {
    max-width: 85%;
  }
}

/* Utility Classes */
.muted {
  color: var(--text-muted);
  font-size: 0.875rem;
}

.hidden {
  display: none !important;
}
```

---

## Phase 4: Main Application Logic

### 4.1 Refactor main.ts

**File**: `src/main.ts` (complete rewrite)

```typescript
import './styles/chat.css';
import { PyodideMcpClient } from './lib/mcp-pyodide-client';
import { WebLLMClient } from './lib/webllm-client';
import { McpWebLLMBridge, ToolExecution } from './lib/mcp-webllm-bridge';
import type { ChatMessage } from './lib/webllm-client';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

// ============================================================================
// State Management
// ============================================================================

interface AppState {
  llmClient: WebLLMClient | null;
  mcpClient: PyodideMcpClient | null;
  bridge: McpWebLLMBridge | null;
  conversationHistory: ChatMessage[];
  isLLMLoaded: boolean;
  isMCPLoaded: boolean;
  isGenerating: boolean;
  currentModelId: string;
}

const state: AppState = {
  llmClient: null,
  mcpClient: null,
  bridge: null,
  conversationHistory: [],
  isLLMLoaded: false,
  isMCPLoaded: false,
  isGenerating: false,
  currentModelId: ''
};

// ============================================================================
// DOM Elements
// ============================================================================

const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
const loadModelBtn = document.getElementById('load-model-btn') as HTMLButtonElement;
const modelProgress = document.getElementById('model-progress') as HTMLDivElement;
const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
const progressText = document.getElementById('progress-text') as HTMLParagraphElement;
const modelStatus = document.getElementById('model-status') as HTMLSpanElement;

const serverSelect = document.getElementById('server-select') as HTMLSelectElement;
const serverUrlInput = document.getElementById('server-url') as HTMLInputElement;
const pyodideUrlInput = document.getElementById('pyodide-url') as HTMLInputElement;
const bootMcpBtn = document.getElementById('boot-mcp-btn') as HTMLButtonElement;
const toolsStatus = document.getElementById('tools-status') as HTMLSpanElement;
const toolsList = document.getElementById('tools-list') as HTMLDivElement;
const refreshToolsBtn = document.getElementById('refresh-tools-btn') as HTMLButtonElement;

const chatMessages = document.getElementById('chat-messages') as HTMLDivElement;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;

const autoScrollCheckbox = document.getElementById('auto-scroll') as HTMLInputElement;
const streamResponseCheckbox = document.getElementById('stream-response') as HTMLInputElement;
const clearChatBtn = document.getElementById('clear-chat-btn') as HTMLButtonElement;

// ============================================================================
// Event Listeners
// ============================================================================

loadModelBtn.addEventListener('click', handleLoadModel);
bootMcpBtn.addEventListener('click', handleBootMCP);
refreshToolsBtn.addEventListener('click', handleRefreshTools);
sendBtn.addEventListener('click', handleSendMessage);
stopBtn.addEventListener('click', handleStopGeneration);
clearChatBtn.addEventListener('click', handleClearChat);

serverSelect.addEventListener('change', () => {
  const isCustomUrl = serverSelect.value === 'url';
  serverUrlInput.style.display = isCustomUrl ? 'block' : 'none';
  
  if (serverSelect.value === 'example') {
    serverUrlInput.value = '/example_remote_server.py';
  } else if (serverSelect.value === 'clean') {
    serverUrlInput.value = '/clean_server.py';
  } else if (!isCustomUrl) {
    serverUrlInput.value = '';
  }
});

chatInput.addEventListener('input', () => {
  // Auto-resize textarea
  chatInput.style.height = 'auto';
  chatInput.style.height = chatInput.scrollHeight + 'px';
  
  // Enable/disable send button
  sendBtn.disabled = !chatInput.value.trim() || !state.isLLMLoaded || state.isGenerating;
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) {
      handleSendMessage();
    }
  }
});

// ============================================================================
// Model Loading
// ============================================================================

async function handleLoadModel() {
  const modelId = modelSelect.value;
  
  try {
    loadModelBtn.disabled = true;
    modelProgress.style.display = 'block';
    modelStatus.textContent = 'Loading...';
    
    state.llmClient = new WebLLMClient();
    
    await state.llmClient.init(modelId, (report) => {
      const progress = Math.round(report.progress * 100);
      progressFill.style.width = `${progress}%`;
      progressText.textContent = report.text;
    });
    
    state.isLLMLoaded = true;
    state.currentModelId = modelId;
    modelStatus.textContent = `✓ ${modelId.split('-')[0]} loaded`;
    modelStatus.style.color = 'var(--success)';
    
    addSystemMessage(`Model ${modelId} loaded successfully! ${state.isMCPLoaded ? 'You can now chat with tool support.' : 'Boot MCP server for tool support.'}`);
    
    // Create bridge if MCP is already loaded
    if (state.mcpClient) {
      state.bridge = new McpWebLLMBridge(state.llmClient, state.mcpClient);
    }
    
    updateUIState();
  } catch (error: any) {
    console.error('Failed to load model:', error);
    modelStatus.textContent = '✗ Load failed';
    modelStatus.style.color = 'var(--danger)';
    addSystemMessage(`Failed to load model: ${error.message}`);
  } finally {
    loadModelBtn.disabled = false;
    setTimeout(() => {
      modelProgress.style.display = 'none';
    }, 2000);
  }
}

// ============================================================================
// MCP Server Loading
// ============================================================================

async function handleBootMCP() {
  try {
    bootMcpBtn.disabled = true;
    toolsStatus.textContent = 'Loading...';
    
    addSystemMessage('Booting MCP server...');
    
    const worker = new Worker(
      new URL('./workers/py.worker.ts', import.meta.url),
      { type: 'module' }
    );
    
    const serverType: 'embedded' | 'url' = 
      serverSelect.value === 'embedded' ? 'embedded' : 'url';
    
    const serverConfig = serverType === 'url' ? {
      serverType,
      serverUrl: serverSelect.value === 'url' 
        ? serverUrlInput.value.trim()
        : serverUrlInput.value
    } : { serverType };
    
    state.mcpClient = await new PyodideMcpClient(worker).init(
      pyodideUrlInput.value,
      serverConfig
    );
    
    state.isMCPLoaded = true;
    
    // Create bridge if LLM is already loaded
    if (state.llmClient) {
      state.bridge = new McpWebLLMBridge(state.llmClient, state.mcpClient);
    }
    
    await handleRefreshTools();
    
    addSystemMessage('MCP server booted successfully!');
    updateUIState();
  } catch (error: any) {
    console.error('Failed to boot MCP:', error);
    toolsStatus.textContent = '✗ Boot failed';
    addSystemMessage(`Failed to boot MCP: ${error.message}`);
  } finally {
    bootMcpBtn.disabled = false;
  }
}

async function handleRefreshTools() {
  if (!state.mcpClient) return;
  
  try {
    const tools = await state.mcpClient.listTools();
    toolsStatus.textContent = `${tools.length} tools`;
    toolsStatus.style.color = tools.length > 0 ? 'var(--success)' : 'var(--text-secondary)';
    
    if (tools.length === 0) {
      toolsList.innerHTML = '<p class="muted">No tools available</p>';
    } else {
      toolsList.innerHTML = tools.map(tool => `
        <div class="tool-item">
          <div class="tool-name">${tool.name}</div>
          ${tool.description ? `<div class="tool-desc">${tool.description}</div>` : ''}
        </div>
      `).join('');
    }
  } catch (error: any) {
    console.error('Failed to refresh tools:', error);
  }
}

// ============================================================================
// Chat Functionality
// ============================================================================

async function handleSendMessage() {
  const message = chatInput.value.trim();
  if (!message || !state.isLLMLoaded || state.isGenerating) return;
  
  // Clear input
  chatInput.value = '';
  chatInput.style.height = 'auto';
  
  // Add user message to UI
  addUserMessage(message);
  
  // Update state
  state.isGenerating = true;
  updateUIState();
  
  try {
    // Show typing indicator
    const typingId = addTypingIndicator();
    
    if (state.bridge && state.isMCPLoaded) {
      // Chat with tool support
      const systemPrompt = `You are a helpful AI assistant with access to tools. Use tools when appropriate to help answer the user's questions. Always explain what you're doing when you use tools.`;
      
      let currentMessageId: string | null = null;
      
      const result = await state.bridge.chatWithTools(
        message,
        state.conversationHistory,
        systemPrompt,
        streamResponseCheckbox.checked ? (delta, snapshot) => {
          removeTypingIndicator(typingId);
          if (!currentMessageId) {
            currentMessageId = addAssistantMessage(snapshot, true);
          } else {
            updateMessage(currentMessageId, snapshot);
          }
        } : undefined,
        (execution) => {
          removeTypingIndicator(typingId);
          addToolExecution(execution);
        }
      );
      
      // Update conversation history
      state.conversationHistory = result.messages;
      
      // If not streaming, add final message
      if (!streamResponseCheckbox.checked) {
        removeTypingIndicator(typingId);
        const lastAssistantMsg = result.messages
          .filter(m => m.role === 'assistant' && m.content)
          .pop();
        if (lastAssistantMsg) {
          addAssistantMessage(lastAssistantMsg.content);
        }
      } else if (currentMessageId) {
        // Finalize streamed message
        finalizeMessage(currentMessageId);
      }
    } else {
      // Chat without tools
      state.conversationHistory.push({
        role: 'user',
        content: message
      });
      
      let currentMessageId: string | null = null;
      
      const response = await state.llmClient!.chat(
        state.conversationHistory,
        undefined,
        streamResponseCheckbox.checked ? (delta, snapshot) => {
          removeTypingIndicator(typingId);
          if (!currentMessageId) {
            currentMessageId = addAssistantMessage(snapshot, true);
          } else {
            updateMessage(currentMessageId, snapshot);
          }
        } : undefined
      );
      
      state.conversationHistory.push(response);
      
      if (!streamResponseCheckbox.checked) {
        removeTypingIndicator(typingId);
        addAssistantMessage(response.content);
      } else if (currentMessageId) {
        finalizeMessage(currentMessageId);
      }
    }
  } catch (error: any) {
    console.error('Chat error:', error);
    addSystemMessage(`Error: ${error.message}`);
  } finally {
    state.isGenerating = false;
    updateUIState();
  }
}

async function handleStopGeneration() {
  if (state.llmClient && state.isGenerating) {
    await state.llmClient.interrupt();
    state.isGenerating = false;
    updateUIState();
    addSystemMessage('Generation stopped.');
  }
}

function handleClearChat() {
  if (confirm('Clear all messages?')) {
    state.conversationHistory = [];
    chatMessages.innerHTML = `
      <div class="welcome-message">
        <h2>Chat cleared</h2>
        <p>Start a new conversation!</p>
      </div>
    `;
    
    if (state.llmClient) {
      state.llmClient.reset();
    }
  }
}

// ============================================================================
// UI Message Rendering
// ============================================================================

function addUserMessage(content: string) {
  const messageEl = document.createElement('div');
  messageEl.className = 'message message-user';
  messageEl.innerHTML = `
    <div class="message-content">
      ${escapeHtml(content)}
    </div>
    <div class="message-avatar">👤</div>
  `;
  
  removeWelcomeMessage();
  chatMessages.appendChild(messageEl);
  scrollToBottom();
}

function addAssistantMessage(content: string, isStreaming = false): string {
  const id = `msg-${Date.now()}`;
  const messageEl = document.createElement('div');
  messageEl.id = id;
  messageEl.className = 'message message-assistant';
  messageEl.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-content">
      ${renderMarkdown(content)}
    </div>
  `;
  
  removeWelcomeMessage();
  chatMessages.appendChild(messageEl);
  scrollToBottom();
  
  return id;
}

function addSystemMessage(content: string) {
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.style.justifyContent = 'center';
  messageEl.innerHTML = `
    <div class="message-content" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); text-align: center; color: var(--text-secondary); font-size: 0.875rem;">
      ${escapeHtml(content)}
    </div>
  `;
  
  removeWelcomeMessage();
  chatMessages.appendChild(messageEl);
  scrollToBottom();
}

function addToolExecution(execution: ToolExecution) {
  const messageEl = document.createElement('div');
  messageEl.className = 'message';
  messageEl.style.justifyContent = 'center';
  messageEl.innerHTML = `
    <div class="tool-execution">
      <div class="tool-execution-header">
        <span class="tool-execution-icon">🔧</span>
        <span>Calling <strong>${execution.name}</strong></span>
      </div>
      <div class="tool-execution-result">
        ${execution.error 
          ? `<span style="color: var(--danger);">Error: ${escapeHtml(execution.error)}</span>`
          : `Result: ${escapeHtml(JSON.stringify(execution.result, null, 2))}`
        }
      </div>
    </div>
  `;
  
  chatMessages.appendChild(messageEl);
  scrollToBottom();
}

function addTypingIndicator(): string {
  const id = `typing-${Date.now()}`;
  const messageEl = document.createElement('div');
  messageEl.id = id;
  messageEl.className = 'message message-assistant';
  messageEl.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-content">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  
  chatMessages.appendChild(messageEl);
  scrollToBottom();
  
  return id;
}

function removeTypingIndicator(id: string) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function updateMessage(id: string, content: string) {
  const el = document.getElementById(id);
  if (el) {
    const contentEl = el.querySelector('.message-content');
    if (contentEl) {
      contentEl.innerHTML = renderMarkdown(content);
      scrollToBottom();
    }
  }
}

function finalizeMessage(id: string) {
  // Could add final rendering polish here if needed
  scrollToBottom();
}

function removeWelcomeMessage() {
  const welcome = chatMessages.querySelector('.welcome-message');
  if (welcome) welcome.remove();
}

function scrollToBottom() {
  if (autoScrollCheckbox.checked) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// ============================================================================
// Utilities
// ============================================================================

function updateUIState() {
  sendBtn.disabled = !state.isLLMLoaded || state.isGenerating || !chatInput.value.trim();
  stopBtn.style.display = state.isGenerating ? 'block' : 'none';
  chatInput.disabled = state.isGenerating;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(content: string): string {
  try {
    const rawHtml = marked.parse(content) as string;
    return DOMPurify.sanitize(rawHtml);
  } catch (error) {
    console.error('Markdown rendering error:', error);
    return escapeHtml(content);
  }
}

// ============================================================================
// Initialize
// ============================================================================

console.log('WebLLM Chat Agent initialized');
console.log('⚡ Load a model to start chatting');
console.log('🔧 Boot MCP server for tool support');
```

---

## Phase 5: System Prompt & Tool Usage

### 5.1 Create System Prompts Module

**New file**: `src/lib/system-prompts.ts`

```typescript
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful, friendly AI assistant with access to tools via the Model Context Protocol (MCP).

When a user asks a question that could benefit from using a tool:
1. Decide which tool(s) would be helpful
2. Call the appropriate tool(s) with correct parameters
3. Wait for the results
4. Use the results to provide a comprehensive answer to the user

Guidelines for tool usage:
- Always explain what you're doing when you use a tool
- If a tool fails, explain the error and try to help anyway
- Use multiple tools if needed to fully answer a question
- Don't make up tool results - only use what the tools actually return

Be conversational, helpful, and concise. Format your responses with markdown when appropriate.`;

export const CODE_ASSISTANT_PROMPT = `You are an expert programming assistant with access to development tools via MCP.

You can help with:
- Writing, reviewing, and debugging code
- Explaining programming concepts
- Using tools to access documentation, run code, or fetch resources
- Suggesting best practices and optimizations

Always:
- Write clean, well-documented code
- Explain your reasoning
- Use tools when they can provide accurate, up-to-date information
- Format code blocks with appropriate syntax highlighting`;

export const RESEARCH_ASSISTANT_PROMPT = `You are a research assistant with access to various information sources via MCP tools.

Your role:
- Help users find and understand information
- Use tools to access databases, documents, and external resources
- Synthesize information from multiple sources
- Cite your sources when using tool data
- Admit when you don't have enough information

Be thorough, accurate, and clear in your explanations.`;
```

---

## Phase 6: Testing & Example MCP Server

### 6.1 Enhance Example MCP Server

**Update**: `src/py/my_server.py`

Add more interesting example tools:

```python
from mcp_core import McpServer, attach_pyodide_worker
import json
from datetime import datetime

class MyService(McpServer):
    """Example MCP server with useful tools for demonstration"""
    
    def __init__(self):
        super().__init__()
        self.notes = []
        self.counter = 0
    
    # ========================================================================
    # Basic Tools
    # ========================================================================
    
    def echo(self, message: str, upper: bool = False) -> str:
        '''Echo a message back, optionally in uppercase.'''
        return message.upper() if upper else message
    
    def add(self, a: float, b: float) -> float:
        '''Add two numbers together.'''
        return a + b
    
    def multiply(self, a: float, b: float) -> float:
        '''Multiply two numbers.'''
        return a * b
    
    # ========================================================================
    # Stateful Tools
    # ========================================================================
    
    def increment_counter(self, amount: int = 1) -> dict:
        '''Increment an internal counter.'''
        self.counter += amount
        return {
            "previous": self.counter - amount,
            "current": self.counter,
            "incremented_by": amount
        }
    
    def get_counter(self) -> int:
        '''Get the current counter value.'''
        return self.counter
    
    def reset_counter(self) -> str:
        '''Reset the counter to zero.'''
        self.counter = 0
        return "Counter reset to 0"
    
    # ========================================================================
    # Note Management Tools
    # ========================================================================
    
    def add_note(self, title: str, content: str) -> dict:
        '''Add a note to the in-memory note store.'''
        note = {
            "id": len(self.notes) + 1,
            "title": title,
            "content": content,
            "created_at": datetime.now().isoformat()
        }
        self.notes.append(note)
        return note
    
    def list_notes(self) -> list:
        '''List all stored notes.'''
        return self.notes
    
    def get_note(self, note_id: int) -> dict:
        '''Get a specific note by ID.'''
        for note in self.notes:
            if note["id"] == note_id:
                return note
        return {"error": f"Note {note_id} not found"}
    
    def search_notes(self, query: str) -> list:
        '''Search notes by title or content.'''
        query_lower = query.lower()
        results = []
        for note in self.notes:
            if (query_lower in note["title"].lower() or 
                query_lower in note["content"].lower()):
                results.append(note)
        return results
    
    # ========================================================================
    # Utility Tools
    # ========================================================================
    
    def get_current_time(self) -> str:
        '''Get the current date and time.'''
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    def reverse_string(self, text: str) -> str:
        '''Reverse a string.'''
        return text[::-1]
    
    def count_words(self, text: str) -> dict:
        '''Count words, characters, and lines in text.'''
        lines = text.split('\n')
        words = text.split()
        return {
            "characters": len(text),
            "words": len(words),
            "lines": len(lines)
        }
    
    # ========================================================================
    # Resources
    # ========================================================================
    
    def resource_readme(self) -> str:
        '''Documentation for this MCP server.'''
        return """# My Service - MCP Server
        
This is an example MCP server with various tools for demonstration.

## Available Tools

- **Math**: add, multiply
- **Counter**: increment_counter, get_counter, reset_counter
- **Notes**: add_note, list_notes, get_note, search_notes
- **Utilities**: echo, get_current_time, reverse_string, count_words

Try asking the AI to use these tools!
"""
    
    def resource_examples(self) -> dict:
        '''Example tool usage scenarios.'''
        return {
            "mimeType": "application/json",
            "text": json.dumps({
                "examples": [
                    {
                        "description": "Basic math",
                        "prompt": "What is 15.5 multiplied by 3.2?"
                    },
                    {
                        "description": "Note taking",
                        "prompt": "Create a note titled 'Shopping List' with items: milk, bread, eggs"
                    },
                    {
                        "description": "Counter usage",
                        "prompt": "Increment the counter by 5, then tell me its value"
                    },
                    {
                        "description": "Text analysis",
                        "prompt": "Count the words in: The quick brown fox jumps over the lazy dog"
                    }
                ]
            }, indent=2)
        }
    
    # ========================================================================
    # Prompts
    # ========================================================================
    
    def prompt_note_template(self) -> dict:
        '''Create a structured note.'''
        return {
            "template": "Create a note titled '{{ title }}' with the following content:\n\n{{ content }}",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "content": {"type": "string"}
                },
                "required": ["title", "content"]
            }
        }

def boot():
    server = MyService()
    attach_pyodide_worker(server)
```

---

## Phase 7: Implementation Checklist

### Priority 1: Core Functionality
- [ ] Install dependencies (`@mlc-ai/web-llm`, `marked`, `dompurify`)
- [ ] Create `src/lib/webllm-client.ts`
- [ ] Create `src/lib/mcp-webllm-bridge.ts`
- [ ] Create `src/lib/system-prompts.ts`
- [ ] Create `src/styles/chat.css`
- [ ] Update `index.html` with new chat UI
- [ ] Rewrite `src/main.ts` with chat functionality
- [ ] Update `vite.config.ts` for WebLLM support

### Priority 2: Enhanced Features
- [ ] Add conversation persistence (localStorage)
- [ ] Add export chat functionality (markdown, JSON)
- [ ] Add model configuration UI (temperature, max_tokens, etc.)
- [ ] Add dark/light theme toggle
- [ ] Add keyboard shortcuts
- [ ] Add message editing and regeneration
- [ ] Add copy code button for code blocks

### Priority 3: Advanced Features
- [ ] Multi-conversation support (tabs or sidebar)
- [ ] Voice input/output integration
- [ ] Image/file upload support
- [ ] Custom system prompts UI
- [ ] Tool execution approval mode (require user confirmation)
- [ ] Token usage tracking and display
- [ ] Performance metrics dashboard

### Priority 4: Polish
- [ ] Error boundary and graceful error handling
- [ ] Loading states and skeleton screens
- [ ] Accessibility improvements (ARIA labels, keyboard navigation)
- [ ] Mobile responsive optimizations
- [ ] PWA support (service worker, offline mode)
- [ ] Comprehensive documentation
- [ ] Example gallery/playground

---

## Phase 8: Deployment & Optimization

### 8.1 Production Build Optimizations

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-webllm': ['@mlc-ai/web-llm'],
          'vendor-markdown': ['marked', 'dompurify'],
          'vendor-validation': ['ajv']
        }
      }
    },
    chunkSizeWarningLimit: 2000
  }
})
```

### 8.2 Performance Considerations

- **Model Caching**: WebLLM automatically caches models in IndexedDB
- **Lazy Loading**: Load Pyodide only when MCP is needed
- **Code Splitting**: Separate vendor chunks for better caching
- **Service Worker**: Cache static assets for offline use

### 8.3 Browser Compatibility

Requirements:
- **WebGPU** support (Chrome 113+, Edge 113+)
- **WebAssembly** with SIMD
- **SharedArrayBuffer** (requires COOP/COEP headers)
- **ES2022** features

Fallback strategy:
- Detect WebGPU availability
- Show friendly error message with instructions
- Provide link to compatible browser download

---

## Phase 9: Documentation Updates

### 9.1 Update README.md

Add sections:
- WebLLM-MLC integration overview
- Browser requirements
- Model selection guide
- Tool calling examples
- Performance tips
- Troubleshooting guide

### 9.2 Update CLAUDE.md

Add sections:
- WebLLM client architecture
- MCP-WebLLM bridge pattern
- Chat state management
- UI component structure
- Testing strategies

### 9.3 Create User Guide

Topics:
- Getting started tutorial
- Model selection and loading
- Using MCP tools
- Advanced features
- FAQ

---

## Expected Results

After completing this refactor, you will have:

✅ **Modern Chat Interface**: Beautiful, responsive UI with streaming support  
✅ **Local LLM Inference**: Fully browser-based using WebLLM-MLC and WebGPU  
✅ **MCP Integration**: Seamless tool calling with Python-based MCP servers  
✅ **Real-time Tool Execution**: Visual feedback for tool calls and results  
✅ **Extensible Architecture**: Easy to add new tools, models, and features  
✅ **Type Safety**: End-to-end TypeScript with generated types  
✅ **Production Ready**: Optimized build, error handling, and user experience  

---

## Estimated Timeline

- **Phase 1-2** (Setup & WebLLM): 4-6 hours
- **Phase 3** (UI): 6-8 hours
- **Phase 4** (Main Logic): 8-10 hours
- **Phase 5-6** (Integration & Testing): 4-6 hours
- **Phase 7** (Polish): 10-15 hours
- **Phase 8-9** (Deployment & Docs): 4-6 hours

**Total**: 36-51 hours for full implementation

---

## Next Steps

1. Review and approve this plan
2. Set up a development branch
3. Start with Phase 1 (dependencies)
4. Implement incrementally with testing at each phase
5. Deploy preview builds for feedback
6. Iterate based on user testing

**Let's build something amazing! 🚀** 