import math
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.deps import get_current_organizer, get_current_user, oauth2_scheme
from app.core.security import decode_token
from app.models import BookingItem, Event, EventCategory, EventStatus, TicketTier, User, UserRole, Venue
from app.schemas.event import (
    EventCreate,
    EventListResponse,
    EventResponse,
    EventUpdate,
    TicketTierCreate,
    TicketTierResponse,
    TicketTierUpdate,
)

router = APIRouter()


def format_event_response(event: Event) -> EventResponse:
    """Helper to convert Event ORM model to EventResponse with nested relationships."""
    venue_name = event.venue.name if event.venue else None
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
        tiers=[TicketTierResponse.model_validate(t) for t in (event.tiers or [])],
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
    for field, value in update_dict.items():
        setattr(event, field, value)

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
