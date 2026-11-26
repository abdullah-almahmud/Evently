import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, List, Set
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.api.v1.websocket_routes import broadcast_event_seat_update
from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.core.redis import release_seat
from app.core.security import create_qr_token
from app.models import (
    Booking,
    BookingItem,
    BookingStatus,
    Event,
    EventStatus,
    PaymentStatus,
    Seat,
    SeatHold,
    SeatHoldStatus,
    Ticket,
    TicketStatus,
    TicketTier,
    User,
    UserRole,
)
from app.schemas.booking import BookingCreate, BookingResponse, BookingItemResponse
from app.schemas.ticket import TicketEventSummary, TicketResponse, TicketSeatSummary, TicketTierSummary

logger = logging.getLogger(__name__)

router = APIRouter()


def _booking_load_options():
    return (
        joinedload(Booking.event).joinedload(Event.venue),
        selectinload(Booking.items).joinedload(BookingItem.tier),
        selectinload(Booking.items).joinedload(BookingItem.seat),
        selectinload(Booking.items).selectinload(BookingItem.tickets).joinedload(Ticket.seat),
    )


def _build_booking_response(booking: Booking) -> BookingResponse:
    """Build a BookingResponse from ORM object (relationships must be loaded)."""
    item_responses = []
    all_tickets = []
    for item in (booking.items or []):
        tier_summary = TicketTierSummary.model_validate(item.tier) if item.tier else None
        item_responses.append(BookingItemResponse(
            id=item.id,
            tier_id=item.tier_id,
            seat_id=item.seat_id,
            quantity=item.quantity,
            unit_price=item.unit_price,
            tier=tier_summary,
        ))
        for ticket in (item.tickets or []):
            seat_summary = TicketSeatSummary.model_validate(ticket.seat) if ticket.seat else None
            all_tickets.append(TicketResponse(
                id=ticket.id,
                event_id=ticket.event_id,
                tier_id=ticket.tier_id,
                user_id=ticket.user_id,
                seat_id=ticket.seat_id,
                seat=seat_summary,
                qr_code=ticket.qr_code,
                status=ticket.status,
                checked_in_at=ticket.checked_in_at,
                created_at=ticket.created_at,
                event=None,
                tier=tier_summary,
            ))

    event_summary = TicketEventSummary.model_validate(booking.event) if booking.event else None

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
        event=event_summary,
    )


async def _generate_tickets_for_booking(booking: Booking, db: AsyncSession) -> None:
    """Idempotently creates Ticket records for all items in a confirmed booking."""
    for item in (booking.items or []):
        existing_count = len(item.tickets or [])
        needed = max(0, item.quantity - existing_count)
        for _ in range(needed):
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
                seat_id=item.seat_id,
                seat=item.seat,
                qr_code=qr,
                status=TicketStatus.ACTIVE,
            )
            db.add(ticket)
            if item.tickets is not None:
                item.tickets.append(ticket)


@router.post("/", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
async def create_booking(
    data: BookingCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    """
    Creates a new booking for the authenticated user using batched DB validation.
    For free events, immediately confirms and issues tickets; broadcasts booked seats over WebSocket.
    """
    if current_user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System administrators cannot create attendee bookings",
        )

    if not data.items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking must include at least one item")

    for req_item in data.items:
        if req_item.quantity <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity must be positive")

    # Fetch event with venue in 1 joined query
    event_res = await db.execute(
        select(Event).where(Event.id == data.event_id).options(joinedload(Event.venue))
    )
    event = event_res.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if event.organizer_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organizers cannot book tickets for their own event")
    if event.status != EventStatus.PUBLISHED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event is not available for booking")

    now = datetime.now(timezone.utc)
    unique_tier_ids = list({req_item.tier_id for req_item in data.items})

    # Batch query #1: load all referenced TicketTiers + all active event tiers
    all_event_tiers_res = await db.execute(
        select(TicketTier).where(TicketTier.event_id == data.event_id, TicketTier.is_active.is_(True))
    )
    tiers_by_id: Dict[UUID, TicketTier] = {t.id: t for t in all_event_tiers_res.scalars().all()}

    for tid in unique_tier_ids:
        if tid not in tiers_by_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Tier {tid} not found or inactive for this event")

    # Batch query #2: existing CONFIRMED/PENDING quantities per tier for this user
    existing_qty_res = await db.execute(
        select(BookingItem.tier_id, func.coalesce(func.sum(BookingItem.quantity), 0))
        .join(Booking, Booking.id == BookingItem.booking_id)
        .where(
            Booking.user_id == current_user.id,
            Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.PENDING]),
            BookingItem.tier_id.in_(unique_tier_ids),
        )
        .group_by(BookingItem.tier_id)
    )
    existing_qty_by_tier: Dict[UUID, int] = {tid: int(cnt or 0) for tid, cnt in existing_qty_res.all()}

    # Validate cumulative tier limits and availability in memory
    requested_qty_by_tier: Dict[UUID, int] = {}
    for req_item in data.items:
        requested_qty_by_tier[req_item.tier_id] = requested_qty_by_tier.get(req_item.tier_id, 0) + req_item.quantity

    for tid, cumulative_req in requested_qty_by_tier.items():
        tier = tiers_by_id[tid]
        if cumulative_req > tier.max_per_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot book {cumulative_req} tickets for tier '{tier.name}'. Max per user is {tier.max_per_user}",
            )
        existing_qty = existing_qty_by_tier.get(tid, 0)
        if existing_qty + cumulative_req > tier.max_per_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"You already have {existing_qty} ticket(s) for tier '{tier.name}'. Max per user is {tier.max_per_user}",
            )
        if tier.available_quantity < cumulative_req:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Not enough tickets available for tier '{tier.name}'. Available: {tier.available_quantity}",
            )

    # Batch seat validation for seated events
    seats_by_id: Dict[UUID, Seat] = {}
    booked_seat_ids_to_convert: List[UUID] = []
    if event.is_seated:
        seen_seat_ids: Set[UUID] = set()
        for req_item in data.items:
            tier = tiers_by_id[req_item.tier_id]
            if not req_item.seat_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"This is a seated event. You must select a specific seat for tier '{tier.name}'.",
                )
            if req_item.quantity != 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="For seated events, quantity must be 1 per seat selection",
                )
            if req_item.seat_id in seen_seat_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Duplicate seat in booking request.",
                )
            seen_seat_ids.add(req_item.seat_id)
            booked_seat_ids_to_convert.append(req_item.seat_id)

        # Batch query #3: lock all requested seats FOR UPDATE
        locked_seats_res = await db.execute(
            select(Seat)
            .where(Seat.id.in_(booked_seat_ids_to_convert), Seat.event_id == data.event_id)
            .order_by(Seat.id)
            .with_for_update()
        )
        seats_by_id = {s.id: s for s in locked_seats_res.scalars().all()}

        if len(seats_by_id) != len(booked_seat_ids_to_convert):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="One or more selected seats do not exist for this event",
            )

        for req_item in data.items:
            seat = seats_by_id[req_item.seat_id]  # type: ignore[index]
            tier = tiers_by_id[req_item.tier_id]
            if seat.tier_id and seat.tier_id != tier.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Seat {seat.row_label}{seat.seat_number} does not belong to tier '{tier.name}'.",
                )

        # Batch query #4: ensure none of these seats are already CONFIRMED or PENDING
        taken_res = await db.execute(
            select(BookingItem.seat_id)
            .join(Booking, Booking.id == BookingItem.booking_id)
            .where(
                BookingItem.seat_id.in_(booked_seat_ids_to_convert),
                Booking.event_id == data.event_id,
                Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.PENDING]),
            )
            .limit(1)
        )
        taken_seat_id = taken_res.scalar_one_or_none()
        if taken_seat_id:
            seat = seats_by_id[taken_seat_id]
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Seat {seat.row_label}{seat.seat_number} is already taken. Please choose another seat.",
            )

        # Batch query #5 (if hold timer enabled): check no OTHER user holds any of these seats
        if event.seat_hold_enabled:
            other_hold = (
                await db.execute(
                    select(SeatHold)
                    .where(
                        SeatHold.seat_id.in_(booked_seat_ids_to_convert),
                        SeatHold.status == SeatHoldStatus.ACTIVE,
                        SeatHold.expires_at > now,
                        SeatHold.user_id != current_user.id,
                    )
                    .limit(1)
                )
            ).scalar_one_or_none()
            if other_hold and other_hold.seat_id in seats_by_id:
                seat = seats_by_id[other_hold.seat_id]
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Seat {seat.row_label}{seat.seat_number} is currently held by another attendee.",
                )

    total_amount = Decimal("0.00")
    has_paid = False
    for req_item in data.items:
        tier = tiers_by_id[req_item.tier_id]
        total_amount += tier.price * req_item.quantity
        if tier.price > 0:
            has_paid = True

    booking_status = BookingStatus.PENDING if has_paid else BookingStatus.CONFIRMED

    booking = Booking(
        user_id=current_user.id,
        event_id=data.event_id,
        total_amount=total_amount,
        status=booking_status,
    )
    db.add(booking)
    await db.flush()

    created_items: List[BookingItem] = []
    for req_item in data.items:
        tier = tiers_by_id[req_item.tier_id]
        tier.available_quantity -= req_item.quantity
        b_item = BookingItem(
            booking_id=booking.id,
            tier_id=tier.id,
            quantity=req_item.quantity,
            unit_price=tier.price,
            seat_id=req_item.seat_id if event.is_seated else None,
        )
        db.add(b_item)
        created_items.append(b_item)

    if booked_seat_ids_to_convert:
        await db.execute(
            update(SeatHold)
            .where(
                SeatHold.seat_id.in_(booked_seat_ids_to_convert),
                SeatHold.user_id == current_user.id,
                SeatHold.status == SeatHoldStatus.ACTIVE,
            )
            .values(status=SeatHoldStatus.CONVERTED)
        )
        for sid in booked_seat_ids_to_convert:
            await release_seat(str(sid))

    # Update SOLD_OUT flag using already-loaded tiers in memory
    if all(t.available_quantity <= 0 for t in tiers_by_id.values()):
        event.status = EventStatus.SOLD_OUT

    await db.flush()

    # Generate Ticket rows directly in memory without extra reload queries
    tickets_by_item: Dict[UUID, List[Ticket]] = {}
    if booking_status == BookingStatus.CONFIRMED:
        for b_item in created_items:
            item_tickets: List[Ticket] = []
            for _ in range(b_item.quantity):
                ticket_id = uuid.uuid4()
                qr = create_qr_token(
                    ticket_id=str(ticket_id),
                    event_id=str(booking.event_id),
                    user_id=str(booking.user_id),
                )
                t_obj = Ticket(
                    id=ticket_id,
                    booking_item_id=b_item.id,
                    user_id=booking.user_id,
                    event_id=booking.event_id,
                    tier_id=b_item.tier_id,
                    seat_id=b_item.seat_id,
                    qr_code=qr,
                    status=TicketStatus.ACTIVE,
                )
                db.add(t_obj)
                item_tickets.append(t_obj)
            tickets_by_item[b_item.id] = item_tickets
        await db.flush()
        logger.info(f"[EMAIL] Booking confirmed: user {current_user.email}, event {event.title}, booking {booking.id}")

    await db.commit()

    if booked_seat_ids_to_convert:
        await broadcast_event_seat_update(
            data.event_id,
            [
                {"id": str(sid), "status": "RESERVED", "holder_id": None, "hold_expires_at": None}
                for sid in booked_seat_ids_to_convert
            ],
            reason="booked",
            actor_id=current_user.id,
        )

    item_responses: List[BookingItemResponse] = []
    all_tickets: List[TicketResponse] = []
    for b_item in created_items:
        tier = tiers_by_id[b_item.tier_id]
        tier_summary = TicketTierSummary.model_validate(tier)
        item_responses.append(BookingItemResponse(
            id=b_item.id,
            tier_id=b_item.tier_id,
            seat_id=b_item.seat_id,
            quantity=b_item.quantity,
            unit_price=b_item.unit_price,
            tier=tier_summary,
        ))
        seat_obj = seats_by_id.get(b_item.seat_id) if b_item.seat_id else None
        seat_summary = TicketSeatSummary.model_validate(seat_obj) if seat_obj else None
        for t_obj in tickets_by_item.get(b_item.id, []):
            all_tickets.append(TicketResponse(
                id=t_obj.id,
                event_id=t_obj.event_id,
                tier_id=t_obj.tier_id,
                user_id=t_obj.user_id,
                seat_id=t_obj.seat_id,
                seat=seat_summary,
                qr_code=t_obj.qr_code,
                status=t_obj.status,
                checked_in_at=t_obj.checked_in_at,
                created_at=t_obj.created_at,
                event=None,
                tier=tier_summary,
            ))

    event_summary = TicketEventSummary.model_validate(event)
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
        event=event_summary,
    )


@router.get("/my-bookings", response_model=List[BookingResponse])
async def get_my_bookings(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> List[BookingResponse]:
    """Returns the booking history for the authenticated user, ordered by most recent."""
    if current_user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System administrators do not hold personal bookings",
        )

    result = await db.execute(
        select(Booking)
        .where(Booking.user_id == current_user.id)
        .options(*_booking_load_options())
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
    """Organizer or Admin: list all bookings for an event."""
    event_res = await db.execute(select(Event).where(Event.id == event_id))
    event = event_res.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if event.organizer_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    result = await db.execute(
        select(Booking)
        .where(Booking.event_id == event_id)
        .options(*_booking_load_options())
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
        .options(*_booking_load_options(), joinedload(Booking.payment))
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

    if current_user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System administrators do not manage personal bookings",
        )

    result = await db.execute(
        select(Booking)
        .where(Booking.id == booking_id)
        .options(*_booking_load_options(), joinedload(Booking.payment))
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
    released_seat_ids: List[UUID] = []
    for item in booking.items:
        if item.seat_id:
            released_seat_ids.append(item.seat_id)
        if item.tier:
            item.tier.available_quantity += item.quantity

        for ticket in (item.tickets or []):
            if ticket.status != TicketStatus.CANCELLED:
                ticket.status = TicketStatus.CANCELLED

    if booking.event and booking.event.status == EventStatus.SOLD_OUT:
        booking.event.status = EventStatus.PUBLISHED

    if booking.payment and booking.payment.status == PaymentStatus.SUCCESS:
        booking.payment.status = PaymentStatus.REFUNDED
        booking.payment.updated_at = datetime.now(timezone.utc)

    booking.status = BookingStatus.CANCELLED
    booking.updated_at = datetime.now(timezone.utc)
    response_payload = _build_booking_response(booking)
    await db.commit()

    if released_seat_ids:
        await broadcast_event_seat_update(
            booking.event_id,
            [
                {"id": str(sid), "status": "AVAILABLE", "holder_id": None, "hold_expires_at": None}
                for sid in released_seat_ids
            ],
            reason="cancelled",
            actor_id=current_user.id,
        )

    logger.info(f"[EMAIL] Booking cancelled: user {current_user.email}, booking {booking.id}")
    return response_payload
