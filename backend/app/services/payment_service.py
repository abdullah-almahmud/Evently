import hashlib
import logging
from typing import Any, Dict
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)


async def initiate_sslcommerz_payment(
    booking_id: str,
    amount: float,
    customer_email: str,
    customer_name: str,
    customer_phone: str = "01700000000",
) -> Dict[str, Any]:
    """
    Calls SSLCommerz Session Initiation API to generate a hosted checkout URL.
    Returns:
        dict containing 'payment_url', 'session_key', and 'status'.
    """
    tran_id = f"EVT-{booking_id[:8].upper()}-{int(amount)}"
    base_url = settings.sslcommerz_base_url
    api_endpoint = f"{base_url}/gwprocess/v4/api.php"

    post_data = {
        "store_id": settings.SSLCOMMERZ_STORE_ID,
        "store_passwd": settings.SSLCOMMERZ_STORE_PASSWORD,
        "total_amount": f"{amount:.2f}",
        "currency": "BDT",
        "tran_id": tran_id,
        "success_url": f"{settings.FRONTEND_URL}/payment/success?booking_id={booking_id}",
        "fail_url": f"{settings.FRONTEND_URL}/payment/fail?booking_id={booking_id}",
        "cancel_url": f"{settings.FRONTEND_URL}/payment/cancel?booking_id={booking_id}",
        "ipn_url": f"http://localhost:8000/api/v1/payments/ipn",
        "cus_name": customer_name,
        "cus_email": customer_email,
        "cus_add1": "Campus Evently",
        "cus_city": "Dhaka",
        "cus_country": "Bangladesh",
        "cus_phone": customer_phone,
        "shipping_method": "NO",
        "product_name": "Evently Ticket Booking",
        "product_category": "Tickets",
        "product_profile": "non-physical-goods",
    }

    # If mock credentials, return a mock response for development convenience
    if not settings.SSLCOMMERZ_STORE_ID or settings.SSLCOMMERZ_STORE_ID == "your-store-id":
        logger.info(f"[DEV SSLCOMMERZ] Simulated initiation for booking {booking_id}")
        return {
            "status": "SUCCESS",
            "payment_url": f"{settings.FRONTEND_URL}/payment/mock?booking_id={booking_id}&tran_id={tran_id}",
            "session_key": f"mock_session_{booking_id}",
            "tran_id": tran_id,
        }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(api_endpoint, data=post_data)
            data = response.json()

            if data.get("status") == "SUCCESS":
                return {
                    "status": "SUCCESS",
                    "payment_url": data.get("GatewayPageURL"),
                    "session_key": data.get("sessionkey"),
                    "tran_id": tran_id,
                }
            else:
                logger.error(f"SSLCommerz initiation failed: {data.get('failedreason')}")
                return {
                    "status": "FAILED",
                    "reason": data.get("failedreason", "Unknown initiation error"),
                }
    except Exception as e:
        logger.error(f"Error connecting to SSLCommerz API: {e}")
        return {
            "status": "ERROR",
            "reason": str(e),
        }


async def verify_ipn(post_data: Dict[str, Any]) -> bool:
    """
    Verifies SSLCommerz Instant Payment Notification (IPN) webhook authenticity.
    Validates the transaction with SSLCommerz validation API using val_id.
    """
    val_id = post_data.get("val_id")
    if not val_id:
        return False

    # Development shortcut for testing
    if not settings.SSLCOMMERZ_STORE_ID or settings.SSLCOMMERZ_STORE_ID == "your-store-id":
        return True

    base_url = settings.sslcommerz_base_url
    validator_url = (
        f"{base_url}/validator/api/validationserverAPI.php"
        f"?val_id={val_id}"
        f"&store_id={settings.SSLCOMMERZ_STORE_ID}"
        f"&store_passwd={settings.SSLCOMMERZ_STORE_PASSWORD}"
        f"&format=json"
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(validator_url)
            validation_data = response.json()
            return validation_data.get("status") in ("VALID", "VALIDATED")
    except Exception as e:
        logger.error(f"Error during SSLCommerz IPN verification: {e}")
        return False
