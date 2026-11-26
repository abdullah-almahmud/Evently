from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.models import EventCategory, EventStatus
from app.schemas.user import UserResponse
from app.schemas.venue import VenueResponse


class TicketTierCreate(BaseModel):
    """Schema for defining a new ticket tier."""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    price: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    total_quantity: int = Field(..., gt=0)
    max_per_user: int = Field(default=4, gt=0, le=20)


class TicketTierUpdate(BaseModel):
    """Schema for updating an existing ticket tier."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    price: Optional[Decimal] = Field(None, ge=Decimal("0.00"))
    total_quantity: Optional[int] = Field(None, gt=0)
    max_per_user: Optional[int] = Field(None, gt=0, le=20)
    is_active: Optional[bool] = None


class TicketTierResponse(BaseModel):
    """Serialized representation of a ticket tier."""
    id: UUID
    event_id: UUID
    name: str
    description: Optional[str] = None
    price: Decimal
    total_quantity: int
    available_quantity: int
    max_per_user: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EventCreate(BaseModel):
    """Schema for creating a new campus event."""
    title: str = Field(..., min_length=3, max_length=255)
    description: Optional[str] = None
    category: EventCategory = EventCategory.OTHER
    venue_id: Optional[UUID] = None
    banner_url: Optional[str] = None
    start_datetime: datetime
    end_datetime: datetime
    registration_start: Optional[datetime] = None
    registration_end: Optional[datetime] = None
    is_seated: bool = False
    seat_hold_enabled: bool = False
    ticket_tiers: Optional[List[TicketTierCreate]] = None

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def populate_tiers(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "ticket_tiers" not in data and "tiers" in data:
                data["ticket_tiers"] = data["tiers"]
        return data


class EventUpdate(BaseModel):
    """Schema for updating event information."""
    title: Optional[str] = Field(None, min_length=3, max_length=255)
    description: Optional[str] = None
    category: Optional[EventCategory] = None
    venue_id: Optional[UUID] = None
    banner_url: Optional[str] = None
    start_datetime: Optional[datetime] = None
    end_datetime: Optional[datetime] = None
    registration_start: Optional[datetime] = None
    registration_end: Optional[datetime] = None
    status: Optional[EventStatus] = None
    is_seated: Optional[bool] = None
    seat_hold_enabled: Optional[bool] = None
    ticket_tiers: Optional[List[TicketTierCreate]] = None

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def populate_tiers(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "ticket_tiers" not in data and "tiers" in data:
                data["ticket_tiers"] = data["tiers"]
        return data


class EventResponse(BaseModel):
    """Full event details including organizer and venue info."""
    id: UUID
    title: str
    description: Optional[str] = None
    category: EventCategory
    organizer_id: UUID
    venue_id: Optional[UUID] = None
    banner_url: Optional[str] = None
    start_datetime: datetime
    end_datetime: datetime
    registration_start: Optional[datetime] = None
    registration_end: Optional[datetime] = None
    status: EventStatus
    is_seated: bool
    seat_hold_enabled: bool = False
    created_at: datetime
    updated_at: datetime
    organizer: Optional[UserResponse] = None
    venue_name: Optional[str] = None
    venue: Optional[VenueResponse] = None
    tiers: List[TicketTierResponse] = []
    ticket_tiers: List[TicketTierResponse] = []

    model_config = ConfigDict(from_attributes=True)


class EventListResponse(BaseModel):
    """Paginated collection of events."""
    items: List[EventResponse]
    total: int
    page: int
    limit: int
    pages: int
