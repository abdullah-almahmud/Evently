import uuid
from decimal import Decimal
from sqlalchemy import (
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    Numeric,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models import BookingStatus


class Booking(Base):
    """
    User booking record representing an order for one or more tickets.
    """
    __tablename__ = "bookings"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    total_amount = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    status = Column(
        SQLEnum(BookingStatus, name="booking_status", create_type=False),
        nullable=False,
        default=BookingStatus.PENDING,
        server_default=BookingStatus.PENDING.value,
        index=True,
    )
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
    user = relationship("User", back_populates="bookings")
    event = relationship("Event", back_populates="bookings")
    items = relationship(
        "BookingItem",
        back_populates="booking",
        cascade="all, delete-orphan",
    )
    payment = relationship("Payment", back_populates="booking", uselist=False, cascade="all, delete-orphan")


class BookingItem(Base):
    """
    Individual ticket line item within a booking order.
    """
    __tablename__ = "booking_items"

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
        nullable=False,
        index=True,
    )
    tier_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ticket_tiers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    seat_id = Column(
        UUID(as_uuid=True),
        ForeignKey("seats.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    quantity = Column(Integer, nullable=False, default=1, server_default="1")
    unit_price = Column(Numeric(10, 2), nullable=False)

    # Relationships
    booking = relationship("Booking", back_populates="items")
    tier = relationship("TicketTier", back_populates="booking_items")
    seat = relationship("Seat", back_populates="booking_items")
    tickets = relationship("Ticket", back_populates="booking_item", cascade="all, delete-orphan")
