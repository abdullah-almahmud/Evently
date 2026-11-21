from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from app.models import BookingStatus


class BookingItemResponse(BaseModel):
    """Line item in a booking response."""
    id: UUID
    tier_id: UUID
    seat_id: Optional[UUID] = None
    quantity: int
    unit_price: Decimal

    model_config = ConfigDict(from_attributes=True)


class BookingResponse(BaseModel):
    """Full booking details with line items."""
    id: UUID
    user_id: UUID
    event_id: UUID
    total_amount: Decimal
    status: BookingStatus
    created_at: datetime
    items: List[BookingItemResponse] = []

    model_config = ConfigDict(from_attributes=True)
