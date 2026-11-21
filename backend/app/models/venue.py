import uuid
from sqlalchemy import (
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models import LayoutType


class Venue(Base):
    """
    Campus venue or facility where events are hosted.
    Can be configured as SEATED or GENERAL_ADMISSION.
    """
    __tablename__ = "venues"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    name = Column(String(255), nullable=False, index=True)
    address = Column(String(500), nullable=False)
    city = Column(String(100), nullable=False)
    total_capacity = Column(Integer, nullable=False)
    layout_type = Column(
        SQLEnum(LayoutType, name="layout_type", create_type=False),
        nullable=False,
        default=LayoutType.GENERAL_ADMISSION,
        server_default=LayoutType.GENERAL_ADMISSION.value,
    )
    description = Column(Text, nullable=True)
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    creator = relationship("User", back_populates="venues")
    sections = relationship(
        "VenueSection",
        back_populates="venue",
        cascade="all, delete-orphan",
        order_by="VenueSection.name",
    )
    events = relationship("Event", back_populates="venue")
    resources = relationship("Resource", back_populates="venue", cascade="all, delete-orphan")


class VenueSection(Base):
    """
    Subdivisions within a SEATED venue with defined rows and seats per row.
    """
    __tablename__ = "venue_sections"

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
    name = Column(String(100), nullable=False)  # e.g., 'Section A', 'Balcony Left'
    rows = Column(Integer, nullable=False)
    seats_per_row = Column(Integer, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    venue = relationship("Venue", back_populates="sections")
    seats = relationship("Seat", back_populates="section", cascade="all, delete-orphan")
