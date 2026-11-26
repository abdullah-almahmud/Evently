from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class SeatResponse(BaseModel):
    """Public seat info returned to attendees for seat-selection UI."""
    id: UUID
    section_id: UUID
    row_label: str
    seat_number: int
    # Derived status: 'AVAILABLE' | 'RESERVED' | 'HELD'
    status: str

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
    sections: List[SeatSectionGroup]
