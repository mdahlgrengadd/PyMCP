from pymcp import Server, serve, BaseModel, Field, Annotated, Any

# Data models
class Task(BaseModel):
    id: int
    title: str
    completed: bool = False

class WeatherInfo(BaseModel):
    location: str
    temperature: float
    humidity: int
    conditions: str

class TaskServer(Server):
    """A clean task management MCP server."""
    
    def __init__(self):
        super().__init__()
        self.tasks = [
            Task(id=1, title="Learn MCP", completed=False),
            Task(id=2, title="Build something cool", completed=False),
        ]
    
    # Tools (public methods become callable tools automatically)
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
        import asyncio
        await asyncio.sleep(0.1)  # Simulate API call
        
        return WeatherInfo(
            location=location,
            temperature=22.5,
            humidity=65,
            conditions="Partly cloudy"
        )
    
    # Resources (methods starting with 'resource_' become accessible via res:// URIs)
    def resource_help(self) -> str:
        """Task server help documentation."""
        return """# Task Management Server

A simple MCP server for managing tasks and getting weather.

## Available Commands:
- **create_task(title, completed=False)**: Create a new task
- **list_tasks()**: Get all tasks
- **toggle_task(task_id)**: Toggle completion status
- **get_weather(location)**: Get weather info

## Resources:
- **res://help**: This help document
- **res://stats**: Server statistics

## Prompts:
- **task_summary**: Summarize tasks
- **task_report**: Generate task report
"""
    
    def resource_stats(self) -> dict[str, Any]:
        """Server statistics."""
        completed = sum(1 for task in self.tasks if task.completed)
        return {
            "mimeType": "application/json",
            "text": f'{{"total_tasks": {len(self.tasks)}, "completed": {completed}, "pending": {len(self.tasks) - completed}}}',
            "description": "Task statistics"
        }
    
    # Prompts (methods starting with 'prompt_' become prompt templates)
    def prompt_task_summary(self) -> str:
        """Summarize tasks for a user."""
        return """{{ user_name }}'s Tasks:
{% for task in tasks %}
- {{ task.title }} {% if task.completed %}✅{% else %}⏳{% endif %}
{% endfor %}

Total: {{ tasks|length }} ({{ completed_count }} completed)"""
    
    def prompt_task_report(self) -> dict[str, Any]:
        """Generate a detailed task report."""
        return {
            "template": """# Task Report for {{ date }}

## Summary
- Total tasks: {{ total }}
- Completed: {{ completed }}
- Pending: {{ pending }}
- Completion rate: {{ (completed/total*100)|round(1) }}%

## Task List
{% for task in tasks %}
{{ loop.index }}. **{{ task.title }}** - {% if task.completed %}✅ Done{% else %}⏳ Pending{% endif %}
{% endfor %}""",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "Report date"},
                    "tasks": {"type": "array", "description": "List of tasks"},
                    "total": {"type": "integer", "description": "Total task count"},
                    "completed": {"type": "integer", "description": "Completed task count"},
                    "pending": {"type": "integer", "description": "Pending task count"}
                },
                "required": ["tasks", "total", "completed", "pending"]
            }
        }

# Simple server startup
def boot():
    """Traditional boot function for compatibility."""
    server = TaskServer()
    serve(server)

if __name__ == "__main__":
    boot()  # Use boot() for both local and remote execution