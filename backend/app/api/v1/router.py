from fastapi import APIRouter
from app.api.v1 import (
    admin,
    analytics,
    auth,
    bookings,
    checkin,
    events,
    payments,
    users,
    venues,
    websocket_routes,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(venues.router, prefix="/venues", tags=["venues"])
api_router.include_router(bookings.router, prefix="/bookings", tags=["bookings"])
api_router.include_router(payments.router, prefix="/payments", tags=["payments"])
api_router.include_router(checkin.router, prefix="/checkin", tags=["checkin"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(websocket_routes.router, tags=["websockets"])
