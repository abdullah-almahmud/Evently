from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from app.models import TicketStatus


class TicketVenueSummary(BaseModel):
    """Minimal venue info nested on ticket/booking event summary."""
    id: UUID
    name: str
    address: Optional[str] = None
    city: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TicketEventSummary(BaseModel):
    """Minimal event info nested on tickets and bookings."""
    id: UUID
    title: str
    start_datetime: datetime
    end_datetime: datetime
    venue: Optional[TicketVenueSummary] = None

    model_config = ConfigDict(from_attributes=True)


class TicketTierSummary(BaseModel):
    """Minimal tier info nested on tickets and booking items."""
    id: UUID
    name: str
    price: Decimal

    model_config = ConfigDict(from_attributes=True)


class TicketResponse(BaseModel):
    """Details of an issued ticket."""
    id: UUID
    event_id: UUID
    tier_id: UUID
    user_id: UUID
    seat_id: Optional[UUID] = None
    qr_code: str
    status: TicketStatus
    checked_in_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    event: Optional[TicketEventSummary] = None
    tier: Optional[TicketTierSummary] = None

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


class CheckInStatsResponse(BaseModel):
    """Statistics for check-in at an event."""
    total_tickets: int
    checked_in: int
    remaining: int


class CheckInTicketListItem(BaseModel):
    """Ticket list item for organizer/staff view."""
    id: UUID
    ticket_id: UUID
    user_id: UUID
    attendee_name: str
    attendee_email: str
    tier_id: UUID
    tier_name: str
    status: TicketStatus
    checked_in_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
