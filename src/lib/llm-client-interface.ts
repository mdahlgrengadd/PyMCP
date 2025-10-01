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

export type ProgressCallback = (report: ProgressReport) => void;
export type StreamCallback = (delta: string, snapshot: string) => void;

export interface ProgressReport {
  progress: number; // 0-1
  text: string;
  timeElapsed?: number;
  speed?: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface LLMClientInterface {
  /**
   * Initialize the LLM client with a specific model
   */
  init(modelId: string, onProgress?: ProgressCallback): Promise<void>;

  /**
   * Generate a chat completion
   */
  chat(
    messages: ChatMessage[],
    tools?: any[],
    onStream?: StreamCallback,
    options?: ChatOptions
  ): Promise<ChatMessage>;

  /**
   * Interrupt ongoing generation
   */
  interrupt(): Promise<void>;

  /**
   * Reset chat history/context
   */
  reset(): Promise<void>;

  /**
   * Get the current model ID
   */
  getModelId(): string;

  /**
   * Get runtime statistics
   */
  getRuntimeStats(): any;

  /**
   * Check if the client is initialized and ready
   */
  isReady(): boolean;

  /**
   * Get client type identifier
   */
  getClientType(): 'webllm' | 'wllama';
}