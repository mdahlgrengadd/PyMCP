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
    
    return mcpTools.map((tool: any) => ({
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