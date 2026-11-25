import logging
from datetime import datetime, timezone
from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models import Event, EventStaff, Ticket, TicketStatus, User, UserRole, TicketTier
from app.schemas.ticket import CheckInRequest, CheckInResponse, CheckInStatsResponse, CheckInTicketListItem, TicketResponse

logger = logging.getLogger(__name__)

router = APIRouter()


async def _is_staff_or_organizer(user: User, event_id: UUID, db: AsyncSession) -> bool:
    """Check if user is event staff, organizer, or admin for the given event."""
    if user.role == UserRole.ADMIN:
        return True

    # Check if organizer
    event_res = await db.execute(select(Event).where(Event.id == event_id))
    event = event_res.scalar_one_or_none()
    if event and event.organizer_id == user.id:
        return True

    # Check if assigned as EventStaff
    staff_res = await db.execute(
        select(EventStaff).where(EventStaff.event_id == event_id, EventStaff.user_id == user.id)
    )
    staff = staff_res.scalar_one_or_none()
    return staff is not None


@router.post("/validate", response_model=CheckInResponse)
async def validate_ticket(
    payload: CheckInRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> CheckInResponse:
    """
    Validates a ticket QR code and marks the attendee as checked in.
    Must be staff, organizer, or admin for the event.
    """
    qr_code = payload.qr_code or payload.ticket_code
    if not qr_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="qr_code is required")

    # Decode JWT
    try:
        token_payload = jwt.decode(qr_code, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return CheckInResponse(valid=False, message="Invalid or tampered QR code")

    ticket_id_str = token_payload.get("ticket_id") or token_payload.get("sub")
    event_id_str = token_payload.get("event_id")

    if not ticket_id_str or not event_id_str:
        return CheckInResponse(valid=False, message="Invalid or tampered QR code")

    try:
        ticket_id = UUID(ticket_id_str)
        event_id = UUID(event_id_str)
    except ValueError:
        return CheckInResponse(valid=False, message="Invalid or tampered QR code")

    # Fetch ticket with user and tier
    ticket_res = await db.execute(
        select(Ticket)
        .where(Ticket.id == ticket_id)
        .options(selectinload(Ticket.user), selectinload(Ticket.tier))
    )
    ticket = ticket_res.scalar_one_or_none()

    if not ticket:
        return CheckInResponse(valid=False, message="Ticket not found")

    if ticket.status == TicketStatus.USED:
        checked_time = ticket.checked_in_at.strftime("%Y-%m-%d %H:%M:%S") if ticket.checked_in_at else "unknown"
        return CheckInResponse(valid=False, message=f"Ticket already used. Checked in at {checked_time}")

    if ticket.status == TicketStatus.CANCELLED:
        return CheckInResponse(valid=False, message="Ticket is cancelled")

    # Verify requesting user is authorized for this event
    authorized = await _is_staff_or_organizer(current_user, ticket.event_id, db)
    if not authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to check in tickets for this event")

    # Mark as used
    ticket.status = TicketStatus.USED
    ticket.checked_in_at = datetime.now(timezone.utc)
    ticket.checked_in_by = current_user.id
    await db.commit()
    await db.refresh(ticket)

    logger.info(f"[CHECKIN] Ticket {ticket.id} checked in by {current_user.email}")

    attendee_name = ticket.user.full_name if ticket.user else "Attendee"
    return CheckInResponse(
        valid=True,
        message=f"Check-in successful! Welcome, {attendee_name}",
        ticket=TicketResponse.model_validate(ticket),
        attendee_name=attendee_name,
    )


@router.get("/event/{event_id}/stats", response_model=CheckInStatsResponse)
async def get_event_checkin_stats(
    event_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> CheckInStatsResponse:
    """Returns check-in statistics for an event. Staff or organizer only."""
    authorized = await _is_staff_or_organizer(current_user, event_id, db)
    if not authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this event")

    total_res = await db.execute(
        select(func.count(Ticket.id)).where(
            Ticket.event_id == event_id,
            Ticket.status != TicketStatus.CANCELLED,
        )
    )
    total = total_res.scalar_one() or 0

    checked_in_res = await db.execute(
        select(func.count(Ticket.id)).where(
            Ticket.event_id == event_id,
            Ticket.status == TicketStatus.USED,
        )
    )
    checked_in = checked_in_res.scalar_one() or 0

    return CheckInStatsResponse(
        total_tickets=total,
        checked_in=checked_in,
        remaining=total - checked_in,
    )


@router.get("/event/{event_id}/tickets", response_model=List[CheckInTicketListItem])
async def get_event_tickets_list(
    event_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> List[CheckInTicketListItem]:
    """Returns all tickets for an event with attendee info. Staff or organizer only."""
    authorized = await _is_staff_or_organizer(current_user, event_id, db)
    if not authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this event")

    result = await db.execute(
        select(Ticket)
        .where(Ticket.event_id == event_id)
        .options(selectinload(Ticket.user), selectinload(Ticket.tier))
        .order_by(Ticket.created_at.desc())
    )
    tickets = result.scalars().all()

    items = []
    for ticket in tickets:
        items.append(CheckInTicketListItem(
            id=ticket.id,
            ticket_id=ticket.id,
            user_id=ticket.user_id,
            attendee_name=ticket.user.full_name if ticket.user else "Unknown",
            attendee_email=ticket.user.email if ticket.user else "Unknown",
            tier_id=ticket.tier_id,
            tier_name=ticket.tier.name if ticket.tier else "Unknown",
            status=ticket.status,
            checked_in_at=ticket.checked_in_at,
            created_at=ticket.created_at,
        ))
    return items
