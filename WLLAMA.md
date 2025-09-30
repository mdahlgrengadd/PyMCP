# wllama Integration Plan for MCP over Pyodide

## Executive Summary

This plan extends the current MCP over Pyodide project to support **wllama** as a CPU-based fallback for browsers that don't support WebGPU. The integration will provide seamless LLM inference capabilities using WebAssembly, ensuring broader browser compatibility while maintaining the existing MCP tool calling functionality.

## Architecture Overview

### Current vs Target Architecture

**Current**: WebLLM (WebGPU) → MCP Bridge → Pyodide MCP Server
**Target**: [WebLLM (WebGPU) | wllama (CPU)] → Unified LLM Interface → MCP Bridge → Pyodide MCP Server

### Key Design Principles

1. **Progressive Enhancement**: WebGPU preferred, CPU fallback automatic
2. **Interface Compatibility**: Common LLM client interface for both backends
3. **Capability Detection**: Runtime detection of browser features
4. **Graceful Degradation**: Clear user feedback about performance differences

## Detailed Implementation Plan

### Phase 1: Core Infrastructure (3-4 days)

#### 1.1 Browser Capability Detection
```typescript
// New file: src/lib/browser-capabilities.ts
export interface BrowserCapabilities {
  webgpu: boolean;
  wasm: boolean;
  wasmThreads: boolean;
  sharedArrayBuffer: boolean;
}

export async function detectCapabilities(): Promise<BrowserCapabilities>
```

#### 1.2 LLM Client Interface Abstraction
```typescript
// New file: src/lib/llm-client-interface.ts
export interface LLMClientInterface {
  init(modelId: string, onProgress?: ProgressCallback): Promise<void>;
  chat(messages: ChatMessage[], tools?: any[], onStream?: StreamCallback): Promise<ChatMessage>;
  interrupt(): Promise<void>;
  reset(): Promise<void>;
  getModelId(): string;
  getRuntimeStats(): any;
}
```

#### 1.3 wllama Client Implementation
```typescript
// New file: src/lib/wllama-client.ts
export class WllamaClient implements LLMClientInterface {
  private wllama: Wllama | null = null;
  private modelId: string = '';

  async init(modelId: string, onProgress?: ProgressCallback): Promise<void>
  // Implementation details...
}
```

### Phase 2: Model Management (2-3 days)

#### 2.1 Model Registry System
```typescript
// New file: src/lib/model-registry.ts
export interface ModelInfo {
  id: string;
  name: string;
  type: 'webllm' | 'wllama';
  size: string;
  description: string;
  modelFile?: string; // For wllama GGUF models
  quantization?: string;
  requirements: BrowserCapabilities;
}

export const MODEL_REGISTRY: ModelInfo[] = [
  // WebLLM models (existing)
  { id: 'Llama-3.2-3B-Instruct-q4f32_1-MLC', type: 'webllm', ... },

  // wllama models (new)
  { id: 'llama-3.2-3b-instruct-q4_k_m', type: 'wllama',
    modelFile: 'ggml-org/models/Llama-3.2-3B-Instruct-Q4_K_M.gguf', ... },
  { id: 'phi-3.5-mini-q4_k_m', type: 'wllama',
    modelFile: 'microsoft/Phi-3.5-mini-instruct-gguf/Phi-3.5-mini-instruct-Q4_K_M.gguf', ... }
]
```

#### 2.2 LLM Client Factory
```typescript
// New file: src/lib/llm-client-factory.ts
export class LLMClientFactory {
  static async createClient(modelInfo: ModelInfo, capabilities: BrowserCapabilities): Promise<LLMClientInterface> {
    if (modelInfo.type === 'webllm' && capabilities.webgpu) {
      return new WebLLMClient();
    } else if (modelInfo.type === 'wllama' && capabilities.wasm) {
      return new WllamaClient();
    } else {
      throw new Error('Incompatible model/browser combination');
    }
  }
}
```

### Phase 3: UI Enhancements (2-3 days)

#### 3.1 Enhanced Model Selection
- Browser capability indicators (WebGPU ✓/✗, WASM ✓/✗)
- Model compatibility badges
- Performance expectations (GPU: Fast, CPU: Slower)
- Automatic model filtering based on browser capabilities

#### 3.2 wllama Configuration Panel
```html
<!-- Additional UI elements for wllama -->
<div class="wllama-config" style="display: none;">
  <label>
    <input type="checkbox" id="wllama-multithread" checked />
    Multi-threading (requires CORS headers)
  </label>
  <label>
    Threads: <input type="range" id="wllama-threads" min="1" max="8" value="4" />
  </label>
</div>
```

#### 3.3 Loading Experience Improvements
- Different progress indicators for WebGPU vs CPU loading
- Estimated loading times based on model size and backend
- Network optimization tips for GGUF model downloads

### Phase 4: Integration & Bridge Updates (2 days)

#### 4.1 Bridge Compatibility
```typescript
// Update: src/lib/mcp-webllm-bridge.ts → mcp-llm-bridge.ts
export class McpLLMBridge {
  constructor(
    private llmClient: LLMClientInterface, // Changed from WebLLMClient
    private mcpClient: PyodideMcpClient
  ) {}
  // Existing functionality remains the same
}
```

#### 4.2 State Management Updates
```typescript
// Update: src/main.ts
interface AppState {
  llmClient: LLMClientInterface | null; // Changed from WebLLMClient
  browserCapabilities: BrowserCapabilities;
  selectedModelInfo: ModelInfo | null;
  // ... rest unchanged
}
```

### Phase 5: Configuration & Deployment (1-2 days)

#### 5.1 Package Dependencies
```json
// package.json additions
{
  "dependencies": {
    "@wllama/wllama": "^2.0.0"
  }
}
```

#### 5.2 Vite Configuration
```typescript
// vite.config.ts updates for wllama WASM files
export default defineConfig({
  // Add headers for SharedArrayBuffer support
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  // Configure wllama assets
  assetsInclude: ['**/*.wasm']
})
```

#### 5.3 wllama Asset Setup
```typescript
// Static asset configuration for wllama WASM files
const WLLAMA_CONFIG = {
  'single-thread/wllama.wasm': '/wllama/single-thread/wllama.wasm',
  'multi-thread/wllama.wasm': '/wllama/multi-thread/wllama.wasm',
  'multi-thread/wllama.worker.mjs': '/wllama/multi-thread/wllama.worker.mjs'
};
```

## Implementation Details

### Model Loading Flow
1. **Capability Detection**: Check WebGPU, WASM, threading support
2. **Model Filtering**: Show only compatible models in UI
3. **Smart Defaults**: Prefer WebGPU models when available
4. **Graceful Fallback**: Suggest alternative models if incompatible
5. **Progress Tracking**: Different UX for GPU vs CPU loading

### Performance Optimizations
- **Parallel Downloads**: Split large GGUF models into chunks
- **Progressive Loading**: Start inference with partial model loading
- **Memory Management**: Clear previous models before loading new ones
- **Thread Optimization**: Auto-detect optimal thread count for wllama

### Error Handling & User Feedback
- **Capability Warnings**: Clear messaging about browser limitations
- **Loading Failures**: Specific error messages with actionable advice
- **Performance Expectations**: Set realistic speed expectations
- **Fallback Suggestions**: Recommend alternative models/browsers

## File Structure Changes

```
src/
├── lib/
│   ├── browser-capabilities.ts        [NEW]
│   ├── llm-client-interface.ts        [NEW]
│   ├── llm-client-factory.ts          [NEW]
│   ├── wllama-client.ts               [NEW]
│   ├── model-registry.ts              [NEW]
│   ├── mcp-llm-bridge.ts              [RENAMED from mcp-webllm-bridge.ts]
│   ├── webllm-client.ts               [UPDATED - implement interface]
│   └── mcp-pyodide-client.ts          [UNCHANGED]
├── main.ts                            [UPDATED - new architecture]
├── styles/
│   └── chat.css                       [UPDATED - new UI elements]
└── workers/
    └── py.worker.ts                   [UNCHANGED]

public/
└── wllama/                            [NEW]
    ├── single-thread/
    │   └── wllama.wasm
    └── multi-thread/
        ├── wllama.wasm
        └── wllama.worker.mjs
```

## Testing Strategy

### Unit Tests
- Browser capability detection accuracy
- Model registry filtering logic
- LLM client interface compliance
- Error handling scenarios

### Integration Tests
- WebLLM → wllama fallback flow
- MCP bridge compatibility with both backends
- Tool calling functionality across both LLM types
- Model loading and switching scenarios

### Browser Compatibility Tests
- Chrome/Edge (WebGPU + wllama)
- Firefox (wllama only)
- Safari (wllama only)
- Mobile browsers (wllama only)

## Performance Benchmarks

### Expected Performance Characteristics
- **WebGPU (WebLLM)**: 15-30 tokens/second
- **CPU Multi-thread (wllama)**: 3-8 tokens/second
- **CPU Single-thread (wllama)**: 1-3 tokens/second

### Optimization Opportunities
- **GGUF Model Selection**: Q4_K_M balance of quality/speed
- **Threading**: Auto-detect optimal core count
- **Model Caching**: Browser storage for faster subsequent loads
- **Progressive Loading**: Start generation with partial model

## Future Enhancements

### Phase 6: Advanced Features (Future)
- **Hybrid Inference**: Use both GPU and CPU simultaneously
- **Model Streaming**: Stream large models during inference
- **Local Model Storage**: IndexedDB caching for frequently used models
- **Performance Profiling**: Runtime performance analytics and optimization suggestions

### Phase 7: Extended Model Support (Future)
- **Multimodal Models**: Vision-language models via wllama
- **Specialized Models**: Code, math, reasoning-optimized models
- **Custom Model Support**: User-provided GGUF model loading
- **Model Quantization**: On-the-fly quantization options

This implementation plan provides a robust, user-friendly integration of wllama that maintains the existing MCP functionality while dramatically expanding browser compatibility. The modular architecture ensures maintainability and allows for future enhancements without breaking changes.