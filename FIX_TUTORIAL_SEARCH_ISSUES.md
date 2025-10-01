# Fix: Tutorial Search and Resource Discovery Issues

## Problems Identified

### 1. Level Mismatch
**Symptom**: Tool call with `level="beginner"` returns empty when tutorial exists at `level="intermediate"`

**Root cause**: Strict level filtering in `find_tutorial`

**Fix**: Make level matching more flexible or add beginner-level tutorials

### 2. Keyword Mismatch
**Symptom**: Search for "async-await" doesn't match "async/await" in database

**Root cause**: Special characters (hyphen vs slash) cause mismatch

**Fix**: Normalize search terms before comparison

### 3. Semantic Search Pollution
**Symptom**: Search query becomes corrupted: "Teach me await any tutorial on the topc?..."

**Root cause**: `extractToolResultText` extracts the error message from empty tool results:
```json
[{"message": "No tutorials found for 'async-await' at beginner level"}]
```

This negative result message gets added to the search context, polluting semantic search.

**Fix**: Don't extract text from error/empty result messages

---

## Proposed Solutions

### Fix 1: Improve `find_tutorial` Search Logic

```python
def find_tutorial(
    self,
    topic: str,
    level: Literal["beginner", "intermediate", "advanced"] = "beginner"
) -> list[dict]:
    """Find learning resources by topic and level"""
    
    results = []
    topic_normalized = topic.lower().replace('-', '/').replace('_', '/')  # Normalize separators
    
    for tutorial_id, tutorial in TUTORIALS.items():
        # More flexible matching
        title_match = topic_normalized in tutorial['title'].lower().replace('-', '/').replace('_', '/')
        topic_match = any(
            topic_normalized in t.replace('-', '/').replace('_', '/')
            for t in tutorial['topics']
        )
        
        # Flexible level matching: exact match OR "all levels"
        level_match = (tutorial['level'] == level or tutorial['level'] == "all levels")
        
        if (title_match or topic_match) and level_match:
            results.append({
                "title": tutorial['title'],
                "resource_uri": f"res://{tutorial_id}",
                "level": tutorial['level'],
                "topics": tutorial['topics']
            })
    
    # Return empty array instead of error message object
    return results
```

**Key changes**:
- Normalize hyphens/underscores to slashes before matching
- Still do strict level filtering BUT:
- **Return empty `[]` instead of `[{"message": "..."}]`**

### Fix 2: Filter Out Empty Result Messages from Search Context

```typescript
// In resource-discovery.ts, extractToolResultText function

function extractToolResultText(toolResults: any[]): string {
  const texts: string[] = [];
  
  for (const result of toolResults) {
    if (typeof result === 'string') {
      texts.push(result);
      continue;
    }
    
    if (typeof result === 'object' && result !== null) {
      // SKIP error messages and empty result indicators
      if (result.message && (
        result.message.includes('not found') ||
        result.message.includes('No ') ||
        result.message.includes('not available')
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
      
      // Nested objects
      if (result.recipe) texts.push(extractToolResultText([result.recipe]));
      if (result.program) texts.push(extractToolResultText([result.program]));
    }
  }
  
  return texts.join(' ');
}
```

**Key change**: Skip extracting text from error/empty result messages

### Fix 3: Add Beginner-Level Async Tutorial (Optional)

```python
"javascript_async_basics": {
    "title": "JavaScript Async Basics",
    "level": "beginner",
    "topics": ["promises", "async/await", "callbacks"],
    "content": """# JavaScript Async Basics (Beginner)
    
## What is Asynchronous Programming?

JavaScript is single-threaded, meaning it executes one thing at a time. Async programming
allows long-running operations (like fetching data) to happen without blocking other code.

### Callbacks (The Old Way)
```javascript
function fetchUser(id, callback) {
    setTimeout(() => {
        callback({ id: id, name: "Alice" });
    }, 1000);
}

fetchUser(1, (user) => {
    console.log(user.name); // "Alice"
});
```

### Promises (The Better Way)
...
"""
}
```

---

## Best Practice Going Forward

### For Tool Returns
1. ✅ Return empty arrays `[]` for no results
2. ❌ Don't return `[{"message": "not found"}]` objects

### For Resource Discovery
1. ✅ Filter out negative/error messages from search context
2. ✅ Normalize search terms (handle hyphens, slashes, underscores)
3. ✅ Use semantic search as fallback when keyword search fails

### For Tool Design
1. Make search more forgiving (fuzzy matching, normalization)
2. Consider level flexibility (e.g., "all levels" tutorials, or return closest level)
3. Return structured data, not error message objects

---

## Testing

After fixes:

```javascript
// Should find the intermediate tutorial
find_tutorial("async-await", "intermediate")  // ✅ Returns javascript_async

// Should find it with slash too
find_tutorial("async/await", "intermediate")  // ✅ Returns javascript_async

// Empty array (clean)
find_tutorial("async-await", "beginner")      // ✅ Returns []

// Semantic search should succeed (not polluted by error messages)
// User: "Teach me about async/await"
// Tool: returns []
// Semantic: finds javascript_async resource (score > 0.15)  ✅
```

