import logging
import math
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Dict, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.api.v1.venues import format_venue_response
from app.core.database import get_db
from app.core.deps import (
    get_current_active_user,
    get_current_organizer,
    get_current_user,
    get_optional_current_user,
    oauth2_scheme,
)
from app.core.redis import hold_seat, release_seat
from app.core.seating import (
    build_generic_sections_for_capacity,
    row_label_from_index,
    sort_sections_front_to_back,
)
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
    SeatHold,
    SeatHoldStatus,
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
from app.schemas.seat import (
    EventSeatsResponse,
    SeatHoldActionResponse,
    SeatResponse,
    SeatSectionGroup,
)
from app.schemas.staff import (
    StaffResponse,
    VolunteerApplicationCreate,
    VolunteerApplicationResponse,
    VolunteerApplicationReview,
)
from app.schemas.user import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter()

HOLD_DURATION_MINUTES = 10
MAX_HELD_SEATS_PER_USER = 4


def _event_load_options():
    """Consistent eager-loading options for Event responses."""
    return (
        selectinload(Event.organizer),
        selectinload(Event.venue).selectinload(Venue.sections),
        selectinload(Event.tiers),
    )


def format_event_response(event: Event) -> EventResponse:
    """Helper to convert Event ORM model to EventResponse with nested relationships."""
    venue_name = event.venue.name if event.venue else None
    venue_resp = format_venue_response(event.venue) if event.venue else None
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
        seat_hold_enabled=bool(event.seat_hold_enabled) if event.is_seated else False,
        created_at=event.created_at,
        updated_at=event.updated_at,
        organizer=event.organizer,
        venue_name=venue_name,
        venue=venue_resp,
        tiers=tier_responses,
        ticket_tiers=tier_responses,
    )


async def _ensure_event_seats(
    event: Event,
    db: AsyncSession,
    force_regenerate: bool = False,
) -> List[Seat]:
    """
    Generate or retrieve physical seats covering the FULL venue capacity for a seated event.
    Sections are ordered front-to-back and mapped to active TicketTiers (highest price in front rows).
    """
    if not event.is_seated or not event.venue_id:
        return []

    if not force_regenerate:
        existing_res = await db.execute(
            select(Seat).where(Seat.event_id == event.id).order_by(Seat.row_label, Seat.seat_number)
        )
        existing_seats = list(existing_res.scalars().all())
        if existing_seats:
            return existing_seats

    # Load venue & sections
    venue_res = await db.execute(
        select(Venue).where(Venue.id == event.venue_id).options(selectinload(Venue.sections))
    )
    venue = venue_res.scalar_one_or_none()
    if not venue or venue.layout_type != LayoutType.SEATED:
        return []

    # Backfill generic sections if seated venue doesn't have any yet
    sections = list(venue.sections or [])
    if not sections:
        for spec in build_generic_sections_for_capacity(venue.total_capacity):
            sec = VenueSection(
                venue_id=venue.id,
                name=spec["name"],
                rows=spec["rows"],
                seats_per_row=spec["seats_per_row"],
            )
            db.add(sec)
            sections.append(sec)
        await db.flush()

    sections = sort_sections_front_to_back(sections)

    # Clear existing seats cleanly in one bulk statement when forcing regeneration
    if force_regenerate:
        # Guard against wiping seats if confirmed/pending bookings already reference seats
        booked_seat_cnt = (
            await db.execute(
                select(func.count(BookingItem.id))
                .join(Booking, Booking.id == BookingItem.booking_id)
                .where(
                    Booking.event_id == event.id,
                    BookingItem.seat_id.is_not(None),
                    Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.PENDING]),
                )
            )
        ).scalar_one()
        if booked_seat_cnt > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot regenerate seats after attendees have booked seats for this event.",
            )
        await db.execute(delete(Seat).where(Seat.event_id == event.id))
        await db.flush()

    # Load active tiers sorted highest price first (VIP in front -> Regular/Free behind)
    tiers_res = await db.execute(
        select(TicketTier)
        .where(TicketTier.event_id == event.id, TicketTier.is_active.is_(True))
        .order_by(TicketTier.price.desc(), TicketTier.created_at.asc())
    )
    tiers = list(tiers_res.scalars().all())

    seat_dicts: List[dict] = []
    tier_seat_counts: Dict[UUID, int] = {t.id: 0 for t in tiers}

    if len(sections) == 1 and len(tiers) >= 2:
        # Single-block room with multiple tiers: allocate front rows (~35%) to premium tier, rest to standard
        section = sections[0]
        front_rows = max(1, round(section.rows * 0.35))
        if front_rows >= section.rows and section.rows > 1:
            front_rows = section.rows - 1
        for row_idx in range(section.rows):
            tier = tiers[0] if row_idx < front_rows else tiers[-1]
            row_lbl = row_label_from_index(row_idx)
            for seat_num in range(1, section.seats_per_row + 1):
                seat_dicts.append({
                    "id": uuid.uuid4(),
                    "section_id": section.id,
                    "event_id": event.id,
                    "tier_id": tier.id,
                    "row_label": row_lbl,
                    "seat_number": seat_num,
                })
                tier_seat_counts[tier.id] = tier_seat_counts.get(tier.id, 0) + 1
    else:
        for idx, section in enumerate(sections):
            tier = tiers[idx] if idx < len(tiers) else (tiers[-1] if tiers else None)
            for row_idx in range(section.rows):
                row_lbl = row_label_from_index(row_idx)
                for seat_num in range(1, section.seats_per_row + 1):
                    seat_dicts.append({
                        "id": uuid.uuid4(),
                        "section_id": section.id,
                        "event_id": event.id,
                        "tier_id": tier.id if tier else None,
                        "row_label": row_lbl,
                        "seat_number": seat_num,
                    })
                    if tier:
                        tier_seat_counts[tier.id] = tier_seat_counts.get(tier.id, 0) + 1

    if seat_dicts:
        await db.execute(insert(Seat).values(seat_dicts))

    # Sync tier quantities with exact generated full-venue seat counts when unbooked
    if tiers:
        booked_exists = (
            await db.execute(
                select(func.count(Booking.id)).where(
                    Booking.event_id == event.id,
                    Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.PENDING]),
                )
            )
        ).scalar_one() > 0
        if not booked_exists:
            for tier in tiers:
                count = tier_seat_counts.get(tier.id, 0)
                if count > 0:
                    tier.total_quantity = count
                    tier.available_quantity = count

    await db.flush()
    created_seats_res = await db.execute(
        select(Seat).where(Seat.event_id == event.id).order_by(Seat.row_label, Seat.seat_number)
    )
    return list(created_seats_res.scalars().all())


@router.get("/my-events", response_model=List[EventResponse])
async def list_my_events(
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> List[EventResponse]:
    """
    Lists all events created by the authenticated organizer across all lifecycle states.
    """
    query = (
        select(Event)
        .where(Event.organizer_id == current_user.id)
        .options(*_event_load_options())
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
        .options(*_event_load_options())
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
    Enforces venue compatibility for interactive seated events and generates full venue seats immediately.
    """
    if data.end_datetime <= data.start_datetime:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event end datetime must be after start datetime",
        )

    venue = None
    if data.venue_id:
        venue_res = await db.execute(select(Venue).where(Venue.id == data.venue_id))
        venue = venue_res.scalar_one_or_none()
        if not venue:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Specified venue does not exist",
            )

    if data.is_seated:
        if not venue:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Interactive seat selection requires selecting a Seated campus venue.",
            )
        if venue.layout_type != LayoutType.SEATED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Venue '{venue.name}' is General Admission and does not support interactive seat selection.",
            )

    resolved_seat_hold = bool(data.seat_hold_enabled) if data.is_seated else False

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
        seat_hold_enabled=resolved_seat_hold,
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
        await db.flush()

    if new_event.is_seated:
        await _ensure_event_seats(new_event, db, force_regenerate=False)

    await db.commit()

    # Reload with relationships
    query = (
        select(Event)
        .where(Event.id == new_event.id)
        .options(*_event_load_options())
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
    """
    query = (
        select(Event)
        .where(Event.id == event_id)
        .options(*_event_load_options())
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
    Updates an event's information.
    Enforces immutability: once created without interactive seats, an event remains General Admission.
    """
    query = (
        select(Event)
        .where(Event.id == event_id)
        .options(*_event_load_options())
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
    tier_updates = update_dict.pop("ticket_tiers", None)

    # Immutability rule: General Admission events cannot be turned into interactive seated events later
    if "is_seated" in update_dict:
        if not event.is_seated and update_dict["is_seated"] is True:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Once an event is created without interactive seats, it remains General Admission and cannot be changed.",
            )
        if event.is_seated and update_dict["is_seated"] is False:
            booked_exists = (
                await db.execute(
                    select(func.count(Booking.id)).where(
                        Booking.event_id == event.id,
                        Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.PENDING]),
                    )
                )
            ).scalar_one() > 0
            if booked_exists:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot disable interactive seats after bookings have been placed.",
                )

    venue_changed = "venue_id" in update_dict and update_dict["venue_id"] != event.venue_id
    if venue_changed and event.is_seated:
        new_venue = (
            await db.execute(select(Venue).where(Venue.id == update_dict["venue_id"]))
        ).scalar_one_or_none()
        if not new_venue or new_venue.layout_type != LayoutType.SEATED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Seated events can only use a Seated venue.",
            )

    for field, value in update_dict.items():
        setattr(event, field, value)

    # Never allow seat_hold_enabled on a non-seated event
    if not event.is_seated:
        event.seat_hold_enabled = False

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

    if event.is_seated and venue_changed:
        await _ensure_event_seats(event, db, force_regenerate=True)

    await db.commit()

    refreshed = (
        await db.execute(select(Event).where(Event.id == event.id).options(*_event_load_options()))
    ).scalar_one()
    return format_event_response(refreshed)


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
    Requires at least one ticket tier and ensures full-venue seats exist for seated events.
    """
    query = (
        select(Event)
        .where(Event.id == event_id)
        .options(*_event_load_options())
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

    if event.is_seated and event.venue_id:
        await _ensure_event_seats(event, db, force_regenerate=False)

    await db.commit()

    refreshed = (
        await db.execute(select(Event).where(Event.id == event.id).options(*_event_load_options()))
    ).scalar_one()
    return format_event_response(refreshed)


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


# ─── Seat Map & Timed Hold Endpoints ───────────────────────────────────────────

async def _expire_stale_holds(event_id: UUID, db: AsyncSession, now: datetime) -> None:
    """Marks any expired ACTIVE holds for seats in this event as EXPIRED."""
    event_seat_ids_subq = select(Seat.id).where(Seat.event_id == event_id)
    await db.execute(
        update(SeatHold)
        .where(
            SeatHold.seat_id.in_(event_seat_ids_subq),
            SeatHold.status == SeatHoldStatus.ACTIVE,
            SeatHold.expires_at <= now,
        )
        .values(status=SeatHoldStatus.EXPIRED)
    )
    await db.flush()


async def _build_event_seats_response(
    event: Event,
    all_seats: List[Seat],
    current_user: Optional[User],
    db: AsyncSession,
    now: datetime,
) -> EventSeatsResponse:
    """Constructs the live EventSeatsResponse with AVAILABLE / HELD / RESERVED states."""
    reserved_res = await db.execute(
        select(BookingItem.seat_id)
        .join(Booking, Booking.id == BookingItem.booking_id)
        .where(
            BookingItem.seat_id.is_not(None),
            Booking.event_id == event.id,
            Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.PENDING]),
        )
    )
    reserved_seat_ids = {row[0] for row in reserved_res.fetchall()}

    # Fetch active non-expired holds if hold mode is active (or clean up any lingering active holds)
    active_holds: Dict[UUID, tuple] = {}
    my_hold_expires_at: Optional[datetime] = None

    event_seat_ids_subq = select(Seat.id).where(Seat.event_id == event.id)
    holds_res = await db.execute(
        select(SeatHold)
        .where(
            SeatHold.seat_id.in_(event_seat_ids_subq),
            SeatHold.status == SeatHoldStatus.ACTIVE,
            SeatHold.expires_at > now,
        )
    )
    for hold in holds_res.scalars().all():
        if hold.seat_id:
            active_holds[hold.seat_id] = (hold.user_id, hold.expires_at)
            if current_user and hold.user_id == current_user.id:
                if my_hold_expires_at is None or hold.expires_at < my_hold_expires_at:
                    my_hold_expires_at = hold.expires_at

    # Group seats by section
    section_map: Dict[str, List[Seat]] = {}
    for seat in all_seats:
        sid = str(seat.section_id)
        section_map.setdefault(sid, []).append(seat)

    sections_res = await db.execute(
        select(VenueSection).where(VenueSection.venue_id == event.venue_id)
    )
    ordered_sections = sort_sections_front_to_back(list(sections_res.scalars().all()))

    section_groups: List[SeatSectionGroup] = []
    for section in ordered_sections:
        sid = str(section.id)
        seats_in_sec = section_map.get(sid, [])
        if not seats_in_sec:
            continue

        seats_sorted = sorted(
            seats_in_sec,
            key=lambda x: (len(x.row_label), x.row_label, x.seat_number),
        )
        default_tier_id = seats_sorted[0].tier_id if seats_sorted else None

        seat_responses: List[SeatResponse] = []
        for s in seats_sorted:
            held_by_me = False
            hold_exp = None
            if s.id in reserved_seat_ids:
                seat_status = "RESERVED"
            elif s.id in active_holds:
                holder_id, hold_exp = active_holds[s.id]
                held_by_me = bool(current_user and holder_id == current_user.id)
                seat_status = "HELD"
            else:
                seat_status = "AVAILABLE"

            seat_responses.append(
                SeatResponse(
                    id=s.id,
                    section_id=s.section_id,
                    tier_id=s.tier_id,
                    row_label=s.row_label,
                    seat_number=s.seat_number,
                    status=seat_status,
                    held_by_me=held_by_me,
                    hold_expires_at=hold_exp,
                )
            )

        section_groups.append(
            SeatSectionGroup(
                section_id=section.id,
                section_name=section.name,
                rows=section.rows,
                seats_per_row=section.seats_per_row,
                tier_id=default_tier_id,
                seats=seat_responses,
            )
        )

    return EventSeatsResponse(
        event_id=event.id,
        is_seated=True,
        seat_hold_enabled=bool(event.seat_hold_enabled),
        my_hold_expires_at=my_hold_expires_at,
        server_time=now,
        sections=section_groups,
    )


@router.post("/{event_id}/seats/generate", response_model=EventSeatsResponse, status_code=status.HTTP_201_CREATED)
async def generate_seats_for_event(
    event_id: UUID,
    current_user: User = Depends(get_current_organizer),
    db: AsyncSession = Depends(get_db),
) -> EventSeatsResponse:
    """
    Organizer: regenerate Seat rows covering the full venue capacity for a seated event.
    """
    query = (
        select(Event)
        .where(Event.id == event_id)
        .options(*_event_load_options())
    )
    res = await db.execute(query)
    event = res.scalar_one_or_none()

    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if event.organizer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    if not event.is_seated:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot generate seats for a non-seated event")
    if not event.venue or event.venue.layout_type != LayoutType.SEATED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event must be assigned to a Seated venue before generating seats.",
        )

    all_seats = await _ensure_event_seats(event, db, force_regenerate=True)
    await db.commit()

    now = datetime.now(timezone.utc)
    return await _build_event_seats_response(event, all_seats, current_user, db, now)


@router.get("/{event_id}/seats", response_model=EventSeatsResponse)
async def get_event_seats(
    event_id: UUID,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventSeatsResponse:
    """
    Public (with optional auth): returns the full venue seat map and live seat statuses
    (AVAILABLE, HELD with held_by_me flag, RESERVED). Auto-expires timed holds and
    syncs seats for seated events that do not yet have seats populated.
    """
    now = datetime.now(timezone.utc)
    query = (
        select(Event)
        .where(Event.id == event_id)
        .options(*_event_load_options())
    )
    res = await db.execute(query)
    event = res.scalar_one_or_none()

    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if not event.is_seated:
        return EventSeatsResponse(
            event_id=event_id,
            is_seated=False,
            seat_hold_enabled=False,
            my_hold_expires_at=None,
            server_time=now,
            sections=[],
        )

    await _expire_stale_holds(event_id, db, now)

    all_seats = await _ensure_event_seats(event, db, force_regenerate=False)
    await db.commit()

    return await _build_event_seats_response(event, all_seats, current_user, db, now)


@router.delete("/{event_id}/seats/holds", response_model=SeatHoldActionResponse)
async def release_all_event_holds(
    event_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> SeatHoldActionResponse:
    """
    Releases ALL active seat holds held by the authenticated user for this event,
    resetting their checkout timer cleanly.
    """
    now = datetime.now(timezone.utc)
    event_seat_ids_subq = select(Seat.id).where(Seat.event_id == event_id)

    active_res = await db.execute(
        select(SeatHold).where(
            SeatHold.seat_id.in_(event_seat_ids_subq),
            SeatHold.user_id == current_user.id,
            SeatHold.status == SeatHoldStatus.ACTIVE,
        )
    )
    holds = active_res.scalars().all()
    for h in holds:
        h.status = SeatHoldStatus.EXPIRED
        if h.seat_id:
            try:
                await release_seat(str(h.seat_id))
            except Exception:
                pass

    await db.commit()
    return SeatHoldActionResponse(
        seat_id=None,
        held=False,
        expires_at=None,
        server_time=now,
        active_hold_count=0,
    )


@router.post("/{event_id}/seats/{seat_id}/hold", response_model=SeatHoldActionResponse)
async def hold_event_seat(
    event_id: UUID,
    seat_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> SeatHoldActionResponse:
    """
    Acquires a 10-minute competitive hold on a seat.
    - First clicked seat starts a 10-minute timer.
    - Additional clicked seats inherit that same existing expiration time (do NOT extend/reset timer).
    """
    if current_user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System administrators cannot hold attendee seats",
        )

    now = datetime.now(timezone.utc)
    event = (await db.execute(select(Event).where(Event.id == event_id))).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if event.organizer_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organizers cannot hold seats for their own event")
    if not event.is_seated or not event.seat_hold_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Timed seat holds are not enabled for this event",
        )
    if event.status != EventStatus.PUBLISHED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event is not open for booking")

    await _expire_stale_holds(event_id, db, now)

    seat = (
        await db.execute(select(Seat).where(Seat.id == seat_id, Seat.event_id == event_id))
    ).scalar_one_or_none()
    if not seat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seat not found for this event")

    # Verify seat isn't permanently booked
    booked_cnt = (
        await db.execute(
            select(func.count(BookingItem.id))
            .join(Booking, Booking.id == BookingItem.booking_id)
            .where(
                BookingItem.seat_id == seat_id,
                Booking.event_id == event_id,
                Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.PENDING]),
            )
        )
    ).scalar_one()
    if booked_cnt > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Seat {seat.row_label}{seat.seat_number} is already booked.",
        )

    # Check active holds on this seat
    existing_seat_hold = (
        await db.execute(
            select(SeatHold).where(
                SeatHold.seat_id == seat_id,
                SeatHold.status == SeatHoldStatus.ACTIVE,
                SeatHold.expires_at > now,
            )
        )
    ).scalar_one_or_none()

    event_seat_ids_subq = select(Seat.id).where(Seat.event_id == event_id)
    my_active_holds = list(
        (
            await db.execute(
                select(SeatHold)
                .where(
                    SeatHold.seat_id.in_(event_seat_ids_subq),
                    SeatHold.user_id == current_user.id,
                    SeatHold.status == SeatHoldStatus.ACTIVE,
                    SeatHold.expires_at > now,
                )
                .order_by(SeatHold.expires_at.asc())
            )
        )
        .scalars()
        .all()
    )

    if existing_seat_hold:
        if existing_seat_hold.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Seat {seat.row_label}{seat.seat_number} is currently held by another attendee.",
            )
        # Idempotent: already held by current user
        return SeatHoldActionResponse(
            seat_id=seat_id,
            held=True,
            expires_at=existing_seat_hold.expires_at,
            server_time=now,
            active_hold_count=len(my_active_holds),
        )

    # Determine max seats allowed for this user / tier
    tier = None
    if seat.tier_id:
        tier = (await db.execute(select(TicketTier).where(TicketTier.id == seat.tier_id))).scalar_one_or_none()

    max_per_user = tier.max_per_user if tier else MAX_HELD_SEATS_PER_USER
    if len(my_active_holds) >= MAX_HELD_SEATS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You can hold up to {MAX_HELD_SEATS_PER_USER} seats at a time.",
        )
    if tier:
        holds_in_tier = sum(1 for h in my_active_holds if h.tier_id == tier.id)
        booked_in_tier = (
            await db.execute(
                select(func.coalesce(func.sum(BookingItem.quantity), 0))
                .join(Booking, Booking.id == BookingItem.booking_id)
                .where(
                    Booking.user_id == current_user.id,
                    Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.PENDING]),
                    BookingItem.tier_id == tier.id,
                )
            )
        ).scalar_one() or 0
        if holds_in_tier + booked_in_tier >= max_per_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum {max_per_user} seats allowed per user for tier '{tier.name}'.",
            )

    # Cart timer anchor: reuse earliest active hold's expires_at if holding >= 1 seat, else start fresh 10-min countdown
    if my_active_holds:
        expires_at = my_active_holds[0].expires_at
    else:
        expires_at = now + timedelta(minutes=HOLD_DURATION_MINUTES)

    tier_id_for_hold = seat.tier_id
    if not tier_id_for_hold:
        fallback_tier = (
            await db.execute(
                select(TicketTier).where(TicketTier.event_id == event_id, TicketTier.is_active.is_(True)).limit(1)
            )
        ).scalar_one_or_none()
        if not fallback_tier:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event has no active ticket tiers")
        tier_id_for_hold = fallback_tier.id

    hold = SeatHold(
        seat_id=seat.id,
        tier_id=tier_id_for_hold,
        user_id=current_user.id,
        quantity=1,
        status=SeatHoldStatus.ACTIVE,
        expires_at=expires_at,
    )
    db.add(hold)
    await db.commit()

    try:
        await hold_seat(seat_id=str(seat.id), user_id=str(current_user.id))
    except Exception:
        pass

    return SeatHoldActionResponse(
        seat_id=seat.id,
        held=True,
        expires_at=expires_at,
        server_time=now,
        active_hold_count=len(my_active_holds) + 1,
    )


@router.delete("/{event_id}/seats/{seat_id}/hold", response_model=SeatHoldActionResponse)
async def release_event_seat(
    event_id: UUID,
    seat_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> SeatHoldActionResponse:
    """
    Releases an attendee's hold on a specific seat.
    If no seats remain held by the user on this event, returns expires_at=None (timer resets).
    """
    now = datetime.now(timezone.utc)
    await _expire_stale_holds(event_id, db, now)

    holds_res = await db.execute(
        select(SeatHold).where(
            SeatHold.seat_id == seat_id,
            SeatHold.user_id == current_user.id,
            SeatHold.status == SeatHoldStatus.ACTIVE,
        )
    )
    for h in holds_res.scalars().all():
        h.status = SeatHoldStatus.EXPIRED

    await db.flush()

    try:
        await release_seat(str(seat_id))
    except Exception:
        pass

    event_seat_ids_subq = select(Seat.id).where(Seat.event_id == event_id)
    remaining_holds = list(
        (
            await db.execute(
                select(SeatHold)
                .where(
                    SeatHold.seat_id.in_(event_seat_ids_subq),
                    SeatHold.user_id == current_user.id,
                    SeatHold.status == SeatHoldStatus.ACTIVE,
                    SeatHold.expires_at > now,
                )
                .order_by(SeatHold.expires_at.asc())
            )
        )
        .scalars()
        .all()
    )

    await db.commit()

    return SeatHoldActionResponse(
        seat_id=seat_id,
        held=False,
        expires_at=remaining_holds[0].expires_at if remaining_holds else None,
        server_time=now,
        active_hold_count=len(remaining_holds),
    )
