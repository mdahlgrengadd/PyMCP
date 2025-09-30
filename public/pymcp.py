"""
PyMCP - Model Context Protocol for Python
Simple decorator-based MCP server framework
"""

from typing import Annotated, Any, Callable
from pydantic import BaseModel, Field

# Runtime compatibility layer
try:
    from mcp_core import McpServer as _McpServer, attach_pyodide_worker as _attach_worker
    _RUNTIME_AVAILABLE = True
except ImportError:
    # Development fallbacks
    class _McpServer:
        pass
    def _attach_worker(server):
        pass
    _RUNTIME_AVAILABLE = False

# Clean public API
class Server(_McpServer):
    """MCP Server base class with automatic tool/resource/prompt discovery."""
    pass

def serve(server_instance: Server) -> None:
    """Start serving the MCP server (auto-detects environment)."""
    if _RUNTIME_AVAILABLE:
        _attach_worker(server_instance)
    else:
        print(f"Development mode: {server_instance.__class__.__name__} created (not serving)")

# Export clean API
__all__ = ['Server', 'serve', 'BaseModel', 'Field', 'Annotated', 'Any']