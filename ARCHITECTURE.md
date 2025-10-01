# Architecture Documentation

## System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                         Browser Window                                 │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                      User Interface Layer                        │ │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │ │
│  │  │  Header    │  │   Sidebar    │  │    Chat Area            │  │ │
│  │  │  - Status  │  │   - Model    │  │    - Messages           │  │ │
│  │  │  - Badges  │  │   - Tools    │  │    - Input              │  │ │
│  │  └────────────┘  └──────────────┘  └─────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                              ↕                                         │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                   Main Thread (main.ts)                          │ │
│  │                                                                  │ │
│  │  ┌────────────────────────────────────────────────────────────┐ │ │
│  │  │  State Manager                                             │ │ │
│  │  │  - conversationHistory: ChatMessage[]                      │ │ │
│  │  │  - isLLMLoaded: boolean                                    │ │ │
│  │  │  - isMCPLoaded: boolean                                    │ │ │
│  │  └────────────────────────────────────────────────────────────┘ │ │
│  │                                                                  │ │
│  │  ┌─────────────────────┐        ┌─────────────────────────────┐ │ │
│  │  │  WebLLMClient       │        │  PyodideMcpClient           │ │ │
│  │  │  - init()           │        │  - call()                   │ │ │
│  │  │  - chat()           │        │  - listTools()              │ │ │
│  │  │  - interrupt()      │        │  - createProxy()            │ │ │
│  │  └──────────┬──────────┘        └────────────┬────────────────┘ │ │
│  │             │                                 │                  │ │
│  │  ┌──────────┴─────────────────────────────────┴────────────────┐ │ │
│  │  │                  McpWebLLMBridge                             │ │ │
│  │  │  - getMcpToolsForLLM()                                       │ │ │
│  │  │  - executeToolCall()                                         │ │ │
│  │  │  - chatWithTools()                                           │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│              ↓                                      ↓                  │
│  ┌───────────────────────┐          ┌──────────────────────────────┐  │
│  │   WebLLM Worker       │          │    Pyodide Worker            │  │
│  │                       │          │                              │  │
│  │  ┌─────────────────┐  │          │  ┌────────────────────────┐  │  │
│  │  │  MLCEngine      │  │          │  │  mcp_core.py           │  │  │
│  │  │  - WebGPU       │  │          │  │  - McpServer           │  │  │
│  │  │  - Model Cache  │  │          │  │  - Tool Discovery      │  │  │
│  │  │  - Inference    │  │          │  │  - JSON-RPC Handler    │  │  │
│  │  └─────────────────┘  │          │  └────────────────────────┘  │  │
│  │                       │          │                              │  │
│  │  ┌─────────────────┐  │          │  ┌────────────────────────┐  │  │
│  │  │ Downloaded      │  │          │  │  my_server.py          │  │  │
│  │  │ Model Files     │  │          │  │  - Business Logic      │  │  │
│  │  │ (IndexedDB)     │  │          │  │  - Tool Methods        │  │  │
│  │  └─────────────────┘  │          │  │  - Resources/Prompts   │  │  │
│  │                       │          │  └────────────────────────┘  │  │
│  └───────────────────────┘          └──────────────────────────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### UI Layer (`index.html` + `chat.css`)
- Renders chat interface
- Displays status indicators
- Handles user input
- Shows loading states
- Renders markdown messages

### State Manager (`main.ts`)
**Responsibilities:**
- Manages conversation history
- Coordinates UI updates
- Handles user events
- Maintains application state

**State:**
```typescript
{
  llmClient: WebLLMClient | null,
  mcpClient: PyodideMcpClient | null,
  bridge: McpWebLLMBridge | null,
  conversationHistory: ChatMessage[],
  isLLMLoaded: boolean,
  isMCPLoaded: boolean,
  isGenerating: boolean
}
```

### WebLLMClient (`src/lib/webllm-client.ts`)
**Responsibilities:**
- Wraps @mlc-ai/web-llm API
- Manages model initialization
- Handles streaming responses
- Supports function calling format

**Methods:**
- `init(modelId, onProgress)` - Load model with progress tracking
- `chat(messages, tools, onStream)` - Generate response
- `interrupt()` - Stop generation
- `reset()` - Clear conversation context

### PyodideMcpClient (`src/lib/mcp-pyodide-client.ts`)
**Responsibilities:**
- Communicates with Pyodide worker
- JSON-RPC message handling
- Tool schema validation (Ajv)
- Creates typed proxies

**Methods:**
- `init(indexURL, serverConfig)` - Boot Pyodide + MCP server
- `call(method, params)` - JSON-RPC call
- `listTools()` - Get available tools
- `createProxy()` - Create typed tool proxy

### McpWebLLMBridge (`src/lib/mcp-webllm-bridge.ts`)
**Responsibilities:**
- Integrates WebLLM with MCP
- Converts MCP tools to OpenAI function format
- Executes tool calls via MCP client
- Manages multi-turn conversations

**Methods:**
- `getMcpToolsForLLM()` - Convert tool schemas
- `executeToolCall(toolCall)` - Execute via MCP
- `chatWithTools(message, history, ...)` - Full chat loop

### WebLLM Worker (Browser API)
**Responsibilities:**
- Runs LLM inference
- Uses WebGPU for acceleration
- Caches models in IndexedDB
- Streams tokens back to main thread

**Not directly controlled** - managed by @mlc-ai/web-llm library

### Pyodide Worker (`src/workers/py.worker.ts`)
**Responsibilities:**
- Loads Pyodide from CDN
- Installs Python dependencies (pydantic)
- Writes MCP server files to virtual FS
- Boots Python MCP server
- Routes JSON-RPC messages

**Initialization:**
1. Fetch pyodide.js from CDN
2. Load Pyodide runtime
3. Install micropip
4. Install pydantic
5. Write mcp_core.py and server file
6. Execute boot() function
7. Python takes over message handling

## Data Flow Diagrams

### 1. Initialization Flow

```
User clicks "Load Model"
    ↓
main.ts: handleLoadModel()
    ↓
WebLLMClient.init(modelId)
    ↓
@mlc-ai/web-llm: CreateMLCEngine()
    ↓
Download model files (with progress)
    ↓
Load into WebGPU memory
    ↓
Call onProgress() callbacks
    ↓
Update UI progress bar
    ↓
State: isLLMLoaded = true
    ↓
Update status badge
```

### 2. MCP Boot Flow

```
User clicks "Boot MCP Server"
    ↓
main.ts: handleBootMCP()
    ↓
Create new Worker (py.worker.ts)
    ↓
Worker: Load Pyodide from CDN
    ↓
Worker: Install pydantic
    ↓
Worker: Write mcp_core.py to virtual FS
    ↓
Worker: Write my_server.py to virtual FS
    ↓
Worker: Run boot() function
    ↓
Python: Instantiate MyService()
    ↓
Python: attach_pyodide_worker(server)
    ↓
Python: Post {type: "mcp.ready"}
    ↓
PyodideMcpClient receives ready message
    ↓
State: isMCPLoaded = true
    ↓
Fetch and display tools list
```

### 3. Chat Message Flow (No Tools)

```
User types message and hits Enter
    ↓
main.ts: handleSendMessage()
    ↓
Add user message to UI
    ↓
Add to conversationHistory
    ↓
Show typing indicator
    ↓
WebLLMClient.chat(messages, [], onStream)
    ↓
For each token:
    ↓
    onStream(delta, snapshot)
    ↓
    Update message in UI
    ↓
Response complete
    ↓
Add assistant message to conversationHistory
    ↓
Remove typing indicator
    ↓
Scroll to bottom
```

### 4. Chat Message Flow (With Tool Calls)

```
User: "What is 15 times 7?"
    ↓
main.ts: handleSendMessage()
    ↓
McpWebLLMBridge.chatWithTools()
    ↓
[Turn 1] LLM generates response
    ↓
Response includes tool_calls: [{
  id: "call_123",
  function: {
    name: "multiply",
    arguments: '{"a": 15, "b": 7}'
  }
}]
    ↓
Bridge.executeToolCall(toolCall)
    ↓
PyodideMcpClient.call('tools/call', {
  name: 'multiply',
  args: {a: 15, b: 7}
})
    ↓
Message to Pyodide worker
    ↓
Python: MyService.multiply(15, 7)
    ↓
Python: return 105
    ↓
Result back to main thread
    ↓
Call onToolExecution callback
    ↓
Display tool execution card in UI
    ↓
Add tool result to conversation:
{
  role: 'tool',
  tool_call_id: 'call_123',
  name: 'multiply',
  content: '105'
}
    ↓
[Turn 2] LLM generates final response
    ↓
"15 times 7 equals 105."
    ↓
Display assistant message
    ↓
Done
```

## Message Format Standards

### ChatMessage Interface
```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];      // Only for assistant
  tool_call_id?: string;         // Only for tool
  name?: string;                 // Only for tool
}
```

### OpenAI Function Calling Format
```typescript
{
  type: 'function',
  function: {
    name: string,
    description: string,
    parameters: JSONSchema  // From MCP inputSchema
  }
}
```

### MCP Tool Format
```typescript
{
  name: string,
  description: string,
  inputSchema: JSONSchema,
  outputSchema: JSONSchema,
  version: number
}
```

### Conversion: MCP → OpenAI
```typescript
mcpTools.map(tool => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema
  }
}))
```

## Error Handling Strategy

### Model Loading Errors
- Catch network errors → Show retry button
- Catch WebGPU errors → Show browser compatibility message
- Timeout after 5 minutes → Allow cancellation

### MCP Boot Errors
- Pyodide load failure → Show CDN status
- Server boot failure → Show Python error traceback
- Tool execution errors → Display in tool card, continue chat

### Chat Errors
- Generation errors → Display error message, allow retry
- Tool call errors → Pass error to LLM, let it explain
- Network interruption → Save state, offer resume

## Performance Optimizations

### Model Loading
- Use IndexedDB cache (automatic in WebLLM)
- Load smaller quantized models by default
- Progressive loading with visual feedback

### Streaming
- Batch UI updates (requestAnimationFrame)
- Virtual scrolling for long conversations
- Debounce scroll handlers

### Tool Execution
- Parallel tool calls when independent
- Cache tool results when appropriate
- Timeout long-running tools

### Memory Management
- Clear old conversation history (keep last N messages)
- Unload unused models
- Lazy load markdown rendering libraries

## Security Considerations

### XSS Prevention
- Use DOMPurify for all markdown rendering
- Sanitize tool outputs before display
- Escape HTML in user messages

### Tool Execution Safety
- Run Python in sandboxed Pyodide environment
- No filesystem access beyond virtual FS
- No network access from Python (unless explicitly enabled)

### Data Privacy
- All inference happens locally
- No data sent to external servers
- Conversation history stored in localStorage only

## Browser Compatibility

### Required Features
| Feature | Chrome | Edge | Safari | Firefox |
|---------|--------|------|--------|---------|
| WebGPU | 113+ | 113+ | TP | 🚧 |
| WebAssembly SIMD | 91+ | 91+ | 16.4+ | 89+ |
| SharedArrayBuffer | 92+ | 92+ | 15.2+ | 89+ |
| ES2022 | 94+ | 94+ | 15.4+ | 93+ |

### Polyfills Needed
- None (graceful degradation instead)

### Fallback Strategy
1. Check `navigator.gpu` availability
2. If missing, show compatibility error
3. Provide links to compatible browsers
4. Offer server-based alternative link

## Deployment Checklist

### Development
- [x] Set COOP/COEP headers in vite.config.ts
- [ ] Test in Chrome/Edge
- [ ] Verify WebGPU detection
- [ ] Check console for errors

### Production Build
- [ ] Run `pnpm build`
- [ ] Verify chunk splitting
- [ ] Test production build locally
- [ ] Measure bundle sizes

### Hosting Requirements
- HTTPS required (for WebGPU)
- COOP/COEP headers required
- Large bandwidth for model downloads
- CDN recommended for static assets

### Recommended Hosts
- Cloudflare Pages ✅
- Vercel ✅
- Netlify ✅
- GitHub Pages ⚠️ (COOP/COEP configuration tricky)

---

## Extension Points

### Adding New Models
Edit `index.html` model selector:
```html
<option value="MODEL_ID_FROM_WEBLLM_CATALOG">Display Name</option>
```

### Adding New MCP Tools
Edit `src/py/my_server.py`:
```python
def my_new_tool(self, param: str) -> str:
    '''Tool description for LLM.'''
    return f"Result: {param}"
```

### Custom System Prompts
Edit `src/lib/system-prompts.ts` or add UI for user customization.

### Adding Resources/Prompts
```python
def resource_mydata(self) -> str:
    '''Description of resource.'''
    return "Resource content"

def prompt_template(self) -> str:
    '''Prompt template description.'''
    return "Template with {{ variables }}"
```

---

## Performance Benchmarks (Expected)

### Model Loading Time
| Model | Size | Time (First) | Time (Cached) |
|-------|------|--------------|---------------|
| Llama 3.2 3B | ~2GB | 30-60s | 5-10s |
| Llama 3.1 8B | ~5GB | 60-120s | 10-20s |
| Phi 3.5 Mini | ~2.5GB | 30-60s | 5-10s |

### Inference Speed (Tokens/sec)
| Model | Integrated GPU | Discrete GPU |
|-------|----------------|--------------|
| 3B models | 20-40 | 40-80 |
| 7-8B models | 10-25 | 25-60 |

### Tool Execution
- Simple tools (math): ~50-100ms
- Complex tools (search): ~100-500ms
- Python startup overhead: ~20ms per call

---

**This architecture is designed for:**
- ✅ Extensibility (easy to add models/tools)
- ✅ Performance (streaming, caching, optimization)
- ✅ Maintainability (clear separation of concerns)
- ✅ Type Safety (end-to-end TypeScript + Pydantic)
- ✅ User Experience (responsive UI, visual feedback) 