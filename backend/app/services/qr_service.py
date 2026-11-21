import base64
import io
import qrcode
from qrcode.constants import ERROR_CORRECT_M


def generate_qr_base64(data: str) -> str:
    """
    Generates a QR code image for the provided string data, encodes it as a PNG,
    and returns it as a Base64 string data URI.
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_bytes = buffered.getvalue()

    base64_encoded = base64.b64encode(img_bytes).decode("utf-8")
    return f"data:image/png;base64,{base64_encoded}"
