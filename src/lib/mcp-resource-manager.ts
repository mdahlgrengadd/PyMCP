import type { PyodideMcpClient } from './mcp-pyodide-client';

export interface ResourceDescriptor {
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
}

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  data?: string; // base64 for binary
  description?: string;
}

export interface PromptDescriptor {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface PromptTemplate {
  name: string;
  description?: string;
  messages?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  template?: string; // Jinja2 template
  format?: 'messages' | 'jinja2';
}

/**
 * Manages MCP Resources and Prompts for context augmentation
 */
export class McpResourceManager {
  private availableResources: ResourceDescriptor[] = [];
  private availablePrompts: PromptDescriptor[] = [];
  private loadedResourceCache = new Map<string, ResourceContent>();

  constructor(private mcpClient: PyodideMcpClient) {}

  /**
   * Discover all available resources from MCP server
   */
  async discoverResources(): Promise<ResourceDescriptor[]> {
    try {
      const result = await this.mcpClient.call('resources/list');
      this.availableResources = result.resources || [];
      return this.availableResources;
    } catch (error: any) {
      console.warn('Failed to list resources:', error);
      return [];
    }
  }

  /**
   * Discover all available prompt templates from MCP server
   */
  async discoverPrompts(): Promise<PromptDescriptor[]> {
    try {
      const result = await this.mcpClient.call('prompts/list');
      this.availablePrompts = result.prompts || [];
      return this.availablePrompts;
    } catch (error: any) {
      console.warn('Failed to list prompts:', error);
      return [];
    }
  }

  /**
   * Load a specific resource by URI
   */
  async loadResource(uri: string): Promise<ResourceContent | null> {
    // Check cache first
    if (this.loadedResourceCache.has(uri)) {
      return this.loadedResourceCache.get(uri)!;
    }

    try {
      const result = await this.mcpClient.call('resources/read', { uri });
      
      if (result.contents && result.contents.length > 0) {
        const content = result.contents[0];
        this.loadedResourceCache.set(uri, content);
        return content;
      }
      
      return null;
    } catch (error: any) {
      console.error(`Failed to load resource ${uri}:`, error);
      return null;
    }
  }

  /**
   * Load multiple resources at once
   */
  async loadResources(uris: string[]): Promise<ResourceContent[]> {
    const results = await Promise.all(
      uris.map(uri => this.loadResource(uri))
    );
    return results.filter((r): r is ResourceContent => r !== null);
  }

  /**
   * Get a prompt template
   */
  async getPrompt(name: string, args?: Record<string, any>): Promise<PromptTemplate | null> {
    try {
      const result = await this.mcpClient.call('prompts/get', { name, arguments: args });
      
      if (result.prompt) {
        return result.prompt as PromptTemplate;
      }
      
      return null;
    } catch (error: any) {
      console.error(`Failed to get prompt ${name}:`, error);
      return null;
    }
  }

  /**
   * Build context string from resources for injection into system prompt
   */
  buildResourceContext(resources: ResourceContent[]): string {
    if (resources.length === 0) return '';

    const contextParts = resources.map(resource => {
      const header = `<resource uri="${resource.uri}" type="${resource.mimeType}">`;
      const footer = '</resource>';
      
      if (resource.text) {
        return `${header}\n${resource.text}\n${footer}`;
      } else if (resource.data) {
        return `${header}\n[Binary data: ${resource.mimeType}]\n${footer}`;
      }
      
      return '';
    }).filter(Boolean);

    if (contextParts.length === 0) return '';

    return `
## Available Context Resources

The following resources have been provided for context. Reference them when relevant to the user's query:

${contextParts.join('\n\n')}

---

`;
  }

  /**
   * Build system prompt from prompt template
   */
  buildPromptFromTemplate(template: PromptTemplate): string {
    if (template.messages) {
      // Extract system messages
      const systemMessages = template.messages
        .filter(m => m.role === 'system')
        .map(m => m.content)
        .join('\n\n');
      return systemMessages;
    } else if (template.template) {
      // Simple template (Jinja2 would need a parser, so we'll use simple string for now)
      return template.template;
    }
    
    return template.description || '';
  }

  /**
   * Get list of available resources
   */
  getAvailableResources(): ResourceDescriptor[] {
    return this.availableResources;
  }

  /**
   * Get list of available prompts
   */
  getAvailablePrompts(): PromptDescriptor[] {
    return this.availablePrompts;
  }

  /**
   * Clear resource cache
   */
  clearCache(): void {
    this.loadedResourceCache.clear();
  }
}

