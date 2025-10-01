# Tool Description Best Practices

## The Problem: LLM Enum Value Confusion

When tools use `Literal` types (enums) for parameters, LLMs often guess values that are "close" but not exact.

### Examples of This Issue

#### Issue 1: Chef Server
```python
# Tool definition
def find_recipes_by_dietary(
    self,
    dietary_restriction: Literal["vegan", "vegetarian", "gluten-free", "dairy-free"]
):
    """Find recipes matching dietary restrictions"""
```

**LLM mistake:**
```javascript
// LLM tried to use it for cuisine search
find_recipes_by_dietary(dietary_restriction="thai")  ❌ 
// Error: 'thai' not in enum!
```

#### Issue 2: Fitness Server
```python
# Tool definition
def find_workouts(
    self,
    goal: Literal["build strength", "fat loss", "flexibility", "endurance"]
):
    """Find workout programs matching goals and fitness level"""
```

**LLM mistake:**
```javascript
// LLM abbreviated the enum value
find_workouts(goal="strength")  ❌ 
// Error: Should be "build strength"!
```

---

## Best Practices

### 1. ✅ Be EXPLICIT About Enum Values in Descriptions

**❌ Bad:**
```python
def find_workouts(
    goal: Literal["build strength", "fat loss", "flexibility", "endurance"]
):
    """Find workout programs matching goals and fitness level"""
```

**✅ Good:**
```python
def find_workouts(
    goal: Literal["build strength", "fat loss", "flexibility", "endurance"]
):
    """Find workout programs matching goals and fitness level.
    
    IMPORTANT: goal must be EXACTLY one of: "build strength", "fat loss", "flexibility", "endurance"
    (Note: use "build strength" not just "strength")
    """
```

### 2. ✅ Clarify Tool Purpose to Prevent Misuse

**❌ Bad:**
```python
def find_recipes_by_dietary(
    dietary_restriction: Literal["vegan", "vegetarian", "gluten-free", "dairy-free"]
):
    """Find recipes matching dietary restrictions"""
```

**✅ Good:**
```python
def find_recipes_by_dietary(
    dietary_restriction: Literal["vegan", "vegetarian", "gluten-free", "dairy-free"]
):
    """Find recipes matching SPECIFIC dietary restrictions (vegan, vegetarian, 
    gluten-free, dairy-free ONLY).
    
    Use this ONLY for dietary needs. For cuisine types (Thai, Italian, Mexican) 
    or general recipe search, use search_recipes_semantic instead.
    """
```

### 3. ✅ Provide Examples in Descriptions

**❌ Bad:**
```python
def search_recipes_semantic(query: str):
    """Semantically search recipes based on query using embeddings."""
```

**✅ Good:**
```python
def search_recipes_semantic(query: str):
    """Search for recipes by ANY criteria: cuisine (Thai, Italian, Mexican), 
    ingredients, dish names, or cooking style.
    
    Examples: "Thai food", "pasta dishes", "chicken recipes", "spicy Mexican", "easy desserts"
    """
```

### 4. ✅ Use Descriptive Enum Values

**❌ Bad:**
```python
# Ambiguous enum values
goal: Literal["strength", "cardio", "flex", "endurance"]
```

**✅ Good:**
```python
# Clear, self-explanatory enum values
goal: Literal["build strength", "fat loss", "flexibility", "endurance"]
```

### 5. ✅ Warn About Similar Tools

If you have multiple tools that might be confused:

```python
def find_recipes_by_dietary(...):
    """Find recipes matching SPECIFIC dietary restrictions (vegan, vegetarian, 
    gluten-free, dairy-free ONLY).
    
    ⚠️ NOT for cuisine types! Use search_recipes_semantic for: Thai, Italian, 
    Mexican, etc.
    """

def search_recipes_semantic(...):
    """Search for recipes by ANY criteria: cuisine (Thai, Italian, Mexican), 
    ingredients, dish names, or cooking style.
    
    ⚠️ Use find_recipes_by_dietary ONLY for: vegan, vegetarian, gluten-free, 
    dairy-free.
    """
```

---

## Template for Enum Parameters

Use this template for any tool with enum parameters:

```python
def your_tool(
    self,
    param: Literal["value1", "value2", "value3"]
) -> ReturnType:
    """Brief description of what this tool does.
    
    IMPORTANT: param must be EXACTLY one of:
    - "value1": Description of when to use this
    - "value2": Description of when to use this
    - "value3": Description of when to use this
    
    Examples:
    - Use case 1: your_tool(param="value1")
    - Use case 2: your_tool(param="value2")
    
    Common mistakes to avoid:
    - ❌ Don't use "val1" (abbreviation)
    - ❌ Don't use "Value1" (wrong case)
    - ✅ Use exact strings: "value1", "value2", "value3"
    """
    # implementation
```

---

## Checklist for New Tools

When creating a new MCP tool with enum parameters:

- [ ] List all enum values EXPLICITLY in the docstring
- [ ] Include "IMPORTANT" or "Note" about exact values
- [ ] Provide examples of correct usage
- [ ] Warn about common mistakes (abbreviations, case, etc.)
- [ ] Clarify when to use this tool vs similar tools
- [ ] Test with actual LLM to catch confusion

---

## Testing Strategy

### 1. Test with Ambiguous Queries

Try queries that might confuse the LLM:

```javascript
// Test query that could match multiple tools
"Show me strength workouts"

// Should use: find_workouts(goal="build strength")
// Might mistake: find_workouts(goal="strength") ❌
```

### 2. Test with Abbreviated Values

```javascript
// Test shortened enum values
"Find veg recipes"

// Should use: find_recipes_by_dietary(dietary_restriction="vegan")
// Might mistake: find_recipes_by_dietary(dietary_restriction="veg") ❌
```

### 3. Test Cross-Tool Confusion

```javascript
// Test queries that might use wrong tool
"Show me Thai recipes"

// Should use: search_recipes_semantic(query="Thai")
// Might mistake: find_recipes_by_dietary(dietary_restriction="thai") ❌
```

---

## Error Handling

When enum validation fails, the error message shows:

```
ValidationError: 1 validation error for find_workoutsParams
goal
  Input should be 'build strength', 'fat loss', 'flexibility' or 'endurance' 
  [type=literal_error, input_value='strength', input_type=str]
```

**This tells you:**
1. ✅ Which tool had the error (`find_workouts`)
2. ✅ Which parameter was wrong (`goal`)
3. ✅ What values are allowed (`'build strength', 'fat loss', ...`)
4. ✅ What value the LLM tried (`'strength'`)

**Action:** Update the tool description to clarify the exact enum values!

---

## Real-World Examples

### Chef Server (Fixed)

```python
def find_recipes_by_dietary(
    dietary_restriction: Literal["vegan", "vegetarian", "gluten-free", "dairy-free"]
):
    """Find recipes matching SPECIFIC dietary restrictions (vegan, vegetarian, 
    gluten-free, dairy-free ONLY).
    
    Use this ONLY for dietary needs. For cuisine types (Thai, Italian, Mexican) 
    or general recipe search, use search_recipes_semantic instead.
    """
```

**Result:** ✅ LLM now uses correct tool for each query type

### Fitness Server (Fixed)

```python
def find_workouts(
    goal: Literal["build strength", "fat loss", "flexibility", "endurance"],
    level: Literal["beginner", "intermediate", "advanced"] = "beginner"
):
    """Find workout programs matching goals and fitness level.
    
    IMPORTANT: goal must be EXACTLY one of: "build strength", "fat loss", "flexibility", "endurance"
    (Note: use "build strength" not just "strength")
    
    level: "beginner", "intermediate", or "advanced"
    """
```

**Result:** ✅ LLM now uses "build strength" instead of "strength"

---

## Summary

**Key Principles:**

1. 🎯 **Be Explicit**: List exact enum values in description
2. 📝 **Provide Examples**: Show correct usage
3. ⚠️ **Warn About Mistakes**: Point out common errors
4. 🔍 **Clarify Purpose**: Explain when to use vs other tools
5. ✅ **Test Thoroughly**: Try ambiguous queries

**Remember:** LLMs are good at understanding intent but bad at guessing exact enum values. Always be explicit!

---

## Quick Reference

```python
# ❌ Minimal description (LLM will guess)
def tool(param: Literal["a", "b", "c"]):
    """Do something"""

# ✅ Explicit description (LLM knows exactly what to use)
def tool(param: Literal["a", "b", "c"]):
    """Do something.
    
    IMPORTANT: param must be EXACTLY: "a", "b", or "c"
    
    Examples: tool(param="a"), tool(param="b")
    """
```

**This prevents validation errors and improves LLM tool selection!** 🎉

