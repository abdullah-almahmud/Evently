from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, status
from app.core.deps import get_current_active_user
from app.models import User

router = APIRouter()


@router.post("/initiate/{booking_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def initiate_payment(
    booking_id: UUID,
    current_user: User = Depends(get_current_active_user),
):
    """
    [70% Milestone Implementation]
    Initiates payment with SSLCommerz gateway for a pending booking and returns
    the hosted payment gateway checkout URL.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Payment initiation will be implemented in the 70% milestone",
    )


@router.post("/ipn", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def sslcommerz_ipn_webhook(
    request: Request,
):
    """
    [70% Milestone Implementation]
    Instant Payment Notification (IPN) webhook called by SSLCommerz upon transaction settlement.
    Validates cryptographic payload and marks booking as CONFIRMED.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="SSLCommerz IPN webhook handler will be implemented in the 70% milestone",
    )


@router.post("/success", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def payment_success_callback(
    request: Request,
):
    """
    [70% Milestone Implementation]
    Callback endpoint triggered when payment succeeds on the gateway.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Payment success callback will be implemented in the 70% milestone",
    )


@router.post("/fail", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def payment_fail_callback(
    request: Request,
):
    """
    [70% Milestone Implementation]
    Callback endpoint triggered when payment fails or is declined by the gateway.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Payment failure callback will be implemented in the 70% milestone",
    )


@router.post("/cancel", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def payment_cancel_callback(
    request: Request,
):
    """
    [70% Milestone Implementation]
    Callback endpoint triggered when the user cancels checkout at the payment gateway.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Payment cancellation callback will be implemented in the 70% milestone",
    )
