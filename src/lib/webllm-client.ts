import * as webllm from '@mlc-ai/web-llm';
import type {
  LLMClientInterface,
  ChatMessage,
  ToolCall,
  ProgressCallback,
  StreamCallback,
  ProgressReport
} from './llm-client-interface';

export class WebLLMClient implements LLMClientInterface {
  private engine: webllm.MLCEngine | null = null;
  private modelId: string = '';
  
  async init(
    modelId: string = 'Llama-3.2-3B-Instruct-q4f32_1-MLC',
    onProgress?: ProgressCallback
  ): Promise<void> {
    this.modelId = modelId;

    const webllmProgress = onProgress ? (report: webllm.InitProgressReport) => {
      const progressReport: ProgressReport = {
        progress: report.progress,
        text: report.text,
        timeElapsed: report.timeElapsed
      };
      onProgress(progressReport);
    } : undefined;

    this.engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: webllmProgress
    });
  }
  
  async chat(
    messages: ChatMessage[],
    tools?: any[],
    onStream?: StreamCallback,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<ChatMessage> {
    if (!this.engine) throw new Error('Engine not initialized');
    
    const request: webllm.ChatCompletionRequest = {
      messages: messages as any,
      temperature: options?.temperature ?? (tools && tools.length > 0 ? 0 : 0.7), // Use 0 for function calling by default
      max_tokens: options?.maxTokens ?? 2048,
      stream: !!onStream
    };
    
    if (tools && tools.length > 0) {
      console.log('Sending tools to WebLLM:', JSON.stringify(tools, null, 2));
      request.tools = tools;
      request.tool_choice = 'auto';
    }
    
    if (onStream) {
      const chunks = await this.engine.chat.completions.create(request) as AsyncIterable<any>;
      let fullContent = '';
      let lastChunk: any = null;

      for await (const chunk of chunks) {
        const delta = chunk.choices[0]?.delta?.content || '';
        fullContent += delta;
        onStream(delta, fullContent);
        lastChunk = chunk;
      }

      // The last chunk contains tool_calls
      const toolCalls = lastChunk?.choices[0]?.delta?.tool_calls ||
                        lastChunk?.choices[0]?.message?.tool_calls;

      console.log('Last chunk (streaming):', JSON.stringify(lastChunk, null, 2));
      console.log('Tool calls from stream:', JSON.stringify(toolCalls, null, 2));

      return {
        role: 'assistant',
        content: fullContent,
        tool_calls: toolCalls as any
      };
    } else {
      const response = await this.engine.chat.completions.create(request) as any;
      const choice = response.choices[0];

      // Debug logging
      console.log('WebLLM Response:', JSON.stringify(response, null, 2));
      console.log('Choice:', JSON.stringify(choice, null, 2));
      console.log('Tool calls:', JSON.stringify(choice.message.tool_calls, null, 2));

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
  
  getRuntimeStats(): any {
    return this.engine ? (this.engine as any).runtimeStatsText?.() : null;
  }

  isReady(): boolean {
    return this.engine !== null;
  }

  getClientType(): 'webllm' | 'wllama' {
    return 'webllm';
  }
} 