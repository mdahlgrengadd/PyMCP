from typing import Annotated, Any
from pydantic import BaseModel, Field
from mcp_core import McpServer, attach_pyodide_worker

class Item(BaseModel):
    id: int
    name: str

class MyService(McpServer):
    def echo(self, message: str, upper: bool = False) -> str:
        '''Echo a message. Set upper to True to shout.'''
        return message.upper() if upper else message

    def add(self, a: float, b: float) -> float:
        '''Add two numbers.'''
        return a + b

    async def get_item(self, item_id: Annotated[int, Field(ge=1)]) -> Item:
        '''Fetch an item by id.'''
        return Item(id=item_id, name=f"Item {item_id}")

    def resource_welcome(self) -> dict[str, str]:
        '''Markdown document explaining how to use the demo.'''
        return {
            "mimeType": "text/markdown",
            "text": "# PyMCP Demo\n\nUse the buttons above to call tools, resources, and prompts.",
        }

    resource_welcome.display_name = "Welcome Guide"  # type: ignore[attr-defined]

    def prompt_greeting(self) -> dict[str, Any]:
        '''Prompt template for greeting a user by name.'''
        return {
            "template": "Hello {{ name }}! I'm ready to help you with MCP.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Recipient name"},
                },
                "required": ["name"],
            },
        }

def boot():
    svc = MyService()
    attach_pyodide_worker(svc)
