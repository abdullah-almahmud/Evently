import uuid
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class EventWaitlist(Base):
    """
    Queue of attendees waiting for ticket tiers that are currently sold out.
    """
    __tablename__ = "event_waitlist"

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
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tier_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ticket_tiers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    joined_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("event_id", "user_id", "tier_id", name="uq_waitlist_event_user_tier"),
    )

    # Relationships
    event = relationship("Event", back_populates="waitlist_entries")
    user = relationship("User", back_populates="waitlists")
    tier = relationship("TicketTier", back_populates="waitlist_entries")
