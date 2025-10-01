# Final Fix: MCP Resources Not Being Indexed

## 🔴 Root Cause Found

MCP resources were **never being indexed** for the V2 bridge, even though the code existed to do so!

### The Problem

Looking at the logs:
```
main.ts:1116 🎯 Creating ReAct-based bridge (V2)...
main.ts:642 Discovered 7 resources and 4 prompts
```

Notice there's NO message saying:
```
✅ Indexed 7 resources with full content
```

**Why?** The indexing code in `createBridge()` ran BEFORE resources were discovered:

```typescript
// createBridge() is called first
async function createBridge() {
  state.bridgeV2 = new McpLLMBridgeV2(...);

  // Try to index resources
  if (state.availableResources.length > 0) {  // ❌ This is 0!
    await state.bridgeV2.indexResources(...);
  }
}

// THEN resources are discovered later
async function refreshMCPFeatures() {
  const resources = await resourceManager.discoverResources();
  state.availableResources = resources;  // ✅ Now it's 7
  console.log(`Discovered ${resources.length} resources`);

  // But indexing code only checked for state.bridge (V1), not bridgeV2!
  if (resources.length > 0 && state.bridge) {  // ❌ bridgeV2 is ignored!
    await state.bridge.resourceDiscovery.indexResources();
  }
}
```

### Timeline of Events

1. User boots MCP → `createBridge()` called
2. Bridge V2 created, but `state.availableResources` is still `[]`
3. Skip indexing (length is 0)
4. Resources discovered → `state.availableResources` now has 7 items
5. Check `if (state.bridge)` → FALSE (we have bridgeV2, not bridge)
6. Skip indexing again!
7. **Result:** Resources never indexed, agent has no context

---

## ✅ Fix Applied

### File: [src/main.ts](src/main.ts:644-678)

**Changed:** Move resource indexing to AFTER discovery, and check for BOTH bridge types

**Before:**
```typescript
async function refreshMCPFeatures() {
  const resources = await resourceManager.discoverResources();
  state.availableResources = resources;

  // Only checks for V1 bridge!
  if (resources.length > 0 && state.bridge) {  // ❌
    await state.bridge.resourceDiscovery.indexResources();
  }
}
```

**After:**
```typescript
async function refreshMCPFeatures() {
  const resources = await resourceManager.discoverResources();
  state.availableResources = resources;

  // Index resources for BOTH V1 and V2
  if (resources.length > 0) {
    if (state.bridgeV2) {  // ✅ Check V2 first
      console.log(`📚 Indexing ${resources.length} resources for ReAct agent...`);

      // Fetch full content for each resource
      const resourcesToIndex = await Promise.all(
        resources.map(async (r) => {
          const resourceData = await state.mcpClient!.call('resources/read', { uri: r.uri });
          let content = `${r.name}: ${r.description || ''}\n\n`;

          if (resourceData && resourceData.contents) {
            for (const item of resourceData.contents) {
              if (item.text) {
                content += item.text + '\n';
              }
            }
          }

          return { uri: r.uri, content };
        })
      );

      await state.bridgeV2.indexResources(resourcesToIndex);
      const stats = await state.bridgeV2.getIndexStats();
      console.log(`✅ Indexed ${stats.count} resources with full content`);

    } else if (state.bridge) {  // ✅ Fallback to V1
      await state.bridge.resourceDiscovery.indexResources();
    }
  }
}
```

---

## Expected Behavior After Fix

### On MCP Boot

**Before:**
```
🎯 Creating ReAct-based bridge (V2)...
Discovered 7 resources and 4 prompts
📚 Discovered 7 resource(s) and 4 prompt template(s).
// ❌ No indexing happens!
```

**After:**
```
🎯 Creating ReAct-based bridge (V2)...
Discovered 7 resources and 4 prompts
📚 Indexing 7 resources for ReAct agent...
💾 Storing embedding for res://vegan_pasta_primavera: 384 dimensions
💾 Storing embedding for res://chocolate_chip_cookies: 384 dimensions
💾 Storing embedding for res://chicken_tikka_masala: 384 dimensions
💾 Storing embedding for res://greek_salad: 384 dimensions
💾 Storing embedding for res://thai_green_curry: 384 dimensions
💾 Storing embedding for res://beef_tacos: 384 dimensions
💾 Storing embedding for res://cooking_tips: 384 dimensions
✅ Indexed 7 resources with full content
📚 Discovered 7 resource(s) and 4 prompt template(s). Semantic search enabled.
```

### During Conversation

**User:** "find vegan pasta recipes"
```
→ Tool: find_recipes_by_dietary → ["Vegan Pasta Primavera", "Thai Green Curry"]
→ 📇 Auto-indexing: tool://find_recipes_by_dietary/exec_123
→ Answer: "Here are some vegan pasta recipes..."
```

**User:** "tell me about vegan pasta primavera"

**Before Fix:**
```
→ 🔍 Found 0 relevant resources  ❌
→ Agent has no context
→ Tries non-existent tools to get details
```

**After Fix:**
```
→ 🔍 Found 2 relevant resources:
   - res://vegan_pasta_primavera (score: 0.85) ✅ Full recipe!
   - tool://find_recipes_by_dietary/exec_123 (score: 0.72) ✅ Previous result!
→ Context includes: ingredients, instructions, dietary info, tags
→ Agent answers: "Vegan Pasta Primavera is an Italian dish with 12oz pasta,
   bell peppers, zucchini, broccoli, cherry tomatoes... [full recipe]"
→ NO TOOL CALLS NEEDED - everything in context!
```

---

## Additional Improvements

### 1. Better Logging

Added dimension tracking to verify embeddings are correct:
```typescript
console.log(`💾 Storing embedding for ${uri}: ${embedding.length} dimensions`);
```

Should always see **384 dimensions** (Xenova all-MiniLM-L6-v2 model).

### 2. Dimension Mismatch Warning

Enhanced error message:
```typescript
console.warn(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
```

Now shows ACTUAL dimensions to help debug issues.

### 3. Metadata Includes Dimensions

```typescript
const metadata = JSON.stringify({
  text: text.substring(0, 500),
  textLength: text.length,
  indexed_at: Date.now(),
  embeddingDim: embedding.length  // ✅ Track this!
});
```

---

## Testing Instructions

1. **Reload page** (fresh start)
2. **Boot MCP chef server**
3. **Check console for:**
   ```
   📚 Indexing 7 resources for ReAct agent...
   💾 Storing embedding for res://vegan_pasta_primavera: 384 dimensions
   💾 Storing embedding for res://chocolate_chip_cookies: 384 dimensions
   ...
   ✅ Indexed 7 resources with full content
   ```
4. **Query:** "find vegan pasta recipes"
5. **Then query:** "tell me more about vegan pasta primavera"
6. **Expected:** Agent provides full recipe WITHOUT calling any tools (gets it from context)

---

## Summary

✅ **Fixed:** MCP resources now indexed when discovered (not just at bridge creation)
✅ **Fixed:** V2 bridge now properly handled in resource indexing code
✅ **Fixed:** Full recipe content indexed (not just name/description)
✅ **Result:** Agent can answer questions about recipes using indexed MCP resources

**This was the missing piece!** Resources were being discovered but never indexed for V2, so the agent had no context about recipes even though they existed in the MCP server.
