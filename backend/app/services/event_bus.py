import asyncio
from typing import Dict, List, AsyncGenerator, Any
import json
from dataclasses import dataclass

@dataclass
class Event:
    type: str # e.g. "task_update", "agent_state_update"
    workspace_id: str
    data: Any

class EventBus:
    def __init__(self):
        # ws_id -> List[Queue]
        self._subscribers: Dict[str, List[asyncio.Queue]] = {}

    async def subscribe(self, workspace_id: str) -> AsyncGenerator[Event, None]:
        """Subscribe to events for a specific workspace"""
        queue = asyncio.Queue()
        
        if workspace_id not in self._subscribers:
            self._subscribers[workspace_id] = []
        self._subscribers[workspace_id].append(queue)
        print(f"📡 SSE SUBSCRIBE: workspace {workspace_id}, total subs: {len(self._subscribers[workspace_id])}")

        try:
            while True:
                event = await queue.get()
                yield event
        finally:
            self._subscribers[workspace_id].remove(queue)
            if not self._subscribers[workspace_id]:
                del self._subscribers[workspace_id]

    async def publish(self, event: Event):
        """Publish an event to all subscribers of a workspace"""
        subs = self._subscribers.get(event.workspace_id, [])
        if subs:
            for queue in subs:
                await queue.put(event)
            # Only log occasionally to avoid spam
            if event.data.get("state_summary", {}).get("status"):
                print(f"📤 SSE PUBLISH: {event.type} to {len(subs)} subs (ws: {event.workspace_id[:8]}...)")
        # Note: if no subs, the event is simply dropped

# Global singleton
event_bus = EventBus()
