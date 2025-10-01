# Comprehensive Agent Loop Overhaul Plan

## Current Problems Identified

### 1. **Tool Calling Failures**
- Model calls multiple tools at once (5 tools in one response)
- Model doesn't understand to call ONE tool at a time
- No reasoning traces before tool calls
- Missing structured examples showing correct behavior

### 2. **Context Management Issues**
- Resources injected every turn based on semantic search
- Same resource (`mcp_protocol`) keeps getting injected even when irrelevant
- No deduplication or context budget management
- Conversation history grows unbounded
- Model loses track of what it's doing across turns

### 3. **Resource Discovery Problems**
- Semantic search returns same resource repeatedly (score: 0.293, 0.276, 0.247)
- Low similarity scores indicate poor matching
- Uses simple cosine similarity without normalization
- No caching or intelligent re-ranking

### 4. **Missing Agent Reasoning**
- No ReAct-style Thought → Action → Observation loop
- Model jumps straight to actions without planning
- No self-reflection or error recovery
- Can't track progress toward goals

### 5. **Prompt Engineering Weaknesses**
- No few-shot examples of correct tool usage
- System prompt rebuilt every turn (wasteful)
- No explicit reasoning instructions
- Missing output format constraints

---

## Proposed Architecture: RAG-Enhanced ReAct Agent

### **Phase 1: Vector Database Foundation**

#### 1.1 Integrate sqlite-vec
```typescript
// src/lib/vector-store.ts
import initSqlite from '@sqlite.org/sqlite-wasm';
import { sqliteVec } from 'sqlite-vec';

class VectorStore {
  private db: any;

  async init() {
    const sqlite = await initSqlite();
    this.db = new sqlite.oo1.DB(':memory:');

    // Load sqlite-vec extension
    this.db.loadExtension(sqliteVec);

    // Create vector tables
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS resource_embeddings
      USING vec0(
        resource_uri TEXT PRIMARY KEY,
        embedding FLOAT[384],  -- Use smaller models for browser
        metadata TEXT
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS conversation_memory
      USING vec0(
        turn_id INTEGER PRIMARY KEY,
        embedding FLOAT[384],
        content TEXT,
        timestamp INTEGER
      );
    `);
  }

  async addResource(uri: string, text: string, embedding: Float32Array) {
    this.db.run(
      `INSERT OR REPLACE INTO resource_embeddings VALUES (?, ?, ?)`,
      [uri, embedding, JSON.stringify({ text, indexed_at: Date.now() })]
    );
  }

  async search(queryEmbedding: Float32Array, limit = 3, threshold = 0.7) {
    const results = this.db.exec(`
      SELECT resource_uri,
             distance AS score,
             metadata
      FROM resource_embeddings
      WHERE vec_distance_cosine(embedding, ?) < ?
      ORDER BY score ASC
      LIMIT ?
    `, [queryEmbedding, 1 - threshold, limit]);

    return results.map(r => ({
      uri: r[0],
      score: 1 - r[1], // Convert distance to similarity
      metadata: JSON.parse(r[2])
    }));
  }
}
```

#### 1.2 Browser-Native Embeddings
```typescript
// src/lib/embeddings.ts
import { pipeline } from '@xenova/transformers';

class EmbeddingService {
  private model: any;

  async init() {
    // Use lightweight model that runs in browser
    this.model = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2', // 384 dimensions, 22MB
      { quantized: true }
    );
  }

  async embed(text: string): Promise<Float32Array> {
    const output = await this.model(text, {
      pooling: 'mean',
      normalize: true
    });
    return output.data;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
}
```

---

### **Phase 2: ReAct-Style Agent Loop**

#### 2.1 Core ReAct Pattern
```typescript
// src/lib/react-agent.ts
interface ReActStep {
  thought: string;    // Reasoning trace
  action?: {          // Tool to call
    tool: string;
    args: any;
  };
  observation?: string; // Tool result
  answer?: string;    // Final answer
}

class ReActAgent {
  async run(
    userQuery: string,
    tools: Tool[],
    context: ConversationContext,
    maxSteps = 5
  ): Promise<string> {
    const steps: ReActStep[] = [];

    for (let i = 0; i < maxSteps; i++) {
      // Build prompt with ReAct format
      const prompt = this.buildReActPrompt(userQuery, tools, steps, context);

      // Get LLM response
      const response = await this.llm.chat(prompt);

      // Parse structured output
      const step = this.parseReActResponse(response);
      steps.push(step);

      // Check if we have final answer
      if (step.answer) {
        return step.answer;
      }

      // Execute action if present
      if (step.action) {
        const result = await this.executeAction(step.action);
        step.observation = JSON.stringify(result, null, 2);
      } else {
        // No action = agent is confused, need to intervene
        step.observation = "ERROR: You must either provide an Action or a Final Answer.";
      }
    }

    return "I apologize, but I couldn't complete the task within the step limit.";
  }

  private buildReActPrompt(
    query: string,
    tools: Tool[],
    steps: ReActStep[],
    context: ConversationContext
  ): string {
    return `You are a helpful assistant that uses tools to answer questions.

## Available Tools:
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

## Instructions:
You must respond in this EXACT format:

Thought: [your reasoning about what to do next]
Action: [tool_name]
Action Input: {"param": "value"}

After I give you the Observation, repeat the cycle.
When you have enough information, respond with:

Thought: [final reasoning]
Final Answer: [your response to the user]

## Few-Shot Examples:
${this.getFewShotExamples()}

## Context:
${context.relevantResources.map(r => r.content).join('\n\n')}

## Question: ${query}

## Previous Steps:
${this.formatSteps(steps)}

Begin!`;
  }

  private getFewShotExamples(): string {
    return `
Example 1:
Question: What's the weather in Paris?
Thought: I need to use the get_weather tool to find Paris weather
Action: get_weather
Action Input: {"location": "Paris"}
Observation: {"temp": 15, "conditions": "cloudy"}
Thought: I have the weather information, I can answer now
Final Answer: The weather in Paris is 15°C and cloudy.

Example 2:
Question: Create a task to buy groceries Friday
Thought: I should use create_task to make a new task
Action: create_task
Action Input: {"title": "Buy groceries", "due_date": "Friday"}
Observation: {"id": 1, "title": "Buy groceries", "due_date": "Friday"}
Thought: Task created successfully
Final Answer: I created a task "Buy groceries" for Friday (ID: 1).
`;
  }
}
```

#### 2.2 Structured Output Parsing
```typescript
function parseReActResponse(response: string): ReActStep {
  const thoughtMatch = response.match(/Thought:\s*(.+?)(?=\n|$)/);
  const actionMatch = response.match(/Action:\s*(.+?)(?=\n|$)/);
  const inputMatch = response.match(/Action Input:\s*(\{.+?\})/s);
  const answerMatch = response.match(/Final Answer:\s*(.+?)(?=\n|$)/s);

  const step: ReActStep = {
    thought: thoughtMatch?.[1]?.trim() || ''
  };

  if (answerMatch) {
    step.answer = answerMatch[1].trim();
  } else if (actionMatch && inputMatch) {
    step.action = {
      tool: actionMatch[1].trim(),
      args: JSON.parse(inputMatch[1])
    };
  }

  return step;
}
```

---

### **Phase 3: Intelligent Context Management**

#### 3.1 Context Window Budgeting
```typescript
class ContextManager {
  private readonly MAX_TOKENS = 4096; // Adjust based on model
  private readonly SYSTEM_BUDGET = 1024;
  private readonly TOOLS_BUDGET = 512;
  private readonly HISTORY_BUDGET = 1024;
  private readonly RESOURCES_BUDGET = 1024;
  private readonly RESPONSE_BUDGET = 512;

  async buildContext(
    userQuery: string,
    tools: Tool[],
    history: Message[],
    vectorStore: VectorStore
  ): Promise<ConversationContext> {
    // 1. Search for relevant resources
    const queryEmbedding = await this.embeddings.embed(userQuery);
    const candidates = await vectorStore.search(queryEmbedding, limit=10);

    // 2. Deduplicate and re-rank
    const uniqueResources = this.deduplicateResources(candidates);
    const rankedResources = await this.rerank(uniqueResources, userQuery);

    // 3. Budget allocation
    const selectedResources = this.selectResourcesByBudget(
      rankedResources,
      this.RESOURCES_BUDGET
    );

    // 4. Compress history
    const compressedHistory = this.compressHistory(
      history,
      this.HISTORY_BUDGET
    );

    return {
      relevantResources: selectedResources,
      conversationHistory: compressedHistory,
      tools: this.selectTools(tools, userQuery)
    };
  }

  private deduplicateResources(candidates: Resource[]): Resource[] {
    const seen = new Set<string>();
    return candidates.filter(r => {
      if (seen.has(r.uri)) return false;
      seen.add(r.uri);
      return true;
    });
  }

  private async rerank(
    resources: Resource[],
    query: string
  ): Promise<Resource[]> {
    // Use cross-encoder or BM25 for re-ranking
    // For now, simple relevance scoring
    return resources.sort((a, b) => {
      const aScore = this.relevanceScore(a, query);
      const bScore = this.relevanceScore(b, query);
      return bScore - aScore;
    });
  }

  private compressHistory(
    history: Message[],
    budget: number
  ): Message[] {
    // Keep most recent messages + important context
    const important = history.filter(m =>
      m.role === 'tool' || m.content.includes('Final Answer')
    );

    const recent = history.slice(-5);
    const combined = [...new Set([...important, ...recent])];

    // Truncate if over budget
    const tokens = this.countTokens(combined);
    if (tokens > budget) {
      return this.truncateToFit(combined, budget);
    }

    return combined;
  }
}
```

#### 3.2 Resource Caching
```typescript
class ResourceCache {
  private cache = new Map<string, {content: string, embedding: Float32Array, timestamp: number}>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  async get(uri: string): Promise<string | null> {
    const entry = this.cache.get(uri);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(uri);
      return null;
    }

    return entry.content;
  }

  set(uri: string, content: string, embedding: Float32Array) {
    this.cache.set(uri, {
      content,
      embedding,
      timestamp: Date.now()
    });
  }
}
```

---

### **Phase 4: Robust Error Handling & Recovery**

```typescript
class AgentExecutor {
  async executeWithRecovery(
    action: Action,
    maxRetries = 2
  ): Promise<string> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.mcp.call(action.tool, action.args);
        return JSON.stringify(result, null, 2);
      } catch (error) {
        if (attempt === maxRetries) {
          return `ERROR after ${maxRetries + 1} attempts: ${error.message}`;
        }

        // Try to auto-fix common issues
        if (error.message.includes('missing required parameter')) {
          action.args = this.addDefaultParams(action.tool, action.args);
        } else if (error.message.includes('invalid format')) {
          action.args = this.cleanParams(action.args);
        }
      }
    }

    return 'ERROR: Failed to execute action';
  }
}
```

---

### **Phase 5: Evaluation Framework**

```typescript
// src/tests/agent-eval.ts
interface TestCase {
  query: string;
  expectedActions: string[];
  expectedAnswer: RegExp;
  maxSteps: number;
}

const TEST_CASES: TestCase[] = [
  {
    query: "What's the weather in Tokyo?",
    expectedActions: ['get_weather'],
    expectedAnswer: /Tokyo.*weather/i,
    maxSteps: 2
  },
  {
    query: "Create a task to call mom on Sunday",
    expectedActions: ['create_task'],
    expectedAnswer: /task.*created/i,
    maxSteps: 2
  },
  {
    query: "List my tasks then tell me about async/await",
    expectedActions: ['list_tasks', 'find_tutorial'],
    expectedAnswer: /tasks.*async/is,
    maxSteps: 4
  }
];

class AgentEvaluator {
  async runTests(testCases: TestCase[]): Promise<Report> {
    const results = [];

    for (const test of testCases) {
      const start = Date.now();
      const result = await this.agent.run(test.query);
      const duration = Date.now() - start;

      const passed = {
        correctActions: this.checkActions(result.steps, test.expectedActions),
        correctAnswer: test.expectedAnswer.test(result.answer),
        withinStepLimit: result.steps.length <= test.maxSteps
      };

      results.push({
        test: test.query,
        passed: Object.values(passed).every(Boolean),
        details: passed,
        duration,
        steps: result.steps.length
      });
    }

    return this.generateReport(results);
  }
}
```

---

## Implementation Roadmap

### Week 1: Foundation
- [ ] Integrate sqlite-vec WASM build
- [ ] Setup Xenova/transformers for embeddings
- [ ] Create VectorStore class with proper schema
- [ ] Index all existing resources with embeddings

### Week 2: ReAct Loop
- [ ] Implement ReActAgent with structured parsing
- [ ] Add few-shot examples to system prompt
- [ ] Create Thought/Action/Observation formatter
- [ ] Test with simple single-tool scenarios

### Week 3: Context Management
- [ ] Build ContextManager with token budgeting
- [ ] Implement resource deduplication + re-ranking
- [ ] Add conversation history compression
- [ ] Cache frequently accessed resources

### Week 4: Polish & Evaluation
- [ ] Add error recovery mechanisms
- [ ] Create comprehensive test suite
- [ ] Measure: success rate, steps, tokens, latency
- [ ] Tune thresholds and prompts based on results

---

## Expected Improvements

| Metric | Current | Target |
|--------|---------|--------|
| Tool call success rate | ~50% | >90% |
| Avg steps per query | 3-5 (with failures) | 2-3 |
| Context relevance | Low (0.2-0.3 scores) | High (>0.7) |
| Response quality | Inconsistent | Consistent |
| Multi-turn coherence | Poor | Good |

---

## Key Design Principles

1. **Local-First**: Everything runs in browser (WASM, IndexedDB)
2. **Explicit Reasoning**: ReAct forces model to think before acting
3. **Budget-Conscious**: Never exceed context window limits
4. **Fail-Safe**: Graceful degradation with error recovery
5. **Measurable**: Comprehensive metrics and evaluation
6. **Few-Shot Examples**: Show, don't just tell
7. **One Action Per Turn**: Enforced by prompt structure

---

## Migration Strategy

1. Keep existing system running
2. Build new system alongside in parallel
3. A/B test with evaluation suite
4. Gradually migrate once metrics prove superiority
5. Maintain backward compatibility during transition
