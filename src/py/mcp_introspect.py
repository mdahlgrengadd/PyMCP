"""
Runtime introspection for MCP servers.
Extracts method metadata for client code generation.
"""
import inspect
from typing import Any, get_type_hints


def introspect_server(server_instance) -> dict:
    """
    Extract complete metadata from an MCP server instance.
    Returns a JSON-serializable schema for TypeScript client generation.
    """
    server_class = server_instance.__class__
    methods = []

    for name, method in inspect.getmembers(server_class, predicate=inspect.isfunction):
        # Skip private methods and internal MCP methods
        if name.startswith('_'):
            continue

        # Get method signature and type hints
        try:
            sig = inspect.signature(method)
            hints = get_type_hints(method) if hasattr(
                method, '__annotations__') else {}
        except Exception:
            # Skip methods that can't be introspected
            continue

        # Determine category based on naming convention
        if name.startswith('resource_'):
            category = 'resource'
            clean_name = name  # Keep full name for resources
        elif name.startswith('prompt_'):
            category = 'prompt'
            clean_name = name  # Keep full name for prompts
        else:
            category = 'tool'
            clean_name = name

        # Extract parameters
        params = []
        for param_name, param in sig.parameters.items():
            if param_name == 'self':
                continue

            param_type = hints.get(param_name, Any)

            params.append({
                'name': param_name,
                'type': _type_to_typescript(param_type),
                'required': param.default == inspect.Parameter.empty,
                'default': None if param.default == inspect.Parameter.empty else str(param.default)
            })

        # Extract return type
        return_type = hints.get('return', Any)

        # Get docstring
        docstring = inspect.getdoc(method) or ''

        methods.append({
            'name': clean_name,
            'category': category,
            'params': params,
            'returnType': _type_to_typescript(return_type),
            'docstring': docstring
        })

    return {
        'className': server_class.__name__,
        'version': getattr(server_instance, '_protocol_version', '1.0.0'),
        'methods': methods
    }


def _type_to_typescript(python_type: Any) -> str:
    """Convert Python type annotation to TypeScript type string."""

    # Handle None/NoneType
    if python_type is None or python_type is type(None):
        return 'void'

    # Get string representation
    type_str = str(python_type)

    # Basic type mappings
    type_map = {
        'str': 'string',
        'int': 'number',
        'float': 'number',
        'bool': 'boolean',
        'dict': 'Record<string, any>',
        'list': 'any[]',
        'Any': 'any',
        'None': 'void',
        'NoneType': 'void'
    }

    # Handle direct type object
    if hasattr(python_type, '__name__'):
        name = python_type.__name__
        if name in type_map:
            return type_map[name]
        # Custom types (like Pydantic models)
        return name

    # Handle typing module types (e.g., List[str], Dict[str, int])
    if 'typing.' in type_str or '<class' in type_str:
        # Extract the base type
        for py_type, ts_type in type_map.items():
            if py_type.lower() in type_str.lower():
                return ts_type

    # Handle string annotations
    type_str_lower = type_str.lower()
    for py_type, ts_type in type_map.items():
        if py_type in type_str_lower:
            return ts_type

    # Default to any for unknown types
    return 'any'

