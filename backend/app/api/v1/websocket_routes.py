from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws/events/{event_id}")
async def event_websocket(websocket: WebSocket, event_id: str):
    """
    WebSocket endpoint for real-time interactive seat map updates and hold events.
    Full multi-client pub/sub broadcasting will be implemented in the 70% milestone.
    """
    await websocket.accept()
    try:
        await websocket.send_json({
            "type": "connected",
            "event_id": event_id,
            "message": "WebSocket connected - full real-time seat synchronization in 70% milestone",
        })
        # Keep connection open until client disconnects
        while True:
            data = await websocket.receive_text()
            await websocket.send_json({
                "type": "echo",
                "event_id": event_id,
                "received": data,
            })
    except WebSocketDisconnect:
        pass
    except Exception:
        await websocket.close()
