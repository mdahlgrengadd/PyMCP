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
    onStream?: StreamCallback
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
      const chunks = await this.engine.chat.completions.create(request) as AsyncIterable<any>;
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
      const response = await this.engine.chat.completions.create(request) as any;
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