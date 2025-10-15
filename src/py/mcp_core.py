from __future__ import annotations
import inspect
from typing import Any, Callable, get_type_hints
from pydantic import BaseModel, create_model

Json = dict[str, Any]


def _build_param_model(fn: Callable) -> type[BaseModel] | None:
    sig = inspect.signature(fn)
    hints = get_type_hints(fn)
    fields = {}
    for name, p in sig.parameters.items():
        if name == "self":
            continue
        ann = hints.get(name, Any)
        fields[name] = (ann, ...) if p.default is inspect._empty else (
            ann, p.default)
    # type: ignore
    return create_model(f"{fn.__name__}Params", **fields) if fields else None


def _build_result_model(fn: Callable) -> type[BaseModel] | None:
    hints = get_type_hints(fn)
    if "return" not in hints:
        return None
    # type: ignore
    return create_model(f"{fn.__name__}Result", result=(hints["return"], ...))


def _doc_summary(fn: Callable) -> str | None:
    doc = inspect.getdoc(fn) or ""
    return doc.strip().splitlines()[0] if doc else None


class _Tool:
    def __init__(self, name: str, fn: Callable):
        self.name = name
        self.fn = fn
        self.params_model = _build_param_model(fn)
        self.result_model = _build_result_model(fn)
        self.description = _doc_summary(fn)

    def input_schema(self):
        return self.params_model.model_json_schema() if self.params_model else None

    def output_schema(self):
        return self.result_model.model_json_schema() if self.result_model else None


class _Resource:
    def __init__(self, uri: str, name: str, description: str, mimeType: str, fn: Callable):
        self.uri = uri
        self.name = name
        self.description = description
        self.mimeType = mimeType
        self.fn = fn
        self.uri_params = self._extract_uri_params(uri)

    def _extract_uri_params(self, uri: str) -> list[str]:
        '''Extract {param} placeholders from URI template.'''
        import re
        return re.findall(r'\{(\w+)\}', uri)

    def matches_uri(self, uri: str) -> dict[str, str] | None:
        '''Check if URI matches this resource template and extract params.'''
        import re
        # Convert URI template to regex pattern
        pattern = re.escape(self.uri).replace(r'\{', '{').replace(r'\}', '}')
        pattern = re.sub(r'\{(\w+)\}', r'(?P<\1>[^/]+)', pattern)
        pattern = f'^{pattern}$'

        match = re.match(pattern, uri)
        return match.groupdict() if match else None


class _Prompt:
    def __init__(self, name: str, description: str, arguments: list, fn: Callable):
        self.name = name
        self.description = description
        self.arguments = arguments
        self.fn = fn


class McpMeta(type):
    def __new__(mcls, name, bases, ns, **kw):
        cls = super().__new__(mcls, name, bases, ns, **kw)
        tools: dict[str, _Tool] = {}
        resources: dict[str, _Resource] = {}
        prompts: dict[str, _Prompt] = {}

        for attr, val in ns.items():
            if not callable(val) or attr.startswith("_"):
                continue

            # Convention: resource_* methods become resources
            if attr.startswith("resource_"):
                resource_name = attr[9:]  # Strip 'resource_' prefix

                # Build URI from method name and parameters
                sig = inspect.signature(val)
                params = [p for p in sig.parameters.keys() if p != 'self']

                if params:
                    # Parameterized resource: res://name/{param}
                    uri = f"res://{resource_name}/{{{params[0]}}}"
                else:
                    # Static resource: res://name
                    uri = f"res://{resource_name}"

                # Infer mimeType from return type hint
                hints = get_type_hints(val)
                return_type = hints.get('return', str)
                mimeType = "application/json" if return_type == dict else "text/plain"

                resources[uri] = _Resource(
                    uri=uri,
                    name=resource_name.replace('_', ' ').title(),
                    description=_doc_summary(val) or "",
                    mimeType=mimeType,
                    fn=val
                )

            # Convention: prompt_* methods become prompts
            elif attr.startswith("prompt_"):
                prompt_name = attr[7:]  # Strip 'prompt_' prefix

                # Infer arguments from method signature
                sig = inspect.signature(val)
                arguments = []
                for param_name, param in sig.parameters.items():
                    if param_name == 'self':
                        continue
                    arguments.append({
                        "name": param_name,
                        "description": f"{param_name.replace('_', ' ')} parameter",
                        "required": param.default == inspect._empty
                    })

                prompts[prompt_name] = _Prompt(
                    name=prompt_name,
                    description=_doc_summary(val) or "",
                    arguments=arguments,
                    fn=val
                )

            # Default: plain method is a tool
            else:
                tools[attr] = _Tool(attr, val)

        setattr(cls, "__mcp_tools__", tools)
        setattr(cls, "__mcp_resources__", resources)
        setattr(cls, "__mcp_prompts__", prompts)
        return cls


class McpServer(metaclass=McpMeta):
    _instance: 'McpServer | None' = None
    
    def __init__(self):
        self._initialized = False
        self._protocol_version = "2025-06-18"

    @classmethod
    def boot(cls, reuse_initialized: bool = False) -> 'McpServer':
        """Create or refresh the MCP service inside Pyodide.
        
        Args:
            reuse_initialized: If True, preserve handshake state across hot reloads
            
        Returns:
            The server instance
        """
        instance = cls()
        if reuse_initialized:
            instance._initialized = True
        cls._instance = instance
        attach_pyodide_worker(instance)
        return instance
    
    @classmethod
    def get_instance(cls) -> 'McpServer | None':
        """Get the current server instance."""
        return cls._instance

    def _server_info(self) -> Json:
        return {
            "name": self.__class__.__name__,
            "version": "0.1.0"
        }

    def _capabilities(self) -> Json:
        caps = {}

        if self.__mcp_tools__:
            caps["tools"] = {"listChanged": True}

        if self.__mcp_resources__:
            caps["resources"] = {"subscribe": False, "listChanged": True}

        if self.__mcp_prompts__:
            caps["prompts"] = {"listChanged": True}

        caps["experimental"] = {"validation": True}
        return caps

    def _tools_list(self) -> list[Json]:
        return [{
            "name": name,
            "description": t.description,
            "inputSchema": t.input_schema(),
            "outputSchema": t.output_schema(),
            "version": 1,
        } for name, t in self.__mcp_tools__.items()]

    def _resources_list(self) -> list[Json]:
        return [{
            "uri": r.uri,
            "name": r.name,
            "description": r.description,
            "mimeType": r.mimeType
        } for r in self.__mcp_resources__.values()]

    def _prompts_list(self) -> list[Json]:
        return [{
            "name": p.name,
            "description": p.description,
            "arguments": p.arguments
        } for p in self.__mcp_prompts__.values()]

    async def _handle_request(self, req: Json) -> Json | None:
        if req.get("jsonrpc") != "2.0":
            return {"jsonrpc": "2.0", "id": req.get("id"),
                    "error": {"code": -32600, "message": "Invalid JSON-RPC"}}

        method = req.get("method")
        req_id = req.get("id")

        # MCP LIFECYCLE: initialize
        if method == "initialize":
            params = req.get("params", {})
            client_version = params.get("protocolVersion")

            # Version negotiation
            if client_version != self._protocol_version:
                return {"jsonrpc": "2.0", "id": req_id,
                        "error": {"code": -32602,
                                  "message": f"Protocol version mismatch: {client_version}"}}

            return {"jsonrpc": "2.0", "id": req_id, "result": {
                "protocolVersion": self._protocol_version,
                "capabilities": self._capabilities(),
                "serverInfo": self._server_info()
            }}

        # MCP LIFECYCLE: initialized notification
        if method == "notifications/initialized":
            self._initialized = True
            return None  # Notifications don't get responses

        # INTROSPECTION: server metadata for client generation (before init check)
        if method == "server/introspect":
            try:
                from mcp_introspect import introspect_server
                schema = introspect_server(self)
                return {"jsonrpc": "2.0", "id": req_id, "result": schema}
            except Exception as e:
                return {"jsonrpc": "2.0", "id": req_id,
                        "error": {"code": -32603, "message": f"Introspection error: {str(e)}"}}

        # ENFORCE INITIALIZATION
        if not self._initialized:
            return {"jsonrpc": "2.0", "id": req_id,
                    "error": {"code": -32002, "message": "Server not initialized"}}

        if method == "tools/list":
            return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": self._tools_list()}}

        # RESOURCES
        if method == "resources/list":
            return {"jsonrpc": "2.0", "id": req_id, "result": {"resources": self._resources_list()}}

        if method == "resources/read":
            uri = req.get("params", {}).get("uri")
            if not uri:
                return {"jsonrpc": "2.0", "id": req_id,
                        "error": {"code": -32602, "message": "Missing uri parameter"}}

            # Find matching resource
            for resource in self.__mcp_resources__.values():
                params = resource.matches_uri(uri)
                if params is not None:
                    try:
                        fn = getattr(self, resource.fn.__name__)
                        content = fn(**params) if params else fn()

                        if inspect.isawaitable(content):
                            content = await content

                        # Format as MCP resource content
                        import json
                        if isinstance(content, dict):
                            text = json.dumps(content)
                        else:
                            text = str(content)

                        return {"jsonrpc": "2.0", "id": req_id, "result": {
                            "contents": [{
                                "uri": uri,
                                "mimeType": resource.mimeType,
                                "text": text
                            }]
                        }}
                    except Exception as e:
                        return {"jsonrpc": "2.0", "id": req_id,
                                "error": {"code": -32603, "message": str(e)}}

            return {"jsonrpc": "2.0", "id": req_id,
                    "error": {"code": -32602, "message": f"Unknown resource: {uri}"}}

        # PROMPTS
        if method == "prompts/list":
            return {"jsonrpc": "2.0", "id": req_id, "result": {"prompts": self._prompts_list()}}

        if method == "prompts/get":
            params = req.get("params", {})
            name = params.get("name")
            args = params.get("arguments", {})

            prompt = self.__mcp_prompts__.get(name)
            if not prompt:
                return {"jsonrpc": "2.0", "id": req_id,
                        "error": {"code": -32602, "message": f"Unknown prompt: {name}"}}

            try:
                fn = getattr(self, prompt.fn.__name__)
                result = fn(**args)

                if inspect.isawaitable(result):
                    result = await result

                return {"jsonrpc": "2.0", "id": req_id, "result": result}
            except Exception as e:
                return {"jsonrpc": "2.0", "id": req_id,
                        "error": {"code": -32603, "message": str(e)}}

        # MCP COMPLIANT tools/call with content wrapper
        if method == "tools/call":
            p = req.get("params") or {}
            name = p.get("name")
            args = p.get("arguments") or {}
            tool = self.__mcp_tools__.get(name)

            if not tool:
                return {"jsonrpc": "2.0", "id": req_id,
                        "error": {"code": -32601, "message": f"Unknown tool: {name}"}}

            try:
                parsed = tool.params_model(
                    **args).model_dump() if tool.params_model else {}
                fn = getattr(self, tool.name)
                res = fn(**parsed)

                if inspect.isawaitable(res):
                    import asyncio
                    res = await res

                # Wrap result in MCP content format
                import json
                if tool.result_model:
                    # For Pydantic models, serialize to JSON
                    result_json = tool.result_model(result=res).model_dump()
                    text_content = json.dumps(result_json['result'])
                else:
                    # For primitives
                    text_content = json.dumps(
                        res) if not isinstance(res, str) else res

                return {"jsonrpc": "2.0", "id": req_id, "result": {
                    "content": [{"type": "text", "text": text_content}]
                }}

            except Exception as e:
                # Error in MCP format
                return {"jsonrpc": "2.0", "id": req_id, "result": {
                    "content": [{"type": "text", "text": str(e)}],
                    "isError": True
                }}

        return {"jsonrpc": "2.0", "id": req_id,
                "error": {"code": -32601, "message": f"Unknown method: {method}"}}


def attach_pyodide_worker(server: McpServer):
    try:
        import js
        from pyodide.ffi import create_proxy, to_js
    except Exception as e:
        raise RuntimeError(
            "attach_pyodide_worker must run inside Pyodide") from e

    async def onmessage(ev):
        data = ev.data.to_py() if hasattr(ev.data, "to_py") else ev.data
        resp = await server._handle_request(data)
        # Only post message if there's a response (notifications return None)
        if resp is not None:
            js.postMessage(to_js(resp, dict_converter=js.Object.fromEntries))

    js.self.onmessage = create_proxy(onmessage)
    # Convert Python dict to JavaScript object for postMessage
    ready_msg = to_js({"type": "mcp.ready"},
                      dict_converter=js.Object.fromEntries)
    js.postMessage(ready_msg)
