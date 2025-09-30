import { Wllama } from '@wllama/wllama';
// Proper URL imports for wllama WASM files
import wllamaSingle from '@wllama/wllama/src/single-thread/wllama.wasm?url';
import wllamaMulti from '@wllama/wllama/src/multi-thread/wllama.wasm?url';
import type {
  LLMClientInterface,
  ChatMessage,
  ToolCall,
  ProgressCallback,
  StreamCallback,
  ProgressReport
} from './llm-client-interface';

export interface WllamaConfig {
  multiThread: boolean;
  numThreads: number;
  enableEmbedding: boolean;
  enableCompletion: boolean;
}

export class WllamaClient implements LLMClientInterface {
  private wllama: Wllama | null = null;
  private modelId: string = '';
  private isInitialized: boolean = false;
  private config: WllamaConfig = {
    multiThread: true,
    numThreads: Math.min(navigator.hardwareConcurrency || 4, 8),
    enableEmbedding: false,
    enableCompletion: true
  };

  constructor(config?: Partial<WllamaConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  async init(modelId: string, onProgress?: ProgressCallback): Promise<void> {
    this.modelId = modelId;

    try {
      // Configure wllama paths
      const wasmPaths = this.getWasmPaths();

      this.wllama = new Wllama(wasmPaths, {
        suppressNativeLog: false,
        logger: {
          debug: console.debug,
          log: console.log,
          warn: console.warn,
          error: console.error
        }
      });

      // Load model with progress tracking
      const startTime = Date.now();

      const progressCallback = onProgress ? (report: any) => {
        const elapsed = Date.now() - startTime;
        const progressReport: ProgressReport = {
          progress: report.loaded / report.total,
          text: `Loading model... ${Math.round(report.loaded / 1024 / 1024)}MB / ${Math.round(report.total / 1024 / 1024)}MB`,
          timeElapsed: elapsed,
          speed: this.formatSpeed(report.loaded, elapsed)
        };
        onProgress(progressReport);
      } : undefined;

      // modelId can be either a Hugging Face path or direct URL
      if (modelId.startsWith('http://') || modelId.startsWith('https://')) {
        // Direct URL loading
        await this.wllama.loadModelFromUrl(modelId, {
          progressCallback,
          allowOffline: false,
          useCache: true,
          n_ctx: 4096 // Set context size during loading
        });
      } else {
        // Hugging Face path - parse it to get namespace and filename
        const [namespace, modelFile] = this.parseModelPath(modelId);
        await this.wllama.loadModelFromHF(namespace, modelFile, {
          progressCallback,
          allowOffline: false,
          useCache: true,
          n_ctx: 4096 // Set context size during loading
        });
      }

      this.isInitialized = true;
    } catch (error: any) {
      this.isInitialized = false;
      throw new Error(`Failed to initialize wllama: ${error.message}`);
    }
  }

  async chat(
    messages: ChatMessage[],
    tools?: any[],
    onStream?: StreamCallback,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<ChatMessage> {
    if (!this.wllama || !this.isInitialized) {
      throw new Error('wllama client not initialized');
    }

    try {
      // Convert messages to prompt format
      const prompt = this.messagesToPrompt(messages);

      if (tools && tools.length > 0) {
        // Handle tool calling
        return await this.chatWithTools(prompt, tools, onStream, options);
      } else {
        // Regular completion
        return await this.createCompletion(prompt, onStream, options);
      }
    } catch (error: any) {
      throw new Error(`Chat failed: ${error.message}`);
    }
  }

  private async createCompletion(prompt: string, onStream?: StreamCallback, options?: { temperature?: number; maxTokens?: number }): Promise<ChatMessage> {
    if (!this.wllama) throw new Error('wllama not initialized');

    const response = await this.wllama.createCompletion(prompt, {
      nPredict: options?.maxTokens ?? 1024,
      nCtx: 4096, // Increase context window
      sampling: {
        temp: options?.temperature ?? 0.7,
        top_k: 40,
        top_p: 0.9,
        penalty_repeat: 1.1
      },
      useCache: true
    });

    // wllama doesn't support streaming in the same way as WebLLM
    // So we simulate streaming by chunking the response
    if (onStream) {
      let currentText = '';
      const chunks = response.split(' ');

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i] + (i < chunks.length - 1 ? ' ' : '');
        currentText += chunk;
        onStream(chunk, currentText);

        // Small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    return {
      role: 'assistant',
      content: response
    };
  }

  private async chatWithTools(
    prompt: string,
    tools: any[],
    onStream?: StreamCallback,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<ChatMessage> {
    // Enhanced tool calling implementation for wllama
    // Format tools as a JSON schema for better understanding
    const toolsJson = tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters || {}
    }));

    const systemMessage = `You are a helpful assistant with access to tools. When you need to use a tool, respond with JSON: {"tool_call": {"name": "tool_name", "arguments": {...}}}

Available tools:
${JSON.stringify(toolsJson)}

Examples:
- Add numbers: {"tool_call": {"name": "add", "arguments": {"a": 5, "b": 32}}}
- Echo text: {"tool_call": {"name": "echo", "arguments": {"message": "hello", "upper": false}}}`;

    const enhancedPrompt = `${systemMessage}\n\nUser: ${prompt}\nAssistant:`;

    const response = await this.createCompletion(enhancedPrompt, onStream, options);

    // Parse JSON tool calls with better error handling
    const content = response.content.trim();

    // Check if response contains a JSON tool call - improved regex to handle nested objects
    const jsonMatch = content.match(/\{"tool_call":\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\}/);
    if (jsonMatch) {
      try {
        const parsedCall = JSON.parse(jsonMatch[0]);
        if (parsedCall.tool_call && parsedCall.tool_call.name) {
          response.tool_calls = [{
            id: `call_${Date.now()}`,
            type: 'function',
            function: {
              name: parsedCall.tool_call.name,
              arguments: JSON.stringify(parsedCall.tool_call.arguments || {})
            }
          }];

          // Clean the response content to remove the tool call JSON
          response.content = content.replace(jsonMatch[0], '').trim();
          if (!response.content) {
            response.content = `I'll use the ${parsedCall.tool_call.name} tool to help you with that.`;
          }
        }
      } catch (e) {
        console.warn('Failed to parse tool call JSON:', e);
        console.warn('Raw JSON:', jsonMatch[0]);
      }
    }

    return response;
  }


  async interrupt(): Promise<void> {
    // wllama doesn't have built-in interrupt support
    // This would require implementing interruption at the WASM level
    console.warn('Interrupt not implemented for wllama client');
  }

  async reset(): Promise<void> {
    if (this.wllama) {
      // Clear any cached context
      // wllama doesn't have explicit reset, but we can clear sampling state
      console.log('Reset called - clearing wllama context');
    }
  }

  getModelId(): string {
    return this.modelId;
  }

  getRuntimeStats(): any {
    return {
      client: 'wllama',
      modelId: this.modelId,
      isInitialized: this.isInitialized,
      config: this.config
    };
  }

  isReady(): boolean {
    return this.isInitialized && this.wllama !== null;
  }

  getClientType(): 'webllm' | 'wllama' {
    return 'wllama';
  }

  private getWasmPaths(): Record<string, string> {
    // Use proper URL imports - Vite will handle the correct paths
    if (this.config.multiThread && 'SharedArrayBuffer' in window) {
      return {
        'single-thread/wllama.wasm': wllamaSingle,
        'multi-thread/wllama.wasm': wllamaMulti,
      };
    } else {
      return {
        'single-thread/wllama.wasm': wllamaSingle,
      };
    }
  }

  private parseModelPath(modelPath: string): [string, string] {
    // Parse model path to extract Hugging Face namespace and model file
    // Expected format: "ggml-org/models/tinyllamas/stories260K.gguf"
    const parts = modelPath.split('/');

    if (parts.length >= 2) {
      const namespace = parts.slice(0, -1).join('/');
      const modelFile = parts[parts.length - 1];
      return [namespace, modelFile];
    } else {
      // Fallback for simple model names
      return ['ggml-org/models', modelPath];
    }
  }

  private messagesToPrompt(messages: ChatMessage[]): string {
    // Convert chat messages to a modern chat template format
    // Use the ChatML format which many models understand

    let prompt = '';

    for (const message of messages) {
      switch (message.role) {
        case 'system':
          prompt += `<|im_start|>system\n${message.content}<|im_end|>\n`;
          break;
        case 'user':
          prompt += `<|im_start|>user\n${message.content}<|im_end|>\n`;
          break;
        case 'assistant':
          prompt += `<|im_start|>assistant\n${message.content}<|im_end|>\n`;
          break;
        case 'tool':
          prompt += `<|im_start|>tool\n${message.content}<|im_end|>\n`;
          break;
      }
    }

    prompt += '<|im_start|>assistant\n';
    return prompt;
  }

  private formatSpeed(bytesLoaded: number, timeElapsed: number): string {
    if (timeElapsed === 0) return '';

    const bytesPerSecond = bytesLoaded / (timeElapsed / 1000);
    const mbPerSecond = bytesPerSecond / (1024 * 1024);

    return `${mbPerSecond.toFixed(1)} MB/s`;
  }
}