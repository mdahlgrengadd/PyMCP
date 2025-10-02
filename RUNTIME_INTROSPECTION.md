# Runtime Introspection - Python to TypeScript Client Generation

## Overview

This implementation features **runtime introspection** that automatically generates TypeScript client classes from Python MCP servers. The Python server introspects itself using Python's `inspect` module, and JavaScript dynamically creates a client class that mirrors the server's structure.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  1. Python Server (Pyodide)                                 │
│     ├─ MyService class with methods                         │
│     └─ Uses inspect module to analyze itself                │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ server/introspect → JSON schema
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Schema (JSON)                                            │
│     {                                                        │
│       className: "MyService",                               │
│       methods: [                                            │
│         {                                                    │
│           name: "echo",                                      │
│           category: "tool",                                  │
│           params: [{name: "message", type: "string"}],      │
│           returnType: "string"                              │
│         }                                                    │
│       ]                                                      │
│     }                                                        │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ generateClass()
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  3. TypeScript Client (Runtime Generated)                   │
│     const myService = {                                      │
│       async echo(message, upper) { ... }                    │
│       async add(a, b) { ... }                               │
│       async resource_help() { ... }                         │
│     }                                                        │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

### Python Side

- **`src/py/mcp_introspect.py`** - Introspection module
  - `introspect_server()` - Extracts metadata from server class
  - `_type_to_typescript()` - Converts Python types to TypeScript types

- **`src/py/mcp_core.py`** - Core MCP server
  - Added `server/introspect` endpoint at line 238

### TypeScript Side

- **`src/lib/runtime-class-generator.ts`** - Client class generator
  - `generateClientFromServer()` - Main entry point
  - `generateClass()` - Creates JavaScript class dynamically
  - `addMethodToClass()` - Adds methods to prototype

- **`src/main.ts`** - Integration
  - Creates runtime-generated client on boot
  - Exposes `window.mcp.myService` for debugging

## Usage

### Before (Manual MCP calls)

```typescript
// Object-based arguments
await tools.echo({ message: "hello", upper: true });
await tools.add({ a: 1, b: 2 });

// Manual URI construction
await client.readResource("res://doc/doc1");

// Manual prompt calls
await client.getPrompt("summarize", { doc_id: "doc1", max_words: 30 });
```

### After (Runtime-Generated Class)

```typescript
// Python-like positional arguments!
await myService.echo("hello", true);
await myService.add(1, 2);

// Method calls instead of URIs
await myService.resource_doc("doc1");

// Clean prompt interface
await myService.prompt_summarize("doc1", 30);
```

## Benefits

### 1. **Always In Sync**
The client is generated from the **actual running server**, so it's always perfectly synchronized. Add a method in Python, and it's immediately available in JavaScript.

```python
# Add to Python
def multiply(self, x: float, y: float) -> float:
    '''Multiply two numbers.'''
    return x * y
```

```typescript
// Automatically available after reload!
await myService.multiply(3, 4); // Works!
```

### 2. **Python-Like Interface**
Use positional arguments like Python instead of verbose object notation.

```typescript
// Natural Python-style calls
await myService.echo("hello", true);
await myService.add(1.5, 2.25);
await myService.resource_doc("doc1");
```

### 3. **Type Information Preserved**
Python type hints are converted to TypeScript types:

```python
def echo(self, message: str, upper: bool = False) -> str:
```

Becomes:

```typescript
async echo(message: string, upper?: boolean): Promise<string>
```

### 4. **Zero Build Step**
Everything happens at runtime in the browser. No code generation scripts needed!

### 5. **Debugging Tools**

```typescript
// In browser console:

// See all available methods
window.mcp.printMethods();

// Access the service
window.mcp.myService.echo("test");

// Inspect method metadata
console.log(window.mcp.myService.__methods__());

// View method signature
console.log(window.mcp.myService.echo.toString());
```

## Type Mappings

Python → TypeScript type conversions:

| Python Type | TypeScript Type |
|------------|----------------|
| `str` | `string` |
| `int` | `number` |
| `float` | `number` |
| `bool` | `boolean` |
| `dict` | `Record<string, any>` |
| `list` | `any[]` |
| `None` | `void` |
| Custom (e.g., `Item`) | `Item` |

## Method Categories

### Tools (Plain Methods)
```python
def echo(self, message: str) -> str:
    return message
```
→ `await myService.echo("hello")`

### Resources (resource_* prefix)
```python
def resource_doc(self, doc_id: str) -> str:
    return self._documents[doc_id]
```
→ `await myService.resource_doc("doc1")`
→ Automatically constructs URI: `res://doc/doc1`

### Prompts (prompt_* prefix)
```python
def prompt_summarize(self, doc_id: str, max_words: int = 50) -> dict:
    return {...}
```
→ `await myService.prompt_summarize("doc1", 30)`

## Console Debugging

```javascript
// Access via window.mcp
const { client, myService, printMethods } = window.mcp;

// List all methods with signatures
printMethods();

// Output:
// 📋 MyServiceClient (6 methods, runtime-generated)
//
//   TOOL: echo(message: string, upper?: boolean)
//     → string
//     Echo a message. Set upper to True to shout.
//
//   TOOL: add(a: number, b: number)
//     → number
//     Add two numbers.
//
//   RESOURCE: resource_doc(doc_id: string)
//     → string
//     Get document by ID

// Call methods directly
await myService.echo("hello", true);  // "HELLO"
await myService.add(1, 2);            // 3
await myService.resource_help();      // "# MyService Help..."
```

## How to Extend

### Add a New Tool

```python
# In my_server.py
def uppercase(self, text: str) -> str:
    '''Convert text to uppercase.'''
    return text.upper()
```

**That's it!** Reload the page and use:
```typescript
await myService.uppercase("hello"); // "HELLO"
```

### Add a New Resource

```python
def resource_config(self) -> dict:
    '''Server configuration.'''
    return {"version": "1.0", "mode": "production"}
```

Use:
```typescript
const config = await myService.resource_config();
```

### Add a New Prompt

```python
def prompt_translate(self, text: str, target_lang: str = "es") -> dict:
    '''Translation prompt.'''
    return {
        "description": f"Translate to {target_lang}",
        "messages": [...]
    }
```

Use:
```typescript
const prompt = await myService.prompt_translate("Hello", "es");
```

## Technical Details

### Introspection Endpoint

The server exposes a special `server/introspect` method:

```typescript
const schema = await client.call('server/introspect', {});
// Returns complete server metadata
```

This endpoint is available **before** the MCP initialization handshake, allowing clients to discover the server structure early.

### Dynamic Class Generation

The client class is created using JavaScript's dynamic features:

```typescript
const GeneratedClass = class {
  constructor(client) { this.client = client; }
};

// Add methods dynamically to prototype
GeneratedClass.prototype[method.name] = async function(...args) {
  // Implementation...
};

return new GeneratedClass(client);
```

### Method Wrapping

Each method type has a different implementation:

**Tools:**
```typescript
async echo(...args) {
  const result = await this.client.call('tools/call', {
    name: 'echo',
    arguments: { message: args[0], upper: args[1] }
  });
  return this.client.unwrapContent(result);
}
```

**Resources:**
```typescript
async resource_doc(doc_id) {
  const result = await this.client.readResource(`res://doc/${doc_id}`);
  return result.contents[0].text;
}
```

**Prompts:**
```typescript
async prompt_summarize(doc_id, max_words) {
  return this.client.getPrompt('summarize', { doc_id, max_words });
}
```

## Limitations

1. **Positional Arguments Only** - Uses positional args, not named/keyword args
2. **No Optional Parameter Detection** - Can't distinguish required vs optional params in usage
3. **Type Information Lost at Runtime** - No TypeScript type checking on generated class
4. **Single Parameter for Parameterized Resources** - Only supports one URI parameter

## Future Enhancements

- [ ] TypeScript `.d.ts` file generation for type safety
- [ ] Support for named/keyword arguments
- [ ] Better handling of optional parameters
- [ ] Multi-parameter resource URIs
- [ ] WebSocket transport support
- [ ] Static code generation option (build-time)

## Comparison with Traditional Approach

| Feature | Traditional (Proxy) | Runtime Generated |
|---------|-------------------|-------------------|
| Arguments | `{ a: 1, b: 2 }` | `1, 2` |
| Verbosity | High | Low |
| Type Safety | Via codegen | None (dynamic) |
| Sync with Server | Manual update | Automatic |
| Resources | Manual URIs | Method calls |
| Prompts | Manual calls | Method calls |
| Python-like | ❌ | ✅ |

## Example: Full Workflow

```python
# 1. Define Python server
class MyService(McpServer):
    def greet(self, name: str, formal: bool = False) -> str:
        '''Greet a person.'''
        if formal:
            return f"Good day, {name}."
        return f"Hi {name}!"
```

```typescript
// 2. Boot MCP client (automatic introspection)
const client = new PyodideMcpClient(transport);
await client.init(indexURL);

// 3. Generate client class (automatic)
const myService = await generateClientFromServer(client);

// 4. Use it like Python!
await myService.greet("Alice", false);  // "Hi Alice!"
await myService.greet("Bob", true);     // "Good day, Bob."
```

**No code generation step. No manual updates. Always in sync!**


