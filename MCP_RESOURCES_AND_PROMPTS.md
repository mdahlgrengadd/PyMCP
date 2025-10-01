# MCP Resources and Prompts Implementation

## Overview

This document explains how **MCP Resources** and **Prompts** are implemented in PyMCP to enable **context-aware AI** and **guided workflows**.

## What Are These Features?

### 🗄️ **Resources** - Context Injection (RAG Pattern)

**Purpose**: Provide read-only data that enriches the LLM's responses with factual context.

**Think of it as**: "Giving the AI a library of reference documents to consult"

**Examples**:
- 📄 Code files, documentation, API schemas
- 🔧 Configuration files, environment variables
- 📊 System logs, metrics, database records
- 🖼️ Images, screenshots (base64 encoded)
- 🌐 API responses, web content

### 🎯 **Prompts** - Workflow Templates

**Purpose**: Predefined templates that guide the LLM through specific workflows or personas.

**Think of it as**: "Giving the AI a recipe to follow"

**Examples**:
- `/analyze-code` - Structured code analysis workflow
- `/debug-error` - Step-by-step debugging assistant
- `/review-pr` - Pull request review checklist
- `/write-tests` - Unit test generation template
- `/expert-mode` - Activate expert persona with specific guidelines

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interaction                         │
│  [Select Prompt Template ▼]  [Select Resources ☑]          │
│  • /analyze-code             ☑ config.json                  │
│  • /debug                    ☑ error.log                    │
│  • /review-pr                ☐ api-docs.md                  │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                  McpResourceManager                          │
│  • discoverResources() → List available resources           │
│  • discoverPrompts() → List available templates             │
│  • loadResource(uri) → Fetch resource content               │
│  • getPrompt(name) → Get prompt template                    │
│  • buildResourceContext() → Format context for LLM          │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                    McpLLMBridge                              │
│  buildAugmentedSystemPrompt():                              │
│   1. Apply prompt template (if selected)                    │
│   2. Inject resource context                                │
│   3. Add tool descriptions                                  │
│   → Augmented System Prompt                                 │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                      LLM Chat                                │
│  Messages: [System with context, User query, Tools...]      │
│  → Context-aware response using resources + tools           │
└─────────────────────────────────────────────────────────────┘
```

## How It Works

### 1. **Resource Discovery & Loading**

When MCP server boots, the client discovers available resources:

```python
# Python MCP Server (my_server.py)
class MyService(McpServer):
    def resource_config(self) -> dict:
        '''Application configuration file'''
        return {
            "mimeType": "application/json",
            "text": json.dumps({"env": "production", "debug": False})
        }
    
    def resource_logs(self) -> str:
        '''Recent application logs'''
        return "2024-01-01 Error: Connection timeout..."
```

The client then:
1. Calls `resources/list` to discover available resources
2. User or app selects relevant resources
3. Calls `resources/read` for each selected resource
4. Injects content into system prompt

**Result**: LLM has access to actual data to ground its responses.

### 2. **Context Injection Format**

Resources are formatted and injected into the system prompt:

```
## Available Context Resources

The following resources have been provided for context. Reference them when relevant:

<resource uri="res://config" type="application/json">
{
  "env": "production",
  "debug": false,
  "api_key": "..."
}
</resource>

<resource uri="res://logs" type="text/plain">
2024-01-01 12:00:00 ERROR Connection timeout to database
2024-01-01 12:01:15 WARN Retrying connection (attempt 2/3)
</resource>

---

[Rest of system prompt with tools, etc.]
```

### 3. **Prompt Templates**

Prompt templates structure how the AI should respond:

```python
# Python MCP Server
def prompt_analyze_code(self) -> dict:
    '''Analyze code for improvements and bugs'''
    return {
        "description": "Code analysis workflow",
        "messages": [
            {
                "role": "system",
                "content": """You are an expert code reviewer. When analyzing code:
                
1. **Security**: Check for vulnerabilities
2. **Performance**: Identify bottlenecks
3. **Maintainability**: Suggest improvements
4. **Best Practices**: Compare against standards

Provide structured output with sections for each category."""
            }
        ]
    }
```

When user selects `/analyze-code`, this template becomes the system prompt.

## Comparison with LangChain Patterns

| Feature | LangChain.js | This Implementation |
|---------|--------------|---------------------|
| **Document Loading** | `DocumentLoader` classes | MCP Resources (`resource_*`) |
| **Text Splitting** | `TextSplitter` | Manual chunking in Python |
| **Vector Search** | VectorStore + Embeddings | N/A (direct resource selection) |
| **Retrieval** | Retrievers | User/app selects resources |
| **Prompt Templates** | `PromptTemplate` class | MCP Prompts (`prompt_*`) |
| **Memory** | `ConversationChain` | `conversationHistory` array |
| **Tools** | Tool interface | MCP Tools (function calling) |

**Key Difference**: LangChain uses **semantic search** for automatic retrieval. PyMCP uses **explicit selection** (user or app decides which resources to include).

## Use Cases

### Use Case 1: Code Review with Context

```typescript
// User selects:
// - Prompt: /review-pr
// - Resources: [config.json, CONTRIBUTING.md, test-results.json]

// Result: LLM reviews code with knowledge of:
// - Project configuration
// - Contribution guidelines
// - Current test status
```

### Use Case 2: Debugging with Logs

```typescript
// User asks: "Why is the API failing?"
// - Resources: [error.log, api-config.json]

// LLM can reference actual error messages and configuration
// to provide specific debugging steps
```

### Use Case 3: Documentation Assistant

```typescript
// User asks: "How do I authenticate?"
// - Resources: [api-docs.md, auth-example.py]

// LLM provides answer based on actual documentation
// rather than potentially outdated training data
```

## Implementation Example

### Python Server Implementation

```python
from mcp_core import McpServer, attach_pyodide_worker
import json

class DocumentationServer(McpServer):
    # ===== TOOLS =====
    def search_docs(self, query: str) -> str:
        '''Search documentation for a query'''
        # Tool implementation
        return f"Search results for: {query}"
    
    # ===== RESOURCES =====
    def resource_api_docs(self) -> dict:
        '''Complete API documentation'''
        return {
            "mimeType": "text/markdown",
            "text": """# API Documentation
            
## Authentication
Use Bearer tokens...
            
## Endpoints
- GET /users
- POST /users
"""
        }
    
    def resource_changelog(self) -> str:
        '''Version history and changes'''
        return """
# Changelog
## v2.0.0 (2024-01-01)
- Breaking: Removed legacy auth
- Added: OAuth2 support
"""
    
    # ===== PROMPTS =====
    def prompt_explain_api(self) -> dict:
        '''Explain API endpoint usage with examples'''
        return {
            "description": "API explanation template",
            "messages": [{
                "role": "system",
                "content": """You are an API documentation expert. When explaining endpoints:

1. Show the endpoint URL and method
2. List required parameters
3. Provide a curl example
4. Show expected response
5. Note common errors

Use the api_docs resource for accurate information."""
            }]
        }

def boot():
    attach_pyodide_worker(DocumentationServer())
```

### TypeScript Client Usage

```typescript
// After MCP boots, resources and prompts are discovered
const resources = await bridge.resourceManager.discoverResources();
const prompts = await bridge.resourceManager.discoverPrompts();

// User selects context
state.selectedResources.add('res://api_docs');
state.selectedResources.add('res://changelog');
state.selectedPrompt = 'explain-api';

// Chat with augmented context
const result = await bridge.chatWithTools(
  "How do I authenticate users?",
  conversationHistory,
  onStream,
  onToolExecution,
  {
    systemPrompt: "You are a helpful API assistant.",
    temperature: 0.7,
    selectedResources: Array.from(state.selectedResources),
    promptTemplate: state.selectedPrompt
  }
);

// LLM now has:
// 1. The explain-api prompt template (structured guidance)
// 2. Full API docs as context
// 3. Changelog for version info
// 4. Available tools for searching
```

## Best Practices

### For Resources

1. ✅ **Keep resources focused** - One resource = one coherent document
2. ✅ **Use clear descriptions** - Help users/apps select relevant resources
3. ✅ **Consider size** - Large resources may exceed context windows
4. ✅ **Update dynamically** - Resources can reflect live data
5. ✅ **Use appropriate mimeTypes** - Helps formatting and parsing

❌ **Don't**: Dump entire databases or massive files  
✅ **Do**: Provide relevant subsets or summaries

### For Prompts

1. ✅ **Be specific** - Clear instructions lead to better results
2. ✅ **Structure workflows** - Break complex tasks into steps
3. ✅ **Reference resources** - Tell LLM to use available context
4. ✅ **Include examples** - Show desired output format
5. ✅ **Make them discoverable** - Good names and descriptions

❌ **Don't**: Create overly generic prompts  
✅ **Do**: Create focused, purpose-driven templates

### For Selection Logic

**Manual Selection (Current Implementation)**:
- User explicitly chooses resources/prompts
- Good for: Debugging, code review, documentation
- Pro: User control, transparency
- Con: Requires user decision

**Future: Automatic Selection**:
```typescript
// Example: Auto-select resources based on query
async function smartResourceSelection(query: string): Promise<string[]> {
  // Could use embeddings, keywords, or rules
  if (query.includes('authentication')) {
    return ['res://api_docs', 'res://auth_example'];
  }
  return [];
}
```

## Integration Points

### Current State

- ✅ Resource and Prompt discovery on MCP boot
- ✅ Context injection into system prompts
- ✅ Template application for guided workflows
- ⏳ UI for resource/prompt selection (to be added)
- ⏳ Slash commands for quick prompt access (to be added)

### Future Enhancements

1. **UI Components**:
   - Resource selector with preview
   - Prompt template dropdown (slash commands)
   - Context preview panel

2. **Smart Selection**:
   - Keyword-based auto-selection
   - Embeddings for semantic matching
   - User preferences/history

3. **Advanced Features**:
   - Resource caching with TTL
   - Dynamic resource templates (parameterized URIs)
   - Prompt composition (combine multiple templates)
   - Resource streaming for large content

## Summary

**Resources** provide the LLM with **factual context** (RAG pattern), while **Prompts** provide **structural guidance** (workflow templates). Together, they enable:

1. 📊 **Grounded responses** - LLM references actual data, not hallucinations
2. 🎯 **Consistent workflows** - Standardized interaction patterns
3. 🔧 **Tool synergy** - Context + Actions = Powerful agent
4. 🚀 **Better UX** - Pre-built templates for common tasks

This is the **proper** way to use MCP's full feature set beyond just function calling!

