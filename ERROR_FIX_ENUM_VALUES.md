# Fix: Pydantic Validation Error for Enum Parameters

## The Error

```
ValidationError: 1 validation error for find_workoutsParams
goal
  Input should be 'build strength', 'fat loss', 'flexibility' or 'endurance'
  [type=literal_error, input_value='fat_loss', input_type=str]
```

## Root Cause

The LLM was calling the function with:
```javascript
find_workouts({"goal": "fat_loss", "level": "intermediate"})
```

But the Python function expects:
```python
def find_workouts(
    goal: Literal["build strength", "fat loss", "flexibility", "endurance"]
)
```

**The issue:** The LLM converted the natural language "fat loss" into a parameter value `"fat_loss"` (with underscore), but the Pydantic `Literal` type requires the exact string `"fat loss"` (with space).

## Why It Happened

The `buildToolCallingPrompt()` function in `src/lib/function-call-parser.ts` was **not including enum values** in the tool descriptions sent to the LLM. 

The parameter description only showed:
```
- goal (string) [required]: Goal
```

Without seeing the allowed values, the LLM had to guess the format and incorrectly chose `"fat_loss"` (snake_case) instead of `"fat loss"` (with space).

## The Fix

### 1. Enhanced Parameter Descriptions

Modified `buildToolCallingPrompt()` to extract and display enum values from JSON schemas:

```typescript
// Now detects enum values from:
// 1. schema.enum (standard JSON schema)
// 2. schema.anyOf with const (Pydantic Literal types)

if (schema.enum && Array.isArray(schema.enum)) {
  paramDesc += ` - MUST be one of: ${schema.enum.map((v: any) => JSON.stringify(v)).join(', ')}`;
}
else if (schema.anyOf && Array.isArray(schema.anyOf)) {
  const enumValues = schema.anyOf
    .filter((item: any) => item.const !== undefined)
    .map((item: any) => item.const);
  if (enumValues.length > 0) {
    paramDesc += ` - MUST be one of: ${enumValues.map((v: any) => JSON.stringify(v)).join(', ')}`;
  }
}
```

Now the LLM sees:
```
- goal (string) [required] - MUST be one of: "build strength", "fat loss", "flexibility", "endurance"
- level (string) - MUST be one of: "beginner", "intermediate", "advanced"
```

### 2. Added Enum Examples

Added correct and incorrect examples to the system prompt:

```
CORRECT:
<function>{"name": "find_workouts", "parameters": {"goal": "fat loss", "level": "intermediate"}}</function>

INCORRECT:
<function>{"name": "find_workouts", "parameters": {"goal": "fat_loss"}}</function>  ❌ Wrong enum value!
```

### 3. Added Critical Reminder

```
CRITICAL: When a parameter has enum values (listed as "MUST be one of"), 
use the EXACT string including spaces, not underscores or abbreviations!
```

## Testing

To verify the fix:

1. Reload your app to get the updated tool descriptions
2. Try asking: "Show me fat loss workout programs for intermediate level"
3. The LLM should now generate: `{"goal": "fat loss", "level": "intermediate"}`
4. The function call should succeed ✅

## Impact

This fix applies to **all tools with enum/Literal parameters**, including:

- `find_workouts`: goal parameter
- `estimate_calories`: sex, activity_level parameters
- Any future tools with Literal/enum types

The LLM will now see the exact allowed values and use them correctly!

## Related

- See `TOOL_DESCRIPTION_BEST_PRACTICES.md` for general best practices on tool descriptions
- The fitness_server.py already had excellent docstrings, but they weren't being properly communicated to the LLM

