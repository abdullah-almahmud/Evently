import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.v1.bookings import (
    _booking_load_options,
    _build_booking_response,
    _generate_tickets_for_booking,
)
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_active_user
from app.models import (
    Booking,
    BookingStatus,
    Payment,
    PaymentGateway,
    PaymentStatus,
    Ticket,
    User,
)
from app.schemas.booking import BookingResponse

logger = logging.getLogger(__name__)

router = APIRouter()


class PaymentActionRequest(BaseModel):
    method: str = "Card / Mobile Banking (Sandbox)"
    tran_id: Optional[str] = None


class PaymentInitiateResponse(BaseModel):
    mode: str  # "sandbox" | "sslcommerz" | "already_confirmed"
    booking_id: UUID
    tran_id: str
    amount: float
    gateway: str
    gateway_url: Optional[str] = None
    message: str


@router.post("/initiate/{booking_id}", response_model=PaymentInitiateResponse)
async def initiate_payment(
    booking_id: UUID,
    payload: Optional[PaymentActionRequest] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentInitiateResponse:
    """
    Initiates payment for a pending booking.
    Uses SSLCommerz Gateway if store credentials are configured, otherwise prepares a
    local sandbox payment transaction so attendees can complete payment cleanly offline.
    """
    result = await db.execute(
        select(Booking)
        .where(Booking.id == booking_id)
        .options(joinedload(Booking.payment), joinedload(Booking.event))
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    if booking.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this booking")
    if booking.status in (BookingStatus.CANCELLED, BookingStatus.REFUNDED):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot pay for a cancelled or refunded booking")

    if booking.status == BookingStatus.CONFIRMED or float(booking.total_amount) == 0:
        return PaymentInitiateResponse(
            mode="already_confirmed",
            booking_id=booking.id,
            tran_id=booking.payment.tran_id if booking.payment and booking.payment.tran_id else f"FREE-{booking.id.hex[:10].upper()}",
            amount=float(booking.total_amount),
            gateway="FREE" if float(booking.total_amount) == 0 else "SSLCOMMERZ",
            message="Booking is already confirmed.",
        )

    tran_id = (
        booking.payment.tran_id
        if booking.payment and booking.payment.tran_id
        else f"EVT-{uuid.uuid4().hex[:12].upper()}"
    )

    if booking.payment is None:
        payment = Payment(
            booking_id=booking.id,
            user_id=current_user.id,
            amount=booking.total_amount,
            gateway=PaymentGateway.SSLCOMMERZ,
            tran_id=tran_id,
            status=PaymentStatus.PENDING,
        )
        db.add(payment)
    else:
        booking.payment.tran_id = tran_id
        booking.payment.status = PaymentStatus.PENDING
        booking.payment.amount = booking.total_amount

    await db.commit()

    if settings.SSLCOMMERZ_STORE_ID and settings.SSLCOMMERZ_STORE_PASSWORD:
        try:
            import httpx

            api_url = f"{settings.sslcommerz_base_url}/gwprocess/v4/api.php"
            form_data = {
                "store_id": settings.SSLCOMMERZ_STORE_ID,
                "store_passwd": settings.SSLCOMMERZ_STORE_PASSWORD,
                "total_amount": str(booking.total_amount),
                "currency": "BDT",
                "tran_id": tran_id,
                "success_url": f"{settings.FRONTEND_URL.rstrip('/')}/my-bookings?payment=success&tran_id={tran_id}",
                "fail_url": f"{settings.FRONTEND_URL.rstrip('/')}/my-bookings?payment=fail&tran_id={tran_id}",
                "cancel_url": f"{settings.FRONTEND_URL.rstrip('/')}/my-bookings?payment=cancel&tran_id={tran_id}",
                "cus_name": current_user.full_name,
                "cus_email": current_user.email,
                "cus_add1": "UIU Campus, Madani Avenue",
                "cus_city": "Dhaka",
                "cus_country": "Bangladesh",
                "cus_phone": "01700000000",
                "shipping_method": "NO",
                "product_name": booking.event.title if booking.event else "Evently Ticket",
                "product_category": "Event Ticket",
                "product_profile": "non-physical-goods",
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(api_url, data=form_data)
                data = resp.json()
                if data.get("status") == "SUCCESS" and data.get("GatewayPageURL"):
                    return PaymentInitiateResponse(
                        mode="sslcommerz",
                        booking_id=booking.id,
                        tran_id=tran_id,
                        amount=float(booking.total_amount),
                        gateway="SSLCOMMERZ",
                        gateway_url=data["GatewayPageURL"],
                        message="Redirecting to SSLCommerz payment gateway.",
                    )
        except Exception as exc:
            logger.warning(f"SSLCommerz initiation fallback to sandbox checkout: {exc}")

    return PaymentInitiateResponse(
        mode="sandbox",
        booking_id=booking.id,
        tran_id=tran_id,
        amount=float(booking.total_amount),
        gateway="SSLCOMMERZ_SANDBOX",
        message="Sandbox payment ready for instant confirmation.",
    )


async def _finalize_booking_payment(
    booking: Booking,
    db: AsyncSession,
    method: str,
    val_id: Optional[str] = None,
    raw_payload: Optional[Dict[str, Any]] = None,
) -> BookingResponse:
    """Marks payment SUCCESS, transitions booking to CONFIRMED, and issues Ticket QR passes."""
    now = datetime.now(timezone.utc)
    existing_tickets = sum(len(item.tickets or []) for item in (booking.items or []))

    if booking.payment is None:
        payment = Payment(
            booking_id=booking.id,
            user_id=booking.user_id,
            amount=booking.total_amount,
            gateway=PaymentGateway.SSLCOMMERZ,
            tran_id=f"EVT-{uuid.uuid4().hex[:12].upper()}",
            val_id=val_id or f"VAL-{uuid.uuid4().hex[:10].upper()}",
            status=PaymentStatus.SUCCESS,
            gateway_response={"method": method, "payload": raw_payload or {}, "confirmed_at": now.isoformat()},
        )
        db.add(payment)
    else:
        booking.payment.status = PaymentStatus.SUCCESS
        booking.payment.val_id = val_id or booking.payment.val_id or f"VAL-{uuid.uuid4().hex[:10].upper()}"
        booking.payment.gateway_response = {"method": method, "payload": raw_payload or {}, "confirmed_at": now.isoformat()}
        booking.payment.updated_at = now

    booking.status = BookingStatus.CONFIRMED
    booking.updated_at = now

    if existing_tickets == 0:
        await _generate_tickets_for_booking(booking, db)
        await db.flush()

    response = _build_booking_response(booking)
    await db.commit()
    logger.info(f"[EMAIL] Payment verified & QR tickets issued for booking {booking.id}")
    return response


@router.post("/confirm/{booking_id}", response_model=BookingResponse)
async def confirm_sandbox_payment(
    booking_id: UUID,
    payload: Optional[PaymentActionRequest] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    """
    Confirms payment for a PENDING booking, marks Payment SUCCESS, transitions booking to CONFIRMED,
    and issues digital QR entry passes so they immediately appear under My Tickets.
    """
    result = await db.execute(
        select(Booking)
        .where(Booking.id == booking_id)
        .options(*_booking_load_options(), joinedload(Booking.payment))
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    if booking.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to pay for this booking")
    if booking.status in (BookingStatus.CANCELLED, BookingStatus.REFUNDED):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot confirm payment for a cancelled booking")

    method = payload.method if payload and payload.method else "Sandbox Checkout"
    return await _finalize_booking_payment(booking, db, method=method)


@router.post("/ipn")
async def sslcommerz_ipn_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """SSLCommerz Instant Payment Notification webhook handler."""
    form = dict(await request.form())
    tran_id = form.get("tran_id")
    status_val = str(form.get("status", "")).upper()
    val_id = form.get("val_id")

    if not tran_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing tran_id")

    pmt = (await db.execute(select(Payment).where(Payment.tran_id == str(tran_id)))).scalar_one_or_none()
    if not pmt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    if status_val in ("VALID", "VALIDATED"):
        bk = (
            await db.execute(
                select(Booking)
                .where(Booking.id == pmt.booking_id)
                .options(*_booking_load_options(), joinedload(Booking.payment))
            )
        ).scalar_one()
        await _finalize_booking_payment(bk, db, method="SSLCommerz", val_id=str(val_id or ""), raw_payload=form)
        return {"status": "confirmed"}

    pmt.status = PaymentStatus.FAILED
    await db.commit()
    return {"status": "failed"}


@router.post("/success")
async def payment_success_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Handles SSLCommerz browser redirect after successful payment."""
    form = dict(await request.form())
    tran_id = form.get("tran_id")
    if tran_id:
        pmt = (await db.execute(select(Payment).where(Payment.tran_id == str(tran_id)))).scalar_one_or_none()
        if pmt:
            bk = (
                await db.execute(
                    select(Booking)
                    .where(Booking.id == pmt.booking_id)
                    .options(*_booking_load_options(), joinedload(Booking.payment))
                )
            ).scalar_one_or_none()
            if bk:
                await _finalize_booking_payment(bk, db, method="SSLCommerz", val_id=str(form.get("val_id") or ""), raw_payload=form)
    return RedirectResponse(url=f"{settings.FRONTEND_URL.rstrip('/')}/my-bookings?payment=success", status_code=303)


@router.post("/fail")
async def payment_fail_callback(request: Request):
    """Handles failed payment gateway callback."""
    return RedirectResponse(url=f"{settings.FRONTEND_URL.rstrip('/')}/my-bookings?payment=failed", status_code=303)


@router.post("/cancel")
async def payment_cancel_callback(request: Request):
    """Handles cancelled payment gateway callback."""
    return RedirectResponse(url=f"{settings.FRONTEND_URL.rstrip('/')}/my-bookings?payment=cancelled", status_code=303)
