/**
 * Resource Discovery Service
 * 
 * Generic, server-agnostic mechanism for discovering relevant resources
 * based on conversation context and tool results.
 * 
 * This uses a simple embedding-like approach (keyword matching) that can
 * be upgraded to real embeddings (WebLLM, OpenAI, etc.) later.
 */

import type { McpResourceManager, ResourceDescriptor } from './mcp-resource-manager';
import type { ChatMessage } from './llm-client-interface';

export interface DiscoveryOptions {
  topK?: number;
  minScore?: number;
  lookbackMessages?: number;
}

/**
 * Computes a simple text embedding using word frequency
 * This is a placeholder that can be replaced with real embeddings
 */
function computeSimpleEmbedding(text: string): Map<string, number> {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => {
      // Keep words longer than 3 characters
      if (w.length > 3) return true;
      // Keep all-caps acronyms (like MCP, API, SQL)
      const originalWord = text.split(/\s+/).find(orig => orig.toLowerCase() === w);
      if (originalWord && originalWord === originalWord.toUpperCase() && w.length >= 2) return true;
      // Keep important short words
      const importantShort = ['api', 'sql', 'cli', 'mcp', 'llm', 'rag', 'ui', 'ux'];
      if (importantShort.includes(w)) return true;
      return false;
    });
  
  const frequency = new Map<string, number>();
  
  for (const word of words) {
    frequency.set(word, (frequency.get(word) || 0) + 1);
  }
  
  return frequency;
}

/**
 * Compute cosine similarity between two embeddings
 */
function cosineSimilarity(embedding1: Map<string, number>, embedding2: Map<string, number>): number {
  const allWords = new Set([...embedding1.keys(), ...embedding2.keys()]);
  
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;
  
  for (const word of allWords) {
    const val1 = embedding1.get(word) || 0;
    const val2 = embedding2.get(word) || 0;
    
    dotProduct += val1 * val2;
    magnitude1 += val1 * val1;
    magnitude2 += val2 * val2;
  }
  
  if (magnitude1 === 0 || magnitude2 === 0) return 0;
  
  return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
}

/**
 * Extract searchable text from tool results
 */
function extractToolResultText(toolResults: any[]): string {
  const texts: string[] = [];
  
  for (const result of toolResults) {
    if (typeof result === 'string') {
      texts.push(result);
      continue;
    }
    
    if (typeof result === 'object' && result !== null) {
      // Skip error messages and empty result indicators
      // These pollute semantic search with negative context
      if (result.message && (
        result.message.toLowerCase().includes('not found') ||
        result.message.toLowerCase().includes('no ') ||
        result.message.toLowerCase().includes('not available') ||
        result.message.toLowerCase().includes('error')
      )) {
        continue;  // Skip negative results
      }
      
      // Extract common fields
      if (result.name) texts.push(result.name);
      if (result.title) texts.push(result.title);
      if (result.category) texts.push(result.category);
      if (result.description) texts.push(result.description);
      if (result.tags && Array.isArray(result.tags)) {
        texts.push(...result.tags);
      }
      
      // For arrays (e.g., search results)
      if (Array.isArray(result)) {
        texts.push(extractToolResultText(result));
      }
      
      // Nested recipe/program/tutorial objects
      if (result.recipe) texts.push(extractToolResultText([result.recipe]));
      if (result.program) texts.push(extractToolResultText([result.program]));
    }
  }
  
  return texts.join(' ');
}

/**
 * Resource Discovery Service
 * 
 * Discovers relevant resources based on conversation context using
 * semantic similarity (keyword-based, upgradeable to embeddings)
 */
export class ResourceDiscoveryService {
  private resourceEmbeddings = new Map<string, Map<string, number>>();
  
  constructor(private resourceManager: McpResourceManager) {}
  
  /**
   * Pre-compute embeddings for all available resources
   * Called after resources are discovered from MCP server
   */
  async indexResources(): Promise<void> {
    const resources = this.resourceManager.getAvailableResources();
    
    this.resourceEmbeddings.clear();
    
    for (const resource of resources) {
      const text = this.getResourceSearchText(resource);
      const embedding = computeSimpleEmbedding(text);
      this.resourceEmbeddings.set(resource.uri, embedding);
    }
    
    console.log(`📇 Indexed ${this.resourceEmbeddings.size} resources for semantic search`);
  }
  
  /**
   * Discover relevant resources based on conversation + tool results
   * 
   * @param messages - Recent conversation messages
   * @param toolResults - Results from recently executed tools
   * @param options - Discovery options
   * @returns Array of relevant resource URIs
   */
  async discoverRelevantResources(
    messages: ChatMessage[],
    toolResults: any[],
    options: DiscoveryOptions = {}
  ): Promise<string[]> {
    const {
      topK = 2,
      minScore = 0.1,
      lookbackMessages = 3
    } = options;
    
    const allResources = this.resourceManager.getAvailableResources();
    
    if (allResources.length === 0) {
      console.log('📚 No resources available for discovery');
      return [];
    }
    
    // Build search context from recent conversation + tool results
    const searchContext = this.buildSearchContext(messages, toolResults, lookbackMessages);
    
    if (!searchContext.trim()) {
      console.log('⚠️ No search context available');
      return [];
    }
    
    console.log(`🔍 Searching for resources matching: "${searchContext.substring(0, 100)}..."`);
    
    // Compute context embedding
    const contextEmbedding = computeSimpleEmbedding(searchContext);
    
    // Score all resources
    const scoredResources = allResources.map(resource => {
      const resourceEmbedding = this.resourceEmbeddings.get(resource.uri);
      
      if (!resourceEmbedding) {
        // Compute on-the-fly if not indexed
        const text = this.getResourceSearchText(resource);
        const embedding = computeSimpleEmbedding(text);
        this.resourceEmbeddings.set(resource.uri, embedding);
        return {
          uri: resource.uri,
          name: resource.name,
          score: cosineSimilarity(contextEmbedding, embedding)
        };
      }
      
      return {
        uri: resource.uri,
        name: resource.name,
        score: cosineSimilarity(contextEmbedding, resourceEmbedding)
      };
    });
    
    // Filter by minimum score and sort
    const relevant = scoredResources
      .filter(r => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    
    if (relevant.length > 0) {
      console.log('✅ Found relevant resources:');
      relevant.forEach(r => {
        console.log(`   - ${r.name} (score: ${r.score.toFixed(3)})`);
      });
    } else {
      console.log('⚠️ No resources met minimum relevance threshold');
    }
    
    return relevant.map(r => r.uri);
  }
  
  /**
   * Build search context from messages and tool results
   */
  private buildSearchContext(
    messages: ChatMessage[],
    toolResults: any[],
    lookbackMessages: number
  ): string {
    const parts: string[] = [];
    
    // Get recent user messages (high weight)
    const recentMessages = messages
      .filter(m => m.role === 'user')
      .slice(-lookbackMessages)
      .map(m => m.content)
      .join(' ');
    
    if (recentMessages) {
      parts.push(recentMessages);
    }
    
    // Extract text from tool results (medium weight)
    if (toolResults.length > 0) {
      const toolText = extractToolResultText(toolResults);
      if (toolText) {
        parts.push(toolText);
      }
    }
    
    return parts.join(' ');
  }
  
  /**
   * Get searchable text from resource descriptor
   */
  private getResourceSearchText(resource: ResourceDescriptor): string {
    const parts: string[] = [
      resource.name,
      resource.description || '',
      resource.mimeType || ''
    ];
    
    // Extract from URI (e.g., "vegan_pasta_primavera" -> "vegan pasta primavera")
    if (resource.uri) {
      const uriText = resource.uri
        .replace(/^res:\/\//, '')
        .replace(/_/g, ' ')
        .replace(/-/g, ' ');
      parts.push(uriText);
    }
    
    return parts.join(' ');
  }
  
  /**
   * Check if tool results suggest resource loading
   * (e.g., search results with resource URIs)
   */
  hasResourceReferences(toolResults: any[]): boolean {
    for (const result of toolResults) {
      if (typeof result === 'object' && result !== null) {
        // Check for resource_uri field
        if (result.resource_uri) return true;
        
        // Check for arrays with resource_uri
        if (Array.isArray(result)) {
          for (const item of result) {
            if (item && item.resource_uri) return true;
          }
        }
      }
    }
    
    return false;
  }
  
  /**
   * Extract resource URIs directly mentioned in tool results
   * (e.g., from search_recipes_semantic results)
   */
  extractReferencedResources(toolResults: any[]): string[] {
    const uris: string[] = [];
    
    for (const result of toolResults) {
      if (typeof result === 'object' && result !== null) {
        // Single result with resource_uri
        if (result.resource_uri && typeof result.resource_uri === 'string') {
          uris.push(result.resource_uri);
        }
        
        // Array of results with resource_uri
        if (Array.isArray(result)) {
          for (const item of result) {
            if (item && item.resource_uri && typeof item.resource_uri === 'string') {
              uris.push(item.resource_uri);
            }
          }
        }
      }
    }
    
    return uris;
  }
}

