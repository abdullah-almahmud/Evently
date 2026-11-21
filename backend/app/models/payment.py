import uuid
from decimal import Decimal
from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Numeric,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models import PaymentGateway, PaymentStatus


class Payment(Base):
    """
    Payment transaction record for a booking, processed via SSLCommerz.
    """
    __tablename__ = "payments"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    booking_id = Column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    amount = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    gateway = Column(
        SQLEnum(PaymentGateway, name="payment_gateway", create_type=False),
        nullable=False,
        default=PaymentGateway.SSLCOMMERZ,
        server_default=PaymentGateway.SSLCOMMERZ.value,
    )
    tran_id = Column(String(100), unique=True, nullable=True, index=True)
    val_id = Column(String(100), nullable=True, index=True)
    status = Column(
        SQLEnum(PaymentStatus, name="payment_status", create_type=False),
        nullable=False,
        default=PaymentStatus.PENDING,
        server_default=PaymentStatus.PENDING.value,
        index=True,
    )
    gateway_response = Column(JSON, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    booking = relationship("Booking", back_populates="payment")
    user = relationship("User")
