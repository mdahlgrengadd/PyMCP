# MCP Resources & Prompts - Implementation Guide

## What We've Built

Your PyMCP project now has **full MCP support** including:

✅ **Tools** - Function calling (existing)  
✅ **Resources** - Context injection (NEW)  
✅ **Prompts** - Workflow templates (NEW)

## Quick Start

### 1. Define Resources in Python

Edit `src/py/my_server.py`:

```python
from mcp_core import McpServer, attach_pyodide_worker
import json

class MyService(McpServer):
    # ===== TOOLS (existing) =====
    def echo(self, message: str, upper: bool = False) -> str:
        '''Echo a message'''
        return message.upper() if upper else message
    
    # ===== RESOURCES (NEW) =====
    def resource_project_docs(self) -> dict:
        '''Project documentation and guidelines'''
        return {
            "mimeType": "text/markdown",
            "text": """# Project Guidelines
            
## Code Style
- Use TypeScript strict mode
- Follow ESLint rules
- Add JSDoc comments

## Architecture
- MCP server in Python (Pyodide)
- LLM client in TypeScript (WebLLM/wllama)
- Bridge pattern for integration
"""
        }
    
    def resource_config(self) -> str:
        '''Current application configuration'''
        config = {
            "environment": "development",
            "features": {
                "webgpu": True,
                "wasm": True,
                "function_calling": True
            }
        }
        return json.dumps(config, indent=2)
    
    # ===== PROMPTS (NEW) =====
    def prompt_code_review(self) -> dict:
        '''Structured code review assistant'''
        return {
            "description": "Comprehensive code review workflow",
            "messages": [{
                "role": "system",
                "content": """You are an expert code reviewer. Analyze code systematically:

1. **Correctness**: Does it work? Any bugs?
2. **Security**: Any vulnerabilities?
3. **Performance**: Any bottlenecks?
4. **Maintainability**: Is it readable and well-structured?
5. **Best Practices**: Does it follow conventions?

Provide specific, actionable feedback with examples."""
            }]
        }
    
    def prompt_debug_assistant(self) -> dict:
        '''Step-by-step debugging helper'''
        return {
            "description": "Debugging workflow",
            "messages": [{
                "role": "system",
                "content": """You are a debugging expert. Help users systematically:

1. **Understand**: What's the expected vs actual behavior?
2. **Isolate**: Where might the issue be?
3. **Investigate**: What data/logs do we need?
4. **Test**: What should we try?
5. **Fix**: What's the solution?

Ask clarifying questions and use available resources (logs, config)."""
            }]
        }

def boot():
    attach_pyodide_worker(MyService())
```

### 2. How It Works Now

After booting MCP:

```typescript
// 1. Resources and prompts are automatically discovered
const resources = state.bridge.resourceManager.getAvailableResources();
// → [
//     { uri: "res://project_docs", name: "Project Docs", mimeType: "text/markdown" },
//     { uri: "res://config", name: "Config", mimeType: "text/plain" }
//   ]

const prompts = state.bridge.resourceManager.getAvailablePrompts();
// → [
//     { name: "code-review", description: "Structured code review" },
//     { name: "debug-assistant", description: "Step-by-step debugging" }
//   ]

// 2. Select resources to include as context
state.selectedResources.add('res://project_docs');
state.selectedResources.add('res://config');

// 3. Select a prompt template (optional)
state.selectedPrompt = 'code-review';

// 4. Chat - context is automatically injected!
// The LLM will receive:
// - The code-review prompt as system message
// - Project docs content as reference
// - Config info as reference
// - Tool definitions
```

### 3. Example Usage Scenarios

#### Scenario A: Code Review with Guidelines

```
User: "Review this function: function add(a, b) { return a + b }"

Selected Resources: [project_docs]
Selected Prompt: code-review

Result: LLM reviews using YOUR project's coding standards
from the project_docs resource
```

#### Scenario B: Debugging with Config Context

```
User: "Why isn't WebGPU working?"

Selected Resources: [config]
Selected Prompt: debug-assistant

Result: LLM sees config shows webgpu: true,
         suggests checking browser support
```

#### Scenario C: General Chat without Context

```
User: "What is WebGPU?"

Selected Resources: []
Selected Prompt: null

Result: Normal chat response without extra context
```

## Next Steps: Add UI Controls

To make this user-friendly, add UI elements:

### A. Resource Selector (in index.html)

```html
<div class="sidebar-section">
  <h3>📚 Context Resources</h3>
  <div id="resources-list" class="resources-list">
    <!-- Populated dynamically -->
  </div>
</div>
```

### B. Prompt Selector (in index.html)

```html
<div class="sidebar-section">
  <h3>🎯 Prompt Templates</h3>
  <select id="prompt-select">
    <option value="">None (Default)</option>
    <!-- Populated dynamically -->
  </select>
</div>
```

### C. Populate Lists (in main.ts)

```typescript
async function updateResourcesList() {
  const resourcesList = document.getElementById('resources-list');
  
  if (state.availableResources.length === 0) {
    resourcesList.innerHTML = '<p class="muted">No resources available</p>';
    return;
  }
  
  resourcesList.innerHTML = state.availableResources.map(resource => `
    <label class="resource-checkbox">
      <input 
        type="checkbox" 
        value="${resource.uri}"
        onchange="handleResourceToggle('${resource.uri}')"
      />
      <span class="resource-name">${resource.name}</span>
      ${resource.description ? `<br/><small>${resource.description}</small>` : ''}
    </label>
  `).join('');
}

function handleResourceToggle(uri: string) {
  if (state.selectedResources.has(uri)) {
    state.selectedResources.delete(uri);
  } else {
    state.selectedResources.add(uri);
  }
}

async function updatePromptsList() {
  const promptSelect = document.getElementById('prompt-select') as HTMLSelectElement;
  
  promptSelect.innerHTML = '<option value="">None (Default)</option>';
  
  state.availablePrompts.forEach(prompt => {
    const option = document.createElement('option');
    option.value = prompt.name;
    option.textContent = `${prompt.name}${prompt.description ? ` - ${prompt.description}` : ''}`;
    promptSelect.appendChild(option);
  });
  
  promptSelect.addEventListener('change', () => {
    state.selectedPrompt = promptSelect.value || null;
  });
}

// Call after handleRefreshTools()
updateResourcesList();
updatePromptsList();
```

## Advanced: Slash Commands

For quick access to prompts, implement slash commands:

```typescript
// In chatInput event listener
chatInput.addEventListener('keydown', (e) => {
  if (e.key === '/' && chatInput.value === '') {
    // Show prompt selector popup
    showPromptMenu();
  }
});

function showPromptMenu() {
  const menu = document.createElement('div');
  menu.className = 'slash-command-menu';
  menu.innerHTML = state.availablePrompts.map(p => `
    <div class="slash-item" onclick="selectPrompt('${p.name}')">
      /${p.name}
      <small>${p.description || ''}</small>
    </div>
  `).join('');
  
  // Position and show menu
  document.body.appendChild(menu);
}

function selectPrompt(name: string) {
  state.selectedPrompt = name;
  // Update UI
  // Close menu
}
```

## Testing Your Implementation

### Test 1: Verify Discovery

```javascript
// In browser console after MCP boots:
console.log('Resources:', state.availableResources);
console.log('Prompts:', state.availablePrompts);
```

Expected output:
```
Resources: [
  { uri: "res://project_docs", name: "Project Docs", ... },
  { uri: "res://config", name: "Config", ... }
]
Prompts: [
  { name: "code-review", description: "Structured code review" },
  { name: "debug-assistant", description: "Step-by-step debugging" }
]
```

### Test 2: Verify Context Injection

Select a resource and send a message. Check browser console for:

```
Augmented system prompt: [should include resource content]
```

### Test 3: Compare With/Without Context

**Without resource**:
```
User: "What are our code style guidelines?"
LLM: "I don't have specific information about your guidelines..."
```

**With project_docs resource**:
```
User: "What are our code style guidelines?"
LLM: "Based on your project documentation, you follow these guidelines:
     - TypeScript strict mode
     - ESLint rules
     - JSDoc comments..."
```

## Real-World Use Cases

### Use Case 1: Documentation Bot

```python
def resource_api_docs(self) -> str:
    '''Complete API documentation'''
    return open('/path/to/docs.md').read()

def resource_examples(self) -> str:
    '''Code examples'''
    return open('/path/to/examples.py').read()

def prompt_explain_api(self) -> dict:
    return {
        "messages": [{
            "role": "system",
            "content": "Explain API endpoints using the api_docs resource. "
                      "Include examples from the examples resource."
        }]
    }
```

**Result**: Accurate API answers based on actual docs, not LLM training data.

### Use Case 2: Code Analysis Bot

```python
def resource_codebase(self) -> str:
    '''Current codebase structure'''
    # Generate from file system
    return generate_tree()

def prompt_refactor(self) -> dict:
    return {
        "messages": [{
            "role": "system",
            "content": "Suggest refactorings based on the codebase structure. "
                      "Ensure consistency with existing patterns."
        }]
    }
```

**Result**: Context-aware refactoring suggestions.

### Use Case 3: System Monitor

```python
def resource_metrics(self) -> dict:
    '''Live system metrics'''
    return {
        "mimeType": "application/json",
        "text": json.dumps(get_system_metrics())
    }

def resource_logs(self) -> str:
    '''Recent error logs'''
    return tail_log_file(lines=100)

def prompt_diagnose(self) -> dict:
    return {
        "messages": [{
            "role": "system",
            "content": "Diagnose system issues using metrics and logs. "
                      "Provide specific recommendations."
        }]
    }
```

**Result**: LLM can actually see system state and provide accurate diagnosis.

## Comparison with Alternatives

### vs. LangChain.js

| Feature | LangChain.js | PyMCP |
|---------|--------------|-------|
| Document Loading | DocumentLoader | MCP Resources |
| Vector Search | Yes | Manual (future enhancement) |
| Prompt Templates | PromptTemplate | MCP Prompts |
| Tool Calling | Tools interface | MCP Tools |
| Deployment | Node.js backend | 100% browser |
| Setup | npm install + config | Zero setup |

### vs. Manual Context

| Approach | PyMCP | Manual Paste |
|----------|-------|--------------|
| Updates | Automatic | Manual |
| Selection | UI checkboxes | Copy-paste |
| Structure | XML tags | Raw text |
| Reuse | Templates | Re-type |
| Dynamic | Yes (live data) | No |

## Key Benefits

1. 🎯 **Grounded Responses** - LLM uses YOUR data, not generic knowledge
2. 🔄 **Consistent Workflows** - Reusable prompt templates
3. 🚀 **Better Results** - Context + Tools = Powerful agent
4. 📚 **Scalable** - Add resources without code changes
5. 🎨 **Flexible** - User controls what context to include

## Summary

You've now implemented the **full MCP protocol** with:

1. **Tools** → Functions the LLM can call
2. **Resources** → Data the LLM can reference
3. **Prompts** → Templates the LLM follows

This enables **true RAG patterns** and **guided workflows** entirely in the browser! 🎉

Next: Add UI controls for resource/prompt selection to make it user-friendly.

