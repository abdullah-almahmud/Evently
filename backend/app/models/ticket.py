import uuid
from sqlalchemy import (
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models import TicketStatus


class Ticket(Base):
    """
    Issued ticket for an attendee, containing a cryptographically signed QR code.
    Used by gate staff for entry validation.
    """
    __tablename__ = "tickets"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    booking_item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("booking_items.id", ondelete="CASCADE"),
        nullable=False,
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
    qr_code = Column(Text, unique=True, nullable=False, index=True)
    status = Column(
        SQLEnum(TicketStatus, name="ticket_status", create_type=False),
        nullable=False,
        default=TicketStatus.ACTIVE,
        server_default=TicketStatus.ACTIVE.value,
        index=True,
    )
    checked_in_at = Column(DateTime(timezone=True), nullable=True)
    checked_in_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    booking_item = relationship("BookingItem", back_populates="tickets")
    user = relationship("User", back_populates="tickets", foreign_keys=[user_id])
    event = relationship("Event", back_populates="tickets")
    tier = relationship("TicketTier", back_populates="tickets")
    seat = relationship("Seat", back_populates="tickets")
    validator = relationship("User", foreign_keys=[checked_in_by])
