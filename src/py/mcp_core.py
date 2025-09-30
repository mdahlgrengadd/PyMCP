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
        fields[name] = (ann, ...) if p.default is inspect._empty else (ann, p.default)
    return create_model(f"{fn.__name__}Params", **fields) if fields else None  # type: ignore

def _build_result_model(fn: Callable) -> type[BaseModel] | None:
    hints = get_type_hints(fn)
    if "return" not in hints:
        return None
    return create_model(f"{fn.__name__}Result", result=(hints["return"], ...))  # type: ignore

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

class McpMeta(type):
    def __new__(mcls, name, bases, ns, **kw):
        cls = super().__new__(mcls, name, bases, ns, **kw)
        tools: dict[str, _Tool] = {}
        for attr, val in ns.items():
            if attr.startswith("_"):
                continue
            if callable(val):
                tools[attr] = _Tool(attr, val)
        setattr(cls, "__mcp_tools__", tools)
        return cls

class McpServer(metaclass=McpMeta):
    def _tools_list(self) -> list[Json]:
        return [{
            "name": name,
            "description": t.description,
            "inputSchema": t.input_schema(),
            "outputSchema": t.output_schema(),
            "version": 1,
        } for name, t in self.__mcp_tools__.items()]

    async def _handle_request(self, req: Json) -> Json:
        if req.get("jsonrpc") != "2.0":
            return {"jsonrpc": "2.0", "id": req.get("id"),
                    "error": {"code": -32600, "message": "Invalid JSON-RPC"}}
        method = req.get("method")
        if method == "tools/list":
            return {"jsonrpc": "2.0", "id": req.get("id"), "result": self._tools_list()}
        if method == "tools/call":
            p = req.get("params") or {}
            name = p.get("name")
            args = p.get("args") or {}
            tool = self.__mcp_tools__.get(name)
            if not tool:
                return {"jsonrpc": "2.0", "id": req.get("id"),
                        "error": {"code": -32601, "message": f"Unknown tool: {name}"}}
            parsed = tool.params_model(**args).model_dump() if tool.params_model else {}
            fn = getattr(self, tool.name)
            res = fn(**parsed)
            if inspect.isawaitable(res):
                import asyncio
                res = await res
            if tool.result_model:
                res = tool.result_model(result=res).model_dump()
            return {"jsonrpc": "2.0", "id": req.get("id"), "result": res}
        return {"jsonrpc": "2.0", "id": req.get("id"),
                "error": {"code": -32601, "message": f"Unknown method: {method}"}}

def attach_pyodide_worker(server: McpServer):
    try:
        import js
        from pyodide.ffi import create_proxy, to_js
    except Exception as e:
        raise RuntimeError("attach_pyodide_worker must run inside Pyodide") from e

    async def onmessage(ev):
        data = ev.data.to_py() if hasattr(ev.data, "to_py") else ev.data
        resp = await server._handle_request(data)
        js.postMessage(to_js(resp, dict_converter=js.Object.fromEntries))

    js.self.onmessage = create_proxy(onmessage)
    # Convert Python dict to JavaScript object for postMessage
    ready_msg = to_js({"type": "mcp.ready"}, dict_converter=js.Object.fromEntries)
    js.postMessage(ready_msg)
