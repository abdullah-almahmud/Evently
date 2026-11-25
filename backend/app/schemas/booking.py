from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from app.models import BookingStatus
from app.schemas.ticket import TicketEventSummary, TicketResponse, TicketTierSummary


class BookingCreateItem(BaseModel):
    """Single tier+quantity item in a booking creation request."""
    tier_id: UUID
    quantity: int


class BookingCreate(BaseModel):
    """Payload for creating a new booking."""
    event_id: UUID
    items: List[BookingCreateItem]


class BookingItemResponse(BaseModel):
    """Line item in a booking response."""
    id: UUID
    tier_id: UUID
    seat_id: Optional[UUID] = None
    quantity: int
    unit_price: Decimal
    tier: Optional[TicketTierSummary] = None

    model_config = ConfigDict(from_attributes=True)


class BookingResponse(BaseModel):
    """Full booking details with line items."""
    id: UUID
    user_id: UUID
    event_id: UUID
    total_amount: Decimal
    status: BookingStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    items: List[BookingItemResponse] = []
    tickets: Optional[List[TicketResponse]] = None
    event: Optional[TicketEventSummary] = None

    model_config = ConfigDict(from_attributes=True)
