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
    onToolExecution?: (execution: ToolExecution) => void
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
        }

        onStepComplete?.(step);
      }
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
