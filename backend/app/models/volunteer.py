import uuid
from sqlalchemy import (
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models import VolunteerApplicationStatus


class VolunteerApplication(Base):
    """
    Tracks volunteer applications from users who want to serve as staff for an event.
    """
    __tablename__ = "volunteer_applications"

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
    motivation = Column(Text, nullable=False)
    status = Column(
        SQLEnum(VolunteerApplicationStatus, name="volunteer_application_status", create_type=False),
        nullable=False,
        default=VolunteerApplicationStatus.PENDING,
        server_default=VolunteerApplicationStatus.PENDING.value,
        index=True,
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

    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_volunteer_event_user"),
    )

    # Relationships
    user = relationship("User", back_populates="volunteer_applications", foreign_keys=[user_id])
    event = relationship("Event", back_populates="volunteer_applications")
    reviewer = relationship("User", foreign_keys=[reviewed_by])
