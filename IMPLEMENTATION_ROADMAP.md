# Implementation Roadmap - Step by Step

This is your practical, hands-on guide to implementing the WebLLM-MLC chat agent. Follow these steps in order.

---

## ✅ Phase 1: Foundation (Day 1)

### Step 1.1: Install Dependencies
```bash
cd /home/martin/Documents/GitHub/PyMCP
pnpm add @mlc-ai/web-llm marked dompurify
```

**Verify:**
```bash
pnpm list @mlc-ai/web-llm marked dompurify
```

### Step 1.2: Update vite.config.ts
```typescript
import { defineConfig } from 'vite';

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
  },
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
    }
  }
});
```

### Step 1.3: Update tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "WebWorker", "WebGPU"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"]
}
```

**Test:** Run `pnpm dev` - should start without errors.

---

## 🧩 Phase 2: WebLLM Client (Day 1-2)

### Step 2.1: Create WebLLM Client Wrapper

Create `src/lib/webllm-client.ts`:

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
    arguments: string;
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
      
      return { role: 'assistant', content: fullContent };
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
    if (this.engine) await this.engine.interruptGenerate();
  }
  
  async reset(): Promise<void> {
    if (this.engine) await this.engine.resetChat();
  }
  
  getModelId(): string {
    return this.modelId;
  }
}
```

**Test:** Create a simple test in browser console after implementing Phase 4.

### Step 2.2: Create MCP-WebLLM Bridge

Create `src/lib/mcp-webllm-bridge.ts`:

```typescript
import { PyodideMcpClient } from './mcp-pyodide-client';
import { WebLLMClient, ChatMessage, ToolCall } from './webllm-client';

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
  
  async executeToolCall(toolCall: ToolCall): Promise<any> {
    const { name, arguments: argsJson } = toolCall.function;
    const args = JSON.parse(argsJson);
    
    return await this.mcpClient.call('tools/call', { name, args });
  }
  
  async chatWithTools(
    userMessage: string,
    conversationHistory: ChatMessage[],
    systemPrompt?: string,
    onStream?: (delta: string, snapshot: string) => void,
    onToolExecution?: (execution: ToolExecution) => void
  ): Promise<{ messages: ChatMessage[]; toolExecutions: ToolExecution[] }> {
    const messages: ChatMessage[] = [...conversationHistory];
    
    if (systemPrompt && messages[0]?.role !== 'system') {
      messages.unshift({ role: 'system', content: systemPrompt });
    }
    
    messages.push({ role: 'user', content: userMessage });
    
    const tools = await this.getMcpToolsForLLM();
    const toolExecutions: ToolExecution[] = [];
    
    let maxIterations = 10;
    while (maxIterations-- > 0) {
      const response = await this.llmClient.chat(messages, tools, onStream);
      messages.push(response);
      
      if (!response.tool_calls || response.tool_calls.length === 0) break;
      
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
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify(execution.result)
          });
        } catch (error: any) {
          execution.error = error.message;
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
    }
    
    return { messages, toolExecutions };
  }
}
```

### Step 2.3: Create System Prompts

Create `src/lib/system-prompts.ts`:

```typescript
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant with access to tools via MCP.

When using tools:
1. Explain what you're doing
2. Use tools when they can help answer questions
3. Don't make up tool results - use what they actually return

Be conversational and format responses with markdown.`;
```

---

## 🎨 Phase 3: Modern UI (Day 2-3)

### Step 3.1: Create CSS Styles Directory

```bash
mkdir -p src/styles
```

### Step 3.2: Create chat.css

See full CSS in `REFACTOR_PLAN.md` Phase 3, Section 3.2.

Save to: `src/styles/chat.css`

**Key sections:**
- `:root` variables for theming
- Layout (header, sidebar, main, input)
- Message styling (user, assistant, system)
- Tool execution cards
- Typing indicator animation
- Responsive breakpoints

### Step 3.3: Update index.html

Replace the entire contents with the new chat UI structure from `REFACTOR_PLAN.md` Phase 3, Section 3.1.

**Key elements:**
- `<link rel="stylesheet" href="/src/styles/chat.css">`
- Header with status badges
- Sidebar with model selector, MCP config, tools list
- Main chat area with messages container
- Input area with textarea and buttons

**Test:** Run `pnpm dev` - UI should look modern (no functionality yet).

---

## 🔌 Phase 4: Wire Everything Up (Day 3-4)

### Step 4.1: Backup Current main.ts

```bash
cp src/main.ts src/main.ts.backup
```

### Step 4.2: Rewrite main.ts

See complete implementation in `REFACTOR_PLAN.md` Phase 4, Section 4.1.

**Core sections to implement:**

1. **State Management**
```typescript
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
```

2. **DOM References**
```typescript
const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
// ... all other elements
```

3. **Event Handlers**
```typescript
async function handleLoadModel() { /* ... */ }
async function handleBootMCP() { /* ... */ }
async function handleSendMessage() { /* ... */ }
// ... etc
```

4. **UI Rendering**
```typescript
function addUserMessage(content: string) { /* ... */ }
function addAssistantMessage(content: string) { /* ... */ }
function addToolExecution(execution: ToolExecution) { /* ... */ }
```

### Step 4.3: Import CSS in main.ts

Add at the top:
```typescript
import './styles/chat.css';
```

**Test:**
1. `pnpm dev`
2. Click "Load Model" - progress bar should appear
3. Wait for model to load
4. Type a message and send
5. Should see streaming response

---

## 🧪 Phase 5: Testing & Polish (Day 4-5)

### Step 5.1: Test Model Loading

- [ ] Select different models from dropdown
- [ ] Verify progress indicator updates
- [ ] Check status badge changes
- [ ] Test with slow connection

### Step 5.2: Test MCP Integration

- [ ] Boot embedded server
- [ ] Verify tools list populates
- [ ] Test tool refresh button
- [ ] Try loading example remote server

### Step 5.3: Test Chat Functionality

- [ ] Send simple message (no tools)
- [ ] Enable/disable streaming
- [ ] Test multi-line input (Shift+Enter)
- [ ] Test stop button during generation
- [ ] Clear chat functionality

### Step 5.4: Test Tool Calling

- [ ] Ask "What is 5 times 7?" - should call multiply
- [ ] Ask "What time is it?" - should call get_current_time
- [ ] Ask "Add a note about testing" - should call add_note
- [ ] Verify tool execution cards appear
- [ ] Check tool results are used in response

### Step 5.5: Edge Cases

- [ ] Send message before model loaded (should be disabled)
- [ ] Very long messages
- [ ] Rapid successive messages
- [ ] Tool call errors
- [ ] Network interruption during model load

---

## 🚀 Phase 6: Enhancements (Day 5+)

### Step 6.1: Add Persistence

```typescript
// In main.ts, add:
function saveConversation() {
  localStorage.setItem('chat-history', JSON.stringify(state.conversationHistory));
}

function loadConversation() {
  const saved = localStorage.getItem('chat-history');
  if (saved) {
    state.conversationHistory = JSON.parse(saved);
    // Re-render messages
  }
}
```

### Step 6.2: Add Export Functionality

```typescript
function exportChatAsMarkdown() {
  let markdown = '# Chat Export\n\n';
  for (const msg of state.conversationHistory) {
    if (msg.role === 'user') {
      markdown += `**User:** ${msg.content}\n\n`;
    } else if (msg.role === 'assistant') {
      markdown += `**Assistant:** ${msg.content}\n\n`;
    }
  }
  
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat-${Date.now()}.md`;
  a.click();
}
```

Add button to UI:
```html
<button id="export-btn" class="secondary-btn">Export Chat</button>
```

### Step 6.3: Add Settings Panel

```typescript
interface Settings {
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  autoScroll: boolean;
  streamResponse: boolean;
}
```

Add UI for adjusting these in sidebar.

### Step 6.4: Add Code Copy Buttons

```typescript
function addCopyButtons() {
  document.querySelectorAll('pre code').forEach(block => {
    const button = document.createElement('button');
    button.className = 'copy-btn';
    button.textContent = 'Copy';
    button.onclick = () => {
      navigator.clipboard.writeText(block.textContent || '');
      button.textContent = 'Copied!';
      setTimeout(() => button.textContent = 'Copy', 2000);
    };
    block.parentElement?.appendChild(button);
  });
}
```

---

## 📖 Phase 7: Documentation (Day 6)

### Step 7.1: Update README.md

Add sections:
- Overview of new chat functionality
- Browser requirements (WebGPU)
- Quick start guide
- Model selection tips
- Creating custom MCP tools
- Troubleshooting

### Step 7.2: Update CLAUDE.md

Add sections:
- New architecture overview
- WebLLM integration details
- State management patterns
- Testing approach

### Step 7.3: Create User Guide

Create `USER_GUIDE.md`:
- Getting started tutorial
- Using the chat interface
- Working with tools
- Advanced features
- FAQ

---

## ✅ Final Checklist

### Functionality
- [ ] Model loading works for multiple models
- [ ] Chat interface is responsive and smooth
- [ ] Streaming responses work correctly
- [ ] Tool calling is automatic and visible
- [ ] Error handling is graceful
- [ ] Stop generation works
- [ ] Clear chat works

### Performance
- [ ] Model loads in reasonable time
- [ ] Streaming is smooth (no stuttering)
- [ ] Tool execution is fast
- [ ] UI remains responsive during generation
- [ ] Memory usage is reasonable

### UI/UX
- [ ] Mobile responsive (at least tablet)
- [ ] Dark theme is easy on eyes
- [ ] Status indicators are clear
- [ ] Loading states are informative
- [ ] Error messages are helpful

### Code Quality
- [ ] TypeScript types are correct
- [ ] No console errors
- [ ] Code is commented
- [ ] Functions are reasonably sized
- [ ] State management is clean

### Documentation
- [ ] README updated
- [ ] Code comments added
- [ ] User guide created
- [ ] Examples provided

---

## 🐛 Common Issues & Solutions

### Issue: "WebGPU not supported"
**Solution:** Use Chrome/Edge 113+ or enable chrome://flags/#enable-unsafe-webgpu

### Issue: Model loading fails
**Solution:** Check network connection, clear IndexedDB cache, try smaller model

### Issue: Streaming is choppy
**Solution:** Reduce max_tokens, check GPU usage, close other tabs

### Issue: Tools not appearing
**Solution:** Ensure MCP server is booted, check browser console for errors

### Issue: COOP/COEP errors
**Solution:** Verify vite.config.ts headers, may need to deploy to test

---

## 🎉 Success!

Once all steps are complete, you'll have:

✅ A fully functional, local chat agent  
✅ WebLLM-MLC running in browser  
✅ MCP tools integrated seamlessly  
✅ Beautiful, modern UI  
✅ Streaming responses  
✅ Tool execution visibility  
✅ Production-ready architecture  

**Next:** Share with the community, gather feedback, iterate!

---

**Questions or issues?** Check `REFACTOR_PLAN.md` for detailed explanations. 