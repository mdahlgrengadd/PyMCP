"""
Coding Mentor MCP Server - Programming education and code review assistant

Features:
- 💻 TOOLS: Code analysis, complexity checker, pattern detector
- 📚 RESOURCES: Tutorials, best practices, design patterns
- 🎯 PROMPTS: Learning workflows (code review, debugging, concept explanation)
"""

from typing import Literal, Optional, List
from pydantic import BaseModel
from mcp_core import McpServer, attach_pyodide_worker
import json
import re


# ============================================================================
# Learning Resources Database
# ============================================================================

TUTORIALS = {
    "python_basics": {
        "title": "Python Fundamentals",
        "level": "beginner",
        "topics": ["variables", "data types", "control flow", "functions"],
        "content": """# Python Fundamentals

## Variables and Data Types

### Basic Types
```python
# Numbers
integer = 42
floating = 3.14
complex_num = 1 + 2j

# Strings
name = "Alice"
message = 'Hello, World!'
multiline = \"\"\"This is
a multiline string\"\"\"

# Boolean
is_active = True
has_permission = False

# None (null)
result = None
```

### Collections
```python
# List (mutable, ordered)
fruits = ["apple", "banana", "cherry"]
fruits.append("date")

# Tuple (immutable, ordered)
coordinates = (10, 20)

# Set (mutable, unordered, unique)
unique_numbers = {1, 2, 3, 3}  # {1, 2, 3}

# Dictionary (key-value pairs)
person = {
    "name": "Bob",
    "age": 30,
    "city": "NYC"
}
```

## Control Flow

### Conditionals
```python
age = 18

if age >= 18:
    print("Adult")
elif age >= 13:
    print("Teenager")
else:
    print("Child")
```

### Loops
```python
# For loop
for i in range(5):
    print(i)

for fruit in fruits:
    print(fruit)

# While loop
count = 0
while count < 5:
    print(count)
    count += 1
```

## Functions
```python
def greet(name, greeting="Hello"):
    \"\"\"Greet someone with an optional custom greeting\"\"\"
    return f"{greeting}, {name}!"

# Call function
message = greet("Alice")
custom = greet("Bob", "Hi")

# Lambda (anonymous functions)
square = lambda x: x ** 2
```

## Common Patterns

### List Comprehension
```python
# Create list of squares
squares = [x**2 for x in range(10)]

# Filter even numbers
evens = [x for x in range(20) if x % 2 == 0]
```

### Exception Handling
```python
try:
    result = 10 / 0
except ZeroDivisionError:
    print("Cannot divide by zero!")
except Exception as e:
    print(f"Error: {e}")
finally:
    print("Always executes")
```
"""
    },
    "javascript_async": {
        "title": "JavaScript Async Patterns",
        "level": "intermediate",
        "topics": ["promises", "async/await", "callbacks", "event loop"],
        "content": """# JavaScript Async Programming

## The Event Loop

JavaScript is single-threaded but uses an event loop for async operations:

1. Call Stack - executes synchronous code
2. Web APIs - handle async operations (timers, fetch, etc.)
3. Callback Queue - holds completed async operations
4. Event Loop - moves callbacks to call stack when empty

## Callbacks (Old Way)
```javascript
function fetchUser(id, callback) {
    setTimeout(() => {
        const user = { id, name: "Alice" };
        callback(null, user);
    }, 1000);
}

// Callback hell
fetchUser(1, (err, user) => {
    if (err) return console.error(err);
    fetchPosts(user.id, (err, posts) => {
        if (err) return console.error(err);
        // ... more nesting
    });
});
```

## Promises (Better)
```javascript
function fetchUser(id) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const user = { id, name: "Alice" };
            resolve(user);
        }, 1000);
    });
}

// Promise chaining
fetchUser(1)
    .then(user => fetchPosts(user.id))
    .then(posts => console.log(posts))
    .catch(err => console.error(err))
    .finally(() => console.log("Done"));
```

## Async/Await (Best)
```javascript
async function getUserData(id) {
    try {
        const user = await fetchUser(id);
        const posts = await fetchPosts(user.id);
        return { user, posts };
    } catch (error) {
        console.error("Error:", error);
        throw error;
    }
}

// Top-level await (in modules)
const data = await getUserData(1);
```

## Common Patterns

### Parallel Execution
```javascript
// Wait for all promises
const [user, posts, comments] = await Promise.all([
    fetchUser(1),
    fetchPosts(1),
    fetchComments(1)
]);

// First to resolve
const fastest = await Promise.race([
    fetch('/api1'),
    fetch('/api2')
]);
```

### Error Handling
```javascript
async function robustFetch(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Fetch failed:', error);
        return null; // Fallback value
    }
}
```
"""
    }
}


DESIGN_PATTERNS = {
    "singleton": {
        "name": "Singleton Pattern",
        "category": "Creational",
        "purpose": "Ensure a class has only one instance",
        "use_cases": ["Database connections", "Configuration managers", "Logging"],
        "example_python": '''class Singleton:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

# Usage
db1 = Singleton()
db2 = Singleton()
assert db1 is db2  # Same instance
''',
        "pros": ["Controlled access to sole instance", "Reduced memory footprint"],
        "cons": ["Global state", "Difficult to test", "Violates Single Responsibility Principle"]
    },
    "factory": {
        "name": "Factory Pattern",
        "category": "Creational",
        "purpose": "Create objects without specifying exact class",
        "use_cases": ["UI components", "Document types", "Payment processors"],
        "example_python": '''class Animal:
    def speak(self): pass

class Dog(Animal):
    def speak(self): return "Woof!"

class Cat(Animal):
    def speak(self): return "Meow!"

class AnimalFactory:
    @staticmethod
    def create_animal(animal_type):
        if animal_type == "dog":
            return Dog()
        elif animal_type == "cat":
            return Cat()
        raise ValueError(f"Unknown animal: {animal_type}")

# Usage
animal = AnimalFactory.create_animal("dog")
print(animal.speak())  # "Woof!"
''',
        "pros": ["Decouples object creation", "Easy to extend", "Single Responsibility"],
        "cons": ["Can become complex", "Extra abstraction layer"]
    }
}


# ============================================================================
# Coding Mentor MCP Server
# ============================================================================

class CodingMentorService(McpServer):

    # ===== TOOLS =====

    def analyze_complexity(self, code: str, language: Literal["python", "javascript", "typescript"] = "python") -> dict:
        """Analyze code complexity (lines, functions, nesting depth)"""

        lines = code.split('\n')
        total_lines = len(lines)
        code_lines = len([l for l in lines if l.strip()
                         and not l.strip().startswith('#')])
        comment_lines = total_lines - code_lines

        # Count functions (simple regex)
        if language == "python":
            functions = len(re.findall(r'^\s*def \w+', code, re.MULTILINE))
            classes = len(re.findall(r'^\s*class \w+', code, re.MULTILINE))
        else:  # JavaScript/TypeScript
            functions = len(re.findall(
                r'function \w+|const \w+ = \([^)]*\) =>', code))
            classes = len(re.findall(r'class \w+', code))

        # Estimate max nesting (count indentation)
        max_indent = 0
        for line in lines:
            if line.strip():
                indent = len(line) - len(line.lstrip())
                # Assuming 4-space indent
                max_indent = max(max_indent, indent // 4)

        # Complexity assessment
        if code_lines < 50 and max_indent <= 3:
            complexity = "Low"
            advice = "Good! Code is simple and maintainable."
        elif code_lines < 150 and max_indent <= 4:
            complexity = "Medium"
            advice = "Consider breaking into smaller functions."
        else:
            complexity = "High"
            advice = "Refactor: Extract functions, reduce nesting."

        return {
            "total_lines": total_lines,
            "code_lines": code_lines,
            "comment_lines": comment_lines,
            "functions": functions,
            "classes": classes,
            "max_nesting_depth": max_indent,
            "complexity": complexity,
            "advice": advice
        }

    def check_naming_conventions(self, code: str, language: Literal["python", "javascript"] = "python") -> dict:
        """Check if code follows naming conventions"""

        issues = []

        if language == "python":
            # Python: snake_case for functions/variables, PascalCase for classes
            functions = re.findall(r'def (\w+)', code)
            classes = re.findall(r'class (\w+)', code)

            for func in functions:
                if not re.match(r'^[a-z_][a-z0-9_]*$', func):
                    issues.append(f"Function '{func}' should use snake_case")

            for cls in classes:
                if not re.match(r'^[A-Z][a-zA-Z0-9]*$', cls):
                    issues.append(f"Class '{cls}' should use PascalCase")

        else:  # JavaScript
            # JavaScript: camelCase for functions/variables, PascalCase for classes
            functions = re.findall(r'function (\w+)|const (\w+) =', code)
            classes = re.findall(r'class (\w+)', code)

            for func_tuple in functions:
                func = func_tuple[0] or func_tuple[1]
                if func and not re.match(r'^[a-z][a-zA-Z0-9]*$', func):
                    issues.append(f"Function '{func}' should use camelCase")

        if not issues:
            return {
                "passed": True,
                "message": "All names follow conventions!",
                "issues": []
            }
        else:
            return {
                "passed": False,
                "message": f"Found {len(issues)} naming issues",
                "issues": issues
            }

    def detect_code_smells(self, code: str) -> list[dict]:
        """Detect common code smells"""

        smells = []
        lines = code.split('\n')

        # Long lines
        for i, line in enumerate(lines, 1):
            if len(line) > 100:
                smells.append({
                    "line": i,
                    "type": "Long Line",
                    "severity": "minor",
                    "message": f"Line {i} is {len(line)} chars (>100 recommended)"
                })

        # Magic numbers
        magic_numbers = re.findall(r'\b(\d{2,})\b', code)
        if len(magic_numbers) > 5:
            smells.append({
                "type": "Magic Numbers",
                "severity": "medium",
                "message": "Consider using named constants for numbers"
            })

        # Deeply nested code
        for i, line in enumerate(lines, 1):
            indent = len(line) - len(line.lstrip())
            if indent >= 16:  # 4+ levels
                smells.append({
                    "line": i,
                    "type": "Deep Nesting",
                    "severity": "high",
                    "message": f"Line {i}: Nesting depth {indent//4}. Consider extracting to function."
                })

        # TODO comments
        for i, line in enumerate(lines, 1):
            if 'TODO' in line or 'FIXME' in line:
                smells.append({
                    "line": i,
                    "type": "TODO Comment",
                    "severity": "info",
                    "message": "TODO found - don't forget to address it!"
                })

        return smells if smells else [{"message": "No code smells detected! 🎉"}]

    def suggest_refactoring(self, description: str) -> dict:
        """Suggest refactoring patterns for common problems"""

        suggestions = {
            "duplicate code": {
                "pattern": "Extract Method",
                "description": "Move duplicate code into a reusable function",
                "example": "def common_logic():\n    # Shared code here\n    pass"
            },
            "long function": {
                "pattern": "Extract Method / Compose Method",
                "description": "Break large function into smaller, focused functions",
                "example": "Split into: validate_input(), process_data(), format_output()"
            },
            "too many parameters": {
                "pattern": "Parameter Object",
                "description": "Group related parameters into an object/dataclass",
                "example": "class UserConfig:\n    def __init__(self, name, age, email): ..."
            },
            "complex conditional": {
                "pattern": "Guard Clauses / Strategy Pattern",
                "description": "Use early returns or strategy pattern",
                "example": "if not valid:\n    return error\nif not authorized:\n    return forbidden"
            }
        }

        for keyword, suggestion in suggestions.items():
            if keyword in description.lower():
                return suggestion

        return {
            "pattern": "General Advice",
            "description": "Consider: Single Responsibility, DRY principle, meaningful names",
            "example": "Break into smaller functions with clear purposes"
        }

    def find_tutorial(
        self,
        topic: str,
        level: Literal["beginner", "intermediate", "advanced"] = "beginner"
    ) -> list[dict]:
        """Find learning resources by topic and level"""

        results = []
        # Normalize topic: convert hyphens/underscores to slashes for better matching
        topic_normalized = topic.lower().replace('-', '/').replace('_', '/')

        for tutorial_id, tutorial in TUTORIALS.items():
            # Normalize tutorial data for comparison
            title_normalized = tutorial['title'].lower().replace(
                '-', '/').replace('_', '/')
            topics_normalized = [t.lower().replace(
                '-', '/').replace('_', '/') for t in tutorial['topics']]

            # Check if topic matches title or any topic tag
            topic_match = (
                topic_normalized in title_normalized or
                any(topic_normalized in t for t in topics_normalized)
            )

            # Flexible level matching: exact match OR "all levels"
            level_match = (tutorial['level'] ==
                           level or tutorial['level'] == "all levels")

            if topic_match and level_match:
                results.append({
                    "title": tutorial['title'],
                    "resource_uri": f"res://{tutorial_id}",
                    "level": tutorial['level'],
                    "topics": tutorial['topics']
                })

        # Return empty array instead of error message object
        # This prevents polluting semantic search with negative context
        return results

    def explain_pattern(self, pattern_name: str) -> dict:
        """Get information about a design pattern"""

        pattern_lower = pattern_name.lower()
        for pattern_id, pattern in DESIGN_PATTERNS.items():
            if pattern_lower in pattern_id or pattern_lower in pattern['name'].lower():
                return pattern

        return {"error": f"Pattern '{pattern_name}' not found. Try: singleton, factory, observer, strategy"}

    # ===== RESOURCES (Learning Materials) =====

    def resource_python_basics(self) -> dict:
        """Python Fundamentals Tutorial - Beginner level guide to Python basics: variables, data types, control flow, loops, functions. Learn Python programming from scratch."""
        tutorial = TUTORIALS["python_basics"]
        return {
            "mimeType": "text/markdown",
            "text": tutorial["content"]
        }

    def resource_javascript_async(self) -> dict:
        """JavaScript Async Programming Tutorial - Intermediate level guide to async/await, promises, callbacks, and event loop. Learn asynchronous programming patterns."""
        tutorial = TUTORIALS["javascript_async"]
        return {
            "mimeType": "text/markdown",
            "text": tutorial["content"]
        }

    def resource_code_review_checklist(self) -> str:
        """Code Review Checklist Guide - Comprehensive checklist for reviewing code quality, functionality, security, testing, and best practices. Improve code review skills."""
        return """# Code Review Checklist

## Functionality
- [ ] Does the code work as intended?
- [ ] Are edge cases handled?
- [ ] Are errors handled gracefully?
- [ ] Is validation performed on inputs?

## Code Quality
- [ ] Is the code readable and self-documenting?
- [ ] Are names descriptive and follow conventions?
- [ ] Is complexity minimized (KISS principle)?
- [ ] Is code DRY (Don't Repeat Yourself)?

## Architecture
- [ ] Is the code in the right place?
- [ ] Are responsibilities properly separated?
- [ ] Are abstractions at the right level?
- [ ] Is the code testable?

## Performance
- [ ] Are there obvious performance issues?
- [ ] Are algorithms appropriate for data size?
- [ ] Are resources cleaned up properly?
- [ ] Are database queries optimized?

## Security
- [ ] Is input validated and sanitized?
- [ ] Are credentials/secrets properly handled?
- [ ] Are SQL injection risks mitigated?
- [ ] Is authentication/authorization correct?

## Testing
- [ ] Are there unit tests?
- [ ] Do tests cover edge cases?
- [ ] Are tests readable and maintainable?
- [ ] Is test coverage adequate?

## Documentation
- [ ] Are complex sections commented?
- [ ] Is public API documented?
- [ ] Are assumptions documented?
- [ ] Is README updated if needed?

## Style
- [ ] Does code follow project style guide?
- [ ] Is formatting consistent?
- [ ] Are imports organized?
- [ ] Are there no linter warnings?
"""

    def resource_clean_code_principles(self) -> str:
        """Clean Code Principles Guide - Learn best practices for writing clean, maintainable, readable code: naming conventions, functions, comments, error handling, and refactoring techniques."""
        return """# Clean Code Principles

## Naming

### Use Intention-Revealing Names
```python
# Bad
d = 86400  # seconds in day

# Good
SECONDS_PER_DAY = 86400
```

### Avoid Disinformation
```python
# Bad: hp could be anything
hp = calculate_score()

# Good
hit_points = calculate_health_points()
```

### Use Pronounceable Names
```python
# Bad
genymdhms = datetime.now()

# Good
generation_timestamp = datetime.now()
```

## Functions

### Small and Focused
- Do one thing and do it well
- 20 lines or less ideal
- Single level of abstraction

```python
# Bad: Does too much
def process_user(user_data):
    validate_email(user_data['email'])
    hash_password(user_data['password'])
    save_to_database(user_data)
    send_welcome_email(user_data['email'])

# Good: Delegate responsibilities
def register_user(user_data):
    validated_user = validate_user(user_data)
    hashed_user = hash_user_password(validated_user)
    saved_user = save_user(hashed_user)
    send_welcome_email(saved_user)
```

### Minimal Arguments
- 0 arguments (ideal)
- 1-2 arguments (good)
- 3 arguments (okay)
- 4+ arguments (refactor)

```python
# Bad
def create_user(name, email, age, address, phone, city, state, zip):
    ...

# Good
def create_user(user_info: UserInfo):
    ...
```

## Comments

### Code Should Be Self-Explanatory
```python
# Bad
# Check if user is over 18
if user.age >= 18:

# Good
if user.is_adult():
```

### When to Comment
- **Legal comments** (copyright, license)
- **Intent** (why, not what)
- **Clarification** (when code can't be changed)
- **Warning** (consequences)
- **TODO** (with date and name)

## Error Handling

### Use Exceptions, Not Return Codes
```python
# Bad
def divide(a, b):
    if b == 0:
        return None
    return a / b

result = divide(10, 0)
if result is None:
    print("Error")

# Good
def divide(a, b):
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b

try:
    result = divide(10, 0)
except ValueError as e:
    print(f"Error: {e}")
```

### Don't Return/Pass Null
```python
# Bad
def find_user(id):
    if user_exists(id):
        return get_user(id)
    return None

user = find_user(123)
if user is not None:  # Defensive check needed everywhere
    process(user)

# Good
def find_user(id):
    if not user_exists(id):
        raise UserNotFoundError(id)
    return get_user(id)
```

## DRY Principle
Don't Repeat Yourself - every piece of knowledge should have single representation

```python
# Bad: Duplication
def validate_email(email):
    if '@' not in email:
        raise ValueError("Invalid email")
    if '.' not in email:
        raise ValueError("Invalid email")

def validate_work_email(email):
    if '@' not in email:
        raise ValueError("Invalid email")
    if '.' not in email:
        raise ValueError("Invalid email")
    if '@company.com' not in email:
        raise ValueError("Not a work email")

# Good: Reuse
def is_valid_email_format(email):
    return '@' in email and '.' in email

def validate_email(email):
    if not is_valid_email_format(email):
        raise ValueError("Invalid email format")

def validate_work_email(email):
    validate_email(email)
    if '@company.com' not in email:
        raise ValueError("Not a work email")
```
"""

    def resource_design_patterns(self) -> dict:
        """Design Patterns Reference Guide - Learn common software design patterns: singleton, factory, observer, strategy. Understand when and how to apply design patterns in your code."""
        return {
            "mimeType": "application/json",
            "text": json.dumps(DESIGN_PATTERNS, indent=2)
        }

    def resource_mcp_protocol(self) -> str:
        """Model Context Protocol (MCP) Tutorial - Learn MCP protocol, build MCP servers, tools, resources, and prompts. MCP tutorial for beginners and intermediate developers. Understand MCP architecture and best practices for creating AI-powered applications with MCP."""
        return """# Model Context Protocol (MCP)

## What is MCP?

The **Model Context Protocol (MCP)** is an open protocol that enables seamless integration between AI applications and external data sources, tools, and services. It provides a standardized way for Language Learning Models (LLMs) to:

- 🔧 **Execute tools** - Call functions to perform actions
- 📚 **Access resources** - Retrieve documents, data, and context
- 🎯 **Use prompts** - Apply pre-built workflows and templates

## Core Concepts

### 1. MCP Server

An MCP server exposes capabilities (tools, resources, prompts) that LLMs can use:

```python
from mcp_core import McpServer, attach_pyodide_worker

class MyService(McpServer):
    def my_tool(self, param: str) -> dict:
        \"\"\"Tool description that LLM sees\"\"\"
        return {"result": f"Processed: {param}"}

def boot():
    svc = MyService()
    attach_pyodide_worker(svc)
```

### 2. Tools (Functions)

Tools are functions the LLM can call to perform actions:

```python
def calculate_bmi(self, weight_kg: float, height_cm: float) -> dict:
    \"\"\"Calculate Body Mass Index (BMI)
    
    Args:
        weight_kg: Weight in kilograms
        height_cm: Height in centimeters
    
    Returns:
        BMI value, category, and health advice
    \"\"\"
    height_m = height_cm / 100
    bmi = weight_kg / (height_m ** 2)
    
    return {
        "bmi": round(bmi, 1),
        "category": "Normal" if 18.5 <= bmi < 25 else "Other"
    }
```

**Best Practices:**
- Use clear, descriptive function names
- Add detailed docstrings (LLM reads them!)
- Use type hints (Pydantic validation)
- Return structured data (dict/list)
- For enums, be explicit in docstrings about exact values

### 3. Resources (Documents)

Resources provide context and reference material:

```python
def resource_user_guide(self) -> str:
    \"\"\"User Guide - Complete tutorial for beginners\"\"\"
    return \"\"\"# User Guide
    
## Getting Started
...
\"\"\"

def resource_config(self) -> dict:
    \"\"\"Configuration settings in JSON format\"\"\"
    return {
        "mimeType": "application/json",
        "text": json.dumps({"setting": "value"})
    }
```

**Resource Discovery:**
- Resources are semantically searched based on conversation context
- Use keyword-rich descriptions (include: tutorial, guide, level, topics)
- Resources are automatically injected when relevant

**Naming Convention:** `resource_<name>` → URI: `res://<name>`

### 4. Prompts (Workflows)

Prompts are pre-built workflows with system instructions:

```python
def prompt_code_reviewer(self) -> dict:
    \"\"\"Guide users through code review process\"\"\"
    return {
        "description": "Code review assistant",
        "messages": [{
            "role": "system",
            "content": \"\"\"You are a code reviewer...
            
Process:
1. Analyze functionality
2. Check readability
3. Assess maintainability
...\"\"\"
        }]
    }
```

## MCP Architecture

```
┌─────────────────┐
│   LLM Client    │ (WebLLM, Claude, GPT-4)
│  (Your App)     │
└────────┬────────┘
         │
         │ MCP Protocol (JSON-RPC)
         │
┌────────▼────────┐
│   MCP Server    │ (Python, TypeScript)
│                 │
│  ┌───────────┐  │
│  │  Tools    │  │ ← Functions LLM can call
│  ├───────────┤  │
│  │ Resources │  │ ← Context & documentation
│  ├───────────┤  │
│  │  Prompts  │  │ ← Workflow templates
│  └───────────┘  │
└─────────────────┘
```

## Building an MCP Server

### Step 1: Define Your Service

```python
from typing import Literal
from mcp_core import McpServer

class WeatherService(McpServer):
    pass  # Add methods below
```

### Step 2: Add Tools

```python
def get_weather(
    self, 
    city: str,
    units: Literal["celsius", "fahrenheit"] = "celsius"
) -> dict:
    \"\"\"Get current weather for a city.
    
    IMPORTANT: units must be EXACTLY: "celsius" or "fahrenheit"
    
    Example: get_weather(city="London", units="celsius")
    \"\"\"
    # Simulate API call
    return {
        "city": city,
        "temperature": 22,
        "units": units,
        "condition": "Sunny"
    }
```

### Step 3: Add Resources

```python
def resource_weather_guide(self) -> str:
    \"\"\"Weather API Guide - Tutorial on using weather tools and understanding forecasts\"\"\"
    return \"\"\"# Weather API Guide
    
## Available Cities
- London, Paris, Tokyo, New York
...\"\"\"
```

### Step 4: Add Prompts

```python
def prompt_weather_advisor(self) -> dict:
    \"\"\"Weather advisory assistant\"\"\"
    return {
        "description": "Personalized weather advice",
        "messages": [{
            "role": "system",
            "content": \"\"\"Provide weather advice including:
1. Current conditions
2. Clothing suggestions
3. Activity recommendations
Use get_weather tool to fetch data.\"\"\"
        }]
    }
```

### Step 5: Boot the Server

```python
def boot():
    svc = WeatherService()
    attach_pyodide_worker(svc)
```

## MCP Best Practices

### Tool Design

✅ **DO:**
- Use descriptive names: `calculate_bmi` not `calc`
- Include detailed docstrings with examples
- List exact enum values in docstring
- Return structured data
- Handle errors gracefully

❌ **DON'T:**
- Return error messages as `[{"message": "not found"}]`
- Use ambiguous parameter names
- Forget type hints
- Return empty error objects

### Resource Design

✅ **DO:**
- Use keyword-rich descriptions
- Include level keywords: "beginner", "intermediate", "advanced"
- Include format: "tutorial", "guide", "reference"
- Add topic keywords users might search for
- Use markdown for readability

❌ **DON'T:**
- Use minimal descriptions
- Forget to include searchable keywords
- Mix multiple unrelated topics

### Prompt Design

✅ **DO:**
- Provide clear step-by-step workflows
- Reference available tools/resources
- Give examples of usage
- Set clear expectations

❌ **DON'T:**
- Make prompts too generic
- Forget to mention relevant tools

## Error Handling

```python
def divide(self, a: float, b: float) -> dict:
    \"\"\"Divide two numbers\"\"\"
    if b == 0:
        return {"error": "Cannot divide by zero"}
    
    return {"result": a / b}
```

## Type Validation with Pydantic

MCP automatically validates parameters using Pydantic:

```python
from typing import Literal

def search(
    self,
    query: str,  # Required
    limit: int = 10,  # Optional with default
    sort: Literal["date", "relevance"] = "relevance"  # Enum
) -> list[dict]:
    \"\"\"Search with parameters.
    
    CRITICAL: sort must be EXACTLY "date" or "relevance" (not "by_date")
    \"\"\"
    # Pydantic validates automatically!
    # If user passes invalid values, error is returned
    return [{"title": "Result 1"}]
```

## Real-World Example: Fitness Tracker

```python
class FitnessService(McpServer):
    
    # Tool: Calculate BMI
    def calculate_bmi(self, weight_kg: float, height_cm: float) -> dict:
        \"\"\"Calculate Body Mass Index\"\"\"
        height_m = height_cm / 100
        bmi = weight_kg / (height_m ** 2)
        return {"bmi": round(bmi, 1)}
    
    # Resource: Workout programs
    def resource_workout_guide(self) -> str:
        \"\"\"Workout Guide - Exercise routines and fitness tips\"\"\"
        return "# Workout Guide\\n\\n## Programs\\n..."
    
    # Prompt: Personal trainer
    def prompt_personal_trainer(self) -> dict:
        \"\"\"AI personal trainer workflow\"\"\"
        return {
            "description": "Personalized fitness coaching",
            "messages": [{
                "role": "system",
                "content": "You are a personal trainer..."
            }]
        }
```

## Testing Your MCP Server

1. **Start the server** - Run your Python file
2. **Connect LLM client** - Point your app to the server
3. **List tools** - Check available capabilities
4. **Call tools** - Test function execution
5. **Query resources** - Verify resource discovery
6. **Use prompts** - Test workflows

## Common Patterns

### Search/Filter Pattern
```python
def find_items(
    self,
    category: str,
    min_price: float = 0
) -> list[dict]:
    \"\"\"Find items by category and price\"\"\"
    results = []
    for item in DATABASE:
        if item['category'] == category and item['price'] >= min_price:
            results.append(item)
    return results
```

### CRUD Pattern
```python
def create_task(self, title: str, priority: int) -> dict:
    \"\"\"Create new task\"\"\"
    task = {"id": generate_id(), "title": title, "priority": priority}
    TASKS.append(task)
    return task

def get_task(self, task_id: str) -> dict:
    \"\"\"Get task by ID\"\"\"
    return next((t for t in TASKS if t['id'] == task_id), None)
```

## Learn More

- MCP Specification: https://modelcontextprotocol.io
- Example Servers: Check the `public/` directory
- PyMCP Documentation: See README.md

## Summary

MCP enables LLMs to:
- **Execute actions** via tools
- **Access knowledge** via resources
- **Follow workflows** via prompts

Build powerful AI applications by exposing your services through MCP! 🚀
"""

    # ===== PROMPTS (Learning Workflows) =====

    def prompt_code_reviewer(self) -> dict:
        """Comprehensive code review assistant"""
        return {
            "description": "Thorough code review workflow",
            "messages": [{
                "role": "system",
                "content": """You are an expert code reviewer. Provide constructive, educational feedback.

Review process:
1. **Functionality**: Does it work? Edge cases covered?
2. **Readability**: Clear names, appropriate comments?
3. **Maintainability**: DRY, single responsibility, testable?
4. **Performance**: Any obvious inefficiencies?
5. **Security**: Input validation, no vulnerabilities?

Use analyze_complexity and detect_code_smells tools.
Reference code_review_checklist and clean_code_principles resources.

Be specific with examples. Balance criticism with praise.
Suggest improvements, don't just point out problems."""
            }]
        }

    def prompt_debugging_coach(self) -> dict:
        """Systematic debugging assistance"""
        return {
            "description": "Step-by-step debugging methodology",
            "messages": [{
                "role": "system",
                "content": """You are a debugging coach teaching systematic problem-solving.

Debugging methodology:
1. **Reproduce**: Can you consistently trigger the bug?
2. **Isolate**: Where exactly does it fail?
3. **Understand**: What is the expected vs actual behavior?
4. **Hypothesize**: What could cause this?
5. **Test**: Add logging/prints to verify hypothesis
6. **Fix**: Implement solution
7. **Verify**: Confirm bug is fixed and no regression

Teach debugging skills:
- Reading error messages carefully
- Using print debugging effectively
- Understanding stack traces
- Binary search approach (comment out half)
- Rubber duck debugging

Don't just give answers - guide them to discover the issue."""
            }]
        }

    def prompt_concept_explainer(self) -> dict:
        """Explain programming concepts clearly"""
        return {
            "description": "Programming concept educator",
            "messages": [{
                "role": "system",
                "content": """You are a programming educator explaining concepts clearly.

Teaching approach:
1. **Analogy**: Start with real-world comparison
2. **Simple Example**: Show basic usage
3. **Complexity**: Gradually add details
4. **Common Mistakes**: Warn about pitfalls
5. **Practice**: Suggest exercises

Use find_tutorial to reference learning materials.
Reference tutorial resources for detailed examples.

Adapt to student's level - avoid jargon for beginners.
Use visual metaphors (boxes, arrows, flow) to aid understanding.
Connect new concepts to things they already know."""
            }]
        }

    def prompt_refactoring_guide(self) -> dict:
        """Guide code refactoring improvements"""
        return {
            "description": "Code refactoring advisor",
            "messages": [{
                "role": "system",
                "content": """You are a refactoring specialist improving code quality.

Refactoring workflow:
1. **Identify**: What's the code smell or problem?
2. **Pattern**: Use suggest_refactoring to find appropriate pattern
3. **Plan**: Break refactoring into safe steps
4. **Execute**: Show before/after code
5. **Verify**: Ensure behavior unchanged

Common refactorings:
- Extract Method (long functions)
- Rename (unclear names)
- Extract Variable (complex expressions)
- Replace Magic Number (hardcoded values)
- Simplify Conditional (complex if/else)

Reference clean_code_principles resource.
Use explain_pattern for design patterns.

Always refactor in small steps with tests."""
            }]
        }


def boot():
    """Boot the Coding Mentor MCP server"""
    svc = CodingMentorService()
    attach_pyodide_worker(svc)
