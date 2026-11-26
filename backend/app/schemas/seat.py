from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class SeatResponse(BaseModel):
    """Public seat info returned to attendees for seat-selection UI."""
    id: UUID
    section_id: UUID
    tier_id: Optional[UUID] = None
    row_label: str
    seat_number: int
    # Server status: 'AVAILABLE' | 'HELD' | 'RESERVED'
    status: str
    held_by_me: bool = False
    hold_expires_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SeatSectionGroup(BaseModel):
    """All seats in one venue section, used for the visual seat map."""
    section_id: UUID
    section_name: str
    rows: int
    seats_per_row: int
    tier_id: Optional[UUID] = None
    seats: List[SeatResponse]


class EventSeatsResponse(BaseModel):
    """Full seat layout for a seated event, grouped by section."""
    event_id: UUID
    is_seated: bool
    seat_hold_enabled: bool = False
    my_hold_expires_at: Optional[datetime] = None
    server_time: Optional[datetime] = None
    sections: List[SeatSectionGroup]


class SeatHoldActionResponse(BaseModel):
    """Response for acquiring or releasing a timed seat hold."""
    seat_id: Optional[UUID] = None
    held: bool
    expires_at: Optional[datetime] = None
    server_time: datetime
    active_hold_count: int = 0
