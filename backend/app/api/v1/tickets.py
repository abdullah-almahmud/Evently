from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models import Event, Ticket, User, UserRole
from app.schemas.ticket import TicketEventSummary, TicketResponse, TicketTierSummary

router = APIRouter()


@router.get("/my-tickets", response_model=List[TicketResponse])
async def get_my_tickets(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> List[TicketResponse]:
    """
    Retrieves all digital entry tickets issued to the authenticated user,
    along with event, venue, and tier details for rendering QR passes.
    """
    if current_user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System administrators do not hold personal entry tickets",
        )

    result = await db.execute(
        select(Ticket)
        .where(Ticket.user_id == current_user.id)
        .options(
            selectinload(Ticket.event).selectinload(Event.venue),
            selectinload(Ticket.tier),
        )
        .order_by(Ticket.created_at.desc())
    )
    tickets = result.scalars().all()

    responses = []
    for ticket in tickets:
        responses.append(
            TicketResponse(
                id=ticket.id,
                event_id=ticket.event_id,
                tier_id=ticket.tier_id,
                user_id=ticket.user_id,
                seat_id=ticket.seat_id,
                qr_code=ticket.qr_code,
                status=ticket.status,
                checked_in_at=ticket.checked_in_at,
                created_at=ticket.created_at,
                event=TicketEventSummary.model_validate(ticket.event) if ticket.event else None,
                tier=TicketTierSummary.model_validate(ticket.tier) if ticket.tier else None,
            )
        )
    return responses
