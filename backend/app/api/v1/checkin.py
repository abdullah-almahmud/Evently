from fastapi import APIRouter, Depends, HTTPException, status
from app.core.deps import get_current_active_user
from app.models import User
from app.schemas.ticket import CheckInRequest, CheckInResponse

router = APIRouter()


@router.post("/validate", response_model=CheckInResponse, status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def validate_ticket(
    payload: CheckInRequest,
    current_user: User = Depends(get_current_active_user),
):
    """
    [70% Milestone Implementation]
    Scans or enters a ticket QR token or ticket ID, verifies JWT signature,
    checks if already USED or CANCELLED, and marks attendee checked-in.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Gate ticket validation will be implemented in the 70% milestone",
    )


@router.post("/scan", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def scan_gate_pass(
    payload: CheckInRequest,
    current_user: User = Depends(get_current_active_user),
):
    """
    [70% Milestone Implementation]
    High-throughput gate scanner endpoint with cached offline verification support.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Fast gate scanner endpoint will be implemented in the 70% milestone",
    )
