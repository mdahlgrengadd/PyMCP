# MCP Servers Guide

This project includes **4 specialized MCP servers** that demonstrate different use cases and maximize MCP features (Tools, Resources, Prompts).

## Available Servers

### 1. 👨‍🍳 Chef Server (`chef_server.py`)

**Focus**: Cooking assistant with semantic recipe search

**Features**:
- **🔧 Tools**:
  - `convert_units` - Convert between cooking measurements
  - `substitute_ingredient` - Find ingredient substitutions
  - `scale_recipe` - Adjust recipe servings
  - `find_recipes_by_dietary` - Filter by dietary restrictions
  - `search_recipes_semantic` - AI-powered recipe search

- **📚 Resources** (Individual Recipes):
  - `vegan_pasta_primavera` - Italian vegan pasta
  - `chocolate_chip_cookies` - Classic dessert
  - `chicken_tikka_masala` - Indian curry
  - `greek_salad` - Mediterranean salad
  - `thai_green_curry` - Thai coconut curry
  - `beef_tacos` - Mexican tacos
  - `cooking_tips` - General cooking guidance

- **🎯 Prompts**:
  - `/meal-planner` - Weekly meal planning
  - `/cooking-instructor` - Step-by-step cooking guidance
  - `/dietary-adapter` - Modify recipes for dietary needs
  - `/recipe-critic` - Recipe review and improvement

**Key Innovation**: Uses **simple embeddings and cosine similarity** to automatically select relevant recipes based on conversation context. For production, this would use actual LLM embeddings.

**Example Usage**:
```
User: "I want to make vegan pasta tonight"
→ System uses semantic search to find vegan_pasta_primavera
→ Automatically includes that recipe as context
→ LLM provides specific instructions from the actual recipe
```

---

### 2. 🏋️ Fitness Trainer (`fitness_server.py`)

**Focus**: Personal fitness and workout planning

**Features**:
- **🔧 Tools**:
  - `calculate_bmi` - Body Mass Index calculator
  - `estimate_calories` - Daily calorie needs (TDEE)
  - `one_rep_max` - Calculate 1RM from sets/reps
  - `workout_tracker` - Log exercises
  - `find_workouts` - Search programs by goal/level

- **📚 Resources** (Workout Programs):
  - `beginner_strength` - Full-body strength training
  - `cardio_hiit` - High-intensity interval training
  - `yoga_flexibility` - Yoga and stretching
  - `exercise_form_guide` - Proper technique guide
  - `nutrition_basics` - Fitness nutrition fundamentals

- **🎯 Prompts**:
  - `/goal-setting` - Create SMART fitness goals
  - `/form-checker` - Guide proper exercise form
  - `/nutrition-coach` - Personalized nutrition planning
  - `/workout-programmer` - Design custom workout programs

**Example Usage**:
```
User: "I'm a beginner and want to build strength"
→ Select beginner_strength resource as context
→ Use /goal-setting prompt for structured guidance
→ LLM creates personalized plan based on the actual program
```

---

### 3. 💻 Coding Mentor (`coding_mentor_server.py`)

**Focus**: Programming education and code review

**Features**:
- **🔧 Tools**:
  - `analyze_complexity` - Code complexity metrics
  - `check_naming_conventions` - Verify naming standards
  - `detect_code_smells` - Find code quality issues
  - `suggest_refactoring` - Refactoring pattern recommendations
  - `find_tutorial` - Search learning resources
  - `explain_pattern` - Get design pattern info

- **📚 Resources** (Learning Materials):
  - `python_basics` - Python fundamentals tutorial
  - `javascript_async` - Async programming guide
  - `code_review_checklist` - What to check when reviewing
  - `clean_code_principles` - Writing maintainable code
  - `design_patterns` - Common design patterns reference

- **🎯 Prompts**:
  - `/code-reviewer` - Comprehensive code review
  - `/debugging-coach` - Systematic debugging methodology
  - `/concept-explainer` - Explain programming concepts
  - `/refactoring-guide` - Guide code improvements

**Example Usage**:
```
User: "Review this function: [code]"
→ Use /code-reviewer prompt
→ Include clean_code_principles resource
→ Use analyze_complexity and detect_code_smells tools
→ LLM provides detailed review with specific examples
```

---

### 4. 📝 Demo Server (`my_server.py`)

**Focus**: Basic MCP features demonstration

**Features**:
- **🔧 Tools**: `echo`, `add`, `get_item`
- **📚 Resources**: `welcome` guide
- **🎯 Prompts**: `greeting` template

Simple example for understanding MCP basics.

---

## How to Use

### 1. Select a Server

1. In the sidebar, find **🔧 MCP Server** dropdown
2. Choose from:
   - 👨‍🍳 Chef Server (Cooking)
   - 🏋️ Fitness Trainer
   - 💻 Coding Mentor
   - 📝 Demo Server (Basic)

3. Click **Boot MCP Server**
4. Wait for "MCP server booted successfully!"

### 2. Explore Resources and Prompts

After booting, the system automatically discovers:
- **Tools**: Listed in the "Available Tools" section
- **Resources**: Recipe files, workout programs, tutorials
- **Prompts**: Workflow templates for structured interactions

Check the browser console for:
```
Discovered X resource(s) and Y prompt template(s)
```

### 3. Use in Conversation

#### Automatic Resource Selection (Chef Server Only)

The Chef server demonstrates **semantic search**:

```
# Conversation about pasta
User: "How do I make a healthy pasta dish?"
→ System searches recipes semantically
→ Finds vegan_pasta_primavera (closest match)
→ Includes recipe in context automatically

User: "What ingredients do I need?"
→ LLM references the actual recipe resource
→ Lists exact ingredients from vegan_pasta_primavera
```

#### Manual Tool Usage

```
User: "Convert 2 cups to ml"
→ LLM calls convert_units(2, "cup", "ml")
→ Returns: "480 ml"

User: "What's my BMI? I'm 70kg and 175cm"
→ LLM calls calculate_bmi(70, 175)
→ Returns BMI category and advice
```

#### Prompt Templates (Future Feature)

When UI is added:
```
Select: /meal-planner prompt
→ System applies structured meal planning workflow
→ LLM asks about dietary preferences, schedule, etc.
→ Provides organized weekly meal plan
```

---

## Best Practices

### For Each Server

#### Chef Server 🎯
- **Ask about**: Recipes, cooking techniques, meal planning
- **Use tools for**: Unit conversions, substitutions, scaling
- **Resources help with**: Exact ingredient lists, step-by-step instructions
- **Prompts guide**: Meal planning, dietary adaptations, cooking instruction

#### Fitness Server 🎯
- **Ask about**: Workout routines, nutrition, exercise form
- **Use tools for**: BMI, calories, 1RM calculations
- **Resources help with**: Structured programs, exercise guides, nutrition info
- **Prompts guide**: Goal setting, form checking, workout design

#### Coding Mentor 🎯
- **Ask about**: Code reviews, debugging, concepts, refactoring
- **Use tools for**: Code analysis, naming checks, finding tutorials
- **Resources help with**: Learning materials, best practices, design patterns
- **Prompts guide**: Code review process, debugging methodology, concept explanation

---

## Architecture Highlights

### Semantic Search (Chef Server)

```python
# Simple embedding-based search
def search_recipes_semantic(query: str, top_k: int = 3):
    query_embedding = compute_embedding(query)
    
    # Compare with all recipe embeddings
    similarities = []
    for recipe_id, recipe_embedding in RECIPE_EMBEDDINGS.items():
        similarity = cosine_similarity(query_embedding, recipe_embedding)
        similarities.append((recipe_id, similarity))
    
    # Return top matches
    return sorted(similarities, reverse=True)[:top_k]
```

**In production**: Use actual LLM embeddings (OpenAI, Cohere, etc.) with a proper vector database (sqlite-vec, Chroma, Pinecone).

### Resource Organization

Each recipe/program/tutorial is a **separate resource**:
```python
def resource_vegan_pasta_primavera(self) -> dict:
    """Vegan Pasta Primavera - Colorful Italian pasta"""
    return {
        "mimeType": "application/json",
        "text": json.dumps(RECIPES["vegan_pasta_primavera"])
    }
```

**Benefits**:
- Selective loading (only what's needed)
- Clear organization
- Easy to update individual items
- Better context window management

### Prompt Structure

Prompts define **workflows**:
```python
def prompt_meal_planner(self) -> dict:
    return {
        "description": "Weekly meal planning assistant",
        "messages": [{
            "role": "system",
            "content": """You are a meal planning expert...
            
When planning meals, consider:
1. Nutritional Balance
2. Variety
3. Time Management
...
"""
        }]
    }
```

**Benefits**:
- Consistent behavior
- Reusable templates
- Structured approach
- Educational for users

---

## Extending the Servers

### Add a New Recipe

```python
# In RECIPES dictionary
RECIPES["new_recipe"] = {
    "name": "New Recipe",
    "category": "Category",
    "ingredients": [...],
    "instructions": [...]
}

# Add resource method
def resource_new_recipe(self) -> dict:
    """New Recipe Description"""
    recipe = RECIPES["new_recipe"]
    return {
        "mimeType": "application/json",
        "text": json.dumps(recipe, indent=2)
    }

# Embeddings auto-computed on boot
```

### Add a New Tool

```python
def new_tool(self, param1: str, param2: int) -> dict:
    """Tool description for LLM"""
    # Implementation
    result = do_something(param1, param2)
    
    return {
        "success": True,
        "result": result
    }
```

### Add a New Prompt

```python
def prompt_new_workflow(self) -> dict:
    """Workflow description"""
    return {
        "description": "Brief description",
        "messages": [{
            "role": "system",
            "content": """Detailed instructions..."""
        }]
    }
```

---

## Development Tips

### Testing a Server

1. **Boot the server** in the UI
2. **Check console** for successful initialization
3. **Verify tools** appear in sidebar
4. **Test simple query**: "What tools do you have?"
5. **Test tool execution**: Ask to use a specific tool
6. **Check resources**: Ask about resource content

### Debugging

```python
# Add debug prints
def my_tool(self, param: str) -> dict:
    print(f"DEBUG: my_tool called with param={param}")  # Shows in browser console
    result = process(param)
    print(f"DEBUG: result={result}")
    return result
```

### Performance

- **Keep resources focused** - Individual documents, not huge files
- **Use embeddings wisely** - Pre-compute, don't generate on every query
- **Limit resource size** - Break large docs into sections
- **Cache when possible** - Store computed results

---

## Comparison: All Servers

| Feature | Chef | Fitness | Coding | Demo |
|---------|------|---------|--------|------|
| **Tools** | 6 | 5 | 6 | 3 |
| **Resources** | 7 | 5 | 5 | 2 |
| **Prompts** | 4 | 4 | 4 | 1 |
| **Smart Search** | ✅ Semantic | ❌ | ❌ | ❌ |
| **Complexity** | High | Medium | Medium | Low |
| **Best For** | RAG demo | Structured data | Education | Learning MCP |

---

## Future Enhancements

### Near-term
1. **UI for resource selection** - Checkboxes for manual selection
2. **Slash commands** - Type `/` to see available prompts
3. **Resource preview** - Hover to see resource content
4. **Usage examples** - Show example queries for each server

### Long-term
1. **Real embeddings** - Use WebLLM or external API for embeddings
2. **Vector database** - sqlite-vec integration for production
3. **Multi-resource selection** - Combine multiple resources
4. **Prompt composition** - Chain multiple prompts
5. **Resource streaming** - Load large resources progressively
6. **User-uploaded resources** - Custom recipe/workout files

---

## Summary

These servers demonstrate **MCP best practices**:

✅ **Focused Purpose** - Each server has a clear domain  
✅ **All Features Used** - Tools + Resources + Prompts  
✅ **Semantic Search** - Smart resource selection (Chef)  
✅ **Proper Organization** - Individual resources, not monoliths  
✅ **Educational Value** - Learn by example  
✅ **Production Patterns** - Scalable architecture  

Pick a server, boot it, and explore how MCP enables context-aware AI! 🚀

