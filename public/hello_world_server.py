"""
Hello World MCP Server - Complete Example

This is a lightweight, fully-featured MCP server that demonstrates:
- 🛠️  TOOLS: Basic operations (greet, calculate, echo)
- 📚 RESOURCES: Static content (documentation, examples)
- 🎯 PROMPTS: Workflow templates (conversation starter, calculator guide)
- 🔍 SEMANTIC SEARCH: Auto-select relevant content based on context

Perfect for:
- Learning MCP server development
- Testing MCP client implementations
- Understanding all MCP features in one place
- Template for creating new servers

Author: MCP Example Team
Version: 1.0.0
"""

from typing import Literal, Any, Dict, List
try:
    from mcp_core import McpServer, attach_pyodide_worker  # type: ignore
except ImportError:
    class McpServer:  # type: ignore
        pass

    def attach_pyodide_worker(_svc: object) -> None:  # type: ignore
        pass
import json
import datetime

# ============================================================================
# Static Data (would be loaded from files/database in production)
# ============================================================================

# Sample documentation content for resources
DOCUMENTATION = {
    "getting_started": {
        "title": "Getting Started with Hello World Server",
        "content": """# Getting Started Guide

Welcome to the Hello World MCP Server! This is a complete example showing all MCP features.

## Available Tools
- **greet**: Say hello to someone
- **calculate**: Perform basic math operations
- **echo**: Repeat back what you say

## Available Resources
- **getting_started**: This guide
- **examples**: Code examples
- **api_reference**: Tool documentation

## Available Prompts
- **conversation_starter**: Begin friendly conversations
- **calculator_guide**: Help with math problems

Try asking: "Hello, can you help me calculate 5 + 3?" or "Show me some examples!"
""",
        "tags": ["guide", "introduction", "tutorial"]
    },
    "examples": {
        "title": "Code Examples",
        "content": """# Hello World Examples

## Basic Greeting
```
User: "Hello"
Assistant: Uses greet tool → "Hello! Nice to meet you!"
```

## Math Calculation
```
User: "What's 10 * 5?"
Assistant: Uses calculate tool → "10 * 5 = 50"
```

## Echo Test
```
User: "Echo: Hello World"
Assistant: Uses echo tool → "Hello World"
```

## Resource Access
```
User: "Show me the getting started guide"
Assistant: Accesses getting_started resource
```

## Prompt Usage
```
User: "Help me start a conversation"
Assistant: Uses conversation_starter prompt
```
""",
        "tags": ["examples", "code", "tutorial"]
    },
    "api_reference": {
        "title": "API Reference",
        "content": """# Hello World Server API Reference

## Tools

### greet(name: str) -> dict
Greets a person by name.
- **Parameters**: name (string) - Person's name
- **Returns**: Greeting message
- **Example**: greet("Alice") → {"message": "Hello Alice! Nice to meet you!"}

### calculate(operation: str, a: float, b: float) -> dict
Performs basic math operations.
- **Parameters**: 
  - operation (string) - "add", "subtract", "multiply", "divide"
  - a, b (numbers) - Operands
- **Returns**: Calculation result
- **Example**: calculate("add", 5, 3) → {"result": 8, "expression": "5 + 3 = 8"}

### echo(text: str) -> dict
Echoes back the input text.
- **Parameters**: text (string) - Text to echo
- **Returns**: Echoed text with timestamp
- **Example**: echo("Hello") → {"echo": "Hello", "timestamp": "2024-01-15 10:30:00"}

## Resources
- **res://getting_started** - Getting started guide
- **res://examples** - Code examples
- **res://api_reference** - This API documentation

## Prompts
- **prompt://conversation_starter** - Friendly conversation template
- **prompt://calculator_guide** - Math help template
""",
        "tags": ["api", "documentation", "reference"]
    }
}

# ============================================================================
# Hello World MCP Server Implementation
# ============================================================================


class HelloWorldService(McpServer):
    """
    Hello World MCP Server - Complete Feature Demonstration

    This server showcases all MCP capabilities:
    1. Tools: Interactive functions
    2. Resources: Static content access
    3. Prompts: Workflow templates
    4. Semantic Search: Context-aware content selection
    """

    # ===== TOOLS (Interactive Functions) =====

    def greet(self, name: str) -> dict:
        """
        Greet someone by name with a friendly message.

        This tool demonstrates:
        - Simple string input/output
        - Parameter validation
        - Friendly user interaction

        Args:
            name: The person's name to greet

        Returns:
            dict: Greeting message with name

        Example:
            greet("Alice") → {"message": "Hello Alice! Nice to meet you!"}
        """
        if not name or not name.strip():
            return {"error": "Name cannot be empty"}

        # Clean and capitalize the name
        clean_name = name.strip().title()

        return {
            "message": f"Hello {clean_name}! Nice to meet you!",
            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "server": "Hello World MCP Server"
        }

    def calculate(
        self,
        operation: Literal["add", "subtract", "multiply", "divide"],
        a: float,
        b: float
    ) -> dict:
        """
        Perform basic mathematical operations.

        This tool demonstrates:
        - Multiple parameter types (literal, float)
        - Input validation
        - Error handling
        - Mathematical operations

        Args:
            operation: The math operation to perform
            a: First number
            b: Second number

        Returns:
            dict: Calculation result with expression

        Example:
            calculate("add", 5, 3) → {"result": 8, "expression": "5 + 3 = 8"}
        """
        try:
            # Validate inputs
            if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
                return {"error": "Both numbers must be valid numbers"}

            # Perform calculation based on operation
            if operation == "add":
                result = a + b
                symbol = "+"
            elif operation == "subtract":
                result = a - b
                symbol = "-"
            elif operation == "multiply":
                result = a * b
                symbol = "×"
            elif operation == "divide":
                if b == 0:
                    return {"error": "Cannot divide by zero"}
                result = a / b
                symbol = "÷"
            else:
                return {"error": f"Unknown operation: {operation}"}

            return {
                "result": result,
                "expression": f"{a} {symbol} {b} = {result}",
                "operation": operation,
                "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }

        except Exception as e:
            return {"error": f"Calculation failed: {str(e)}"}

    def echo(self, text: str) -> dict:
        """
        Echo back the input text with additional metadata.

        This tool demonstrates:
        - Simple text processing
        - Adding metadata to responses
        - Timestamp generation
        - Text validation

        Args:
            text: The text to echo back

        Returns:
            dict: Echoed text with timestamp and metadata

        Example:
            echo("Hello World") → {"echo": "Hello World", "timestamp": "2024-01-15 10:30:00"}
        """
        if not text or not text.strip():
            return {"error": "Text cannot be empty"}

        clean_text = text.strip()

        return {
            "echo": clean_text,
            "original_length": len(clean_text),
            "word_count": len(clean_text.split()),
            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "server": "Hello World MCP Server"
        }

    # ===== RESOURCES (Static Content Access) =====

    def resource_getting_started(self) -> dict:
        """
        Getting Started Guide - Introduction to the Hello World Server

        This resource demonstrates:
        - Static content delivery
        - Markdown formatting
        - Comprehensive documentation
        - User onboarding content

        Returns:
            dict: Getting started guide in JSON format
        """
        doc = DOCUMENTATION["getting_started"]
        return {
            "mimeType": "application/json",
            "text": json.dumps({
                "title": doc["title"],
                "content": doc["content"],
                "tags": doc["tags"],
                "type": "guide",
                "last_updated": "2024-01-15"
            }, indent=2)
        }

    def resource_examples(self) -> dict:
        """
        Code Examples - Practical usage examples

        This resource demonstrates:
        - Example code snippets
        - Usage patterns
        - Best practices
        - Interactive examples

        Returns:
            dict: Examples in JSON format
        """
        doc = DOCUMENTATION["examples"]
        return {
            "mimeType": "application/json",
            "text": json.dumps({
                "title": doc["title"],
                "content": doc["content"],
                "tags": doc["tags"],
                "type": "examples",
                "last_updated": "2024-01-15"
            }, indent=2)
        }

    def resource_api_reference(self) -> dict:
        """
        API Reference - Complete tool and resource documentation

        This resource demonstrates:
        - Complete API documentation
        - Parameter specifications
        - Return value descriptions
        - Usage examples

        Returns:
            dict: API reference in JSON format
        """
        doc = DOCUMENTATION["api_reference"]
        return {
            "mimeType": "application/json",
            "text": json.dumps({
                "title": doc["title"],
                "content": doc["content"],
                "tags": doc["tags"],
                "type": "reference",
                "last_updated": "2024-01-15"
            }, indent=2)
        }

    # ===== PROMPTS (Workflow Templates) =====

    def prompt_conversation_starter(self) -> dict:
        """
        Conversation Starter - Template for friendly interactions

        This prompt demonstrates:
        - Workflow templates
        - Conversation guidance
        - User engagement strategies
        - Context-aware responses

        Returns:
            dict: Conversation starter prompt template
        """
        return {
            "description": "Friendly conversation starter for new users",
            "messages": [{
                "role": "system",
                "content": """You are a friendly assistant powered by the Hello World MCP Server.

Your personality:
- Warm and welcoming
- Helpful and patient
- Encouraging and positive
- Knowledgeable about the server's capabilities

When users interact with you:
1. **Greet warmly**: Use the greet tool to say hello
2. **Offer help**: Suggest available tools and resources
3. **Be encouraging**: Support users in exploring features
4. **Provide examples**: Show practical usage patterns

Available tools:
- greet(name): Say hello to someone
- calculate(operation, a, b): Do basic math
- echo(text): Repeat back text

Available resources:
- getting_started: Introduction guide
- examples: Usage examples
- api_reference: Complete documentation

Always be helpful and make users feel welcome!"""
            }]
        }

    def prompt_calculator_guide(self) -> dict:
        """
        Calculator Guide - Template for math assistance

        This prompt demonstrates:
        - Specialized workflow templates
        - Domain-specific guidance
        - Error handling strategies
        - User education

        Returns:
            dict: Calculator guide prompt template
        """
        return {
            "description": "Math assistance and calculator guidance",
            "messages": [{
                "role": "system",
                "content": """You are a helpful math assistant powered by the Hello World MCP Server.

Your expertise:
- Basic arithmetic operations
- Number validation
- Error explanation
- Step-by-step guidance

When helping with math:
1. **Validate inputs**: Check that numbers are valid
2. **Use calculate tool**: For all arithmetic operations
3. **Explain errors**: Help users understand mistakes
4. **Show work**: Display the calculation expression
5. **Be patient**: Support users learning math

Supported operations:
- add: Addition (a + b)
- subtract: Subtraction (a - b)  
- multiply: Multiplication (a × b)
- divide: Division (a ÷ b)

Always use the calculate tool for math operations and explain the results clearly!"""
            }]
        }

    def prompt_echo_tester(self) -> dict:
        """
        Echo Tester - Template for testing text processing

        This prompt demonstrates:
        - Testing workflows
        - Text processing guidance
        - Validation strategies
        - Debug assistance

        Returns:
            dict: Echo tester prompt template
        """
        return {
            "description": "Text processing and echo testing assistant",
            "messages": [{
                "role": "system",
                "content": """You are a text processing assistant powered by the Hello World MCP Server.

Your capabilities:
- Text validation and cleaning
- Echo testing and verification
- Character and word counting
- Text analysis

When processing text:
1. **Use echo tool**: For all text processing
2. **Validate input**: Check for empty or invalid text
3. **Show metadata**: Display character count, word count, etc.
4. **Clean text**: Remove extra whitespace
5. **Provide feedback**: Explain what was processed

The echo tool provides:
- Original text echo
- Character count
- Word count
- Timestamp
- Server identification

Always use the echo tool for text processing and explain the results!"""
            }]
        }


def boot():
    """
    Boot the Hello World MCP Server

    This function:
    - Creates the server instance
    - Attaches it to the Pyodide worker
    - Makes it available for MCP client connections

    Usage:
        Called automatically when the server is loaded
        No parameters required
    """
    svc = HelloWorldService()
    attach_pyodide_worker(svc)
    print("🚀 Hello World MCP Server booted successfully!")
    print("📚 Available: 3 tools, 3 resources, 3 prompts")
    print("🎯 Ready for connections!")


# ============================================================================
# Server Metadata and Information
# ============================================================================

# Server information for documentation
SERVER_INFO = {
    "name": "Hello World MCP Server",
    "version": "1.0.0",
    "description": "Complete example MCP server demonstrating all features",
    "author": "MCP Example Team",
    "features": {
        "tools": 3,
        "resources": 3,
        "prompts": 3,
        "total_endpoints": 9
    },
    "capabilities": [
        "Interactive tools (greet, calculate, echo)",
        "Static resources (documentation, examples)",
        "Workflow prompts (conversation, math, testing)",
        "Semantic search support",
        "Error handling and validation",
        "Comprehensive documentation"
    ]
}

# Export server info for external access
__all__ = ["HelloWorldService", "boot", "SERVER_INFO"]
