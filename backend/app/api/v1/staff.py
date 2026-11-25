import logging
from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models import Event, EventStaff, User
from app.schemas.event import EventResponse
from app.schemas.staff import StaffResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/my-events", response_model=List[EventResponse])
async def get_my_staff_events(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> List[EventResponse]:
    """Returns all events where the current user is assigned as EventStaff."""
    # Find all staff assignments for this user
    staff_res = await db.execute(
        select(EventStaff)
        .where(EventStaff.user_id == current_user.id)
        .options(
            selectinload(EventStaff.event).selectinload(Event.organizer),
            selectinload(EventStaff.event).selectinload(Event.venue),
            selectinload(EventStaff.event).selectinload(Event.tiers),
        )
        .order_by(EventStaff.created_at.desc())
    )
    assignments = staff_res.scalars().all()

    from app.api.v1.events import format_event_response
    result = []
    for assignment in assignments:
        if assignment.event:
            result.append(format_event_response(assignment.event))
    return result
