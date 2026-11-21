from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from app.models import TicketStatus


class TicketResponse(BaseModel):
    """Details of an issued ticket."""
    id: UUID
    event_id: UUID
    tier_id: UUID
    seat_id: Optional[UUID] = None
    qr_code: str
    status: TicketStatus
    checked_in_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CheckInRequest(BaseModel):
    """Payload for gate staff checking in an attendee via QR scan or manual ticket ID."""
    qr_code: Optional[str] = None
    ticket_code: Optional[str] = None


class CheckInResponse(BaseModel):
    """Verification result for gate check-in."""
    valid: bool
    message: str
    ticket: Optional[TicketResponse] = None
    attendee_name: Optional[str] = None
