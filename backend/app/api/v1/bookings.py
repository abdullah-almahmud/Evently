import logging
import uuid
from decimal import Decimal
from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.core.security import create_qr_token
from app.models import (
    Booking,
    BookingItem,
    BookingStatus,
    Event,
    EventStatus,
    Ticket,
    TicketStatus,
    TicketTier,
    User,
    UserRole,
)
from app.schemas.booking import BookingCreate, BookingResponse, BookingItemResponse
from app.schemas.ticket import TicketResponse

logger = logging.getLogger(__name__)

router = APIRouter()


def _build_booking_response(booking: Booking) -> BookingResponse:
    """Build a BookingResponse from ORM object (relationships must be loaded)."""
    item_responses = []
    all_tickets = []
    for item in (booking.items or []):
        item_responses.append(BookingItemResponse(
            id=item.id,
            tier_id=item.tier_id,
            seat_id=item.seat_id,
            quantity=item.quantity,
            unit_price=item.unit_price,
        ))
        for ticket in (item.tickets or []):
            all_tickets.append(TicketResponse.model_validate(ticket))

    return BookingResponse(
        id=booking.id,
        user_id=booking.user_id,
        event_id=booking.event_id,
        total_amount=booking.total_amount,
        status=booking.status,
        created_at=booking.created_at,
        updated_at=booking.updated_at,
        items=item_responses,
        tickets=all_tickets if all_tickets else None,
    )


async def _generate_tickets_for_booking(booking: Booking, db: AsyncSession) -> None:
    """Create Ticket records for all items in a confirmed booking."""
    for item in booking.items:
        for _ in range(item.quantity):
            ticket_id = uuid.uuid4()
            qr = create_qr_token(
                ticket_id=str(ticket_id),
                event_id=str(booking.event_id),
                user_id=str(booking.user_id),
            )
            ticket = Ticket(
                id=ticket_id,
                booking_item_id=item.id,
                user_id=booking.user_id,
                event_id=booking.event_id,
                tier_id=item.tier_id,
                qr_code=qr,
                status=TicketStatus.ACTIVE,
            )
            db.add(ticket)


@router.post("/", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
async def create_booking(
    data: BookingCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    """
    Creates a new booking for the authenticated user.
    For free events, immediately confirms and issues tickets.
    """
    if not data.items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking must include at least one item")

    # Fetch event
    event_res = await db.execute(select(Event).where(Event.id == data.event_id))
    event = event_res.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if event.status != EventStatus.PUBLISHED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event is not available for booking")

    total_amount = Decimal("0.00")
    has_paid = False
    tier_items = []  # list of (tier, quantity)

    for req_item in data.items:
        if req_item.quantity <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Quantity must be positive")

        tier_res = await db.execute(select(TicketTier).where(
            TicketTier.id == req_item.tier_id,
            TicketTier.event_id == data.event_id,
        ))
        tier = tier_res.scalar_one_or_none()
        if not tier:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Tier {req_item.tier_id} not found for this event")
        if not tier.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Ticket tier '{tier.name}' is not active")

        # Per-user quantity check
        if req_item.quantity > tier.max_per_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot book {req_item.quantity} tickets for tier '{tier.name}'. Max per user is {tier.max_per_user}",
            )

        # Check how many tickets user already holds in CONFIRMED bookings for this tier
        existing_qty_res = await db.execute(
            select(func.coalesce(func.sum(BookingItem.quantity), 0))
            .join(Booking, Booking.id == BookingItem.booking_id)
            .where(
                Booking.user_id == current_user.id,
                Booking.status == BookingStatus.CONFIRMED,
                BookingItem.tier_id == tier.id,
            )
        )
        existing_qty = existing_qty_res.scalar_one() or 0
        if existing_qty + req_item.quantity > tier.max_per_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"You already have {existing_qty} ticket(s) for tier '{tier.name}'. Max per user is {tier.max_per_user}",
            )

        # Availability check
        if tier.available_quantity < req_item.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Not enough tickets available for tier '{tier.name}'. Available: {tier.available_quantity}",
            )

        tier_items.append((tier, req_item.quantity))
        total_amount += tier.price * req_item.quantity
        if tier.price > 0:
            has_paid = True

    # Determine booking status
    booking_status = BookingStatus.PENDING if has_paid else BookingStatus.CONFIRMED

    # Create booking
    booking = Booking(
        user_id=current_user.id,
        event_id=data.event_id,
        total_amount=total_amount,
        status=booking_status,
    )
    db.add(booking)
    await db.flush()

    # Deduct quantities and create booking items
    all_tiers_zero = True
    for tier, qty in tier_items:
        tier.available_quantity -= qty
        if tier.available_quantity > 0:
            all_tiers_zero = False

        item = BookingItem(
            booking_id=booking.id,
            tier_id=tier.id,
            quantity=qty,
            unit_price=tier.price,
        )
        db.add(item)

    await db.flush()

    # Check if event should be SOLD_OUT (all tiers at 0)
    if all_tiers_zero:
        tiers_res = await db.execute(select(TicketTier).where(TicketTier.event_id == event.id, TicketTier.is_active.is_(True)))
        all_tiers = tiers_res.scalars().all()
        if all(t.available_quantity == 0 for t in all_tiers):
            event.status = EventStatus.SOLD_OUT

    # For confirmed (free) bookings: generate tickets
    if booking_status == BookingStatus.CONFIRMED:
        # Reload booking with items
        await db.flush()
        booking_with_items_res = await db.execute(
            select(Booking)
            .where(Booking.id == booking.id)
            .options(selectinload(Booking.items))
        )
        booking_loaded = booking_with_items_res.scalar_one()
        await _generate_tickets_for_booking(booking_loaded, db)

        logger.info(f"[EMAIL] Booking confirmed: user {current_user.email}, event {event.title}, booking {booking.id}")

    await db.commit()

    # Reload full booking with items + tickets
    full_res = await db.execute(
        select(Booking)
        .where(Booking.id == booking.id)
        .options(
            selectinload(Booking.items).selectinload(BookingItem.tickets)
        )
    )
    full_booking = full_res.scalar_one()

    return _build_booking_response(full_booking)


@router.get("/my-bookings", response_model=List[BookingResponse])
async def get_my_bookings(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> List[BookingResponse]:
    """Returns the booking history for the authenticated user, ordered by most recent."""
    result = await db.execute(
        select(Booking)
        .where(Booking.user_id == current_user.id)
        .options(selectinload(Booking.items).selectinload(BookingItem.tickets))
        .order_by(Booking.created_at.desc())
    )
    bookings = result.scalars().all()
    return [_build_booking_response(b) for b in bookings]


@router.get("/event/{event_id}", response_model=List[BookingResponse])
async def get_event_bookings(
    event_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> List[BookingResponse]:
    """Organizer only: list all bookings for their event."""
    event_res = await db.execute(select(Event).where(Event.id == event_id))
    event = event_res.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if event.organizer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    result = await db.execute(
        select(Booking)
        .where(Booking.event_id == event_id)
        .options(selectinload(Booking.items).selectinload(BookingItem.tickets))
        .order_by(Booking.created_at.desc())
    )
    bookings = result.scalars().all()
    return [_build_booking_response(b) for b in bookings]


@router.get("/{booking_id}", response_model=BookingResponse)
async def get_booking_detail(
    booking_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    """Returns full booking details. User can only see their own bookings (or organizer/admin)."""
    result = await db.execute(
        select(Booking)
        .where(Booking.id == booking_id)
        .options(
            selectinload(Booking.items).selectinload(BookingItem.tickets),
            selectinload(Booking.event),
        )
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    # Access control: own booking, or organizer, or admin
    is_owner = booking.user_id == current_user.id
    is_organizer = booking.event and booking.event.organizer_id == current_user.id
    is_admin = current_user.role == UserRole.ADMIN

    if not (is_owner or is_organizer or is_admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view this booking")

    return _build_booking_response(booking)


@router.post("/{booking_id}/cancel", response_model=BookingResponse)
async def cancel_booking(
    booking_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    """Cancel a booking before the event starts. Restores tier availability and cancels tickets."""
    from datetime import datetime, timezone

    result = await db.execute(
        select(Booking)
        .where(Booking.id == booking_id)
        .options(
            selectinload(Booking.items).selectinload(BookingItem.tickets),
            selectinload(Booking.event),
        )
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    if booking.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to cancel this booking")

    if booking.status not in (BookingStatus.PENDING, BookingStatus.CONFIRMED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel a booking with status {booking.status.value}",
        )

    # Check event hasn't started yet
    if booking.event and booking.event.start_datetime <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot cancel booking after the event has started",
        )

    # Restore quantities and cancel tickets
    for item in booking.items:
        # Restore tier availability
        tier_res = await db.execute(select(TicketTier).where(TicketTier.id == item.tier_id))
        tier = tier_res.scalar_one_or_none()
        if tier:
            tier.available_quantity += item.quantity

        for ticket in (item.tickets or []):
            if ticket.status != TicketStatus.CANCELLED:
                ticket.status = TicketStatus.CANCELLED

    booking.status = BookingStatus.CANCELLED
    await db.commit()

    logger.info(f"[EMAIL] Booking cancelled: user {current_user.email}, booking {booking.id}")

    # Reload for response
    full_res = await db.execute(
        select(Booking)
        .where(Booking.id == booking.id)
        .options(selectinload(Booking.items).selectinload(BookingItem.tickets))
    )
    full_booking = full_res.scalar_one()
    return _build_booking_response(full_booking)
