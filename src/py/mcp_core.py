from __future__ import annotations

import base64
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
    return create_model(f"{fn.__name__}Params", **fields) if fields else None  # type: ignore[arg-type]


def _build_result_model(fn: Callable) -> type[BaseModel] | None:
    hints = get_type_hints(fn)
    if "return" not in hints:
        return None
    return create_model(f"{fn.__name__}Result", result=(hints["return"], ...))  # type: ignore[arg-type]


def _doc_summary(fn: Callable) -> str | None:
    doc = inspect.getdoc(fn) or ""
    return doc.strip().splitlines()[0] if doc else None


def _title_case_slug(slug: str) -> str:
    parts = slug.replace("-", " ").replace("_", " ").split()
    return " ".join(p.capitalize() for p in parts) if parts else slug


def _ensure_model_dump(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump()
    return value


def _normalize_resource_content(value: Any, uri: str, default_description: str | None) -> dict[str, Any]:
    value = _ensure_model_dump(value)

    if isinstance(value, dict) and "contents" in value:
        return value  # assume caller returned fully formed payload

    base: dict[str, Any] = {"uri": uri}

    if isinstance(value, str):
        base.update({"mimeType": "text/plain", "text": value})
        if default_description:
            base["description"] = default_description
        return base

    if isinstance(value, bytes):
        base.update({
            "mimeType": "application/octet-stream",
            "data": base64.b64encode(value).decode("ascii"),
        })
        if default_description:
            base["description"] = default_description
        return base

    if isinstance(value, dict):
        result = {**base, **{k: v for k, v in value.items() if k not in {"bytes"}}}
        result.setdefault("mimeType", "text/plain")
        if "text" not in result and "data" not in result:
            if "bytes" in value:
                result["data"] = base64.b64encode(value["bytes"]).decode("ascii")
            else:
                raise ValueError("Resource dict must include 'text', 'data', or 'bytes'.")
        if "description" not in result and default_description:
            result["description"] = default_description
        return result

    raise TypeError("Unsupported resource return type. Use str, bytes, dict, or BaseModel.")


def _normalize_prompt(value: Any, name: str, description: str | None) -> dict[str, Any]:
    value = _ensure_model_dump(value)

    if isinstance(value, dict) and "prompt" in value:
        base = {"name": name}
        if description:
            base["description"] = description
        return {**base, **value["prompt"]}

    base: dict[str, Any] = {"name": name}
    if description:
        base["description"] = description

    if isinstance(value, str):
        base.update({
            "format": "jinja2",
            "template": value,
        })
        return base

    if isinstance(value, dict):
        merged = {**base, **value}
        merged.setdefault("format", "jinja2" if "template" in merged else "messages")
        return merged

    raise TypeError("Unsupported prompt return type. Use str, dict, or BaseModel.")


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
    def __init__(self, attr: str, fn: Callable):
        self.attr = attr
        self.slug = attr[len("resource_"):]
        self.fn = fn
        self.description = _doc_summary(fn)
        self.display_name = getattr(fn, "display_name", _title_case_slug(self.slug))
        self.default_mime = getattr(fn, "mime_type", "text/plain")

    @property
    def uri(self) -> str:
        return f"res://{self.slug}"

    def descriptor(self) -> dict[str, Any]:
        desc: dict[str, Any] = {
            "uri": self.uri,
            "name": self.display_name,
            "mimeType": self.default_mime,
        }
        if self.description:
            desc["description"] = self.description
        return desc


class _Prompt:
    def __init__(self, attr: str, fn: Callable):
        self.attr = attr
        self.name = attr[len("prompt_"):]
        self.fn = fn
        self.description = _doc_summary(fn)

    def descriptor(self) -> dict[str, Any]:
        desc: dict[str, Any] = {"name": self.name}
        if self.description:
            desc["description"] = self.description
        return desc


class McpMeta(type):
    def __new__(mcls, name, bases, ns, **kw):
        cls = super().__new__(mcls, name, bases, ns, **kw)
        tools: dict[str, _Tool] = {}
        resources: dict[str, _Resource] = {}
        prompts: dict[str, _Prompt] = {}
        for attr, val in ns.items():
            if attr.startswith("_"):
                continue
            if callable(val):
                if attr.startswith("resource_"):
                    resources[attr[len("resource_"):]] = _Resource(attr, val)
                    continue
                if attr.startswith("prompt_"):
                    prompts[attr[len("prompt_"):]] = _Prompt(attr, val)
                    continue
                tools[attr] = _Tool(attr, val)
        setattr(cls, "__mcp_tools__", tools)
        setattr(cls, "__mcp_resources__", resources)
        setattr(cls, "__mcp_prompts__", prompts)
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

    def _resources_list(self) -> list[Json]:
        return [res.descriptor() for res in self.__mcp_resources__.values()]

    async def _resource_read(self, uri: str) -> Json:
        if not uri.startswith("res://"):
            raise ValueError("Resource URIs must start with 'res://'")
        slug = uri[len("res://"):]
        res = self.__mcp_resources__.get(slug)
        if not res:
            raise KeyError(f"Unknown resource: {uri}")
        fn = getattr(self, res.attr)
        value = fn()
        if inspect.isawaitable(value):
            value = await value
        content = _normalize_resource_content(value, res.uri, res.description)
        content.setdefault("mimeType", res.default_mime)
        return {"contents": [content]}

    def _prompts_list(self) -> list[Json]:
        return [prompt.descriptor() for prompt in self.__mcp_prompts__.values()]

    async def _prompts_get(self, name: str) -> Json:
        prompt = self.__mcp_prompts__.get(name)
        if not prompt:
            raise KeyError(f"Unknown prompt template: {name}")
        fn = getattr(self, prompt.attr)
        value = fn()
        if inspect.isawaitable(value):
            value = await value
        prompt_payload = _normalize_prompt(value, name, prompt.description)
        return {"prompt": prompt_payload}

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
                res = await res
            if tool.result_model:
                res = tool.result_model(result=res).model_dump()
            return {"jsonrpc": "2.0", "id": req.get("id"), "result": res}

        if method == "resources/list":
            return {"jsonrpc": "2.0", "id": req.get("id"), "result": {"resources": self._resources_list()}}

        if method == "resources/read":
            p = req.get("params") or {}
            uri = p.get("uri")
            if not uri:
                return {"jsonrpc": "2.0", "id": req.get("id"),
                        "error": {"code": -32602, "message": "Missing 'uri' parameter"}}
            try:
                result = await self._resource_read(uri)
            except KeyError as exc:
                return {"jsonrpc": "2.0", "id": req.get("id"),
                        "error": {"code": -32601, "message": str(exc)}}
            except Exception as exc:  # noqa: BLE001
                return {"jsonrpc": "2.0", "id": req.get("id"),
                        "error": {"code": -32000, "message": str(exc)}}
            return {"jsonrpc": "2.0", "id": req.get("id"), "result": result}

        if method == "prompts/list":
            return {"jsonrpc": "2.0", "id": req.get("id"), "result": {"prompts": self._prompts_list()}}

        if method == "prompts/get":
            p = req.get("params") or {}
            name = p.get("name")
            if not name:
                return {"jsonrpc": "2.0", "id": req.get("id"),
                        "error": {"code": -32602, "message": "Missing 'name' parameter"}}
            try:
                result = await self._prompts_get(name)
            except KeyError as exc:
                return {"jsonrpc": "2.0", "id": req.get("id"),
                        "error": {"code": -32601, "message": str(exc)}}
            except Exception as exc:  # noqa: BLE001
                return {"jsonrpc": "2.0", "id": req.get("id"),
                        "error": {"code": -32000, "message": str(exc)}}
            return {"jsonrpc": "2.0", "id": req.get("id"), "result": result}

        return {"jsonrpc": "2.0", "id": req.get("id"),
                "error": {"code": -32601, "message": f"Unknown method: {method}"}}


def attach_pyodide_worker(server: McpServer):
    try:
        import js
        from pyodide.ffi import create_proxy, to_js
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("attach_pyodide_worker must run inside Pyodide") from exc

    async def onmessage(ev):
        data = ev.data.to_py() if hasattr(ev.data, "to_py") else ev.data
        resp = await server._handle_request(data)
        js.postMessage(to_js(resp, dict_converter=js.Object.fromEntries))

    js.self.onmessage = create_proxy(onmessage)
    ready_msg = to_js({"type": "mcp.ready"}, dict_converter=js.Object.fromEntries)
    js.postMessage(ready_msg)
