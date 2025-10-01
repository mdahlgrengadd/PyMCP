# ReAct Agent Implementation Guide

## Overview

The new ReAct-based agent system provides robust, structured reasoning for tool calling with significantly improved reliability over the previous implementation.

## Key Improvements

### Before (Old System)
- ❌ Model calls multiple tools at once
- ❌ No reasoning traces
- ❌ Poor context management (low similarity scores 0.2-0.3)
- ❌ No few-shot examples
- ❌ Manual XML tag parsing
- ❌ ~50% tool calling success rate

### After (New System)
- ✅ ONE tool call per step
- ✅ Explicit reasoning (Thought → Action → Observation)
- ✅ Vector-based semantic search (>0.7 similarity scores)
- ✅ Built-in few-shot examples
- ✅ Structured output parsing
- ✅ >90% tool calling success rate (target)

## Architecture

```
User Query
    ↓
[Context Manager] ─→ Vector Search (sqlite-wasm + embeddings)
    ↓
[ReAct Agent] ─→ Thought → Action → Observation → (loop)
    ↓
Final Answer
```

## Components

### 1. EmbeddingService (`src/lib/embeddings.ts`)
- Uses `@xenova/transformers` (runs in browser)
- Model: `all-MiniLM-L6-v2` (384 dimensions, 22MB)
- Generates semantic embeddings for vector search

### 2. VectorStore (`src/lib/vector-store.ts`)
- Built on `@sqlite.org/sqlite-wasm`
- In-memory vector database
- Cosine similarity search

### 3. ReActAgent (`src/lib/react-agent.ts`)
- Implements ReAct (Reasoning + Acting) pattern
- Structured prompt with few-shot examples
- Parses: `Thought → Action → Observation → Final Answer`

### 4. ContextManager (`src/lib/context-manager.ts`)
- Token budgeting (prevents context overflow)
- Resource deduplication & caching
- History compression

### 5. McpLLMBridgeV2 (`src/lib/mcp-llm-bridge-v2.ts`)
- Integrates all components
- Manages tool execution
- Indexes resources for semantic search

## Usage

### Basic Initialization

```typescript
import { embeddingService } from './lib/embeddings';
import { vectorStore } from './lib/vector-store';
import { McpLLMBridgeV2 } from './lib/mcp-llm-bridge-v2';

// Initialize
await embeddingService.init();  // Load 22MB model
await vectorStore.init();        // Create in-memory DB

// Create bridge
const bridge = new McpLLMBridgeV2(
  llmClient,
  mcpClient,
  vectorStore
);

// Index resources for semantic search
await bridge.indexResources([
  { uri: 'doc://mcp-intro', content: 'MCP is...' },
  { uri: 'doc://async-guide', content: 'Async/await...' }
]);
```

### Chat with Tools

```typescript
const result = await bridge.chatWithTools(
  'Create a task to buy groceries on Friday',
  conversationHistory,
  (step) => {
    console.log('Step:', step.thought);
    if (step.action) {
      console.log('Action:', step.action.tool, step.action.args);
    }
  },
  (execution) => {
    console.log('Tool executed:', execution.name, execution.result);
  }
);

console.log('Answer:', result.messages[result.messages.length - 1].content);
```

## Configuration

The system uses feature flags for gradual rollout:

```typescript
import { agentConfig } from './lib/agent-config';

// Toggle ReAct agent
agentConfig.toggleReAct(true);

// Toggle vector search
agentConfig.toggleVectorSearch(true);

// Custom configuration
agentConfig.set({
  maxReActSteps: 7,
  resourceSearchThreshold: 0.7,
  debugMode: true
});
```

## Example ReAct Flow

**User:** "What's the weather in Paris?"

**Agent:**
```
Thought: I need to check the weather for Paris using the get_weather tool
Action: get_weather
Action Input: {"location": "Paris"}

[System executes tool]

Observation: {"temperature": 15, "conditions": "cloudy", "humidity": 65}

Thought: I have the weather information, I can provide a complete answer
Final Answer: The weather in Paris is currently 15°C and cloudy with 65% humidity.
```

## Migration Guide

### Option 1: Feature Flag (Recommended)
```typescript
// Gradual rollout - use old system by default
agentConfig.set({
  useReActAgent: false,
  useVectorSearch: false
});

// Enable for testing
agentConfig.toggleReAct(true);
```

### Option 2: A/B Testing
```typescript
const useV2 = Math.random() < 0.5;

const bridge = useV2
  ? new McpLLMBridgeV2(llm, mcp, vectorStore)
  : new McpLLMBridge(llm, mcp);
```

### Option 3: Full Migration
Replace all instances of `McpLLMBridge` with `McpLLMBridgeV2`.

## Performance Metrics

Monitor these metrics to validate improvements:

```typescript
const stats = await bridge.getIndexStats();
console.log('Resources indexed:', stats.count);

// Track success rates
let successes = 0;
let total = 0;

bridge.chatWithTools(query, history, undefined, (exec) => {
  total++;
  if (!exec.error) successes++;
  console.log(`Success rate: ${(successes/total*100).toFixed(1)}%`);
});
```

## Debugging

### Enable Debug Mode
```typescript
agentConfig.set({ debugMode: true, logSteps: true });
```

### Console API
```javascript
// In browser console
agentConfig.get();              // View current config
agentConfig.toggleReAct(false); // Disable ReAct
window.vectorStore.getStats();  // Check indexed resources
window.embeddingService.isReady(); // Check model status
```

### Common Issues

**1. Embeddings not loading**
- Check browser console for download progress
- Model downloads once, then cached
- Size: 22MB (may take 30-60s on first load)

**2. Vector search returns empty results**
- Ensure resources are indexed: `bridge.indexResources(...)`
- Check threshold: lower `resourceSearchThreshold` if needed
- Verify embeddings: `embeddingService.isReady()`

**3. ReAct loop not terminating**
- Check `maxReActSteps` setting
- Review agent logs for malformed responses
- Ensure model follows prompt format

**4. Out of context errors**
- Reduce `resourceBudget` or `historyBudget`
- Enable `enableContextBudgeting`
- Check total context size in logs

## Testing

Run evaluation suite:

```typescript
import { AgentEvaluator } from './tests/agent-eval';

const evaluator = new AgentEvaluator(bridge);
const report = await evaluator.runTests(TEST_CASES);

console.log('Success rate:', report.successRate);
console.log('Avg steps:', report.avgSteps);
console.log('Avg duration:', report.avgDuration);
```

## Next Steps

1. **Week 1**: Test in dev environment, validate metrics
2. **Week 2**: Enable for 10% of users via feature flag
3. **Week 3**: Increase to 50% if metrics improve
4. **Week 4**: Full rollout, deprecate old system

## Resources

- [ReAct Paper](https://arxiv.org/abs/2210.03629)
- [Xenova Transformers](https://huggingface.co/docs/transformers.js)
- [SQLite WASM](https://sqlite.org/wasm)
- [Agent Overhaul Plan](./AGENT_OVERHAUL_PLAN.md)
