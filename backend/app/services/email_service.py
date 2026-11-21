import asyncio
import logging
from typing import Optional
import resend
from app.core.config import settings

logger = logging.getLogger(__name__)

if settings.RESEND_API_KEY:
    resend.api_key = settings.RESEND_API_KEY


async def send_booking_confirmation(
    to_email: str,
    user_name: str,
    event_title: str,
    event_date: str,
    ticket_qr_code: str,
    booking_id: str,
) -> Optional[dict]:
    """
    Sends a booking confirmation email with event details and ticket identifier.
    Uses Resend API in a non-blocking thread.
    """
    if not settings.RESEND_API_KEY or settings.RESEND_API_KEY.startswith("re_xxxx"):
        logger.info(
            f"[DEV EMAIL] Booking confirmation skipped for {to_email}. "
            f"Event: '{event_title}', Booking ID: {booking_id}"
        )
        return {"id": "mock_email_id", "status": "mock_sent"}

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f7; color: #333333; margin: 0; padding: 20px; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }}
            .header {{ background-color: #4f46e5; color: #ffffff; padding: 30px 20px; text-align: center; }}
            .header h1 {{ margin: 0; font-size: 24px; font-weight: 700; }}
            .content {{ padding: 30px; }}
            .badge {{ display: inline-block; background: #e0e7ff; color: #4338ca; padding: 4px 12px; border-radius: 9999px; font-weight: 600; font-size: 13px; }}
            .info-box {{ background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 20px 0; }}
            .info-row {{ display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }}
            .info-row:last-child {{ margin-bottom: 0; }}
            .label {{ color: #6b7280; font-weight: 500; }}
            .value {{ color: #111827; font-weight: 600; }}
            .qr-notice {{ text-align: center; margin: 25px 0; background-color: #eff6ff; border: 1px dashed #3b82f6; border-radius: 6px; padding: 15px; font-size: 13px; color: #1e40af; word-break: break-all; }}
            .footer {{ background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 20px; text-align: center; font-size: 12px; color: #9ca3af; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Booking Confirmed!</h1>
            </div>
            <div class="content">
                <p>Hello <strong>{user_name}</strong>,</p>
                <p>Your tickets for <strong>{event_title}</strong> have been secured. We look forward to seeing you there!</p>
                
                <div class="info-box">
                    <div class="info-row">
                        <span class="label">Booking ID:</span>
                        <span class="value">{booking_id}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Date & Time:</span>
                        <span class="value">{event_date}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Status:</span>
                        <span class="value" style="color: #16a34a;">Confirmed</span>
                    </div>
                </div>

                <div class="qr-notice">
                    <strong>Digital Ticket Token:</strong><br/>
                    <code>{ticket_qr_code}</code><br/>
                    <small>Present this QR code or code at gate check-in via the Evently App.</small>
                </div>

                <p>Need assistance or wish to cancel? Check your profile in the Evently portal.</p>
            </div>
            <div class="footer">
                &copy; Evently Campus Event Management System. All rights reserved.
            </div>
        </div>
    </body>
    </html>
    """

    params: resend.Emails.SendParams = {
        "from": settings.RESEND_FROM_EMAIL,
        "to": [to_email],
        "subject": f"Your Ticket for {event_title} - Booking Confirmed",
        "html": html_content,
    }

    try:
        response = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Booking confirmation email sent to {to_email}")
        return response
    except Exception as e:
        logger.error(f"Failed to send booking confirmation email to {to_email}: {e}")
        return None


async def send_event_reminder(
    to_email: str,
    user_name: str,
    event_title: str,
    event_date: str,
) -> Optional[dict]:
    """
    Sends an upcoming event reminder to registered attendees.
    """
    if not settings.RESEND_API_KEY or settings.RESEND_API_KEY.startswith("re_xxxx"):
        logger.info(
            f"[DEV EMAIL] Event reminder skipped for {to_email}. Event: '{event_title}'"
        )
        return {"id": "mock_email_id", "status": "mock_sent"}

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f7; color: #333; margin: 0; padding: 20px; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; }}
            .header {{ background-color: #2563eb; color: #fff; padding: 25px; text-align: center; }}
            .content {{ padding: 25px; }}
            .footer {{ background: #f9fafb; padding: 15px; text-align: center; font-size: 12px; color: #9ca3af; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>Upcoming Event Reminder</h2>
            </div>
            <div class="content">
                <p>Hello <strong>{user_name}</strong>,</p>
                <p>This is a quick reminder that <strong>{event_title}</strong> is happening on <strong>{event_date}</strong>.</p>
                <p>Please make sure to have your digital ticket QR code ready for gate scanning.</p>
            </div>
            <div class="footer">
                &copy; Evently Campus Event Management System.
            </div>
        </div>
    </body>
    </html>
    """

    params: resend.Emails.SendParams = {
        "from": settings.RESEND_FROM_EMAIL,
        "to": [to_email],
        "subject": f"Reminder: {event_title} is coming up!",
        "html": html_content,
    }

    try:
        response = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Event reminder email sent to {to_email}")
        return response
    except Exception as e:
        logger.error(f"Failed to send event reminder email to {to_email}: {e}")
        return None
