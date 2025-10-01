# Decoupled Resource Discovery Architecture

## Overview

This document explains the **generic, server-agnostic** resource discovery system that automatically enriches LLM context with relevant resources based on conversation and tool execution results.

## The Problem

When an LLM uses tools (e.g., `search_recipes_semantic`), the tool may return references to detailed content (e.g., recipes, tutorials, documentation). However, the LLM only sees the search results, not the full content.

**Example:**
```
User: "Show me vegan pasta ingredients"

Tool Result: [{ name: "Vegan Pasta Primavera", resource_uri: "res://vegan_pasta_primavera" }]

LLM Response: *hallucinates ingredients because it doesn't have the actual recipe*
```

## The Solution: Decoupled Context Enrichment

### Key Principle: **Zero Coupling**

- ✅ **MCP Bridge** doesn't know about specific servers (Chef, Fitness, etc.)
- ✅ **MCP Servers** don't know about the bridge
- ✅ **Generic mechanism** works for any server automatically

### Two-Strategy Approach

The bridge uses **two complementary strategies** to discover relevant resources:

#### Strategy 1: Explicit References
```typescript
// If tool results contain "resource_uri" fields, load them automatically
{
  "name": "Vegan Pasta Primavera",
  "resource_uri": "res://vegan_pasta_primavera",  // ⭐ Explicit reference
  "relevance_score": 0.95
}
```

#### Strategy 2: Semantic Discovery
```typescript
// Use embeddings to find resources similar to conversation + tool results
const context = buildSearchContext(messages, toolResults);
const contextEmbedding = computeEmbedding(context);

for (const resource of allResources) {
  const resourceEmbedding = computeEmbedding(resource.name + resource.description);
  const similarity = cosineSimilarity(contextEmbedding, resourceEmbedding);
  // Load resources with highest similarity
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      McpLLMBridge                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  1. Tool Execution Loop                               │  │
│  │     - Execute tools                                   │  │
│  │     - Accumulate results                              │  │
│  │                                                        │  │
│  │  2. enrichContextFromTools() [GENERIC]                │  │
│  │     ┌─────────────────────────────────────────────┐   │  │
│  │     │ Strategy 1: Extract Explicit References    │   │  │
│  │     │   - Look for "resource_uri" fields         │   │  │
│  │     │   - Server-agnostic pattern matching       │   │  │
│  │     └─────────────────────────────────────────────┘   │  │
│  │     ┌─────────────────────────────────────────────┐   │  │
│  │     │ Strategy 2: Semantic Discovery             │   │  │
│  │     │   - Compute context embedding              │   │  │
│  │     │   - Search ALL available resources         │   │  │
│  │     │   - Return top-K by similarity             │   │  │
│  │     └─────────────────────────────────────────────┘   │  │
│  │                                                        │  │
│  │  3. Load & Inject Resources                           │  │
│  │     - resourceManager.loadResources()                 │  │
│  │     - Inject into system message                      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              ResourceDiscoveryService                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ • extractReferencedResources(toolResults)             │  │
│  │   → Find "resource_uri" fields in results             │  │
│  │                                                        │  │
│  │ • discoverRelevantResources(messages, toolResults)    │  │
│  │   → Semantic search across all resources              │  │
│  │                                                        │  │
│  │ • indexResources()                                    │  │
│  │   → Pre-compute resource embeddings                   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              McpResourceManager                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ • discoverResources() → List available resources      │  │
│  │ • loadResource(uri) → Load resource content           │  │
│  │ • buildResourceContext() → Format for LLM            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## How It Works (Example Flow)

### User Query: "How do I make vegan pasta?"

```typescript
// 1. LLM calls tool
{
  tool: "search_recipes_semantic",
  args: { query: "vegan pasta", top_k: 3 }
}

// 2. Tool returns (from Chef server, no coupling!)
[
  {
    name: "Vegan Pasta Primavera",
    resource_uri: "res://vegan_pasta_primavera",  // ⭐ Key!
    category: "Italian",
    difficulty: "easy",
    relevance_score: 0.95
  }
]

// 3. Bridge detects resource_uri (Strategy 1)
const explicitRefs = extractReferencedResources(toolResults);
// → ["res://vegan_pasta_primavera"]

// 4. Bridge also searches semantically (Strategy 2)
const context = "vegan pasta Italian easy"; // From messages + tool results
const discoveredRefs = discoverRelevantResources(context);
// → ["res://vegan_pasta_primavera", "res://vegan_alfredo"] (top-2 similar)

// 5. Load full resource content
const resources = await loadResources([
  "res://vegan_pasta_primavera",
  "res://vegan_alfredo"
]);

// 6. Inject into system message
messages[0].content = `
<resource uri="res://vegan_pasta_primavera" type="application/json">
{
  "name": "Vegan Pasta Primavera",
  "ingredients": [
    "8 oz spaghetti",
    "2 tbsp olive oil",
    "2 cloves garlic, minced",
    "1 red bell pepper, diced",
    "1 zucchini, diced",
    ...
  ],
  "instructions": [
    "Cook pasta according to package directions",
    "Heat olive oil in large skillet",
    ...
  ]
}
</resource>

... (original system prompt)
`;

// 7. LLM now has FULL recipe and can guide user properly! ✅
```

## Server-Side Pattern (No Coupling Required!)

### Option A: Return resource_uri (Recommended)

```python
# chef_server.py - NO knowledge of bridge required!

def search_recipes_semantic(self, query: str, top_k: int = 3) -> list[dict]:
    """Search recipes"""
    
    results = []
    for recipe_id, score in similarities[:top_k]:
        results.append({
            "name": recipe['name'],
            "resource_uri": f"res://{recipe_id}",  # ⭐ This is all you need!
            "category": recipe['category'],
            "relevance_score": score
        })
    
    return results

# The bridge automatically detects and loads res://... URIs
```

### Option B: Return Any Structured Data (Also works!)

```python
# fitness_server.py - Different pattern, still decoupled!

def find_workouts(self, goal: str) -> list[dict]:
    """Find workout programs"""
    
    return [
        {
            "name": "Strength Training Beginner",
            "goal": "strength",
            "duration_weeks": 12
            # NO resource_uri, but bridge will use semantic search!
        }
    ]

# Bridge uses embeddings to find "res://strength_training_beginner"
# based on tool result content
```

## Key Benefits

### 1. **Zero Coupling**
```typescript
// Bridge doesn't know about Chef, Fitness, or any specific server
// It just:
// 1. Looks for "resource_uri" patterns (generic)
// 2. Does semantic search (generic)
// 3. Loads resources (generic)
```

### 2. **Works with Any Server**
```python
# Add a new "Travel Guide" server:

def search_destinations(self, query: str) -> list[dict]:
    return [
        {
            "name": "Paris Travel Guide",
            "resource_uri": "res://paris_guide"  # Auto-loaded by bridge!
        }
    ]

# NO bridge changes needed! ✅
```

### 3. **Flexible Resource Matching**

The system works even if:
- Server returns `resource_uri` → Loads explicitly
- Server doesn't return `resource_uri` → Semantic search finds it
- Multiple resources match → Loads top-K most relevant
- No resources match → Continues normally

### 4. **Automatic Context Enrichment**

```typescript
// User never has to manually select resources
// Bridge automatically discovers and loads relevant ones
// Based on conversation flow and tool execution results
```

## Embedding Strategy (Upgradeable)

### Current: Simple Keyword Matching
```typescript
// Lightweight, runs in browser, no external dependencies
function computeSimpleEmbedding(text: string): Map<string, number> {
  // Word frequency vectors
  // Cosine similarity for matching
}
```

### Future: Real Embeddings
```typescript
// Can be upgraded to:
// - WebLLM embeddings (Nomic, BGE models)
// - OpenAI embeddings
// - Local transformer.js embeddings

class RealEmbeddingStrategy {
  async computeEmbedding(text: string): Promise<number[]> {
    return await this.model.encode(text);
  }
}

// Just swap the strategy, no other changes needed!
```

## Configuration Options

```typescript
// In McpLLMBridge

await this.enrichContextFromTools(messages, toolResults, {
  // Strategy 1: Explicit references
  extractExplicitRefs: true,
  explicitRefPattern: /resource_uri|res:|uri:/,
  
  // Strategy 2: Semantic discovery
  enableSemanticSearch: true,
  topK: 2,                    // Load top-2 most similar
  minScore: 0.15,             // Minimum similarity threshold
  
  // Context management
  maxResourcesPerTurn: 3,     // Don't overload context
  cacheLoadedResources: true  // Cache for performance
});
```

## Performance Considerations

### Indexing
```typescript
// Resources are indexed once after discovery
await bridge.resourceDiscovery.indexResources();
// Pre-computes embeddings for all resources

// Then lookups are O(n) where n = # resources (typically < 100)
// Very fast even with keyword-based embeddings
```

### Caching
```typescript
// Resource content is cached after first load
resourceManager.loadResource("res://recipe_1"); // Loads from server
resourceManager.loadResource("res://recipe_1"); // Returns from cache
```

### Lazy Loading
```typescript
// Resources only loaded when:
// 1. Explicitly referenced in tool results, OR
// 2. Semantically similar to conversation

// Not all resources loaded at once
```

## Testing & Validation

### Test Case 1: Explicit References
```typescript
const toolResults = [
  { name: "Recipe A", resource_uri: "res://recipe_a" }
];

const refs = extractReferencedResources(toolResults);
assert(refs.includes("res://recipe_a")); // ✅
```

### Test Case 2: Semantic Discovery
```typescript
const messages = [
  { role: "user", content: "vegan pasta recipe" }
];
const toolResults = [
  { name: "Vegan Pasta", category: "Italian" }
];

const refs = await discoverRelevantResources(messages, toolResults);
assert(refs.includes("res://vegan_pasta_primavera")); // ✅
```

### Test Case 3: No Coupling
```typescript
// Add new server with different schema
const newServerResults = [
  { title: "Guide", link: "res://guide" } // Different fields!
];

const refs = extractReferencedResources(newServerResults);
assert(refs.includes("res://guide")); // ✅ Still works!
```

## Comparison with Alternatives

### ❌ Coupled Approach (BAD)
```typescript
// Bridge knows about specific servers
if (toolName === "search_recipes_semantic") {
  // Load recipe resource
} else if (toolName === "find_workouts") {
  // Load workout resource
}
// Breaks encapsulation, doesn't scale
```

### ✅ Decoupled Approach (GOOD)
```typescript
// Bridge uses generic patterns
const refs = extractReferencedResources(toolResults); // Works for any server
const discovered = await discoverRelevantResources(...); // Works for any server
// Scales to infinite servers, zero coupling
```

## Summary

**This architecture achieves:**

1. ✅ **Decoupling**: Servers and bridge are independent
2. ✅ **Generality**: Works with any MCP server automatically
3. ✅ **Flexibility**: Two complementary discovery strategies
4. ✅ **Performance**: Indexed search with caching
5. ✅ **Upgradeable**: Can swap keyword matching for real embeddings
6. ✅ **User Experience**: Automatic context enrichment, no manual selection

**The LLM now has full context automatically, resulting in accurate, detailed responses!** 🎉

