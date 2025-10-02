from typing import Annotated
from pydantic import BaseModel, Field
from mcp_core import McpServer, attach_pyodide_worker


class Item(BaseModel):
    id: int
    name: str


class MyService(McpServer):
    def __init__(self):
        super().__init__()
        # Example data for resources
        self._documents = {
            "doc1": "This is the first document. It contains important information.",
            "doc2": "This is the second document. It has different content.",
        }

    # ============ TOOLS (plain methods) ============

    def echo(self, message: str, upper: bool = False) -> str:
        '''Echo a message. Set upper to True to shout.'''
        return message.upper() if upper else message

    def add(self, a: float, b: float) -> float:
        '''Add two numbers.'''
        return a + b

    async def get_item(self, item_id: Annotated[int, Field(ge=1)]) -> Item:
        '''Fetch an item by id.'''
        return Item(id=item_id, name=f"Item {item_id}")

    # ============ RESOURCES (resource_* methods) ============

    def resource_help(self) -> str:
        '''Server help documentation (auto: res://help, text/plain).'''
        return """# MyService Help Documentation"""

    def resource_stats(self) -> dict:
        '''Server statistics (auto: res://stats, application/json).'''
        return {
            "total_documents": len(self._documents),
            "available_tools": 3,
            "available_resources": 3,
            "available_prompts": 2,
            "server_version": "0.1.0"
        }

    def resource_doc(self, doc_id: str) -> str:
        '''Get document by ID (auto: res://doc/{doc_id}, text/plain).'''
        if doc_id not in self._documents:
            return f"Document '{doc_id}' not found. Available: {', '.join(self._documents.keys())}"
        return self._documents[doc_id]

    # ============ PROMPTS (prompt_* methods) ============

    def prompt_summarize(self, doc_id: str, max_words: int = 50) -> dict:
        '''Summarize a document (arguments auto-inferred from signature).'''
        doc_content = self._documents.get(doc_id, "Document not found")

        return {
            "description": f"Summarize document {doc_id} in {max_words} words",
            "messages": [
                {
                    "role": "user",
                    "content": {
                        "type": "text",
                        "text": f"Please summarize the following document in {max_words} words or less:\n\n{doc_content}"
                    }
                }
            ]
        }

    def prompt_code_review(self, language: str, complexity: str = "medium") -> dict:
        '''Generate a code review prompt (arguments auto-inferred).'''
        return {
            "description": f"Code review for {language} at {complexity} complexity",
            "messages": [
                {
                    "role": "user",
                    "content": {
                        "type": "text",
                        "text": f"Please review this {language} code. Focus on {complexity}-level issues including:\n" +
                        ("- Basic syntax and style\n" if complexity == "easy" else "") +
                        ("- Logic and best practices\n" if complexity == "medium" else "") +
                        ("- Performance and architecture\n" if complexity == "hard" else "")
                    }
                }
            ]
        }


def boot():
    svc = MyService()
    attach_pyodide_worker(svc)
