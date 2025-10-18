/**
 * PrometheOS Python Package for PyMCP
 * 
 * This module contains the embedded PrometheOS package code extracted from
 * the pyodide-notebook implementation. It provides Desktop API and MCP
 * functionality to PyMCP workers.
 */

export function getEmbeddedPrometheosPackage(): string {
  return `
import sys
from types import ModuleType

# === prometheos_api_core.py ===
# Create and register the core module FIRST
prometheos_api_core = ModuleType('prometheos_api_core')
prometheos_api_core.__doc__ = """
Desktop API Core Implementation

Provides the core Desktop API functionality for direct component interaction.
"""

# Execute the module code in its namespace
exec("""
import json
import asyncio
from typing import Dict, Any, List, Optional, Union
import js
from pyodide.ffi import to_js

class DesktopAPICore:
    '''
    Core Desktop API for direct component interaction
    '''

    def __init__(self):
        self._initialized = False
        self._available_components = []
        self._api_comlink = None

    async def initialize(self) -> bool:
        '''Initialize the Desktop API connection'''
        if self._initialized:
            return True

        try:
            js = __import__('js')
            print(f"js object available: {js}")
            print(f"js.globalThis available: {hasattr(js, 'globalThis')}")

            # Access via globalThis (matching legacy pattern)
            if hasattr(js, 'globalThis'):
                global_this = js.globalThis
                has_comlink = hasattr(global_this, 'desktop_api_comlink')
                print(f"desktop_api_comlink available: {has_comlink}")

                if has_comlink:
                    self._api_comlink = global_this.desktop_api_comlink
                    self._initialized = True
                    print("Desktop API initialized successfully")
                    return True
                else:
                    print("desktop_api_comlink not found on globalThis")
                    return False
            else:
                print("globalThis not available")
                return False
        except Exception as e:
            print(f"Failed to initialize Desktop API: {e}")
            import traceback
            traceback.print_exc()
            return False

    async def list_components(self) -> List[str]:
        '''List all available desktop components'''
        if not self._initialized:
            return []
        try:
            result = await self._api_comlink.listComponents()
            # Convert JS result to Python if needed
            if hasattr(result, 'to_py'):
                result = result.to_py()
            self._available_components = result or []
            return self._available_components
        except Exception as e:
            print(f"Failed to list components: {e}")
            return []

    async def execute_action(self, component_id: str, action: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        '''Execute an action on a desktop component'''
        if not self._initialized:
            return {"success": False, "error": "Desktop API not initialized"}
        try:
            params = params or {}
            print(f"Executing action: {component_id}.{action} with params: {params}")

            # Convert Python dict to JavaScript object
            js_params = to_js(params, dict_converter=js.Object.fromEntries)

            result = await self._api_comlink.execute(component_id, action, js_params)
            # Convert JS result to Python if needed
            if hasattr(result, 'to_py'):
                result = result.to_py()
            elif result is not None:
                # Try JSON conversion for objects
                try:
                    js_module = __import__('js')
                    result = json.loads(js_module.JSON.stringify(result))
                except:
                    pass
            print(f"Action result: {result}")
            return result
        except Exception as e:
            print(f"Action execution error: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    async def get_component_actions(self, component_id: str) -> List[str]:
        '''Get available actions for a component'''
        if not self._initialized:
            return []
        try:
            result = await self._api_comlink.getComponentActions(component_id)
            if hasattr(result, 'to_py'):
                result = result.to_py()
            return result or []
        except Exception as e:
            print(f"Failed to get component actions: {e}")
            return []
""", prometheos_api_core.__dict__)

sys.modules['prometheos_api_core'] = prometheos_api_core

# === prometheos_mcp_core.py ===
# Create and register the MCP core module
prometheos_mcp_core = ModuleType('prometheos_mcp_core')
prometheos_mcp_core.__doc__ = """
MCP (Model Context Protocol) Core Implementation

Provides the core MCP functionality for AI agent integration and tool execution.
"""

exec("""
import json
import asyncio
from typing import Dict, Any, List, Optional, Union

class McpCore:
    '''
    Core MCP API for tool-based operations and AI agent integration
    '''

    def __init__(self):
        self._initialized = False
        self._available_tools = []
        self._mcp = None

    async def initialize(self) -> bool:
        '''Initialize the MCP API connection'''
        if self._initialized:
            return True

        try:
            # Check if we're running in a browser environment
            if not hasattr(__import__('js'), 'window'):
                print("Warning: Not running in browser environment")
                return False

            # Get the JavaScript bridge
            js = __import__('js')
            window = js.window

            # Check if __PROMETHEOS_MCP__ is available
            if hasattr(window, '__PROMETHEOS_MCP__'):
                self._mcp = window.__PROMETHEOS_MCP__
                self._initialized = True
                print("MCP API initialized successfully")
                return True
            else:
                print("Warning: __PROMETHEOS_MCP__ not found")
                return False

        except Exception as e:
            print(f"Failed to initialize MCP API: {e}")
            return False

    async def list_tools(self) -> List[Dict[str, Any]]:
        '''List all available MCP tools'''
        if not self._initialized:
            print("MCP API not initialized")
            return []

        try:
            js = __import__('js')
            # Call listTools() which returns immediately (not a promise for simple data)
            tools = self._mcp.listTools()

            # Convert JS array to Python list
            result = []
            if hasattr(tools, 'length'):
                for i in range(tools.length):
                    tool = tools[i]
                    result.append({
                        'name': tool.name if hasattr(tool, 'name') else '',
                        'description': tool.description if hasattr(tool, 'description') else '',
                        'inputSchema': self._js_to_python(tool.inputSchema) if hasattr(tool, 'inputSchema') else {}
                    })

            self._available_tools = result
            return result
        except Exception as e:
            print(f"Failed to list MCP tools: {e}")
            return []

    async def call_tool(self, name: str, args: Dict[str, Any] = None) -> Dict[str, Any]:
        '''Execute an MCP tool'''
        if not self._initialized:
            return {"content": [{"type": "text", "text": "MCP API not initialized"}], "isError": True}

        try:
            args = args or {}
            js = __import__('js')

            # Convert Python dict to JS object
            from pyodide.ffi import to_js
            js_args = to_js(args, dict_converter=js.Object.fromEntries)

            # Call the tool (returns a Promise)
            result_promise = self._mcp.callTool(name, js_args)

            # Await the promise
            result = await result_promise

            # Convert result to Python dict
            return self._js_to_python(result)

        except Exception as e:
            return {
                "content": [{"type": "text", "text": f"Error calling tool {name}: {str(e)}"}],
                "isError": True
            }

    def _js_to_python(self, js_obj) -> Any:
        '''Convert JavaScript object to Python object'''
        try:
            js = __import__('js')

            if js_obj is None or js_obj is js.undefined:
                return None

            # Handle primitive types
            if isinstance(js_obj, (str, int, float, bool)):
                return js_obj

            # Handle arrays
            if hasattr(js_obj, 'length') and not isinstance(js_obj, str):
                return [self._js_to_python(js_obj[i]) for i in range(js_obj.length)]

            # Handle objects
            if hasattr(js_obj, 'constructor') and js_obj.constructor.name == 'Object':
                result = {}
                keys = js.Object.keys(js_obj)
                for i in range(keys.length):
                    key = keys[i]
                    result[key] = self._js_to_python(getattr(js_obj, key))
                return result

            # Fallback: try to get object properties
            try:
                return json.loads(js.JSON.stringify(js_obj))
            except:
                return str(js_obj)

        except Exception as e:
            print(f"Failed to convert JS to Python: {e}")
            return None
""", prometheos_mcp_core.__dict__)

sys.modules['prometheos_mcp_core'] = prometheos_mcp_core

# === prometheos.api ===
# Create the API submodule
prometheos_api = ModuleType('prometheos.api')
prometheos_api.__doc__ = """
PrometheOS Desktop API Module

Provides direct access to desktop components and system functionality.
Use this for direct UI interaction, file system access, and component operations.
"""

exec("""
from prometheos_api_core import DesktopAPICore

# Create global instance
api = DesktopAPICore()

# Convenience functions
async def notify(message: str, type: str = "info") -> bool:
    '''Show a system notification using Desktop API'''
    if not await api.initialize():
        return False
    result = await api.execute_action("system", "notify", {
        "message": message,
        "type": type
    })
    return result.get("success", False)

async def open(app_id: str) -> bool:
    '''Open an application using Desktop API'''
    if not await api.initialize():
        return False
    result = await api.execute_action("system", "open", {"appId": app_id})
    return result.get("success", False)

async def kill(app_id: str) -> bool:
    '''Close an application using Desktop API'''
    if not await api.initialize():
        return False
    result = await api.execute_action("system", "kill", {"appId": app_id})
    return result.get("success", False)

async def open_file_dialog(title: str = "Open File", filters: list = None) -> str | None:
    '''Open a file dialog using Desktop API'''
    if not await api.initialize():
        return None
    result = await api.execute_action("file_system", "open_dialog", {
        "title": title,
        "filters": filters or ["*.*"]
    })
    if result.get("success"):
        return result.get("file_path")
    return None

__all__ = [
    "api",
    "notify", 
    "open",
    "kill",
    "open_file_dialog"
]
""", prometheos_api.__dict__)

sys.modules['prometheos.api'] = prometheos_api

# === prometheos.mcp ===
# Create the MCP submodule
prometheos_mcp = ModuleType('prometheos.mcp')
prometheos_mcp.__doc__ = """
PrometheOS MCP (Model Context Protocol) Module

Provides access to MCP tools for AI agent integration and standardized tool execution.
Use this for tool discovery, AI agent workflows, and standardized protocol operations.
"""

exec("""
from prometheos_mcp_core import McpCore

# Create global instance
mcp = McpCore()

# Convenience functions
async def notify(message: str, type: str = "info") -> bool:
    '''Show a system notification using MCP'''
    if not await mcp.initialize():
        return False
    result = await mcp.call_tool('system.notify', {
        'message': message,
        'type': type
    })
    return not result.get('isError', True)

async def open(app_id: str) -> bool:
    '''Open an application using MCP'''
    if not await mcp.initialize():
        return False
    result = await mcp.call_tool('system.open', {'appId': app_id})
    return not result.get('isError', True)

async def kill(app_id: str) -> bool:
    '''Close an application using MCP'''
    if not await mcp.initialize():
        return False
    result = await mcp.call_tool('system.kill', {'appId': app_id})
    return not result.get('isError', True)

async def list_apps() -> list[str]:
    '''List all available applications using MCP'''
    if not await mcp.initialize():
        return []
    result = await mcp.call_tool('system.listApps', {})
    if not result.get('isError', True):
        content = result.get('content', [{}])[0]
        text = content.get('text', '[]')
        try:
            import json
            return json.loads(text)
        except:
            return []
    return []

async def set_notepad_content(content: str) -> bool:
    '''Set notepad content using MCP (if notepad is open)'''
    if not await mcp.initialize():
        return False
    # First, list tools to find notepad tools
    tools = await mcp.list_tools()
    notepad_tool = next((t for t in tools if 'notepad' in t['name'] and 'setValue' in t['name']), None)
    if not notepad_tool:
        print("Notepad setValue tool not found")
        return False
    result = await mcp.call_tool(notepad_tool['name'], {'value': content})
    return not result.get('isError', True)

async def get_notepad_content() -> str | None:
    '''Get notepad content using MCP (if notepad is open)'''
    if not await mcp.initialize():
        return None
    # First, list tools to find notepad tools
    tools = await mcp.list_tools()
    notepad_tool = next((t for t in tools if 'notepad' in t['name'] and 'getValue' in t['name']), None)
    if not notepad_tool:
        print("Notepad getValue tool not found")
        return None
    result = await mcp.call_tool(notepad_tool['name'], {})
    if not result.get('isError', True):
        content = result.get('content', [{}])[0]
        text = content.get('text', '')
        try:
            import json
            data = json.loads(text)
            return data.get('value', text)
        except:
            return text
    return None

async def list_resources() -> list[dict]:
    '''List all available MCP resources'''
    if not await mcp.initialize():
        return []
    return await mcp.list_resources()

async def read_resource(uri: str) -> dict | None:
    '''Read an MCP resource by URI'''
    if not await mcp.initialize():
        return None
    return await mcp.read_resource(uri)

__all__ = [
    "mcp",
    "notify",
    "open",
    "kill",
    "list_apps",
    "set_notepad_content",
    "get_notepad_content",
    "list_resources",
    "read_resource"
]
""", prometheos_mcp.__dict__)

sys.modules['prometheos.mcp'] = prometheos_mcp

# === prometheos (main package) ===
# Create the main package
prometheos = ModuleType('prometheos')
prometheos.__doc__ = """
PrometheOS Python API Package

A clean, professional Python interface to the PrometheOS desktop environment.
Provides both direct API access and MCP (Model Context Protocol) integration.

Usage:
    # Core APIs
    from prometheos import api, mcp
    
    # Convenience functions
    from prometheos.api import notify, open, kill, open_file_dialog
    from prometheos.mcp import notify, open, kill, list_apps, set_notepad_content
"""

# Attach submodules
prometheos.api = prometheos_api
prometheos.mcp = prometheos_mcp
prometheos.__version__ = "1.0.0"
prometheos.__all__ = ["api", "mcp"]

sys.modules['prometheos'] = prometheos

print("PrometheOS package loaded successfully in PyMCP worker")
`;
}
