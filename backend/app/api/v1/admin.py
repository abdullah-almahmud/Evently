from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models import (
    Booking,
    Event,
    EventStaff,
    EventStatus,
    OrganizerRequest,
    OrganizerRequestStatus,
    Ticket,
    User,
    UserRole,
    Venue,
)
from app.schemas.event import EventResponse
from app.schemas.user import (
    AdminOverviewResponse,
    OrganizerRequestResponse,
    OrganizerRequestReview,
    UserResponse,
    UserRoleUpdate,
)

router = APIRouter()


@router.get("/overview", response_model=AdminOverviewResponse)
async def get_admin_overview(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminOverviewResponse:
    """
    Returns platform-wide governance metrics across users, roles, events, requests, bookings, and tickets.
    Restricted to system administrators.
    """
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one() or 0
    attendees_count = (
        await db.execute(select(func.count(User.id)).where(User.role == UserRole.ATTENDEE))
    ).scalar_one() or 0
    organizers_count = (
        await db.execute(select(func.count(User.id)).where(User.role == UserRole.ORGANIZER))
    ).scalar_one() or 0
    admins_count = (
        await db.execute(select(func.count(User.id)).where(User.role == UserRole.ADMIN))
    ).scalar_one() or 0
    staff_users_count = (
        await db.execute(select(func.count(func.distinct(EventStaff.user_id))))
    ).scalar_one() or 0

    total_events = (await db.execute(select(func.count(Event.id)))).scalar_one() or 0
    published_events = (
        await db.execute(select(func.count(Event.id)).where(Event.status == EventStatus.PUBLISHED))
    ).scalar_one() or 0
    draft_events = (
        await db.execute(select(func.count(Event.id)).where(Event.status == EventStatus.DRAFT))
    ).scalar_one() or 0

    pending_organizer_requests = (
        await db.execute(
            select(func.count(OrganizerRequest.id)).where(
                OrganizerRequest.status == OrganizerRequestStatus.PENDING
            )
        )
    ).scalar_one() or 0

    total_bookings = (await db.execute(select(func.count(Booking.id)))).scalar_one() or 0
    total_tickets = (await db.execute(select(func.count(Ticket.id)))).scalar_one() or 0

    return AdminOverviewResponse(
        total_users=total_users,
        attendees_count=attendees_count,
        organizers_count=organizers_count,
        admins_count=admins_count,
        staff_users_count=staff_users_count,
        total_events=total_events,
        published_events=published_events,
        draft_events=draft_events,
        pending_organizer_requests=pending_organizer_requests,
        total_bookings=total_bookings,
        total_tickets=total_tickets,
    )


@router.get("/organizer-requests", response_model=List[OrganizerRequestResponse])
async def list_organizer_requests(
    status_filter: Optional[OrganizerRequestStatus] = Query(None, alias="status"),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> List[OrganizerRequestResponse]:
    """
    Lists organizer upgrade applications submitted by attendees.
    Supports optional status filtering (PENDING, APPROVED, REJECTED).
    Restricted to system administrators.
    """
    query = (
        select(OrganizerRequest)
        .options(selectinload(OrganizerRequest.user))
        .order_by(OrganizerRequest.created_at.desc())
    )
    if status_filter:
        query = query.where(OrganizerRequest.status == status_filter)

    result = await db.execute(query)
    requests = result.scalars().all()
    return [OrganizerRequestResponse.model_validate(r) for r in requests]


@router.put("/organizer-requests/{request_id}", response_model=OrganizerRequestResponse)
@router.post("/organizer-requests/{request_id}/review", response_model=OrganizerRequestResponse)
async def review_organizer_request(
    request_id: UUID,
    review: OrganizerRequestReview,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> OrganizerRequestResponse:
    """
    Approves or rejects an organizer application.
    If APPROVED, upgrades the applicant's role from ATTENDEE to ORGANIZER.
    """
    query = (
        select(OrganizerRequest)
        .where(OrganizerRequest.id == request_id)
        .options(selectinload(OrganizerRequest.user))
    )
    result = await db.execute(query)
    req = result.scalar_one_or_none()

    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organizer request not found",
        )

    req.status = review.status
    req.reviewed_by = current_user.id
    req.reviewed_at = datetime.now(timezone.utc)

    # If approved, upgrade target user's role to ORGANIZER
    if review.status == OrganizerRequestStatus.APPROVED:
        user_query = select(User).where(User.id == req.user_id)
        user_res = await db.execute(user_query)
        target_user = user_res.scalar_one_or_none()
        if target_user:
            target_user.role = UserRole.ORGANIZER

    await db.commit()

    refreshed_res = await db.execute(
        select(OrganizerRequest)
        .where(OrganizerRequest.id == req.id)
        .options(selectinload(OrganizerRequest.user))
    )
    refreshed = refreshed_res.scalar_one()
    return OrganizerRequestResponse.model_validate(refreshed)


@router.get("/users", response_model=List[UserResponse])
async def list_all_users(
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=200),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> List[UserResponse]:
    """
    Lists registered users across the platform with role and staff-assignment status.
    Restricted to system administrators.
    """
    offset = (page - 1) * limit
    query = (
        select(User)
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(query)
    users = result.scalars().all()

    staff_user_ids_res = await db.execute(select(func.distinct(EventStaff.user_id)))
    staff_user_ids = set(staff_user_ids_res.scalars().all())

    responses = []
    for u in users:
        resp = UserResponse.model_validate(u)
        resp.is_staff = u.id in staff_user_ids
        responses.append(resp)
    return responses


@router.put("/users/{user_id}/role", response_model=UserResponse)
@router.patch("/users/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: UUID,
    payload: UserRoleUpdate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Allows administrators to change any user's platform role (ATTENDEE, ORGANIZER, ADMIN).
    Administrators cannot change their own role to prevent accidental self-lockout.
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot change their own role",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    target_user.role = payload.role
    await db.commit()
    await db.refresh(target_user)

    staff_count = (
        await db.execute(select(func.count(EventStaff.id)).where(EventStaff.user_id == target_user.id))
    ).scalar_one() or 0

    resp = UserResponse.model_validate(target_user)
    resp.is_staff = staff_count > 0
    return resp


@router.put("/users/{user_id}/toggle-active", response_model=UserResponse)
async def toggle_user_active_status(
    user_id: UUID,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """
    Enables or disables a user account.
    Administrators are prevented from deactivating their own account.
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot deactivate their own account",
        )

    query = select(User).where(User.id == user_id)
    result = await db.execute(query)
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    target_user.is_active = not target_user.is_active
    await db.commit()
    await db.refresh(target_user)

    staff_count = (
        await db.execute(select(func.count(EventStaff.id)).where(EventStaff.user_id == target_user.id))
    ).scalar_one() or 0

    resp = UserResponse.model_validate(target_user)
    resp.is_staff = staff_count > 0
    return resp


@router.get("/events", response_model=List[EventResponse])
async def list_all_platform_events(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> List[EventResponse]:
    """
    Lists all events across the entire platform across all organizers and statuses.
    Gives administrators global visibility and moderation access.
    """
    from app.api.v1.events import format_event_response

    query = (
        select(Event)
        .options(
            selectinload(Event.organizer),
            selectinload(Event.venue).selectinload(Venue.sections),
            selectinload(Event.tiers),
        )
        .order_by(Event.created_at.desc())
    )
    result = await db.execute(query)
    events = result.scalars().all()
    return [format_event_response(e) for e in events]
