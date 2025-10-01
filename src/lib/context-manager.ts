/**
 * Context Manager with Token Budgeting
 * Intelligently manages context window by budgeting tokens across different components
 */

import type { ChatMessage } from './llm-client-interface';
import { VectorStore, VectorSearchResult } from './vector-store';
import { embeddingService } from './embeddings';
import type { Tool } from './react-agent';
import { agentConfig } from './agent-config';

export interface ConversationContext {
  relevantResources: Array<{ uri: string; content: string }>;
  conversationHistory: ChatMessage[];
  tools: Tool[];
}

export class ContextManager {
  // Token budgets (approximate - based on ~4 chars per token)
  private readonly MAX_TOKENS = 4096;
  private readonly SYSTEM_BUDGET = 1024;      // System prompt + tools
  private readonly RESOURCES_BUDGET = 2048;   // Retrieved context (increased for full resource content)
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

    // 1. Search for relevant resources WITH conversation history for context enhancement
    // Limit to 2 resources to reduce confusion when multiple recipes/workouts are in context
    const relevantResources = await this.searchRelevantResources(userQuery, 2, history);

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
    maxResults = 5,
    conversationHistory: ChatMessage[] = []
  ): Promise<Array<{ uri: string; content: string }>> {
    if (!this.vectorStore.isReady() || !embeddingService.isReady()) {
      return [];
    }

    try {
      // Enhance query with recent conversation context for better retrieval
      const enhancedQuery = this.enhanceQueryWithContext(query, conversationHistory);
      
      if (enhancedQuery !== query) {
        console.log(`🔍 Enhanced query: "${query}" → "${enhancedQuery}"`);
      }

      // Generate query embedding with enhanced context
      const queryEmbedding = await embeddingService.embed(enhancedQuery);

      // Search for similar resources with LOWER threshold to get boost candidates
      // We'll filter by the real threshold AFTER boosting
      const config = agentConfig.get();
      let results = await this.vectorStore.search(
        queryEmbedding, 
        maxResults * 3,  // Get even more candidates
        0.25  // Low threshold to include resources that will be boosted
      );

      console.log(`🔍 Pre-boost: ${results.length} candidates`);

      // Boost scores for resources mentioned in recent conversation
      results = this.boostRecentlyMentionedResources(results, conversationHistory);

      // NOW filter by the configured threshold (after boosting)
      results = results.filter(r => r.score >= config.resourceSearchThreshold);

      // Re-sort by score
      results = results.sort((a, b) => b.score - a.score);

      // If the top result has a perfect or near-perfect score (0.95+), it's likely the
      // target of a follow-up question. Return ONLY that resource to avoid confusion.
      if (results.length > 0 && results[0].score >= 0.95) {
        console.log(`🎯 Top resource has very high score (${results[0].score.toFixed(3)}), returning only that one`);
        results = [results[0]];
      } else {
        // Otherwise, limit to maxResults
        results = results.slice(0, maxResults);
      }

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
   * Boost scores for resources that were mentioned in recent conversation
   * This ensures follow-up questions like "show it" retrieve the right resource
   */
  private boostRecentlyMentionedResources(
    results: VectorSearchResult[],
    history: ChatMessage[]
  ): VectorSearchResult[] {
    if (history.length === 0) return results;

    // Extract resource URIs mentioned in last 3 messages
    const recentMessages = history.slice(-3);
    const mentionedUris = new Set<string>();
    const mentionedResourceNames = new Set<string>();

    for (const msg of recentMessages) {
      const content = msg.content || '';
      
      // Match res:// URIs
      const uriMatches = content.match(/res:\/\/([\w_]+)/g);
      if (uriMatches) {
        uriMatches.forEach(uri => {
          mentionedUris.add(uri);
          // Also extract the resource ID (e.g., "beginner_strength" from "res://beginner_strength")
          const id = uri.replace('res://', '');
          mentionedResourceNames.add(id);
        });
      }
      
      // Also check for common resource name patterns mentioned in the text
      // Match snake_case identifiers that look like resource IDs
      const resourceIdMatches = content.match(/\b([a-z]+_[a-z_]+)\b/gi);
      if (resourceIdMatches) {
        resourceIdMatches.forEach(id => mentionedResourceNames.add(id.toLowerCase()));
      }
    }

    if (mentionedUris.size === 0 && mentionedResourceNames.size === 0) {
      return results;
    }

    console.log(`🔗 Boosting recently mentioned resources: ${Array.from(mentionedUris).join(', ')}`);
    if (mentionedResourceNames.size > 0) {
      console.log(`   Also matching by name: ${Array.from(mentionedResourceNames).join(', ')}`);
    }

    // Apply score boost to mentioned resources
    return results.map(result => {
      const resourceId = result.uri.replace('res://', '').toLowerCase();
      const shouldBoost = mentionedUris.has(result.uri) || mentionedResourceNames.has(resourceId);
      
      if (shouldBoost) {
        const boostedScore = Math.min(result.score + 0.4, 1.0);  // +0.4 boost, cap at 1.0
        console.log(`  ↑ ${result.uri}: ${result.score.toFixed(3)} → ${boostedScore.toFixed(3)}`);
        return { ...result, score: boostedScore };
      }
      return result;
    });
  }

  /**
   * Enhance query with recent conversation context for better retrieval
   * Helps with follow-up questions that have implicit references
   */
  private enhanceQueryWithContext(
    query: string,
    history: ChatMessage[]
  ): string {
    // Strategy 1: Check if query is a follow-up question
    const followUpIndicators = [
      'can i', 'can you', 'could i', 'could you',
      'what about', 'how about', 'what if',
      'the', 'that', 'this', 'it', 'them', 'those',
      'substitute', 'replace', 'change', 'modify', 'instead',
      'more about', 'tell me', 'show me'
    ];
    
    const queryLower = query.toLowerCase();
    const isFollowUp = followUpIndicators.some(indicator => 
      queryLower.includes(indicator)
    );
    
    if (!isFollowUp || history.length === 0) {
      return query; // No enhancement needed for standalone queries
    }
    
    // Strategy 2: Extract key entities from recent messages
    // Use only last 2 messages (most recent exchange) to avoid old context pollution
    const recentMessages = history.slice(-2); // Last exchange: user query + assistant response
    const contextTerms: string[] = [];
    
    // Process messages in REVERSE order (most recent first) to prioritize recent context
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      if (msg.role === 'user' || msg.role === 'assistant') {
        const content = msg.content || '';
        
        // Extract proper nouns (capitalized multi-word phrases - names, titles, entities)
        const properNounMatches = content.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g);
        if (properNounMatches) {
          contextTerms.push(...properNounMatches);
        }
        
        // Extract resource URIs mentioned (MCP resources)
        const uriMatches = content.match(/res:\/\/(\w+)/g);
        if (uriMatches) {
          // Convert URIs to readable names (e.g., "res://some_resource" → "some resource")
          contextTerms.push(...uriMatches.map(uri => 
            uri.replace('res://', '').replace(/_/g, ' ')
          ));
        }
        
        // Extract quoted text (explicit references)
        const quotedMatches = content.match(/"([^"]+)"/g);
        if (quotedMatches) {
          contextTerms.push(...quotedMatches.map(q => q.replace(/"/g, '')));
        }
      }
    }
    
    // Strategy 3: Combine query with unique context terms
    const uniqueTerms = [...new Set(contextTerms)];
    if (uniqueTerms.length > 0) {
      // Prioritize terms that contain keywords from the user's query
      const queryWords = queryLower.split(/\s+/);
      const relevantTerms = uniqueTerms.filter(term => 
        queryWords.some(word => term.toLowerCase().includes(word))
      );
      
      // If we found relevant terms, use the first one
      // Otherwise, use the first term (most recent)
      const relevantContext = relevantTerms.length > 0 ? relevantTerms[0] : uniqueTerms[0];
      return `${query} ${relevantContext}`;
    }
    
    return query;
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
