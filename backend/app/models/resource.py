import uuid
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class Resource(Base):
    """
    Facility resources associated with a venue (e.g. Projector, Sound System, Mic, Podium).
    """
    __tablename__ = "resources"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    venue_id = Column(
        UUID(as_uuid=True),
        ForeignKey("venues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(150), nullable=False)
    total_quantity = Column(Integer, nullable=False, default=1, server_default="1")
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    venue = relationship("Venue", back_populates="resources")
    bookings = relationship("ResourceBooking", back_populates="resource", cascade="all, delete-orphan")


class ResourceBooking(Base):
    """
    Reservation of venue resources for a specific event time window.
    """
    __tablename__ = "resource_bookings"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    resource_id = Column(
        UUID(as_uuid=True),
        ForeignKey("resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity_reserved = Column(Integer, nullable=False)
    start_datetime = Column(DateTime(timezone=True), nullable=False)
    end_datetime = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    resource = relationship("Resource", back_populates="bookings")
    event = relationship("Event", back_populates="resource_bookings")
