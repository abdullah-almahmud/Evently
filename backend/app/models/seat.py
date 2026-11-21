import uuid
from sqlalchemy import (
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models import SeatHoldStatus


class Seat(Base):
    """
    Physical seat assigned to an event and venue section.
    """
    __tablename__ = "seats"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    section_id = Column(
        UUID(as_uuid=True),
        ForeignKey("venue_sections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tier_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ticket_tiers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    row_label = Column(String(10), nullable=False)  # e.g., 'A', 'B', 'AA'
    seat_number = Column(Integer, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "event_id",
            "section_id",
            "row_label",
            "seat_number",
            name="uq_seat_event_section_row_number",
        ),
    )

    # Relationships
    section = relationship("VenueSection", back_populates="seats")
    event = relationship("Event", back_populates="seats")
    tier = relationship("TicketTier", back_populates="seats")
    holds = relationship("SeatHold", back_populates="seat")
    booking_items = relationship("BookingItem", back_populates="seat")
    tickets = relationship("Ticket", back_populates="seat")


class SeatHold(Base):
    """
    Temporary lock on a specific seat or GA quantity during checkout (10-min window).
    """
    __tablename__ = "seat_holds"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    seat_id = Column(
        UUID(as_uuid=True),
        ForeignKey("seats.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    tier_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ticket_tiers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity = Column(Integer, nullable=False, default=1, server_default="1")
    status = Column(
        SQLEnum(SeatHoldStatus, name="seat_hold_status", create_type=False),
        nullable=False,
        default=SeatHoldStatus.ACTIVE,
        server_default=SeatHoldStatus.ACTIVE.value,
        index=True,
    )
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    seat = relationship("Seat", back_populates="holds")
    tier = relationship("TicketTier", back_populates="seat_holds")
    user = relationship("User")
