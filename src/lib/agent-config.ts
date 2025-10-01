/**
 * Agent Configuration & Feature Flags
 * Allows switching between old and new agent implementations
 */

export interface AgentConfig {
  // Feature flags
  useReActAgent: boolean;          // Use new ReAct-based agent
  useVectorSearch: boolean;        // Use vector-based resource discovery
  enableContextBudgeting: boolean; // Apply token budgeting

  // ReAct settings
  maxReActSteps: number;           // Maximum reasoning steps
  resourceSearchThreshold: number; // Minimum similarity score

  // Context settings
  maxContextTokens: number;
  resourceBudget: number;
  historyBudget: number;

  // Debug settings
  debugMode: boolean;
  logSteps: boolean;
}

// Default configuration
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  // Start with new system enabled
  useReActAgent: true,
  useVectorSearch: true,
  enableContextBudgeting: true,

  // ReAct settings
  maxReActSteps: 5,
  resourceSearchThreshold: 0.6,

  // Context settings
  maxContextTokens: 4096,
  resourceBudget: 1024,
  historyBudget: 512,

  // Debug
  debugMode: true,
  logSteps: true
};

// Configuration manager
class AgentConfigManager {
  private config: AgentConfig = { ...DEFAULT_AGENT_CONFIG };

  get(): AgentConfig {
    return { ...this.config };
  }

  set(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('🔧 Agent config updated:', updates);
  }

  reset(): void {
    this.config = { ...DEFAULT_AGENT_CONFIG };
    console.log('🔄 Agent config reset to defaults');
  }

  toggleReAct(enabled: boolean): void {
    this.config.useReActAgent = enabled;
    console.log(`${enabled ? '✅' : '❌'} ReAct agent ${enabled ? 'enabled' : 'disabled'}`);
  }

  toggleVectorSearch(enabled: boolean): void {
    this.config.useVectorSearch = enabled;
    console.log(`${enabled ? '✅' : '❌'} Vector search ${enabled ? 'enabled' : 'disabled'}`);
  }
}

export const agentConfig = new AgentConfigManager();

// Expose globally for debugging
if (typeof window !== 'undefined') {
  (window as any).agentConfig = agentConfig;
}
