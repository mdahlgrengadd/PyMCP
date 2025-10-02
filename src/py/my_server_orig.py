from typing import Annotated
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

def boot():
    svc = MyService()
    attach_pyodide_worker(svc)
