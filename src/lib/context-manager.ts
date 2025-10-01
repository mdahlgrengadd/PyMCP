/**
 * Context Manager with Token Budgeting
 * Intelligently manages context window by budgeting tokens across different components
 */

import type { ChatMessage } from './llm-client-interface';
import { VectorStore, VectorSearchResult } from './vector-store';
import { embeddingService } from './embeddings';
import type { Tool } from './react-agent';

export interface ConversationContext {
  relevantResources: Array<{ uri: string; content: string }>;
  conversationHistory: ChatMessage[];
  tools: Tool[];
}

export class ContextManager {
  // Token budgets (approximate - based on ~4 chars per token)
  private readonly MAX_TOKENS = 4096;
  private readonly SYSTEM_BUDGET = 1024;      // System prompt + tools
  private readonly RESOURCES_BUDGET = 1024;   // Retrieved context
  private readonly HISTORY_BUDGET = 512;      // Conversation history
  private readonly RESPONSE_BUDGET = 512;     // Reserved for response

  private resourceCache = new Map<string, { content: string; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    private vectorStore: VectorStore
  ) {}

  /**
   * Build optimized context for the current query
   */
  async buildContext(
    userQuery: string,
    tools: Tool[],
    history: ChatMessage[]
  ): Promise<ConversationContext> {
    console.log('🔧 Building context for query...');

    // 1. Search for relevant resources
    const relevantResources = await this.searchRelevantResources(userQuery);

    // 2. Select and compress history
    const compressedHistory = this.compressHistory(history);

    // 3. Select relevant tools (if we have many)
    const selectedTools = this.selectTools(tools, userQuery);

    console.log(`📚 Selected ${relevantResources.length} resources, ${compressedHistory.length} history messages, ${selectedTools.length} tools`);

    return {
      relevantResources,
      conversationHistory: compressedHistory,
      tools: selectedTools
    };
  }

  /**
   * Search for relevant resources using vector similarity
   */
  private async searchRelevantResources(
    query: string,
    maxResults = 3
  ): Promise<Array<{ uri: string; content: string }>> {
    if (!this.vectorStore.isReady() || !embeddingService.isReady()) {
      return [];
    }

    try {
      // Generate query embedding
      const queryEmbedding = await embeddingService.embed(query);

      // Search for similar resources
      const results = await this.vectorStore.search(queryEmbedding, maxResults, 0.6);

      console.log(`🔍 Found ${results.length} relevant resources (scores: ${results.map(r => r.score.toFixed(2)).join(', ')})`);

      // Deduplicate and fetch content
      const resources = await this.fetchResources(results);

      // Select by budget
      return this.selectResourcesByBudget(resources, this.RESOURCES_BUDGET);
    } catch (error) {
      console.error('Resource search failed:', error);
      return [];
    }
  }

  /**
   * Fetch resource content (with caching)
   */
  private async fetchResources(
    results: VectorSearchResult[]
  ): Promise<Array<{ uri: string; content: string; score: number }>> {
    const resources: Array<{ uri: string; content: string; score: number }> = [];

    for (const result of results) {
      // Check cache first
      const cached = this.resourceCache.get(result.uri);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        resources.push({
          uri: result.uri,
          content: cached.content,
          score: result.score
        });
        continue;
      }

      // Extract content from metadata
      if (result.metadata?.text) {
        const content = result.metadata.text;
        this.resourceCache.set(result.uri, {
          content,
          timestamp: Date.now()
        });

        resources.push({
          uri: result.uri,
          content,
          score: result.score
        });
      }
    }

    // Deduplicate by URI
    const seen = new Set<string>();
    return resources.filter(r => {
      if (seen.has(r.uri)) return false;
      seen.add(r.uri);
      return true;
    });
  }

  /**
   * Select resources that fit within token budget
   */
  private selectResourcesByBudget(
    resources: Array<{ uri: string; content: string; score: number }>,
    budget: number
  ): Array<{ uri: string; content: string }> {
    const selected: Array<{ uri: string; content: string }> = [];
    let tokenCount = 0;

    // Sort by score descending
    const sorted = [...resources].sort((a, b) => b.score - a.score);

    for (const resource of sorted) {
      const resourceTokens = this.estimateTokens(resource.content);

      if (tokenCount + resourceTokens <= budget) {
        selected.push({
          uri: resource.uri,
          content: resource.content
        });
        tokenCount += resourceTokens;
      } else {
        // Try to fit a truncated version
        const availableTokens = budget - tokenCount;
        if (availableTokens > 100) {
          const truncated = this.truncateToTokens(resource.content, availableTokens);
          selected.push({
            uri: resource.uri,
            content: truncated
          });
        }
        break;
      }
    }

    return selected;
  }

  /**
   * Compress conversation history to fit budget
   */
  private compressHistory(
    history: ChatMessage[],
    budget: number = this.HISTORY_BUDGET
  ): ChatMessage[] {
    if (history.length === 0) return [];

    // Strategy: Keep most recent messages + important context
    const important = history.filter(m =>
      m.role === 'tool' ||
      m.content?.includes('Final Answer') ||
      m.role === 'system'
    );

    const recent = history.slice(-5); // Last 5 messages

    // Combine and deduplicate
    const combined = this.deduplicateMessages([...important, ...recent]);

    // Check if within budget
    const totalTokens = combined.reduce((sum, m) =>
      sum + this.estimateTokens(m.content || ''), 0
    );

    if (totalTokens <= budget) {
      return combined;
    }

    // Truncate if over budget
    return this.truncateHistory(combined, budget);
  }

  /**
   * Deduplicate messages by content
   */
  private deduplicateMessages(messages: ChatMessage[]): ChatMessage[] {
    const seen = new Set<string>();
    return messages.filter(m => {
      const key = `${m.role}:${m.content}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Truncate history to fit budget
   */
  private truncateHistory(messages: ChatMessage[], budget: number): ChatMessage[] {
    const result: ChatMessage[] = [];
    let tokenCount = 0;

    // Start from most recent
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const messageTokens = this.estimateTokens(message.content || '');

      if (tokenCount + messageTokens <= budget) {
        result.unshift(message);
        tokenCount += messageTokens;
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * Select relevant tools (if we have too many)
   */
  private selectTools(tools: Tool[], query: string): Tool[] {
    // For now, return all tools
    // In the future, could use embeddings to select most relevant
    return tools;
  }

  /**
   * Estimate token count (rough approximation: ~4 chars per token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate text to approximate token count
   */
  private truncateToTokens(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;

    return text.substring(0, maxChars) + '... (truncated)';
  }

  /**
   * Clear resource cache
   */
  clearCache(): void {
    this.resourceCache.clear();
  }
}
