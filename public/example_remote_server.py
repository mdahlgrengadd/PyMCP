from typing import Annotated, Any
from pydantic import BaseModel, Field

# These will be imported from mcp_core when running in Pyodide
try:
    from mcp_core import McpServer, attach_pyodide_worker
except ImportError:
    # Fallback definitions for development/testing
    class McpServer:
        pass
    def attach_pyodide_worker(server):
        pass

# Example data models
class Task(BaseModel):
    id: int
    title: str
    completed: bool = False

class WeatherInfo(BaseModel):
    location: str
    temperature: float
    humidity: int
    conditions: str

class ExampleRemoteServer(McpServer):
    """Example remote MCP server with tools, resources, and prompts."""
    
    def __init__(self):
        super().__init__()
        self.tasks = [
            Task(id=1, title="Learn MCP", completed=False),
            Task(id=2, title="Build something cool", completed=False),
        ]
    
    def create_task(self, title: str, completed: bool = False) -> Task:
        """Create a new task."""
        new_id = max(task.id for task in self.tasks) + 1 if self.tasks else 1
        task = Task(id=new_id, title=title, completed=completed)
        self.tasks.append(task)
        return task
    
    def list_tasks(self) -> list[Task]:
        """List all tasks."""
        return self.tasks
    
    def toggle_task(self, task_id: Annotated[int, Field(ge=1)]) -> Task:
        """Toggle task completion status."""
        for task in self.tasks:
            if task.id == task_id:
                task.completed = not task.completed
                return task
        raise ValueError(f"Task {task_id} not found")
    
    async def get_weather(self, location: str) -> WeatherInfo:
        """Get weather information for a location (simulated)."""
        # Simulate async weather API call
        import asyncio
        await asyncio.sleep(0.1)
        
        return WeatherInfo(
            location=location,
            temperature=22.5,
            humidity=65,
            conditions="Partly cloudy"
        )
    
    def resource_help(self) -> str:
        """Comprehensive help documentation."""
        return """# Remote MCP Server Help

This is an example remote MCP server loaded dynamically from a URL.

## Available Tools:
- **create_task**: Create a new task
- **list_tasks**: List all current tasks  
- **toggle_task**: Toggle task completion
- **get_weather**: Get weather for a location (simulated)

## Resources:
- **help**: This help document
- **server_info**: Information about this server

## Prompts:
- **task_summary**: Summarize task list
- **weather_report**: Format weather information
"""
    
    def resource_server_info(self) -> dict[str, Any]:
        """Information about this remote server."""
        return {
            "mimeType": "application/json",
            "text": """{"name": "Example Remote MCP Server", "version": "1.0.0", "loaded_from": "remote_url", "features": ["tools", "resources", "prompts"]}""",
            "description": "Server metadata and capabilities"
        }
    
    def prompt_task_summary(self) -> dict[str, Any]:
        """Prompt for generating task summaries."""
        return {
            "template": "Here's a summary of {{ user_name }}'s tasks:\n\n{% for task in tasks %}{{ loop.index }}. {{ task.title }} {% if task.completed %}✅{% else %}⏳{% endif %}\n{% endfor %}\nTotal: {{ tasks|length }} tasks ({{ completed_count }} completed)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "user_name": {"type": "string", "description": "Name of the user"},
                    "tasks": {"type": "array", "description": "List of tasks"},
                    "completed_count": {"type": "integer", "description": "Number of completed tasks"}
                },
                "required": ["tasks"]
            }
        }
    
    def prompt_weather_report(self) -> str:
        """Simple weather report template."""
        return "🌤️ Weather in {{ location }}: {{ temperature }}°C, {{ humidity }}% humidity. Conditions: {{ conditions }}"

# Auto-discovery boot function
def boot():
    """Initialize and attach the remote server."""
    server = ExampleRemoteServer()
    attach_pyodide_worker(server)

if __name__ == "__main__":
    boot()