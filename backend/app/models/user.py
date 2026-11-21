import uuid
from sqlalchemy import (
    Boolean,
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
from app.models import OrganizerRequestStatus, UserRole


class User(Base):
    """
    User entity representing students, faculty, organizers, and admins.
    Supports both local password authentication and Google OAuth2.
    """
    __tablename__ = "users"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=True)
    google_id = Column(String(255), unique=True, nullable=True, index=True)
    full_name = Column(String(255), nullable=False)
    avatar_url = Column(String(1024), nullable=True)
    role = Column(
        SQLEnum(UserRole, name="user_role", create_type=False),
        nullable=False,
        default=UserRole.ATTENDEE,
        server_default=UserRole.ATTENDEE.value,
    )
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
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
    organizer_requests = relationship(
        "OrganizerRequest",
        back_populates="user",
        foreign_keys="OrganizerRequest.user_id",
        cascade="all, delete-orphan",
    )
    reviewed_requests = relationship(
        "OrganizerRequest",
        back_populates="reviewer",
        foreign_keys="OrganizerRequest.reviewed_by",
    )
    venues = relationship("Venue", back_populates="creator")
    events = relationship("Event", back_populates="organizer")
    bookings = relationship("Booking", back_populates="user", cascade="all, delete-orphan")
    tickets = relationship(
        "Ticket",
        back_populates="user",
        foreign_keys="Ticket.user_id",
        cascade="all, delete-orphan",
    )
    staff_assignments = relationship("EventStaff", back_populates="user", foreign_keys="EventStaff.user_id")
    waitlists = relationship("EventWaitlist", back_populates="user", cascade="all, delete-orphan")


class OrganizerRequest(Base):
    """
    Tracks attendee requests to become event organizers,
    subject to review and approval by an administrator.
    """
    __tablename__ = "organizer_requests"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reason = Column(Text, nullable=False)
    status = Column(
        SQLEnum(OrganizerRequestStatus, name="organizer_request_status", create_type=False),
        nullable=False,
        default=OrganizerRequestStatus.PENDING,
        server_default=OrganizerRequestStatus.PENDING.value,
    )
    reviewed_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    user = relationship("User", back_populates="organizer_requests", foreign_keys=[user_id])
    reviewer = relationship("User", back_populates="reviewed_requests", foreign_keys=[reviewed_by])
