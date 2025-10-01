# Resource Management & Context Window Strategy

## Overview

The system implements **smart resource management** to keep the LLM's context window clean and relevant. Resources are dynamically loaded, replaced, and cleaned based on conversation flow.

## The Problem

Without resource management, the context would accumulate endlessly:

```
Turn 1: "vegan pasta"
System: <resource>Vegan Pasta Primavera</resource>
        You are a helpful AI assistant...

Turn 2: "thai food"
System: <resource>Thai Green Curry</resource>     ⬅️ NEW
        <resource>Vegan Pasta Primavera</resource> ⬅️ DUPLICATE!
        You are a helpful AI assistant...

Turn 3: "dessert"
System: <resource>Chocolate Cookies</resource>    ⬅️ NEW
        <resource>Thai Green Curry</resource>      ⬅️ DUPLICATE!
        <resource>Vegan Pasta Primavera</resource> ⬅️ DUPLICATE!
        You are a helpful AI assistant...

❌ Context explodes! Memory waste! Slower inference!
```

## The Solution: Clean Replacement

Resources are **replaced, not accumulated**:

```typescript
Turn 1: "vegan pasta"
System: <resource>Vegan Pasta Primavera</resource>
        You are a helpful AI assistant...

Turn 2: "thai food"
System: <resource>Thai Green Curry</resource>     ⬅️ Only relevant one!
        You are a helpful AI assistant...

Turn 3: "dessert"
System: <resource>Chocolate Cookies</resource>    ⬅️ Only relevant one!
        You are a helpful AI assistant...

✅ Clean context! Efficient! Fast!
```

## How It Works

### 1. Resource Discovery (Per Tool Execution)

After each tool call, the system discovers relevant resources:

```typescript
// Strategy 1: Explicit references
const explicitRefs = extractReferencedResources(toolResults);
// Finds: "resource_uri": "res://vegan_pasta_primavera"

// Strategy 2: Semantic search
const discoveredRefs = await discoverRelevantResources(
  messages,        // Recent conversation
  toolResults,     // What tools returned
  { 
    topK: 2,       // Top-2 most similar
    minScore: 0.15 // Minimum relevance threshold
  }
);
```

### 2. Resource Cleanup

**Before** injecting new resources, old ones are removed:

```typescript
private cleanSystemMessageResources(systemMessage: string): string {
  // Remove resource section header
  let cleaned = systemMessage.replace(
    /^## Available Context Resources[\s\S]*?---\s*/m,
    ''
  );
  
  // Remove individual <resource>...</resource> blocks
  cleaned = cleaned.replace(
    /<resource[^>]*>[\s\S]*?<\/resource>\s*/g,
    ''
  );
  
  return cleaned.trim();
}
```

### 3. Fresh Resource Injection

Only **currently relevant** resources are injected:

```typescript
if (resources.length > 0) {
  const resourceContext = buildResourceContext(resources);
  
  // Clean old, inject new
  const cleanSystemPrompt = cleanSystemMessageResources(messages[0].content);
  messages[0].content = resourceContext + '\n\n' + cleanSystemPrompt;
  
  console.log(`✅ Injected ${resources.length} resource(s) (replaced old ones)`);
}
```

### 4. Automatic Cleanup

If no new resources are relevant, old ones are still cleaned:

```typescript
} else {
  // No new resources, but clean old ones if they exist
  const cleanedContent = cleanSystemMessageResources(currentContent);
  
  if (currentContent !== cleanedContent) {
    messages[0].content = cleanedContent;
    console.log('🧹 Cleaned old resources from context (no new resources relevant)');
  }
}
```

## Resource Selection Strategy

### Top-K with Threshold

Resources are selected using a **dual-filter** approach:

```typescript
{ 
  topK: 2,        // Maximum 2 resources
  minScore: 0.15  // Minimum similarity: 0.15 (out of 1.0)
}
```

**Example:**

```
Query: "thai food"

All Resources (scored):
1. Thai Green Curry       (0.450) ✅ Above threshold
2. Vegan Pasta Primavera  (0.369) ✅ Above threshold
3. Chocolate Chip Cookies (0.089) ❌ Below threshold
4. Greek Salad           (0.034) ❌ Below threshold

Selected: Top-2 above threshold = [Thai Green Curry, Vegan Pasta Primavera]
```

### Relevance Decay

As conversation shifts topics, resource relevance naturally decreases:

```
Turn 1: "vegan pasta"
  - Vegan Pasta Primavera (score: 0.553) ✅

Turn 2: "actually, thai food"
  Context now includes: "vegan pasta" + "thai food"
  - Thai Green Curry (score: 0.450) ✅ More relevant
  - Vegan Pasta Primavera (score: 0.369) ✅ Still somewhat relevant

Turn 3: "no, dessert instead"
  Context now includes: "vegan pasta" + "thai food" + "dessert"
  - Chocolate Chip Cookies (score: 0.620) ✅ Highly relevant
  - Vegan Pasta Primavera (score: 0.120) ❌ Below threshold
  - Thai Green Curry (score: 0.098) ❌ Below threshold
  
Old resources naturally fall below threshold and get cleaned! 🧹
```

## Configuration

### Adjust Selection Parameters

In `src/lib/mcp-llm-bridge.ts`, line ~286:

```typescript
const discoveredRefs = await this.resourceDiscovery.discoverRelevantResources(
  messages,
  toolResults,
  { 
    topK: 2,       // ⬅️ Change this: Load top-N resources
    minScore: 0.15 // ⬅️ Change this: Minimum relevance (0-1)
  }
);
```

**Parameters:**

| Parameter | Default | Effect | When to Change |
|-----------|---------|--------|----------------|
| `topK` | 2 | Maximum resources loaded | Increase for more context, decrease for speed |
| `minScore` | 0.15 | Minimum relevance (0-1) | Increase for stricter matching, decrease for more resources |

**Examples:**

```typescript
// More context, slower
{ topK: 5, minScore: 0.10 }

// Stricter matching, faster
{ topK: 1, minScore: 0.30 }

// Balanced (default)
{ topK: 2, minScore: 0.15 }
```

### Context Window Considerations

**Average resource size:** ~500-2000 tokens

**With `topK: 2`:**
- Resources: ~1000-4000 tokens
- System prompt: ~500 tokens
- Tool descriptions: ~500 tokens
- **Total overhead:** ~2000-5000 tokens

**With `topK: 5`:**
- Resources: ~2500-10000 tokens
- **Total overhead:** ~3500-11000 tokens

**Model context limits:**
- Hermes 8B: 8192 tokens (safe with topK: 2-3)
- Llama 3.2 3B: 4096 tokens (safe with topK: 1-2)

## Console Output

### Successful Injection
```
🔍 Discovered relevant resources: ['res://thai_green_curry']
✅ Injected 1 resource(s) into context (replaced old ones)
```

### Multiple Resources
```
📌 Found explicit resource references: ['res://vegan_pasta_primavera']
🔍 Discovered relevant resources: ['res://thai_green_curry']
✅ Injected 2 resource(s) into context (replaced old ones)
```

### Cleanup Only
```
🧹 Cleaned old resources from context (no new resources relevant)
```

## Benefits

### 1. ✅ No Accumulation
Resources are replaced, not duplicated:
```
Turn 1: 1 resource  (1000 tokens)
Turn 2: 1 resource  (1000 tokens) ← Not 2!
Turn 3: 1 resource  (1000 tokens) ← Not 3!
```

### 2. ✅ Always Relevant
Only currently relevant resources are in context:
```
Query: "dessert"
Context: <resource>Chocolate Chip Cookies</resource>
✅ Not: Vegan Pasta + Thai Curry + Greek Salad + ...
```

### 3. ✅ Efficient Memory
Constant context overhead regardless of conversation length:
```
10 turns: ~2000-5000 tokens
100 turns: ~2000-5000 tokens  ← Same!
```

### 4. ✅ Faster Inference
Smaller context = faster LLM response:
```
With accumulation: 10000+ tokens → 8-12s
With cleanup:      2000-5000 tokens → 4-6s
```

### 5. ✅ Automatic Management
No manual intervention required:
```
User: "vegan pasta"
System: [Loads Vegan Pasta resource]

User: "thai food"
System: [Cleans Vegan Pasta, loads Thai Curry]

User: "dessert"
System: [Cleans Thai Curry, loads Cookies]
```

## Edge Cases

### Case 1: No Relevant Resources
```typescript
Query: "What's the weather?"
Tool: get_weather() → "Sunny, 75°F"

// No recipes match "weather"
// Old resources cleaned, no new ones injected
🧹 Cleaned old resources from context (no new resources relevant)
```

### Case 2: Multiple Equally Relevant
```typescript
Query: "vegan recipes"

Scores:
- Vegan Pasta Primavera (0.550)
- Thai Green Curry (0.540)
- Greek Salad (0.530)

// Top-K limits to 2
Selected: [Vegan Pasta Primavera, Thai Green Curry]
```

### Case 3: All Below Threshold
```typescript
Query: "programming question"

Scores (all recipes):
- Vegan Pasta Primavera (0.08)
- Thai Green Curry (0.06)
- Chocolate Chip Cookies (0.05)

// All below minScore: 0.15
// No resources injected, old ones cleaned
🧹 Cleaned old resources from context (no new resources relevant)
```

## Testing

### Test Resource Replacement
1. Ask: "Show me vegan pasta"
   - Console: `Injected 1 resource(s) (replaced old ones)`
   - Resource: Vegan Pasta Primavera

2. Ask: "Actually, show me thai food"
   - Console: `Injected 1-2 resource(s) (replaced old ones)`
   - Resource: Thai Green Curry
   - ✅ Vegan Pasta should be replaced (not accumulated)

3. Check conversation history:
   ```javascript
   console.log(state.conversationHistory[0]); // System message
   // Should only contain Thai Green Curry resource
   // NOT Vegan Pasta + Thai Green Curry
   ```

### Test Cleanup
1. Ask: "What's 2+2?"
   - No tools called, no resources relevant
   - Console: `🧹 Cleaned old resources from context`

### Test Top-K Limiting
1. Ask: "Show me all recipes"
   - Many recipes match
   - Console: `Injected 2 resource(s)` ← Limited by topK: 2
   - ✅ Not all recipes loaded

## Future Enhancements

### 1. Adaptive Top-K
```typescript
// Adjust topK based on context window usage
const usedTokens = estimateTokens(messages);
const availableTokens = maxTokens - usedTokens;
const adaptiveTopK = Math.floor(availableTokens / 1000); // ~1000 tokens per resource
```

### 2. Resource Relevance Cache
```typescript
// Cache relevance scores to avoid recomputing
const cachedScore = resourceRelevanceCache.get(resource.uri);
if (cachedScore && cachedScore.turn === currentTurn - 1) {
  return cachedScore.score * 0.9; // Decay factor
}
```

### 3. Multi-Turn Resource Persistence
```typescript
// Keep highly relevant resources for multiple turns
if (score > 0.7) {
  resource.persistFor = 3; // Keep for 3 more turns
}
```

### 4. Resource Summarization
```typescript
// For large resources, create summaries
if (resource.content.length > 2000) {
  resource.summary = summarize(resource.content, maxLength: 500);
}
```

## Summary

**The resource management system:**
- ✅ Prevents context accumulation
- ✅ Maintains only relevant resources
- ✅ Automatically cleans old resources
- ✅ Limits via top-K and threshold
- ✅ Optimizes for speed and memory
- ✅ Requires zero manual intervention

**Result:** Clean, efficient, context-aware LLM responses! 🎉

