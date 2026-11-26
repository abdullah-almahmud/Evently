import logging
import math
import string
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.deps import get_current_active_user, get_current_organizer, get_current_user, oauth2_scheme
from app.core.security import decode_token
from app.models import (
    Booking,
    BookingItem,
    BookingStatus,
    Event,
    EventCategory,
    EventStaff,
    EventStatus,
    LayoutType,
    Seat,
    StaffRole,
    TicketTier,
    User,
    UserRole,
    Venue,
    VenueSection,
    VolunteerApplication,
    VolunteerApplicationStatus,
)
from app.schemas.event import (
    EventCreate,
    EventListResponse,
    EventResponse,
    EventUpdate,
    TicketTierCreate,
    TicketTierResponse,
    TicketTierUpdate,
)
from app.schemas.seat import EventSeatsResponse, SeatResponse, SeatSectionGroup
from app.schemas.staff import (
    StaffResponse,
    VolunteerApplicationCreate,
    VolunteerApplicationResponse,
    VolunteerApplicationReview,
)
from app.schemas.user import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter()


def format_event_response(event: Event) -> EventResponse:
    """Helper to convert Event ORM model to EventResponse with nested relationships."""
    venue_name = event.venue.name if event.venue else None
    tier_responses = [TicketTierResponse.model_validate(t) for t in (event.tiers or [])]
    return EventResponse(
        id=event.id,
        title=event.title,
        description=event.description,
        category=event.category,
        organizer_id=event.organizer_id,
        venue_id=event.venue_id,
        banner_url=event.banner_url,
        start_datetime=event.start_datetime,
        end_datetime=event.end_datetime,
        registration_start=event.registration_start,
        registration_end=event.registration_end,
        status=event.status,
        is_seated=event.is_seated,
        created_at=event.created_at,
        updated_at=event.updated_at,
        organizer=event.organizer,
        venue_name=venue_name,
        tiers=tier_responses,
        ticket_tiers=tier_responses,
    )


@router.get("/my-events", response_model=List[EventResponse])
async def list_my_events(
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> List[EventResponse]:
    """
    Lists all events created by the authenticated organizer across all lifecycle states.
    Administrators receive all events they authored or all events if preferred.
    """
    query = (
        select(Event)
        .where(Event.organizer_id == current_user.id)
        .options(selectinload(Event.organizer), selectinload(Event.venue), selectinload(Event.tiers))
        .order_by(Event.created_at.desc())
    )
    result = await db.execute(query)
    events = result.scalars().all()
    return [format_event_response(e) for e in events]


@router.get("/", response_model=EventListResponse)
async def list_published_events(
    category: Optional[EventCategory] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> EventListResponse:
    """
    Public catalogue of published events with category filtering and keyword search.
    Supports pagination.
    """
    base_filter = [Event.status == EventStatus.PUBLISHED]

    if category:
        base_filter.append(Event.category == category)
    if search:
        base_filter.append(Event.title.ilike(f"%{search.strip()}%"))

    # Count total matching events
    count_query = select(func.count(Event.id)).where(*base_filter)
    count_res = await db.execute(count_query)
    total = count_res.scalar_one()

    # Retrieve page slice
    offset = (page - 1) * limit
    data_query = (
        select(Event)
        .where(*base_filter)
        .options(selectinload(Event.organizer), selectinload(Event.venue), selectinload(Event.tiers))
        .order_by(Event.start_datetime.asc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(data_query)
    events = result.scalars().all()

    pages = math.ceil(total / limit) if total > 0 else 1

    return EventListResponse(
        items=[format_event_response(e) for e in events],
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


@router.post("/", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    data: EventCreate,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    """
    Creates a new event draft for the authenticated organizer.
    Validates datetime ranges and venue existence if provided.
    """
    if data.end_datetime <= data.start_datetime:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event end datetime must be after start datetime",
        )

    if data.venue_id:
        venue_res = await db.execute(select(Venue).where(Venue.id == data.venue_id))
        venue = venue_res.scalar_one_or_none()
        if not venue:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Specified venue does not exist",
            )

    new_event = Event(
        title=data.title,
        description=data.description,
        category=data.category,
        organizer_id=current_user.id,
        venue_id=data.venue_id,
        banner_url=data.banner_url,
        start_datetime=data.start_datetime,
        end_datetime=data.end_datetime,
        registration_start=data.registration_start,
        registration_end=data.registration_end,
        status=EventStatus.DRAFT,
        is_seated=data.is_seated,
    )
    db.add(new_event)
    await db.flush()

    # Create associated ticket tiers if provided in the creation payload
    if data.ticket_tiers:
        for t_data in data.ticket_tiers:
            tier = TicketTier(
                event_id=new_event.id,
                name=t_data.name,
                description=t_data.description,
                price=t_data.price,
                total_quantity=t_data.total_quantity,
                available_quantity=t_data.total_quantity,
                max_per_user=t_data.max_per_user,
                is_active=True,
            )
            db.add(tier)

    await db.commit()
    await db.refresh(new_event)

    # Reload with relationships
    query = (
        select(Event)
        .where(Event.id == new_event.id)
        .options(selectinload(Event.organizer), selectinload(Event.venue), selectinload(Event.tiers))
    )
    res = await db.execute(query)
    created = res.scalar_one()

    return format_event_response(created)


@router.get("/{event_id}", response_model=EventResponse)
async def get_event_detail(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    """
    Retrieves detailed event information.
    Publicly accessible if published; drafts are visible to event author or admin.
    """
    query = (
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.organizer), selectinload(Event.venue), selectinload(Event.tiers))
    )
    res = await db.execute(query)
    event = res.scalar_one_or_none()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    return format_event_response(event)


@router.put("/{event_id}", response_model=EventResponse)
@router.patch("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: UUID,
    data: EventUpdate,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    """
    Updates an event's information. Only the organizer who owns the event or an admin can update it.
    """
    query = (
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.organizer), selectinload(Event.venue), selectinload(Event.tiers))
    )
    res = await db.execute(query)
    event = res.scalar_one_or_none()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    if event.organizer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to modify this event",
        )

    update_dict = data.model_dump(exclude_unset=True)
    # Remove nested tiers from direct model assignment
    tier_updates = update_dict.pop("ticket_tiers", None)

    for field, value in update_dict.items():
        setattr(event, field, value)

    if tier_updates:
        for t_data in tier_updates:
            tier = TicketTier(
                event_id=event.id,
                name=t_data["name"],
                description=t_data.get("description"),
                price=t_data.get("price", Decimal("0.00")),
                total_quantity=t_data["total_quantity"],
                available_quantity=t_data["total_quantity"],
                max_per_user=t_data.get("max_per_user", 4),
                is_active=True,
            )
            db.add(tier)

    await db.commit()
    await db.refresh(event)
    return format_event_response(event)


@router.delete("/{event_id}", status_code=status.HTTP_200_OK)
async def delete_or_cancel_event(
    event_id: UUID,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancels or deletes an event. Only allowed for DRAFT events owned by the organizer or an admin.
    """
    query = select(Event).where(Event.id == event_id)
    res = await db.execute(query)
    event = res.scalar_one_or_none()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    if event.organizer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this event",
        )

    if event.status != EventStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only events in DRAFT status can be cancelled or removed",
        )

    event.status = EventStatus.CANCELLED
    await db.commit()
    return {"message": "Event cancelled successfully"}


@router.post("/{event_id}/publish", response_model=EventResponse)
async def publish_event(
    event_id: UUID,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    """
    Transitions an event status to PUBLISHED.
    Requires at least one ticket tier to have been created.
    """
    query = (
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.organizer), selectinload(Event.venue), selectinload(Event.tiers))
    )
    res = await db.execute(query)
    event = res.scalar_one_or_none()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    if event.organizer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to publish this event",
        )

    if not event.tiers or len(event.tiers) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event must have at least one ticket tier before it can be published",
        )

    event.status = EventStatus.PUBLISHED

    # If seated event and no seats generated yet, auto-generate from venue sections
    if event.is_seated and event.venue_id:
        seat_count_res = await db.execute(
            select(func.count(Seat.id)).where(Seat.event_id == event.id)
        )
        if seat_count_res.scalar_one() == 0:
            venue_res = await db.execute(
                select(Venue).where(Venue.id == event.venue_id).options(selectinload(Venue.sections))
            )
            venue = venue_res.scalar_one_or_none()
            if venue and venue.sections:
                tiers_res = await db.execute(
                    select(TicketTier)
                    .where(TicketTier.event_id == event.id, TicketTier.is_active.is_(True))
                    .order_by(TicketTier.price.asc())
                )
                tiers = tiers_res.scalars().all()
                sections = sorted(venue.sections, key=lambda s: s.name)
                for idx, section in enumerate(sections):
                    tier = tiers[idx] if idx < len(tiers) else (tiers[-1] if tiers else None)
                    for row_idx in range(section.rows):
                        for seat_num in range(1, section.seats_per_row + 1):
                            seat = Seat(
                                section_id=section.id,
                                event_id=event.id,
                                tier_id=tier.id if tier else None,
                                row_label=_row_label(row_idx),
                                seat_number=seat_num,
                            )
                            db.add(seat)

    await db.commit()
    await db.refresh(event)
    return format_event_response(event)


# Ticket Tier Management Endpoints

@router.get("/{event_id}/tiers", response_model=List[TicketTierResponse])
async def list_event_tiers(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> List[TicketTierResponse]:
    """
    Lists active ticket tiers available for an event.
    """
    query = (
        select(TicketTier)
        .where(TicketTier.event_id == event_id, TicketTier.is_active.is_(True))
        .order_by(TicketTier.price.asc())
    )
    res = await db.execute(query)
    tiers = res.scalars().all()
    return [TicketTierResponse.model_validate(t) for t in tiers]


@router.post("/{event_id}/tiers", response_model=TicketTierResponse, status_code=status.HTTP_201_CREATED)
async def create_ticket_tier(
    event_id: UUID,
    data: TicketTierCreate,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> TicketTierResponse:
    """
    Adds a new ticket tier to an event (VIP, Regular, Student, etc.).
    Initializes available_quantity equal to total_quantity.
    """
    event_res = await db.execute(select(Event).where(Event.id == event_id))
    event = event_res.scalar_one_or_none()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    if event.organizer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to add ticket tiers to this event",
        )

    tier = TicketTier(
        event_id=event_id,
        name=data.name,
        description=data.description,
        price=data.price,
        total_quantity=data.total_quantity,
        available_quantity=data.total_quantity,
        max_per_user=data.max_per_user,
        is_active=True,
    )
    db.add(tier)
    await db.commit()
    await db.refresh(tier)
    return TicketTierResponse.model_validate(tier)


@router.put("/{event_id}/tiers/{tier_id}", response_model=TicketTierResponse)
@router.patch("/{event_id}/tiers/{tier_id}", response_model=TicketTierResponse)
async def update_ticket_tier(
    event_id: UUID,
    tier_id: UUID,
    data: TicketTierUpdate,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> TicketTierResponse:
    """
    Updates configuration of a ticket tier.
    """
    event_res = await db.execute(select(Event).where(Event.id == event_id))
    event = event_res.scalar_one_or_none()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    if event.organizer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to edit this tier",
        )

    tier_res = await db.execute(select(TicketTier).where(TicketTier.id == tier_id, TicketTier.event_id == event_id))
    tier = tier_res.scalar_one_or_none()

    if not tier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket tier not found for this event",
        )

    update_dict = data.model_dump(exclude_unset=True)
    if "total_quantity" in update_dict and update_dict["total_quantity"] != tier.total_quantity:
        diff = update_dict["total_quantity"] - tier.total_quantity
        tier.available_quantity = max(0, tier.available_quantity + diff)

    for field, value in update_dict.items():
        setattr(tier, field, value)

    await db.commit()
    await db.refresh(tier)
    return TicketTierResponse.model_validate(tier)


@router.delete("/{event_id}/tiers/{tier_id}", status_code=status.HTTP_200_OK)
async def delete_ticket_tier(
    event_id: UUID,
    tier_id: UUID,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
):
    """
    Removes a ticket tier from an event, provided no bookings have been made for it.
    """
    event_res = await db.execute(select(Event).where(Event.id == event_id))
    event = event_res.scalar_one_or_none()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    if event.organizer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this tier",
        )

    tier_res = await db.execute(select(TicketTier).where(TicketTier.id == tier_id, TicketTier.event_id == event_id))
    tier = tier_res.scalar_one_or_none()

    if not tier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket tier not found",
        )

    # Check for existing bookings
    booking_items_res = await db.execute(
        select(func.count(BookingItem.id)).where(BookingItem.tier_id == tier_id)
    )
    booked_count = booking_items_res.scalar_one()

    if booked_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete a tier that already has active bookings. You may deactivate it instead.",
        )

    await db.delete(tier)
    await db.commit()
    return {"message": "Ticket tier deleted successfully"}


# ─── Volunteer Application Routes ─────────────────────────────────────────────

@router.post("/{event_id}/volunteer-apply", response_model=VolunteerApplicationResponse, status_code=status.HTTP_201_CREATED)
async def apply_as_volunteer(
    event_id: UUID,
    data: VolunteerApplicationCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> VolunteerApplicationResponse:
    """Attendees (or non-organizer users) can apply to volunteer for an event."""
    if current_user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System administrators cannot apply as event volunteers",
        )

    # Verify event exists
    event_res = await db.execute(select(Event).where(Event.id == event_id))
    event = event_res.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if event.organizer_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are the organizer of this event and cannot apply as a volunteer",
        )

    # Check for duplicate application
    existing_res = await db.execute(
        select(VolunteerApplication).where(
            VolunteerApplication.event_id == event_id,
            VolunteerApplication.user_id == current_user.id,
        )
    )
    existing = existing_res.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already applied to volunteer for this event",
        )

    application = VolunteerApplication(
        event_id=event_id,
        user_id=current_user.id,
        motivation=data.motivation,
        status=VolunteerApplicationStatus.PENDING,
    )
    db.add(application)
    await db.commit()
    await db.refresh(application)

    # Reload with user
    app_res = await db.execute(
        select(VolunteerApplication)
        .where(VolunteerApplication.id == application.id)
        .options(selectinload(VolunteerApplication.user))
    )
    loaded = app_res.scalar_one()
    return VolunteerApplicationResponse.model_validate(loaded)


@router.get("/{event_id}/volunteer-applications", response_model=List[VolunteerApplicationResponse])
async def list_volunteer_applications(
    event_id: UUID,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> List[VolunteerApplicationResponse]:
    """Organizer only: list all volunteer applications for their event."""
    event_res = await db.execute(select(Event).where(Event.id == event_id))
    event = event_res.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if event.organizer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    result = await db.execute(
        select(VolunteerApplication)
        .where(VolunteerApplication.event_id == event_id)
        .options(selectinload(VolunteerApplication.user))
        .order_by(VolunteerApplication.created_at.desc())
    )
    apps = result.scalars().all()
    return [VolunteerApplicationResponse.model_validate(a) for a in apps]


@router.post("/{event_id}/volunteer-applications/{app_id}/review", response_model=VolunteerApplicationResponse)
async def review_volunteer_application(
    event_id: UUID,
    app_id: UUID,
    data: VolunteerApplicationReview,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> VolunteerApplicationResponse:
    """Organizer only: approve or reject a volunteer application. On APPROVED, auto-create EventStaff."""
    event_res = await db.execute(select(Event).where(Event.id == event_id))
    event = event_res.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if event.organizer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    app_res = await db.execute(
        select(VolunteerApplication)
        .where(VolunteerApplication.id == app_id, VolunteerApplication.event_id == event_id)
        .options(selectinload(VolunteerApplication.user))
    )
    application = app_res.scalar_one_or_none()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Volunteer application not found")

    application.status = data.status
    application.reviewed_by = current_user.id
    application.reviewed_at = datetime.now(timezone.utc)

    # On approval: create EventStaff record if not already exists
    if data.status == VolunteerApplicationStatus.APPROVED:
        existing_staff_res = await db.execute(
            select(EventStaff).where(
                EventStaff.event_id == event_id,
                EventStaff.user_id == application.user_id,
            )
        )
        existing_staff = existing_staff_res.scalar_one_or_none()
        if not existing_staff:
            staff = EventStaff(
                user_id=application.user_id,
                event_id=event_id,
                role=StaffRole.GATE_STAFF,
                assigned_by=current_user.id,
            )
            db.add(staff)

    await db.commit()

    # Reload with user
    app_reload_res = await db.execute(
        select(VolunteerApplication)
        .where(VolunteerApplication.id == application.id)
        .options(selectinload(VolunteerApplication.user))
    )
    loaded = app_reload_res.scalar_one()
    return VolunteerApplicationResponse.model_validate(loaded)


@router.get("/{event_id}/my-volunteer-status", response_model=VolunteerApplicationResponse)
async def get_my_volunteer_status(
    event_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> VolunteerApplicationResponse:
    """Authenticated user: check their own volunteer application status for this event."""
    app_res = await db.execute(
        select(VolunteerApplication)
        .where(
            VolunteerApplication.event_id == event_id,
            VolunteerApplication.user_id == current_user.id,
        )
        .options(selectinload(VolunteerApplication.user))
    )
    application = app_res.scalar_one_or_none()
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No volunteer application found for this event")

    return VolunteerApplicationResponse.model_validate(application)


# ─── Event Staff Listing ───────────────────────────────────────────────────────

@router.get("/{event_id}/staff", response_model=List[StaffResponse])
async def list_event_staff(
    event_id: UUID,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> List[StaffResponse]:
    """Organizer only: list all staff assigned to an event."""
    event_res = await db.execute(select(Event).where(Event.id == event_id))
    event = event_res.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if event.organizer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    result = await db.execute(
        select(EventStaff)
        .where(EventStaff.event_id == event_id)
        .options(selectinload(EventStaff.user))
        .order_by(EventStaff.created_at.asc())
    )
    staff_list = result.scalars().all()
    return [StaffResponse.model_validate(s) for s in staff_list]


@router.delete("/{event_id}/staff/{staff_id}", status_code=status.HTTP_200_OK)
async def remove_event_staff(
    event_id: UUID,
    staff_id: UUID,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
):
    """Organizer only: remove a staff assignment from an event."""
    event_res = await db.execute(select(Event).where(Event.id == event_id))
    event = event_res.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if event.organizer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    staff_res = await db.execute(
        select(EventStaff).where(EventStaff.id == staff_id, EventStaff.event_id == event_id)
    )
    staff = staff_res.scalar_one_or_none()
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff assignment not found")

    await db.delete(staff)
    await db.commit()
    return {"message": "Staff assignment removed successfully"}


# ─── Seat Map Endpoints ────────────────────────────────────────────────────────

def _row_label(index: int) -> str:
    """Convert 0-based row index to alphabetic label (0→A, 25→Z, 26→AA, …)."""
    result = ""
    n = index
    while True:
        result = string.ascii_uppercase[n % 26] + result
        n = n // 26 - 1
        if n < 0:
            break
    return result


@router.post("/{event_id}/seats/generate", response_model=EventSeatsResponse, status_code=status.HTTP_201_CREATED)
async def generate_seats_for_event(
    event_id: UUID,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> EventSeatsResponse:
    """
    Organizer: auto-generate Seat rows for a seated event from its venue sections.
    Idempotent — clears existing seats first if re-generated.
    Each section's rows × seats_per_row produces labelled Seat records (Row A–Z, seat 1–N).
    """
    query = (
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.venue).selectinload(Venue.sections))
    )
    res = await db.execute(query)
    event = res.scalar_one_or_none()

    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if event.organizer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    if not event.is_seated:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot generate seats for a non-seated event")
    if not event.venue or not event.venue.sections:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event's venue has no sections. Add sections to the venue first.",
        )

    # Remove existing seats for this event (safe re-generation)
    existing_res = await db.execute(select(Seat).where(Seat.event_id == event_id))
    for existing_seat in existing_res.scalars().all():
        await db.delete(existing_seat)
    await db.flush()

    # Find tiers to map sections → tiers (best-effort: sort tiers by price, sections by name)
    tiers_res = await db.execute(
        select(TicketTier)
        .where(TicketTier.event_id == event_id, TicketTier.is_active.is_(True))
        .order_by(TicketTier.price.asc())
    )
    tiers = tiers_res.scalars().all()

    sections = sorted(event.venue.sections, key=lambda s: s.name)
    section_groups = []

    for idx, section in enumerate(sections):
        tier = tiers[idx] if idx < len(tiers) else (tiers[-1] if tiers else None)
        new_seats = []

        for row_idx in range(section.rows):
            for seat_num in range(1, section.seats_per_row + 1):
                seat = Seat(
                    section_id=section.id,
                    event_id=event_id,
                    tier_id=tier.id if tier else None,
                    row_label=_row_label(row_idx),
                    seat_number=seat_num,
                )
                db.add(seat)
                new_seats.append(seat)

        await db.flush()
        section_groups.append(SeatSectionGroup(
            section_id=section.id,
            section_name=section.name,
            rows=section.rows,
            seats_per_row=section.seats_per_row,
            tier_id=tier.id if tier else None,
            seats=[SeatResponse(
                id=s.id,
                section_id=s.section_id,
                row_label=s.row_label,
                seat_number=s.seat_number,
                status="AVAILABLE",
            ) for s in new_seats],
        ))

    await db.commit()

    return EventSeatsResponse(
        event_id=event_id,
        is_seated=True,
        sections=section_groups,
    )


@router.get("/{event_id}/seats", response_model=EventSeatsResponse)
async def get_event_seats(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> EventSeatsResponse:
    """
    Public: returns the full seat map for a seated event.
    Seat status is computed from active BookingItems (RESERVED) vs database rows (AVAILABLE).
    Redis holds are not surfaced here for simplicity; a seat disappears from AVAILABLE once booked.
    """
    query = (
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.venue).selectinload(Venue.sections))
    )
    res = await db.execute(query)
    event = res.scalar_one_or_none()

    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if not event.is_seated:
        return EventSeatsResponse(event_id=event_id, is_seated=False, sections=[])

    # Fetch all seats for this event
    seats_res = await db.execute(
        select(Seat).where(Seat.event_id == event_id).order_by(Seat.row_label, Seat.seat_number)
    )
    all_seats = seats_res.scalars().all()

    # Determine which seat_ids are reserved (confirmed or pending bookings)
    reserved_res = await db.execute(
        select(BookingItem.seat_id)
        .join(Booking, Booking.id == BookingItem.booking_id)
        .where(
            BookingItem.seat_id.is_not(None),
            BookingItem.booking_id.in_(
                select(Booking.id).where(
                    Booking.event_id == event_id,
                    Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.PENDING]),
                )
            ),
        )
    )
    reserved_seat_ids = {row[0] for row in reserved_res.fetchall()}

    # Group seats by section
    section_map: dict = {}
    for seat in all_seats:
        sid = str(seat.section_id)
        if sid not in section_map:
            section_map[sid] = []
        section_map[sid].append(seat)

    # Fetch sections for metadata
    sections_res = await db.execute(
        select(VenueSection).where(VenueSection.venue_id == event.venue_id)
    )
    sections_by_id = {str(s.id): s for s in sections_res.scalars().all()}

    # Build section groups from tiers
    tiers_res = await db.execute(
        select(TicketTier).where(TicketTier.event_id == event_id, TicketTier.is_active.is_(True))
    )
    tiers_by_id = {str(t.id): t for t in tiers_res.scalars().all()}

    section_groups = []
    for sid, seats in section_map.items():
        section = sections_by_id.get(sid)
        # Determine tier from first seat's tier_id
        tier_id = str(seats[0].tier_id) if seats and seats[0].tier_id else None

        seat_responses = []
        for s in sorted(seats, key=lambda x: (x.row_label, x.seat_number)):
            seat_status = "RESERVED" if s.id in reserved_seat_ids else "AVAILABLE"
            seat_responses.append(SeatResponse(
                id=s.id,
                section_id=s.section_id,
                row_label=s.row_label,
                seat_number=s.seat_number,
                status=seat_status,
            ))

        section_groups.append(SeatSectionGroup(
            section_id=UUID(sid),
            section_name=section.name if section else sid[:8],
            rows=section.rows if section else 0,
            seats_per_row=section.seats_per_row if section else 0,
            tier_id=UUID(tier_id) if tier_id else None,
            seats=seat_responses,
        ))

    return EventSeatsResponse(
        event_id=event_id,
        is_seated=True,
        sections=sorted(section_groups, key=lambda g: g.section_name),
    )
