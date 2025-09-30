import { PyodideMcpClient } from './mcp-pyodide-client';
import { McpResourceManager } from './mcp-resource-manager';
import { ResourceDiscoveryService } from './resource-discovery';
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
  public resourceDiscovery: ResourceDiscoveryService;

  constructor(
    private llmClient: LLMClientInterface,
    private mcpClient: PyodideMcpClient,
    private supportsFunctionCalling: boolean = false
  ) {
    this.resourceManager = new McpResourceManager(mcpClient);
    this.resourceDiscovery = new ResourceDiscoveryService(this.resourceManager);
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
    const accumulatedToolResults: any[] = []; // Track all tool results

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
        
        // ⭐ Accumulate tool results for context discovery
        accumulatedToolResults.push(execution.result);

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
      
      // ⭐ GENERIC RESOURCE DISCOVERY (Server-agnostic!)
      // After tool execution, discover relevant resources
      if (accumulatedToolResults.length > 0) {
        await this.enrichContextFromTools(messages, accumulatedToolResults);
      }
      
      // Continue loop to let model process tool results (with enriched context)
    }
    
    return {
      messages,
      toolExecutions
    };
  }
  
  /**
   * Clean old resource blocks from system message to prevent accumulation
   */
  private cleanSystemMessageResources(systemMessage: string): string {
    // Remove resource section header
    let cleaned = systemMessage.replace(
      /^## Available Context Resources[\s\S]*?---\s*/m,
      ''
    );
    
    // Remove individual <resource>...</resource> blocks
    cleaned = cleaned.replace(
      /<resource[^>]*>[\s\S]*?<\/resource>\s*/g,
      ''
    );
    
    return cleaned.trim();
  }
  
  /**
   * Enrich context based on tool results (GENERIC, server-agnostic)
   * 
   * This method:
   * 1. Checks if tool results reference resources (e.g., resource_uri fields)
   * 2. Uses semantic search to find relevant resources
   * 3. Loads and injects resources into system message
   * 4. Cleans old resources to prevent accumulation
   */
  private async enrichContextFromTools(
    messages: ChatMessage[],
    toolResults: any[]
  ): Promise<void> {
    const resourcesToLoad: string[] = [];
    
    // Strategy 1: Extract explicit resource references
    // (e.g., search results that return resource_uri)
    const explicitRefs = this.resourceDiscovery.extractReferencedResources(toolResults);
    if (explicitRefs.length > 0) {
      console.log('📌 Found explicit resource references:', explicitRefs);
      resourcesToLoad.push(...explicitRefs);
    }
    
    // Strategy 2: Semantic discovery
    // Find resources semantically similar to conversation + tool results
    const discoveredRefs = await this.resourceDiscovery.discoverRelevantResources(
      messages,
      toolResults,
      { topK: 2, minScore: 0.15 }
    );
    
    if (discoveredRefs.length > 0) {
      console.log('🔍 Discovered relevant resources:', discoveredRefs);
      // Only add if not already in explicit refs
      for (const uri of discoveredRefs) {
        if (!resourcesToLoad.includes(uri)) {
          resourcesToLoad.push(uri);
        }
      }
    }
    
    // Load and inject resources
    if (resourcesToLoad.length > 0) {
      const resources = await this.resourceManager.loadResources(resourcesToLoad);
      
      if (resources.length > 0) {
        const resourceContext = this.resourceManager.buildResourceContext(resources);
        
        // Clean old resources and inject fresh ones
        if (messages[0]?.role === 'system') {
          const cleanSystemPrompt = this.cleanSystemMessageResources(messages[0].content);
          messages[0].content = resourceContext + '\n\n' + cleanSystemPrompt;
          console.log(`✅ Injected ${resources.length} resource(s) into context (replaced old ones)`);
        }
      }
    } else {
      // No new resources, but clean old ones if they exist
      if (messages[0]?.role === 'system') {
        const currentContent = messages[0].content;
        const cleanedContent = this.cleanSystemMessageResources(currentContent);
        
        if (currentContent !== cleanedContent) {
          messages[0].content = cleanedContent;
          console.log('🧹 Cleaned old resources from context (no new resources relevant)');
        }
      }
    }
  }
} 