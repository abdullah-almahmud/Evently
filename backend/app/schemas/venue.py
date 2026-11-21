from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from app.models import LayoutType


class VenueSectionCreate(BaseModel):
    """Schema for adding a seated section to a venue."""
    name: str = Field(..., min_length=1, max_length=100)
    rows: int = Field(..., gt=0, le=100)
    seats_per_row: int = Field(..., gt=0, le=100)


class VenueSectionResponse(BaseModel):
    """Details of a venue section."""
    id: UUID
    venue_id: UUID
    name: str
    rows: int
    seats_per_row: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VenueCreate(BaseModel):
    """Schema for creating a campus venue."""
    name: str = Field(..., min_length=2, max_length=255)
    address: str = Field(..., min_length=5, max_length=500)
    city: str = Field(..., min_length=2, max_length=100)
    total_capacity: int = Field(..., gt=0)
    layout_type: LayoutType = LayoutType.GENERAL_ADMISSION
    description: Optional[str] = None


class VenueUpdate(BaseModel):
    """Schema for updating venue properties."""
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    address: Optional[str] = Field(None, min_length=5, max_length=500)
    city: Optional[str] = Field(None, min_length=2, max_length=100)
    total_capacity: Optional[int] = Field(None, gt=0)
    layout_type: Optional[LayoutType] = None
    description: Optional[str] = None


class VenueResponse(BaseModel):
    """Public details of a venue, including sections if applicable."""
    id: UUID
    name: str
    address: str
    city: str
    total_capacity: int
    layout_type: LayoutType
    description: Optional[str] = None
    created_by: UUID
    created_at: datetime
    sections: List[VenueSectionResponse] = []

    model_config = ConfigDict(from_attributes=True)
