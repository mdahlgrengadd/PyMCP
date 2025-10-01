# WebLLM-MLC Chat Agent - Executive Summary

## 🎯 Goal
Transform PyMCP into a **fully local, browser-based chat agent** with WebLLM-MLC for inference and native MCP tool support.

## 🏗️ Architecture Overview

```
User Interface (Modern Chat UI)
         ↓
Chat Orchestrator (State & Logic)
         ↓
    ┌────┴────┐
    ↓         ↓
WebLLM      Pyodide
Worker      Worker
(Inference) (MCP Tools)
```

## ✨ Key Features

1. **Local LLM Inference** - WebGPU-powered models (Llama 3, Phi-3, Qwen, etc.)
2. **MCP Tool Integration** - Python-based tools via existing Pyodide infrastructure
3. **Modern Chat UI** - Streaming responses, markdown rendering, syntax highlighting
4. **Function Calling** - Automatic tool detection and execution with visual feedback
5. **Fully Local** - No external APIs, complete privacy
6. **Extensible** - Easy to add new models and MCP tools

## 📦 New Dependencies

```bash
pnpm add @mlc-ai/web-llm    # LLM inference engine
pnpm add marked             # Markdown rendering
pnpm add dompurify          # XSS protection
pnpm add highlight.js       # Code highlighting (optional)
```

## 🗂️ File Structure Changes

### New Files
- `src/lib/webllm-client.ts` - WebLLM wrapper with chat API
- `src/lib/mcp-webllm-bridge.ts` - MCP ↔ WebLLM integration
- `src/lib/system-prompts.ts` - System prompt templates
- `src/styles/chat.css` - Modern chat UI styles

### Modified Files
- `index.html` - Complete UI redesign
- `src/main.ts` - Rewrite for chat functionality
- `vite.config.ts` - WebLLM optimizations
- `src/py/my_server.py` - Enhanced example tools

## 🔄 Core Workflow

1. **User sends message** → Added to conversation history
2. **Bridge checks for MCP tools** → Converts to OpenAI function format
3. **WebLLM generates response** → Streams or returns complete
4. **If tool calls detected** → Execute via Pyodide MCP client
5. **Tool results injected** → LLM continues with results
6. **Final response displayed** → With tool execution indicators

## 🚀 Implementation Phases

| Phase | Focus | Time Estimate |
|-------|-------|---------------|
| 1 | Dependencies & Setup | 4-6h |
| 2 | WebLLM Integration | 6-8h |
| 3 | Modern Chat UI | 6-8h |
| 4 | Main Application Logic | 8-10h |
| 5 | System Prompts & Testing | 4-6h |
| 6 | Polish & Features | 10-15h |
| 7 | Deployment & Docs | 4-6h |
| **Total** | | **42-59h** |

## 🎨 UI Components

### Header
- Model status indicator
- Active tools count
- Connection status

### Sidebar
- Model selector & loader
- MCP server configuration
- Available tools list
- Settings (temperature, streaming, etc.)

### Main Chat Area
- Message list with auto-scroll
- User messages (right-aligned, blue)
- Assistant messages (left-aligned, with avatar)
- Tool execution cards (with results)
- Typing indicator

### Input Area
- Multiline textarea (Shift+Enter for newline)
- Send button with hotkey indicator
- Stop generation button (when active)

## 🛠️ Key Technical Decisions

### Why WebLLM-MLC?
- ✅ Production-ready WebGPU inference
- ✅ Large model catalog
- ✅ Excellent performance
- ✅ Active development
- ✅ OpenAI-compatible API

### Why Keep Pyodide?
- ✅ Already working MCP infrastructure
- ✅ Python ecosystem for tools
- ✅ Type safety with Pydantic
- ✅ Easy to write MCP servers

### Function Calling Strategy
- Use OpenAI function calling format
- Auto-convert MCP tools to function schemas
- Multi-turn conversation for tool results
- Visual feedback for each tool execution

## 📊 Expected Performance

- **Model Loading**: 30s - 2min (depending on model size)
- **First Token Latency**: 100-300ms
- **Streaming Speed**: 20-60 tokens/sec (model dependent)
- **Tool Execution**: ~50-200ms per tool call
- **Memory Usage**: 2-8GB (model dependent)

## 🌐 Browser Requirements

**Required:**
- Chrome/Edge 113+ (WebGPU support)
- 8GB+ RAM (16GB recommended)
- Modern GPU (integrated works, discrete better)

**Headers Required:**
```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

## 🎯 Success Metrics

After refactoring, the app should:

1. ✅ Load and run LLMs locally in browser
2. ✅ Display beautiful, responsive chat interface
3. ✅ Stream responses in real-time
4. ✅ Automatically detect and execute MCP tools
5. ✅ Show visual feedback for tool calls
6. ✅ Handle errors gracefully
7. ✅ Work offline (after initial model download)
8. ✅ Maintain type safety end-to-end

## 🔗 References

- [WebLLM Documentation](https://webllm.mlc.ai/)
- [MLC-LLM GitHub](https://github.com/mlc-ai/web-llm)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Pyodide Documentation](https://pyodide.org/)

## 📝 Next Steps

1. **Review full plan**: See `REFACTOR_PLAN.md` for complete details
2. **Set up branch**: Create `feature/webllm-chat-agent`
3. **Phase 1**: Install dependencies and set up tooling
4. **Phase 2**: Implement WebLLM client wrapper
5. **Phase 3**: Build chat UI
6. **Phase 4**: Wire up main application logic
7. **Test & iterate**: Deploy preview builds
8. **Launch**: Update documentation and announce

---

**Ready to build? Let's start with Phase 1! 🚀** 