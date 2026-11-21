import uuid
from decimal import Decimal
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models import EventCategory, EventStatus


class Event(Base):
    """
    Campus event managed by an organizer.
    Supports multi-tier ticketing, seated/non-seated layouts, and staff assignment.
    """
    __tablename__ = "events"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    title = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    category = Column(
        SQLEnum(EventCategory, name="event_category", create_type=False),
        nullable=False,
        default=EventCategory.OTHER,
        server_default=EventCategory.OTHER.value,
        index=True,
    )
    organizer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    venue_id = Column(
        UUID(as_uuid=True),
        ForeignKey("venues.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    banner_url = Column(String(1024), nullable=True)
    start_datetime = Column(DateTime(timezone=True), nullable=False)
    end_datetime = Column(DateTime(timezone=True), nullable=False)
    registration_start = Column(DateTime(timezone=True), nullable=True)
    registration_end = Column(DateTime(timezone=True), nullable=True)
    status = Column(
        SQLEnum(EventStatus, name="event_status", create_type=False),
        nullable=False,
        default=EventStatus.DRAFT,
        server_default=EventStatus.DRAFT.value,
        index=True,
    )
    is_seated = Column(Boolean, nullable=False, default=False, server_default="false")
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
    organizer = relationship("User", back_populates="events")
    venue = relationship("Venue", back_populates="events")
    tiers = relationship(
        "TicketTier",
        back_populates="event",
        cascade="all, delete-orphan",
        order_by="TicketTier.price",
    )
    seats = relationship("Seat", back_populates="event", cascade="all, delete-orphan")
    bookings = relationship("Booking", back_populates="event")
    tickets = relationship("Ticket", back_populates="event")
    staff = relationship("EventStaff", back_populates="event", cascade="all, delete-orphan")
    resource_bookings = relationship("ResourceBooking", back_populates="event", cascade="all, delete-orphan")
    waitlist_entries = relationship("EventWaitlist", back_populates="event", cascade="all, delete-orphan")


class TicketTier(Base):
    """
    Ticket tier/category for an event (e.g. VIP, General Admission, Early Bird).
    """
    __tablename__ = "ticket_tiers"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    price = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    total_quantity = Column(Integer, nullable=False)
    available_quantity = Column(Integer, nullable=False)
    max_per_user = Column(Integer, nullable=False, default=4, server_default="4")
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    event = relationship("Event", back_populates="tiers")
    seats = relationship("Seat", back_populates="tier")
    seat_holds = relationship("SeatHold", back_populates="tier")
    booking_items = relationship("BookingItem", back_populates="tier")
    tickets = relationship("Ticket", back_populates="tier")
    waitlist_entries = relationship("EventWaitlist", back_populates="tier", cascade="all, delete-orphan")
