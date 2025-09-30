# Resource Discovery - Quick Usage Guide

## For Users

### What Changed?

The LLM now **automatically loads relevant context** based on your conversation and tool results. You don't need to do anything special!

### Example

**Before** (without auto-discovery):
```
User: "Show me vegan pasta ingredients"
AI: "Here's what you need for vegan pasta:
     - Pasta (I'm guessing spaghetti?)
     - Olive oil
     - Some vegetables..."  ❌ Hallucinated!
```

**After** (with auto-discovery):
```
User: "Show me vegan pasta ingredients"
AI: [Automatically loads full recipe from resources]
    "Here's what you need for Vegan Pasta Primavera:
     - 8 oz spaghetti
     - 2 tablespoons olive oil
     - 2 cloves garlic, minced
     - 1 red bell pepper, diced
     - 1 zucchini, diced
     - 1 cup cherry tomatoes, halved
     - 2 cups fresh spinach
     - Salt and black pepper to taste
     - Nutritional yeast (optional)"  ✅ Accurate!
```

### How It Works

1. **You ask a question**
2. **LLM uses tools** (e.g., search recipes)
3. **Bridge detects references** in tool results
4. **Automatically loads full content** from resources
5. **LLM responds with complete, accurate information** ✨

### Visual Indicator

Look for console messages like:
```
🔍 Discovered relevant resources: ["res://vegan_pasta_primavera"]
✅ Injected 1 resource(s) into context
```

This means the system automatically enriched the LLM's context!

---

## For MCP Server Developers

### How to Make Your Server Compatible

Your server is **automatically compatible**! But you can optimize it:

### Method 1: Return `resource_uri` (Recommended)

```python
from mcp_core import McpServer

class MyServer(McpServer):
    
    @tool()
    def search_items(self, query: str) -> list[dict]:
        """Search for items"""
        
        results = []
        for item_id, score in search_results:
            results.append({
                "name": item['name'],
                "resource_uri": f"res://{item_id}",  # ⭐ Include this!
                "description": item['description'],
                "score": score
            })
        
        return results
    
    # Define corresponding resource
    @resource(uri="res://item_123")
    def get_item_details(self) -> dict:
        """Full item details"""
        return {
            "mimeType": "application/json",
            "text": json.dumps({
                "name": "My Item",
                "full_details": "..."
            })
        }
```

**When to use:**
- ✅ When your tool returns search results
- ✅ When you want explicit control over which resources load
- ✅ When you have a 1:1 mapping (search result → resource)

### Method 2: Rely on Semantic Discovery

```python
class MyServer(McpServer):
    
    @tool()
    def find_tutorials(self, topic: str) -> list[dict]:
        """Find tutorials"""
        
        # Just return relevant data - NO resource_uri needed!
        return [
            {
                "title": "Python Async Tutorial",
                "difficulty": "intermediate",
                "topics": ["asyncio", "coroutines"]
            }
        ]
    
    # Define resources with good names/descriptions
    @resource(
        uri="res://python_async_tutorial",
        name="Python Async Tutorial",
        description="Comprehensive guide to Python asyncio and coroutines"
    )
    def tutorial_python_async(self) -> dict:
        """Full tutorial content"""
        return {
            "mimeType": "text/markdown",
            "text": "# Python Async Tutorial\n..."
        }
```

**When to use:**
- ✅ When your tool doesn't map directly to resources
- ✅ When you want the bridge to intelligently select resources
- ✅ When resources have good descriptive metadata

### Method 3: Hybrid (Best of Both)

```python
class MyServer(McpServer):
    
    @tool()
    def search_workouts(self, goal: str, level: str) -> list[dict]:
        """Search workouts"""
        
        results = []
        for workout in matching_workouts:
            result = {
                "name": workout['name'],
                "goal": workout['goal'],
                "level": workout['level'],
                "duration_weeks": workout['duration']
            }
            
            # Include resource_uri for high-confidence matches
            if workout['relevance'] > 0.8:
                result["resource_uri"] = f"res://{workout['id']}"
            
            results.append(result)
        
        return results
    
    # Bridge will:
    # 1. Auto-load resources with explicit URIs
    # 2. Use semantic search for others (if relevant)
```

**When to use:**
- ✅ For maximum flexibility
- ✅ When you want both explicit control AND intelligent fallback
- ✅ For complex search scenarios

---

## Best Practices

### 1. Use Descriptive Resource Metadata

```python
# ✅ Good - Bridge can find this semantically
@resource(
    uri="res://vegan_pasta_primavera",
    name="Vegan Pasta Primavera",
    description="Italian pasta dish with colorful vegetables, vegan and dairy-free"
)

# ❌ Bad - Hard to find semantically
@resource(
    uri="res://recipe_001",
    name="Recipe 001",
    description=""
)
```

### 2. Keep Resources Focused

```python
# ✅ Good - One recipe per resource
@resource(uri="res://vegan_pasta")
def recipe_vegan_pasta():
    return {"mimeType": "application/json", "text": json.dumps(recipe)}

@resource(uri="res://vegan_pizza")
def recipe_vegan_pizza():
    return {"mimeType": "application/json", "text": json.dumps(recipe)}

# ❌ Bad - All recipes in one resource
@resource(uri="res://all_recipes")
def all_recipes():
    return {"mimeType": "application/json", "text": json.dumps(all_recipes)}
```

### 3. Use Consistent URI Schemes

```python
# ✅ Good - Consistent pattern
res://vegan_pasta_primavera
res://vegan_alfredo
res://vegan_lasagna

# ❌ Bad - Inconsistent
res://recipe1
resource://vegan_pasta
res://VeganAlfredo  # Different case
```

### 4. Return resource_uri for Search Tools

```python
# ✅ Good - Search returns URIs
@tool()
def search_recipes(self, query: str):
    return [{"name": "...", "resource_uri": "res://..."}]

# ❌ Suboptimal - Search returns full content
@tool()
def search_recipes(self, query: str):
    return [{"name": "...", "ingredients": [...], "instructions": [...]}]
    # Full content in tool result bloats context unnecessarily
```

### 5. Test with Console Logging

```python
# Check if your resources are being discovered
print(f"Registered resources: {server.list_resources()}")

# In browser console, look for:
# 📇 Indexed 10 resources for semantic search
# 🔍 Searching for resources matching: "vegan pasta..."
# ✅ Injected 1 resource(s) into context
```

---

## Troubleshooting

### "Resources not being loaded?"

1. **Check resource URIs match**
   ```python
   # Tool returns:
   "resource_uri": "res://my_recipe"
   
   # Resource decorator must match:
   @resource(uri="res://my_recipe")  # ✅ Same URI
   ```

2. **Verify resources are registered**
   ```python
   # After boot, check:
   await bridge.resourceManager.discoverResources()
   # Should log: "Discovered N resources"
   ```

3. **Check embedding similarity**
   ```javascript
   // In console:
   await bridge.resourceDiscovery.indexResources();
   // Should log: "📇 Indexed N resources"
   ```

### "Wrong resources being loaded?"

1. **Improve resource descriptions**
   ```python
   # Add more context
   @resource(
       uri="res://advanced_workout",
       description="Advanced strength training for experienced athletes"
       # Include keywords that might appear in conversations
   )
   ```

2. **Use explicit resource_uri**
   ```python
   # For critical matches, return explicit URIs
   if relevance_score > 0.9:
       result["resource_uri"] = f"res://{item_id}"
   ```

3. **Adjust similarity threshold**
   ```typescript
   // In mcp-llm-bridge.ts
   { topK: 2, minScore: 0.15 }  // Increase minScore for stricter matching
   ```

---

## Performance Tips

### 1. Pre-compute Embeddings (Server-side)

```python
# Cache embeddings for faster search
RECIPE_EMBEDDINGS = {
    "vegan_pasta_primavera": compute_embedding("Vegan Pasta Primavera Italian vegetables"),
    "vegan_alfredo": compute_embedding("Vegan Alfredo creamy white sauce"),
    # ...
}

# Use in semantic search tool
def search_recipes_semantic(self, query: str):
    query_embedding = compute_embedding(query)
    # Compare with pre-computed embeddings
```

### 2. Limit Resource Size

```python
# ✅ Good - Reasonable size
{
  "name": "Recipe",
  "ingredients": [...],  # ~20 items
  "instructions": [...]  # ~10 steps
}

# ❌ Bad - Too large
{
  "name": "Recipe",
  "comments": [...]  # 1000+ user comments
  "history": [...]   # Full edit history
}
```

### 3. Use Appropriate MIME Types

```python
# For structured data
{"mimeType": "application/json", "text": json.dumps(data)}

# For text content
{"mimeType": "text/markdown", "text": markdown_content}

# For code
{"mimeType": "text/python", "text": code_content}
```

---

## Examples from Built-in Servers

### Chef Server (Explicit URIs)
```python
def search_recipes_semantic(self, query: str):
    return [
        {
            "name": "Vegan Pasta Primavera",
            "resource_uri": "res://vegan_pasta_primavera",  # ⭐ Explicit
            "relevance_score": 0.95
        }
    ]
```

### Fitness Server (Semantic Discovery)
```python
def find_programs(self, goal: str):
    return [
        {
            "name": "Strength Training Beginner",
            "goal": "strength"
            # No resource_uri - bridge uses semantic search
        }
    ]
```

### Coding Mentor (Hybrid)
```python
def search_tutorials(self, topic: str):
    tutorials = search(topic)
    
    return [
        {
            "title": tutorial['title'],
            "difficulty": tutorial['difficulty'],
            # Include URI for exact matches
            "resource_uri": f"res://{tutorial['id']}" if score > 0.8 else None
        }
        for tutorial, score in tutorials
    ]
```

---

## Summary

**For Users:**
- ✨ Automatic context enrichment
- 📚 More accurate, detailed responses
- 🚀 No manual resource selection needed

**For Developers:**
- 🔌 Zero coupling required
- 🎯 Return `resource_uri` for explicit control
- 🧠 Let semantic search handle the rest
- 📈 Scales to any number of servers automatically

**The system just works!** 🎉

