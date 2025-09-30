import { PyodideMcpClient } from './mcp-pyodide-client';
import { McpResourceManager } from './mcp-resource-manager';
import type { LLMClientInterface, ChatMessage, ToolCall } from './llm-client-interface';
import type { ResourceContent } from './mcp-resource-manager';
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

export interface ChatWithToolsOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  selectedResources?: string[]; // Resource URIs to include as context
  promptTemplate?: string; // Prompt template name to use
}

export class McpLLMBridge {
  public resourceManager: McpResourceManager;

  constructor(
    private llmClient: LLMClientInterface,
    private mcpClient: PyodideMcpClient,
    private supportsFunctionCalling: boolean = false
  ) {
    this.resourceManager = new McpResourceManager(mcpClient);
  }
  
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
   * Build augmented system prompt with resources and prompt templates
   */
  private async buildAugmentedSystemPrompt(
    baseSystemPrompt: string,
    tools: any[],
    options?: ChatWithToolsOptions
  ): Promise<string> {
    let systemPrompt = baseSystemPrompt;

    // 1. Apply prompt template if specified
    if (options?.promptTemplate) {
      const template = await this.resourceManager.getPrompt(options.promptTemplate);
      if (template) {
        const templatePrompt = this.resourceManager.buildPromptFromTemplate(template);
        systemPrompt = templatePrompt + '\n\n' + systemPrompt;
      }
    }

    // 2. Add resource context if resources are selected
    if (options?.selectedResources && options.selectedResources.length > 0) {
      const resources = await this.resourceManager.loadResources(options.selectedResources);
      const resourceContext = this.resourceManager.buildResourceContext(resources);
      
      if (resourceContext) {
        systemPrompt = resourceContext + '\n' + systemPrompt;
      }
    }

    // 3. Add tool descriptions
    const toolPrompt = buildToolCallingPrompt(tools);
    systemPrompt = systemPrompt + '\n\n' + toolPrompt;

    return systemPrompt;
  }

  /**
   * Main chat loop with automatic tool calling, resource context, and prompt templates
   */
  async chatWithTools(
    userMessage: string,
    conversationHistory: ChatMessage[],
    onStream?: (delta: string, snapshot: string) => void,
    onToolExecution?: (execution: ToolExecution) => void,
    options?: ChatWithToolsOptions
  ): Promise<ConversationState> {
    const messages: ChatMessage[] = [...conversationHistory];

    const tools = await this.getMcpToolsForLLM();
    const toolExecutions: ToolExecution[] = [];

    // Build augmented system prompt with resources and templates
    const baseSystemPrompt = options?.systemPrompt || 'You are a helpful AI assistant.';
    const augmentedSystemPrompt = await this.buildAugmentedSystemPrompt(
      baseSystemPrompt,
      tools,
      options
    );

    // Add/replace system message
    if (messages[0]?.role === 'system') {
      messages[0] = { role: 'system', content: augmentedSystemPrompt };
    } else {
      messages.unshift({ role: 'system', content: augmentedSystemPrompt });
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
        onStream,
        {
          temperature: options?.temperature,
          maxTokens: options?.maxTokens
        }
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