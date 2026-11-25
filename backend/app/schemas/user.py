from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from app.models import OrganizerRequestStatus, UserRole


class UserResponse(BaseModel):
    """Public user profile response."""
    id: UUID
    email: str
    username: str
    full_name: str
    avatar_url: Optional[str] = None
    role: UserRole
    is_active: bool
    is_staff: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserUpdateRequest(BaseModel):
    """Editable profile attributes for current user."""
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)
    avatar_url: Optional[str] = None


class UserRoleUpdate(BaseModel):
    """Payload for administrators to change a user's platform role."""
    role: UserRole


class OrganizerRequestCreate(BaseModel):
    """Payload for submitting an organizer promotion request."""
    reason: str = Field(..., min_length=10, max_length=2000)


class OrganizerRequestResponse(BaseModel):
    """Details of an organizer upgrade request."""
    id: UUID
    user_id: UUID
    reason: str
    status: OrganizerRequestStatus
    reviewed_by: Optional[UUID] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    user: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)


class OrganizerRequestReview(BaseModel):
    """Payload for administrators to approve or reject an organizer request."""
    status: OrganizerRequestStatus

    def model_post_init(self, __context):
        if self.status not in (OrganizerRequestStatus.APPROVED, OrganizerRequestStatus.REJECTED):
            raise ValueError("Review status must be either APPROVED or REJECTED")


class AdminOverviewResponse(BaseModel):
    """System-wide overview statistics for platform administrators."""
    total_users: int
    attendees_count: int
    organizers_count: int
    admins_count: int
    staff_users_count: int
    total_events: int
    published_events: int
    draft_events: int
    pending_organizer_requests: int
    total_bookings: int
    total_tickets: int
