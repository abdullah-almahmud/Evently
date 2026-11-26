from collections import defaultdict
from typing import Any, Dict, Set
from uuid import UUID
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


class EventConnectionManager:
    """In-memory WebSocket broadcast hub for real-time per-event seat updates."""

    def __init__(self) -> None:
        self.rooms: Dict[str, Set[WebSocket]] = defaultdict(set)

    async def connect(self, event_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.rooms[str(event_id)].add(websocket)

    def disconnect(self, event_id: str, websocket: WebSocket) -> None:
        key = str(event_id)
        clients = self.rooms.get(key)
        if not clients:
            return
        clients.discard(websocket)
        if not clients:
            self.rooms.pop(key, None)

    async def broadcast(self, event_id: str | UUID, payload: Dict[str, Any]) -> None:
        key = str(event_id)
        clients = list(self.rooms.get(key, ()))
        if not clients:
            return
        dead: list[WebSocket] = []
        for ws in clients:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(key, ws)


event_ws_manager = EventConnectionManager()


async def broadcast_event_seat_update(
    event_id: str | UUID,
    seats: list[Dict[str, Any]],
    reason: str,
    actor_id: str | UUID | None = None,
) -> None:
    """Broadcasts live seat status changes (HELD / AVAILABLE / RESERVED) to all viewers."""
    if not seats:
        return
    await event_ws_manager.broadcast(
        event_id,
        {
            "type": "seat_update",
            "event_id": str(event_id),
            "reason": reason,
            "actor_id": str(actor_id) if actor_id else None,
            "seats": seats,
        },
    )


@router.websocket("/ws/events/{event_id}")
async def event_websocket(websocket: WebSocket, event_id: str):
    """
    Real-time WebSocket endpoint for interactive seat selection updates.
    Pushes instant Pink/Red/Green seat transitions across all attendees on an event.
    """
    await event_ws_manager.connect(event_id, websocket)
    try:
        await websocket.send_json({
            "type": "connected",
            "event_id": event_id,
        })
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        event_ws_manager.disconnect(event_id, websocket)
    except Exception:
        event_ws_manager.disconnect(event_id, websocket)
        try:
            await websocket.close()
        except Exception:
            pass
