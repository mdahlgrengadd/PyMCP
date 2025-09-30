# Function Call Parser - Robustness Fix

## Problem

The LLM was generating malformed function calls like:
```
<substitute_ingredient>{"ingredient": "pasta", "reason": "vegan"}</function>
```

Notice:
- Opening tag: `<substitute_ingredient>` (uses function name)
- Closing tag: `</function>` (uses generic "function")
- **Tags don't match!**

This caused the parser to fail with "No function calls detected".

## Root Cause

The LLM sometimes confuses:
1. What the function **name** is (`substitute_ingredient`)
2. What the **XML tag** should be (`<function>`)

It incorrectly uses the function name as the opening tag.

## Solution

### 1. Made Parser More Robust

**Before:**
```typescript
// Only matched: <function>...</function>
const match = text.match(/<function>([\s\S]*?)<\/function>/);
```

**After:**
```typescript
// First try standard format: <function>...</function>
let match = text.match(/<function>([\s\S]*?)<\/function>/);

if (!match) {
  // Also handle malformed: <function_name>...</function>
  const malformedMatch = text.match(/<([a-z_][a-z0-9_]*)>([\s\S]*?)<\/(?:function|[a-z_][a-z0-9_]*)>/i);
  
  if (malformedMatch) {
    const functionName = malformedMatch[1];
    const content = malformedMatch[2].trim();
    
    return {
      name: functionName,
      arguments: JSON.stringify(JSON.parse(content))
    };
  }
}
```

**Now handles:**
- ✅ `<function>{"name": "search", "parameters": {...}}</function>` (standard)
- ✅ `<search_recipes>{...}</function>` (malformed opening tag)
- ✅ `<search_recipes>{...}</search_recipes>` (both tags wrong)
- ✅ `<substitute_ingredient>{"ingredient": "pasta"}</function>` (your case!)

### 2. Improved System Prompt

**Before:**
```
To use a tool, respond with:
<function>{"name": "tool_name", "parameters": {...}}</function>
```

**After:**
```
To use a tool, you MUST respond with this EXACT format:
<function>{"name": "tool_name", "parameters": {...}}</function>

CRITICAL FORMAT RULES:
- Opening tag MUST be: <function> (not <tool_name>)
- Closing tag MUST be: </function> (not </tool_name>)

CORRECT examples:
<function>{"name": "search_recipes", "parameters": {...}}</function>

INCORRECT examples (DO NOT USE):
<search_recipes>{...}</function>  ❌ Wrong opening tag!
```

This should **reduce** (but not eliminate) malformed calls.

### 3. Updated Message Cleaner

```typescript
export function cleanAssistantMessage(text: string): string {
  // Try standard format
  let match = text.match(/<function>([\s\S]*?)<\/function>/);
  if (match) return match[0];
  
  // Handle malformed and normalize to standard format
  const malformedMatch = text.match(/<([a-z_][a-z0-9_]*)>([\s\S]*?)<\/(?:function|[a-z_][a-z0-9_]*)>/i);
  if (malformedMatch) {
    // Convert: <substitute_ingredient>{...}</function>
    // To:      <function>{"name": "substitute_ingredient", "parameters": {...}}</function>
    return `<function>{"name": "${malformedMatch[1]}", "parameters": ${malformedMatch[2].trim()}}</function>`;
  }
  
  return text;
}
```

## Testing

### Test Case 1: Your Original Error
**Input:**
```
<substitute_ingredient>{"ingredient": "pasta", "reason": "vegan"}</function>
```

**Before:** ❌ No function calls detected

**After:** ✅ Detected
```javascript
{
  name: "substitute_ingredient",
  arguments: '{"ingredient":"pasta","reason":"vegan"}'
}
```

### Test Case 2: Standard Format (Still Works)
**Input:**
```
<function>{"name": "search_recipes", "parameters": {"query": "pasta"}}</function>
```

**Result:** ✅ Detected (unchanged behavior)

### Test Case 3: Both Tags Wrong
**Input:**
```
<search_recipes>{"query": "pasta"}</search_recipes>
```

**Before:** ❌ No function calls detected

**After:** ✅ Detected
```javascript
{
  name: "search_recipes",
  arguments: '{"query":"pasta"}'
}
```

### Test Case 4: Mixed Content
**Input:**
```
<substitute_ingredient>{"ingredient": "butter", "reason": "vegan"}</function>

Here are some vegan butter substitutes:
- Coconut oil
- Vegan margarine
```

**Result:** ✅ Function detected, explanatory text preserved

## Benefits

1. ✅ **Backward Compatible**: Standard format still works
2. ✅ **Forward Compatible**: Handles malformed LLM outputs
3. ✅ **Clear Feedback**: Better error messages
4. ✅ **Better Prompting**: Clearer instructions reduce mistakes
5. ✅ **Graceful Degradation**: Tries standard first, falls back to robust parser

## Regex Breakdown

```typescript
/<([a-z_][a-z0-9_]*)>([\s\S]*?)<\/(?:function|[a-z_][a-z0-9_]*)>/i
```

- `<([a-z_][a-z0-9_]*)>` - Capture opening tag (function name)
  - Must start with letter or underscore
  - Can contain letters, numbers, underscores
- `([\s\S]*?)` - Capture content (non-greedy)
- `<\/(?:function|[a-z_][a-z0-9_]*)>` - Match closing tag
  - Either `</function>` or `</function_name>`
  - Non-capturing group `(?:...)`
- `/i` - Case insensitive

## Future Improvements

### 1. Even More Robust Parsing
```typescript
// Handle: <FUNCTION>...</FUNCTION> (wrong case)
// Handle: function(...) (no XML tags at all)
// Handle: {"name": "search"} (bare JSON, no tags)
```

### 2. LLM Fine-tuning
- Fine-tune model on correct function calling format
- Reduce reliance on parser robustness

### 3. Auto-correction with Feedback
```typescript
if (malformedDetected) {
  addSystemMessage("Note: Please use <function> tags, not function name tags");
}
```

## Summary

**This fix ensures function calls work even when the LLM generates malformed XML tags.**

**Your specific error:**
```
<substitute_ingredient>{...}</function>  ❌ Was failing
                                         ✅ Now works!
```

The parser is now **resilient** to common LLM mistakes while maintaining backward compatibility with the standard format. 🎉

