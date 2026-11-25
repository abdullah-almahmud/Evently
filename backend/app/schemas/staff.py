from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from app.models import StaffRole, VolunteerApplicationStatus
from app.schemas.user import UserResponse


class StaffResponse(BaseModel):
    """Details of an event staff assignment."""
    id: UUID
    user_id: UUID
    event_id: UUID
    role: StaffRole
    assigned_by: UUID
    created_at: datetime
    user: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)


class VolunteerApplicationResponse(BaseModel):
    """Details of a volunteer application."""
    id: UUID
    event_id: UUID
    user_id: UUID
    motivation: str
    status: VolunteerApplicationStatus
    reviewed_by: Optional[UUID] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    user: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)


class VolunteerApplicationCreate(BaseModel):
    """Payload for submitting a volunteer application."""
    motivation: str


class VolunteerApplicationReview(BaseModel):
    """Payload for reviewing a volunteer application."""
    status: VolunteerApplicationStatus

    def model_post_init(self, __context):
        if self.status not in (VolunteerApplicationStatus.APPROVED, VolunteerApplicationStatus.REJECTED):
            raise ValueError("Review status must be either APPROVED or REJECTED")
