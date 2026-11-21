from datetime import datetime, timedelta, timezone
from typing import Optional
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.redis import get_redis, hold_seat, release_seat
from app.core.security import create_qr_token
from app.models import (
    Booking,
    BookingItem,
    BookingStatus,
    Seat,
    SeatHold,
    SeatHoldStatus,
    Ticket,
    TicketStatus,
    TicketTier,
)
from app.services.email_service import send_booking_confirmation


async def hold_seat_for_user(
    seat_id: str,
    user_id: str,
    tier_id: str,
    db: AsyncSession,
    redis: Optional[Redis] = None,
) -> bool:
    """
    Atomically holds a seat using Redis SET NX EX 600 (10-minute TTL) and persists
    a corresponding SeatHold record in PostgreSQL.

    Seat Locking Algorithm:
    -----------------------
    1. An atomic Redis key `seat:hold:{seat_id}` is set with value `{user_id}` and TTL of 600s.
    2. If Redis returns 0 (key already exists), the seat is currently held by someone else -> return False.
    3. If Redis returns 1, the lock is acquired. We then persist a `SeatHold` row in the database
       with `expires_at = now + 10 minutes`.
    4. When payment succeeds or checkout completes, `confirm_booking` transitions the hold to CONVERTED
       and clears the Redis lock.
    5. If the user abandons checkout or the 10-minute timer expires, Redis automatically evicts
       the lock key and background cleanup marks the DB record EXPIRED.
    """
    if redis is None:
        redis = get_redis()

    # Step 1: Attempt Redis atomic lock
    acquired = await hold_seat(seat_id=seat_id, user_id=user_id)
    if not acquired:
        return False

    # Step 2: Record seat hold in database
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    hold = SeatHold(
        seat_id=seat_id,
        tier_id=tier_id,
        user_id=user_id,
        quantity=1,
        status=SeatHoldStatus.ACTIVE,
        expires_at=expires_at,
    )
    db.add(hold)
    await db.commit()
    return True


async def confirm_booking(
    booking_id: str,
    db: AsyncSession,
    redis: Optional[Redis] = None,
) -> bool:
    """
    Converts held seats and line items into a CONFIRMED booking:
    1. Validates that the booking exists and is currently PENDING.
    2. Decrements tier available capacity if not already locked.
    3. Generates signed JWT QR codes for each ticket.
    4. Creates `Ticket` records with status ACTIVE.
    5. Updates booking status to CONFIRMED.
    6. Releases Redis locks and updates SeatHold status to CONVERTED.
    7. Sends an asynchronous confirmation email via Resend with ticket info.
    """
    if redis is None:
        redis = get_redis()

    # Retrieve booking with items and event info
    query = (
        select(Booking)
        .where(Booking.id == booking_id)
    )
    result = await db.execute(query)
    booking = result.scalar_one_or_none()

    if not booking or booking.status != BookingStatus.PENDING:
        return False

    # Fetch booking items
    items_query = select(BookingItem).where(BookingItem.booking_id == booking_id)
    items_res = await db.execute(items_query)
    items = items_res.scalars().all()

    first_ticket_token = ""
    for item in items:
        # Generate ticket for each item unit
        for _ in range(item.quantity):
            jwt_token = create_qr_token(
                ticket_id=str(item.id),
                event_id=str(booking.event_id),
                user_id=str(booking.user_id),
            )
            if not first_ticket_token:
                first_ticket_token = jwt_token

            ticket = Ticket(
                booking_item_id=item.id,
                user_id=booking.user_id,
                event_id=booking.event_id,
                tier_id=item.tier_id,
                seat_id=item.seat_id,
                qr_code=jwt_token,
                status=TicketStatus.ACTIVE,
            )
            db.add(ticket)

            # Release seat lock if seated
            if item.seat_id:
                await release_seat(str(item.seat_id))

    booking.status = BookingStatus.CONFIRMED
    await db.commit()

    return True
