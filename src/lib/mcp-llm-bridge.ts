import { PyodideMcpClient } from './mcp-pyodide-client';
import type { LLMClientInterface, ChatMessage, ToolCall } from './llm-client-interface';
import { extractFunctionCall, buildToolCallingPrompt, cleanAssistantMessage } from './function-call-parser';

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

export class McpLLMBridge {
  constructor(
    private llmClient: LLMClientInterface,
    private mcpClient: PyodideMcpClient,
    private supportsFunctionCalling: boolean = false
  ) {}
  
  /**
   * Convert MCP tools to OpenAI function calling format
   */
  async getMcpToolsForLLM(): Promise<any[]> {
    const mcpTools = await this.mcpClient.listTools();

    console.log('Raw MCP tools:', JSON.stringify(mcpTools, null, 2));

    const formattedTools = mcpTools.map((tool: any) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || `Call the ${tool.name} tool`,
        parameters: tool.inputSchema || { type: 'object', properties: {} }
      }
    }));

    console.log('Formatted tools for LLM:', JSON.stringify(formattedTools, null, 2));

    return formattedTools;
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

    const tools = await this.getMcpToolsForLLM();
    const toolExecutions: ToolExecution[] = [];

    // Build tool-calling system prompt (replaces native tools API)
    const toolPrompt = buildToolCallingPrompt(tools);

    if (messages[0]?.role !== 'system') {
      messages.unshift({ role: 'system', content: toolPrompt });
    }

    // Add user message
    messages.push({ role: 'user', content: userMessage });

    // Multi-turn tool calling loop (manual parsing)
    let maxIterations = 10;
    while (maxIterations-- > 0) {
      // Don't pass tools to LLM - use manual parsing instead
      const response = await this.llmClient.chat(
        messages,
        undefined, // No tools API
        onStream
      );

      // Debug logging
      console.log('Response from LLM:', JSON.stringify(response, null, 2));

      // Manual parsing: extract function call from content
      const functionCall = extractFunctionCall(response.content || '');

      if (!functionCall) {
        // No tool calls, final response - add as-is
        messages.push(response);
        console.log('No function calls detected in content, ending loop');
        break;
      }

      console.log('Detected function call:', functionCall);

      // Clean the assistant message to only include the function call
      const cleanedResponse = {
        ...response,
        content: cleanAssistantMessage(response.content || '')
      };
      messages.push(cleanedResponse);

      // Execute tool call
      const toolCall: ToolCall = {
        id: `call_${Date.now()}`,
        type: 'function',
        function: functionCall
      };

      const execution: ToolExecution = {
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: JSON.parse(toolCall.function.arguments),
        result: null,
        timestamp: Date.now()
      };

      try {
        execution.result = await this.executeToolCall(toolCall);

        // Add tool result using 'tool' role (proper Hermes format)
        messages.push({
          role: 'tool' as any, // TypeScript may not recognize 'tool' role
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: `<tool_response>\n${JSON.stringify(execution.result, null, 2)}\n</tool_response>`
        });
      } catch (error: any) {
        execution.error = error.message;

        // Add error using 'tool' role
        messages.push({
          role: 'tool' as any,
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: `<tool_response>\n{"error": "${error.message}"}\n</tool_response>`
        });
      }

      toolExecutions.push(execution);
      onToolExecution?.(execution);
      
      // Continue loop to let model process tool results
    }
    
    return {
      messages,
      toolExecutions
    };
  }
} 