# Hello World MCP Server 🚀

A **complete, lightweight example** MCP server that demonstrates all features while being super small and well-documented. Perfect for learning MCP development!

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start](#quick-start)
- [Tools](#tools)
- [Resources](#resources)
- [Prompts](#prompts)
- [Usage Examples](#usage-examples)
- [Architecture](#architecture)
- [Development Guide](#development-guide)

## 🎯 Overview

The Hello World MCP Server is a **comprehensive example** that showcases:

- ✅ **All MCP Features**: Tools, Resources, Prompts
- ✅ **Lightweight**: Only ~400 lines of code
- ✅ **Well Documented**: Every function explained
- ✅ **Production Ready**: Error handling, validation
- ✅ **Educational**: Perfect for learning MCP

## 🌟 Features

### 🛠️ Tools (3 Interactive Functions)
- **`greet(name)`** - Friendly greetings with validation
- **`calculate(operation, a, b)`** - Basic math operations
- **`echo(text)`** - Text processing with metadata

### 📚 Resources (3 Static Content)
- **`res://getting_started`** - Complete introduction guide
- **`res://examples`** - Practical usage examples
- **`res://api_reference`** - Full API documentation

### 🎯 Prompts (3 Workflow Templates)
- **`prompt://conversation_starter`** - Friendly interaction template
- **`prompt://calculator_guide`** - Math assistance template
- **`prompt://echo_tester`** - Text processing template

## 🚀 Quick Start

### 1. Load the Server
```python
# In your MCP client
from hello_world_server import boot
boot()
```

### 2. Test Basic Functionality
```python
# Test tools
greet("Alice")           # → "Hello Alice! Nice to meet you!"
calculate("add", 5, 3)   # → {"result": 8, "expression": "5 + 3 = 8"}
echo("Hello World")      # → {"echo": "Hello World", "word_count": 2}

# Access resources
resources/read {"uri": "res://getting_started"}
resources/read {"uri": "res://examples"}
resources/read {"uri": "res://api_reference"}

# Use prompts
prompts/get {"name": "conversation_starter"}
prompts/get {"name": "calculator_guide"}
prompts/get {"name": "echo_tester"}
```

## 🛠️ Tools Reference

### `greet(name: str) -> dict`
**Purpose**: Greet someone by name with a friendly message

**Parameters**:
- `name` (string): Person's name to greet

**Returns**:
```json
{
  "message": "Hello Alice! Nice to meet you!",
  "timestamp": "2024-01-15 10:30:00",
  "server": "Hello World MCP Server"
}
```

**Features**:
- ✅ Input validation (empty name check)
- ✅ Name cleaning and capitalization
- ✅ Timestamp generation
- ✅ Server identification

**Example**:
```python
greet("alice")  # → "Hello Alice! Nice to meet you!"
greet("")       # → {"error": "Name cannot be empty"}
```

### `calculate(operation, a, b) -> dict`
**Purpose**: Perform basic mathematical operations

**Parameters**:
- `operation` (literal): "add", "subtract", "multiply", "divide"
- `a` (float): First number
- `b` (float): Second number

**Returns**:
```json
{
  "result": 8,
  "expression": "5 + 3 = 8",
  "operation": "add",
  "timestamp": "2024-01-15 10:30:00"
}
```

**Features**:
- ✅ Type validation (numbers only)
- ✅ Division by zero protection
- ✅ Expression formatting
- ✅ Error handling

**Examples**:
```python
calculate("add", 5, 3)      # → {"result": 8, "expression": "5 + 3 = 8"}
calculate("divide", 10, 0)  # → {"error": "Cannot divide by zero"}
calculate("multiply", 2.5, 4) # → {"result": 10.0, "expression": "2.5 × 4 = 10.0"}
```

### `echo(text: str) -> dict`
**Purpose**: Echo back input text with metadata

**Parameters**:
- `text` (string): Text to echo back

**Returns**:
```json
{
  "echo": "Hello World",
  "original_length": 11,
  "word_count": 2,
  "timestamp": "2024-01-15 10:30:00",
  "server": "Hello World MCP Server"
}
```

**Features**:
- ✅ Text validation and cleaning
- ✅ Character and word counting
- ✅ Timestamp generation
- ✅ Server identification

**Examples**:
```python
echo("Hello World")           # → {"echo": "Hello World", "word_count": 2}
echo("   spaced   text   ")   # → {"echo": "spaced text", "word_count": 2}
echo("")                      # → {"error": "Text cannot be empty"}
```

## 📚 Resources Reference

### `res://getting_started`
**Purpose**: Complete introduction to the Hello World Server

**Content**:
- Welcome message and overview
- Available tools explanation
- Available resources list
- Available prompts list
- Usage examples and suggestions

**Access**:
```python
resources/read {"uri": "res://getting_started"}
```

### `res://examples`
**Purpose**: Practical usage examples for all features

**Content**:
- Basic greeting examples
- Math calculation examples
- Echo testing examples
- Resource access examples
- Prompt usage examples

**Access**:
```python
resources/read {"uri": "res://examples"}
```

### `res://api_reference`
**Purpose**: Complete API documentation

**Content**:
- Tool parameter specifications
- Return value descriptions
- Usage examples
- Error handling information
- Resource and prompt documentation

**Access**:
```python
resources/read {"uri": "res://api_reference"}
```

## 🎯 Prompts Reference

### `prompt://conversation_starter`
**Purpose**: Template for friendly user interactions

**Features**:
- Warm and welcoming personality
- Tool and resource suggestions
- Encouraging user engagement
- Practical usage examples

**Usage**:
```python
prompts/get {"name": "conversation_starter"}
```

### `prompt://calculator_guide`
**Purpose**: Template for math assistance

**Features**:
- Input validation guidance
- Error explanation strategies
- Step-by-step calculation help
- Educational support

**Usage**:
```python
prompts/get {"name": "calculator_guide"}
```

### `prompt://echo_tester`
**Purpose**: Template for text processing assistance

**Features**:
- Text validation strategies
- Character and word counting
- Text cleaning guidance
- Debug assistance

**Usage**:
```python
prompts/get {"name": "echo_tester"}
```

## 💡 Usage Examples

### Complete Workflow Example
```python
# 1. Start with greeting
greet("Alice")
# → "Hello Alice! Nice to meet you!"

# 2. Do some math
calculate("multiply", 7, 8)
# → {"result": 56, "expression": "7 × 8 = 56"}

# 3. Echo some text
echo("MCP is awesome!")
# → {"echo": "MCP is awesome!", "word_count": 3}

# 4. Access documentation
resources/read {"uri": "res://getting_started"}
# → Complete getting started guide

# 5. Use conversation prompt
prompts/get {"name": "conversation_starter"}
# → Friendly conversation template
```

### Error Handling Examples
```python
# Invalid inputs
greet("")                    # → {"error": "Name cannot be empty"}
calculate("add", "a", 5)     # → {"error": "Both numbers must be valid numbers"}
calculate("divide", 10, 0)   # → {"error": "Cannot divide by zero"}
echo("")                     # → {"error": "Text cannot be empty"}
```

## 🏗️ Architecture

### File Structure
```
hello_world_server.py
├── Documentation Section
│   ├── Module docstring
│   ├── Feature overview
│   └── Usage examples
├── Static Data Section
│   └── DOCUMENTATION dict
├── Server Implementation
│   ├── Tools (3 functions)
│   ├── Resources (3 functions)
│   └── Prompts (3 functions)
├── Boot Function
└── Server Metadata
```

### Design Principles
1. **Simplicity**: Each function has a single, clear purpose
2. **Documentation**: Every function is thoroughly documented
3. **Validation**: All inputs are validated with helpful error messages
4. **Consistency**: Uniform return formats and error handling
5. **Extensibility**: Easy to add new tools, resources, or prompts

### Error Handling Strategy
- **Input Validation**: Check all parameters before processing
- **Type Checking**: Ensure correct data types
- **Graceful Degradation**: Return helpful error messages
- **Consistent Format**: All errors follow the same structure

## 🛠️ Development Guide

### Adding New Tools
```python
def new_tool(self, param: str) -> dict:
    """
    Brief description of what this tool does.
    
    Args:
        param: Description of parameter
        
    Returns:
        dict: Description of return value
    """
    # Input validation
    if not param:
        return {"error": "Parameter cannot be empty"}
    
    # Tool logic here
    result = process_param(param)
    
    return {
        "result": result,
        "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
```

### Adding New Resources
```python
def resource_new_content(self) -> dict:
    """
    Description of this resource content.
    
    Returns:
        dict: Resource content in JSON format
    """
    return {
        "mimeType": "application/json",
        "text": json.dumps({
            "title": "Resource Title",
            "content": "Resource content here",
            "type": "resource_type",
            "last_updated": "2024-01-15"
        }, indent=2)
    }
```

### Adding New Prompts
```python
def prompt_new_workflow(self) -> dict:
    """
    Description of this prompt workflow.
    
    Returns:
        dict: Prompt template
    """
    return {
        "description": "Brief description of workflow",
        "messages": [{
            "role": "system",
            "content": """System prompt content here.
            
            Instructions for the AI assistant.
            Available tools and resources.
            Behavior guidelines."""
        }]
    }
```

### Testing Your Server
```python
# Test all tools
assert greet("Alice")["message"] == "Hello Alice! Nice to meet you!"
assert calculate("add", 5, 3)["result"] == 8
assert echo("test")["echo"] == "test"

# Test error handling
assert "error" in greet("")
assert "error" in calculate("divide", 5, 0)
assert "error" in echo("")

# Test resources
getting_started = resource_getting_started()
assert "mimeType" in getting_started
assert "text" in getting_started

# Test prompts
conversation = prompt_conversation_starter()
assert "description" in conversation
assert "messages" in conversation
```

## 🎉 Conclusion

The Hello World MCP Server demonstrates that you can create a **complete, feature-rich MCP server** in just ~400 lines of code. It showcases:

- ✅ **All MCP Features**: Tools, Resources, Prompts
- ✅ **Best Practices**: Error handling, validation, documentation
- ✅ **Educational Value**: Perfect for learning MCP development
- ✅ **Production Ready**: Robust and reliable
- ✅ **Lightweight**: Minimal dependencies and overhead

Use this as a **template** for your own MCP servers, or study it to understand how MCP servers work. Happy coding! 🚀

---

**Server Info**:
- **Name**: Hello World MCP Server
- **Version**: 1.0.0
- **Features**: 3 tools, 3 resources, 3 prompts
- **Total Endpoints**: 9
- **Lines of Code**: ~400
- **Dependencies**: Minimal (just MCP core)
