/**
 * MCP-LLM Bridge V2 - ReAct-Based Implementation
 * Replaces the old function calling approach with ReAct reasoning loop
 */

import { PyodideMcpClient } from './mcp-pyodide-client';
import type { LLMClientInterface, ChatMessage } from './llm-client-interface';
import { ReActAgent, type Tool, type ReActStep } from './react-agent';
import { ContextManager } from './context-manager';
import { VectorStore } from './vector-store';
import { embeddingService } from './embeddings';

export interface ToolExecution {
  id: string;
  name: string;
  arguments: any;
  result: any;
  timestamp: number;
  error?: string;
}

export interface ConversationState {
  messages: ChatMessage[];
  toolExecutions: ToolExecution[];
  reactSteps: ReActStep[];
}

export class McpLLMBridgeV2 {
  private reactAgent: ReActAgent;
  private contextManager: ContextManager;

  constructor(
    private llmClient: LLMClientInterface,
    private mcpClient: PyodideMcpClient,
    private vectorStore: VectorStore
  ) {
    this.reactAgent = new ReActAgent(llmClient, mcpClient);
    this.contextManager = new ContextManager(vectorStore);
  }

  /**
   * Convert MCP tools to ReAct format
   */
  private async getMcpToolsForReAct(): Promise<Tool[]> {
    const mcpTools = await this.mcpClient.listTools();

    return mcpTools.map((tool: any) => ({
      name: tool.name,
      description: tool.description || `Call the ${tool.name} tool`,
      parameters: tool.inputSchema || { type: 'object', properties: {} }
    }));
  }

  /**
   * Chat with tools using ReAct reasoning
   */
  async chatWithTools(
    userMessage: string,
    conversationHistory: ChatMessage[],
    onStepComplete?: (step: ReActStep) => void,
    onToolExecution?: (execution: ToolExecution) => void,
    onAnswerStream?: (delta: string, snapshot: string) => void
  ): Promise<ConversationState> {
    console.log('🚀 Starting ReAct chat loop...');

    // Get available tools
    const tools = await this.getMcpToolsForReAct();
    console.log(`🔧 Loaded ${tools.length} tools`);

    // Build optimized context
    const context = await this.contextManager.buildContext(
      userMessage,
      tools,
      conversationHistory
    );

    // Track executions
    const toolExecutions: ToolExecution[] = [];

    // Run ReAct agent
    const result = await this.reactAgent.run(
      userMessage,
      context.tools,
      context,
      5, // max steps
      (step) => {
        // Track tool executions
        if (step.action && step.observation) {
          const execution: ToolExecution = {
            id: `exec_${Date.now()}`,
            name: step.action.tool,
            arguments: step.action.args,
            result: step.observation.startsWith('ERROR')
              ? null
              : JSON.parse(step.observation),
            timestamp: Date.now(),
            error: step.observation.startsWith('ERROR')
              ? step.observation
              : undefined
          };

          toolExecutions.push(execution);
          onToolExecution?.(execution);

          // Auto-index successful tool results for future semantic search
          if (!execution.error && execution.result) {
            this.indexToolResult(execution).catch(err =>
              console.warn('Failed to index tool result:', err)
            );
          }
        }

        onStepComplete?.(step);
      },
      onAnswerStream
    );

    // Build final message list
    const messages: ChatMessage[] = [
      ...conversationHistory,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: result.answer }
    ];

    return {
      messages,
      toolExecutions,
      reactSteps: result.steps
    };
  }

  /**
   * Automatically index tool results for future semantic search
   * Also fetches and indexes any resource_uri references in the result
   */
  private async indexToolResult(execution: ToolExecution): Promise<void> {
    try {
      const uri = `tool://${execution.name}/${execution.id}`;
      const content = `Tool: ${execution.name}\nArguments: ${JSON.stringify(execution.arguments)}\nResult: ${JSON.stringify(execution.result, null, 2)}`;

      console.log(`📇 Auto-indexing tool result: ${uri}`);
      await this.indexResource(uri, content);

      // Check if result contains resource_uri references and fetch them
      await this.fetchReferencedResources(execution.result);
    } catch (error) {
      console.error('Failed to index tool result:', error);
    }
  }

  /**
   * Fetch and index any resources referenced in tool results
   */
  private async fetchReferencedResources(result: any): Promise<void> {
    if (!result) {
      console.log('📚 No result to check for referenced resources');
      return;
    }

    const resourceUris: string[] = [];

    // Extract resource_uri from result (handles arrays and objects)
    const extractUris = (obj: any, depth = 0) => {
      if (Array.isArray(obj)) {
        console.log(`  ${'  '.repeat(depth)}Array with ${obj.length} items`);
        obj.forEach(item => extractUris(item, depth + 1));
      } else if (typeof obj === 'object' && obj !== null) {
        if (obj.resource_uri && typeof obj.resource_uri === 'string') {
          console.log(`  ${'  '.repeat(depth)}✓ Found resource_uri: ${obj.resource_uri}`);
          resourceUris.push(obj.resource_uri);
        }
        Object.keys(obj).forEach(key => {
          if (key === 'resource_uri') return; // Already handled above
          extractUris(obj[key], depth + 1);
        });
      }
    };

    console.log('🔍 Scanning tool result for resource_uri references...');
    extractUris(result);
    
    if (resourceUris.length === 0) {
      console.log('  No resource_uri found in tool result');
      return;
    }
    
    console.log(`📚 Found ${resourceUris.length} resource URI(s) to fetch`);

    // Fetch and index each referenced resource
    for (const uri of resourceUris) {
      try {
        console.log(`📚 Fetching referenced resource: ${uri}`);
        
        // Get resource metadata
        const resources = await this.mcpClient.call('resources/list', {});
        const resourceMeta = resources.resources?.find((r: any) => r.uri === uri);
        
        const resourceData = await this.mcpClient.call('resources/read', { uri });
        
        if (resourceData && resourceData.contents) {
          // Make name/description prominent for better semantic matching
          let content = `RESOURCE: ${resourceMeta?.name || uri}\n`;
          content += `DESCRIPTION: ${resourceMeta?.description || ''}\n`;
          content += `URI: ${uri}\n`;
          content += `\nCONTENT:\n`;
          
          for (const item of resourceData.contents) {
            if (item.text) {
              content += item.text + '\n';
            }
          }
          
          if (content) {
            console.log(`📇 Auto-indexing referenced resource: ${uri} (${resourceMeta?.name || 'unknown'})`);
            await this.indexResource(uri, content);
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch referenced resource ${uri}:`, error);
      }
    }
  }

  /**
   * Index a resource for semantic search
   */
  async indexResource(uri: string, content: string): Promise<void> {
    if (!embeddingService.isReady()) {
      await embeddingService.init();
    }

    if (!this.vectorStore.isReady()) {
      await this.vectorStore.init();
    }

    console.log(`📇 Indexing resource: ${uri}`);

    try {
      const embedding = await embeddingService.embed(content);
      await this.vectorStore.addResource(uri, content, embedding);
    } catch (error) {
      console.error(`Failed to index resource ${uri}:`, error);
    }
  }

  /**
   * Batch index multiple resources
   */
  async indexResources(resources: Array<{ uri: string; content: string }>): Promise<void> {
    console.log(`📚 Batch indexing ${resources.length} resources...`);

    if (!embeddingService.isReady()) {
      await embeddingService.init();
    }

    if (!this.vectorStore.isReady()) {
      await this.vectorStore.init();
    }

    for (const resource of resources) {
      await this.indexResource(resource.uri, resource.content);
    }

    const stats = await this.vectorStore.getStats();
    console.log(`✅ Indexed ${stats.count} resources (${(stats.totalSize / 1024).toFixed(1)}KB)`);
  }

  /**
   * Clear all indexed resources
   */
  async clearIndex(): Promise<void> {
    await this.vectorStore.clear();
    this.contextManager.clearCache();
  }

  /**
   * Get vector store statistics
   */
  async getIndexStats(): Promise<{ count: number; totalSize: number }> {
    return await this.vectorStore.getStats();
  }
}
